const express = require('express');
const upload = require('../middleware/upload');
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const Document = require('../models/Document');
const SchemeOfWork = require('../models/SchemeOfWork');
const { extractSchemeOfWorkText, generateLessonPlanAndRecord } = require('../services/aiService');
const fs = require('fs');

const router = express.Router();

/**
 * Helper function to safely delete a file if it exists.
 * Used for cleanup after processing or on error.
 * @param {string} filePath - Path to file
 */
const cleanupFile = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlink(filePath, (err) => {
      if (err) console.error(`Failed to delete temporary file ${filePath}:`, err.message);
    });
  }
};

// Apply protect middleware to all routes in this file (teachers only/authenticated users)
router.use(protect);

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/scheme-of-work
// Update Scheme of Work text directly (via textarea)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/scheme-of-work', async (req, res) => {
  try {
    const { content } = req.body;

    // Update current user
    req.user.schemeOfWork = content || '';
    await req.user.save();

    return res.status(200).json({
      success: true,
      message: 'Scheme of Work updated successfully.',
      schemeOfWork: req.user.schemeOfWork,
    });
  } catch (err) {
    console.error('Update scheme error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error updating Scheme of Work.',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/upload-scheme
// Upload and parse a Scheme of Work document, saving nested hierarchy to DB
// Uses upsert: if the teacher already has a scheme for that grade, it overwrites it
// ─────────────────────────────────────────────────────────────────────────────
router.post('/upload-scheme', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || 'File upload failed.'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Please upload a file with field name "file".'
      });
    }

    const filePath = req.file.path;

    try {
      // 1. Extract hierarchical JSON via AI service
      const extractedText = await extractSchemeOfWorkText(filePath);
      const schemeObj = JSON.parse(extractedText);

      // 2. Clean up file
      cleanupFile(filePath);

      // 3. Validate the AI response matches the expected hierarchical structure
      if (!schemeObj.grade || !Array.isArray(schemeObj.strands)) {
        return res.status(422).json({
          success: false,
          message: 'AI returned an invalid structure. Expected { grade, strands: [...] }. Please try uploading again.',
        });
      }

      // Validate strand/subStrand nesting
      for (const strand of schemeObj.strands) {
        if (!strand.strandName || !Array.isArray(strand.subStrands)) {
          return res.status(422).json({
            success: false,
            message: `Invalid strand structure detected (missing strandName or subStrands array). Please try again.`,
          });
        }
      }

      // 4. Upsert: update existing grade document or create a new one
      const teacherId = req.user._id;
      const grade = schemeObj.grade;

      await SchemeOfWork.findOneAndUpdate(
        { teacherId, grade },
        {
          teacherId,
          grade,
          strands: schemeObj.strands,
        },
        { upsert: true, returnDocument: 'after', runValidators: true }
      );

      // For backward compatibility / profile snapshot
      req.user.schemeOfWork = extractedText;
      await req.user.save();

      return res.status(200).json({
        success: true,
        message: `Scheme of Work for "${grade}" processed and saved to database.`,
        grade,
        strandsCount: schemeObj.strands.length,
      });

    } catch (extractErr) {
      cleanupFile(filePath);
      console.error('Error extracting Scheme of Work document:', extractErr);
      return res.status(500).json({
        success: false,
        message: extractErr.message || 'Failed to extract text from Scheme of Work.',
      });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/schemes/options
// Fetches flat lists of grades, strands, and subStrands for the logged-in teacher
// (Derived from the nested hierarchy)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/schemes/options', async (req, res) => {
  try {
    const teacherId = req.user._id;
    const schemes = await SchemeOfWork.find({ teacherId }).lean();

    const gradesSet = new Set();
    const strandsSet = new Set();
    const subStrandsSet = new Set();

    schemes.forEach((scheme) => {
      gradesSet.add(scheme.grade);
      (scheme.strands || []).forEach((strand) => {
        strandsSet.add(strand.strandName);
        (strand.subStrands || []).forEach((sub) => {
          subStrandsSet.add(sub.subStrandName);
        });
      });
    });

    return res.status(200).json({
      success: true,
      grades: [...gradesSet],
      strands: [...strandsSet],
      subStrands: [...subStrandsSet],
    });
  } catch (err) {
    console.error('Fetch scheme options error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error fetching scheme options.',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/schemes/data
// Returns the full nested cascading hierarchy for the logged-in teacher
// { "Grade 7": { "Numbers": ["Place Value", "Rounding Off"] }, ... }
// ─────────────────────────────────────────────────────────────────────────────
router.get('/schemes/data', async (req, res) => {
  try {
    const teacherId = req.user._id;
    const schemes = await SchemeOfWork.find({ teacherId }).lean();

    const hierarchy = {};

    schemes.forEach((scheme) => {
      const grade = scheme.grade || 'Unknown Grade';
      hierarchy[grade] = {};

      (scheme.strands || []).forEach((strand) => {
        const strandName = strand.strandName || 'Unknown Strand';
        hierarchy[grade][strandName] = (strand.subStrands || []).map(
          (ss) => ss.subStrandName || 'Unknown Sub-strand'
        );
      });
    });

    return res.status(200).json({
      success: true,
      data: hierarchy,
    });
  } catch (err) {
    console.error('Fetch schemes data hierarchy error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error fetching schemes data hierarchy.',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/generate
// Perform RAG and generate Lesson Plan & Record of Work combined JSON
// ─────────────────────────────────────────────────────────────────────────────
router.post('/generate', async (req, res) => {
  try {
    const { strand, subStrand, objectives, presentation, conclusion, date, time, roll, grade } = req.body;

    if (!strand || !subStrand || !Array.isArray(presentation) || presentation.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide strand, subStrand, and presentation in point form.',
      });
    }

    const generatedData = await generateLessonPlanAndRecord(req.user._id, {
      strand,
      subStrand,
      objectives: Array.isArray(objectives) ? objectives : [],
      presentation,
      conclusion: conclusion || '',
      date: date || '',
      time: time || '',
      roll: roll || '',
      grade: grade || '',
    });

    return res.status(200).json({
      success: true,
      message: 'Curriculum assets generated successfully.',
      data: generatedData,
    });
  } catch (err) {
    console.error('RAG Generation error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'AI Generation failed.',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/documents
// Save generated Lesson Plan & Record of Work document to database with 'pending' status
// ─────────────────────────────────────────────────────────────────────────────
router.post('/documents', async (req, res) => {
  try {
    const { strand, subStrand, objectives, presentation, lessonPlan, recordOfWork, grade, date, time, roll, conclusion } = req.body;

    if (!strand || !subStrand || !Array.isArray(objectives) || objectives.length === 0 || !Array.isArray(presentation) || presentation.length === 0 || !lessonPlan || !recordOfWork) {
      return res.status(400).json({
        success: false,
        message: 'Missing required submission fields.',
      });
    }

    const document = await Document.create({
      teacherId: req.user._id,
      strand,
      subStrand,
      grade,
      date,
      time,
      roll,
      conclusion,
      objective: Array.isArray(objectives) ? objectives[0] || '' : '',
      objectives,
      presentation,
      lessonPlan,
      recordOfWork,
      status: 'pending',
    });

    return res.status(201).json({
      success: true,
      message: 'Document submitted for approval successfully.',
      document,
    });
  } catch (err) {
    console.error('Save document error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error saving document submission.',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/documents
// Fetch teacher's own document submissions (ensures isolation)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/documents', async (req, res) => {
  try {
    const documents = await Document.find({ teacherId: req.user._id }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      documents,
    });
  } catch (err) {
    console.error('Fetch documents error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error fetching your document submissions.',
    });
  }
});

module.exports = router;
