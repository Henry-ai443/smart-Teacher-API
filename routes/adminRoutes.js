const express = require('express');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const User = require('../models/User');
const Document = require('../models/Document');
const SchemeOfWork = require('../models/SchemeOfWork');
const { protect } = require('../middleware/auth');
const isAdmin = require('../middleware/adminAuth');

const router = express.Router();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

function splitWeeklyBlocks(rawText) {
  const normalized = rawText.replace(/\r\n/g, '\n').trim();
  const blocks = normalized.split(/(?=^Week\s*\d+)/gim);
  return blocks.map((block) => block.trim()).filter(Boolean);
}

function parseJsonText(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (primaryError) {
    const firstBracket = trimmed.indexOf('[');
    const firstBrace = trimmed.indexOf('{');
    const lastBracket = trimmed.lastIndexOf(']');
    const lastBrace = trimmed.lastIndexOf('}');

    if (firstBracket !== -1 && lastBracket !== -1) {
      return JSON.parse(trimmed.slice(firstBracket, lastBracket + 1));
    }
    if (firstBrace !== -1 && lastBrace !== -1) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }

    throw primaryError;
  }
}

async function parseWeekBlock(block) {
  const prompt = `Extract the following scheme of work text into clean JSON. Split each lesson into a JSON object with exactly these keys: week, lessonNumber, strand, subStrand, specificLearningOutcomes, keyInquiryQuestions, learningExperiences, learningResources. Use arrays of strings for the learning outcome and experience fields. Use an integer for lessonNumber. If a field cannot be inferred, return an empty string or empty array. Output only valid JSON without markdown, labels, or explanation.\n\nText:\n${block}`;

  const response = await geminiModel.generateContent({
    contents: prompt,
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  const raw = response.response.text();
  const parsed = parseJsonText(raw);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function normalizeEntry(entry) {
  return {
    week: entry.week ? String(entry.week).trim() : '',
    lessonNumber: Number.isInteger(entry.lessonNumber)
      ? entry.lessonNumber
      : parseInt(entry.lessonNumber, 10) || 0,
    strand: entry.strand ? String(entry.strand).trim() : '',
    subStrand: entry.subStrand ? String(entry.subStrand).trim() : '',
    specificLearningOutcomes: Array.isArray(entry.specificLearningOutcomes)
      ? entry.specificLearningOutcomes.map((item) => String(item).trim()).filter(Boolean)
      : entry.specificLearningOutcomes
      ? [String(entry.specificLearningOutcomes).trim()]
      : [],
    keyInquiryQuestions: Array.isArray(entry.keyInquiryQuestions)
      ? entry.keyInquiryQuestions.map((item) => String(item).trim()).filter(Boolean)
      : entry.keyInquiryQuestions
      ? [String(entry.keyInquiryQuestions).trim()]
      : [],
    learningExperiences: Array.isArray(entry.learningExperiences)
      ? entry.learningExperiences.map((item) => String(item).trim()).filter(Boolean)
      : entry.learningExperiences
      ? [String(entry.learningExperiences).trim()]
      : [],
    learningResources: Array.isArray(entry.learningResources)
      ? entry.learningResources.map((item) => String(item).trim()).filter(Boolean)
      : entry.learningResources
      ? [String(entry.learningResources).trim()]
      : [],
    rawText: entry.rawText || '',
  };
}

// Apply auth protection and admin restriction to all routes in this file
router.use(protect);
router.use(isAdmin);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/create-user
// ─────────────────────────────────────────────────────────────────────────────
router.post('/create-user', async (req, res) => {
  try {
    const { firstName, lastName, email, password, role } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide firstName, lastName, email, and password.',
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists.',
      });
    }

    const newUser = await User.create({
      firstName,
      lastName,
      email,
      password,
      role: role || 'teacher',
    });

    res.status(201).json({
      success: true,
      message: `${role === 'admin' ? 'Admin' : 'Teacher'} account created successfully.`,
      user: newUser.toSafeObject(),
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({
        success: false,
        message: messages.join(' '),
      });
    }

    console.error('Create user error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error creating user.',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/teachers
// ─────────────────────────────────────────────────────────────────────────────
router.get('/teachers', async (req, res) => {
  try {
    const teachers = await User.find({ role: 'teacher' }).sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      teachers: teachers.map(u => u.toSafeObject()),
    });
  } catch (err) {
    console.error('Fetch teachers error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error fetching teachers.',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/process-scheme
// ─────────────────────────────────────────────────────────────────────────────
router.post('/process-scheme', async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Gemini API key is not configured on the server.',
      });
    }

    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({
        success: false,
        message: 'Filename is required.',
      });
    }

    const filePath = path.join(__dirname, '../uploads', filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: `File not found: ${filename}`,
      });
    }

    const rawBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(rawBuffer);
    const rawText = pdfData.text || '';
    const blocks = splitWeeklyBlocks(rawText);
    if (blocks.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Could not split the uploaded PDF text into week blocks. Make sure the document contains "Week" headings.',
      });
    }

    const savedDocuments = [];

    for (const block of blocks) {
      const parsedEntries = await parseWeekBlock(block);
      for (const rawEntry of parsedEntries) {
        const entry = normalizeEntry({ ...rawEntry, rawText: block });

        if (!entry.week || !Number.isInteger(entry.lessonNumber) || entry.lessonNumber <= 0) {
          return res.status(400).json({
            success: false,
            message: 'Parsed scheme data must include week and numeric lessonNumber for every entry.',
            parsed: rawEntry,
          });
        }

        const filter = {
          week: entry.week,
          lessonNumber: entry.lessonNumber,
        };

        const update = {
          strand: entry.strand,
          subStrand: entry.subStrand,
          specificLearningOutcomes: entry.specificLearningOutcomes,
          keyInquiryQuestions: entry.keyInquiryQuestions,
          learningExperiences: entry.learningExperiences,
          learningResources: entry.learningResources,
          rawText: entry.rawText,
        };

        const document = await SchemeOfWork.findOneAndUpdate(filter, update, {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        });

        savedDocuments.push(document);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Scheme of Work processed and saved successfully.',
      count: savedDocuments.length,
      documents: savedDocuments,
    });
  } catch (err) {
    console.error('Process scheme error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Server error processing scheme document.',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/submissions
// ─────────────────────────────────────────────────────────────────────────────
router.get('/submissions', async (req, res) => {
  try {
    // Populate teacher details (firstName, lastName, email)
    const submissions = await Document.find({ status: 'pending' })
      .populate('teacherId', 'firstName lastName email schemeOfWork')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      submissions,
    });
  } catch (err) {
    console.error('Fetch submissions error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error fetching pending submissions.',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/admin/approve/:id
// ─────────────────────────────────────────────────────────────────────────────
router.put('/approve/:id', async (req, res) => {
  try {
    const { adminComments } = req.body;
    const update = {
      status: 'approved',
      reviewedBy: req.user._id,
      reviewedAt: new Date(),
      adminComments: adminComments || '',
    };

    const document = await Document.findByIdAndUpdate(req.params.id, update, {
      new: true,
    }).populate('teacherId', 'firstName lastName email');

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found.',
      });
    }

    document.history.push({
      action: 'approved',
      by: req.user._id,
      byName: `${req.user.firstName} ${req.user.lastName}`,
      at: new Date(),
      notes: adminComments || 'Approved submission.',
    });
    await document.save();

    res.status(200).json({
      success: true,
      message: 'Document approved successfully.',
      document,
    });
  } catch (err) {
    console.error('Approve document error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error approving document.',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/admin/reject/:id
// ─────────────────────────────────────────────────────────────────────────────
router.put('/reject/:id', async (req, res) => {
  try {
    const { adminComments, rejectionReason } = req.body;
    const update = {
      status: 'rejected',
      reviewedBy: req.user._id,
      reviewedAt: new Date(),
      adminComments: adminComments || '',
      rejectionReason: rejectionReason || '',
    };

    const document = await Document.findByIdAndUpdate(req.params.id, update, {
      new: true,
    }).populate('teacherId', 'firstName lastName email');

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found.',
      });
    }

    document.history.push({
      action: 'rejected',
      by: req.user._id,
      byName: `${req.user.firstName} ${req.user.lastName}`,
      at: new Date(),
      notes: rejectionReason || adminComments || 'Rejected submission.',
    });
    await document.save();

    res.status(200).json({
      success: true,
      message: 'Document rejected successfully.',
      document,
    });
  } catch (err) {
    console.error('Reject document error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error rejecting document.',
    });
  }
});

module.exports = router;
