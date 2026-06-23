const express = require('express');
const { protect } = require('../middleware/auth');
const LessonPlan = require('../models/LessonPlan');
const Document = require('../models/Document');
const SchemeOfWork = require('../models/SchemeOfWork');

const router = express.Router();
router.use(protect);

const mongoose = require('mongoose');

// GET /api/schemes/metadata
// Returns distinct grades, strands and subStrands. Supports optional filters: ?grade=...&strand=...
router.get('/schemes/metadata', async (req, res) => {
  try {
    const { grade, strand } = req.query;

    // Log total documents in the collection to help debug empty distinct() results
    try {
      const totalDocs = await SchemeOfWork.countDocuments({});
      console.log('[schemes/metadata] Total documents in collection:', totalDocs);
    } catch (countErr) {
      console.warn('[schemes/metadata] Failed to count documents:', countErr.message || countErr);
    }

    // Return unfiltered distinct values unless specific filters are provided
    const grades = await SchemeOfWork.distinct('grade');

    let strands;
    if (typeof grade !== 'undefined' && grade !== '') {
      strands = await SchemeOfWork.distinct('strand', { grade });
    } else {
      strands = await SchemeOfWork.distinct('strand');
    }

    let subStrands;
    const subFilter = {};
    if (typeof grade !== 'undefined' && grade !== '') subFilter.grade = grade;
    if (typeof strand !== 'undefined' && strand !== '') subFilter.strand = strand;
    if (Object.keys(subFilter).length) {
      subStrands = await SchemeOfWork.distinct('subStrand', subFilter);
    } else {
      subStrands = await SchemeOfWork.distinct('subStrand');
    }

    console.log('[schemes/metadata] distinct sample (first grade,strand,subStrand):', {
      gradeSample: grades[0] || null,
      strandSample: strands[0] || null,
      subStrandSample: subStrands[0] || null,
    });
    console.log('[schemes/metadata] query:', { grade, strand });
    console.log('[schemes/metadata] results counts:', { grades: grades.length, strands: strands.length, subStrands: subStrands.length });

    return res.status(200).json({ success: true, metadata: { grades, strands, subStrands } });
  } catch (err) {
    console.error('Fetch schemes metadata error:', err);
    return res.status(500).json({ success: false, message: 'Server error fetching schemes metadata.' });
  }
});

// Temporary debug route: lists collections and returns first 3 docs from schemesofwork
router.get('/schemes/debug-db', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const cols = await db.listCollections().toArray();
    const collections = cols.map((c) => c.name);

    let sample = [];
    try {
      sample = await SchemeOfWork.find().limit(3).lean();
    } catch (sErr) {
      console.warn('Failed to read sample docs from schemesofwork:', sErr.message || sErr);
    }

    return res.status(200).json({ success: true, collections, sample });
  } catch (err) {
    console.error('Debug DB route error:', err);
    return res.status(500).json({ success: false, message: 'Server error in debug route.' });
  }
});

// GET /api/schemes/find
// Find a single scheme document matching grade/strand/subStrand (returns first match)
router.get('/schemes/find', async (req, res) => {
  try {
    const { grade, strand, subStrand } = req.query;
    if (!grade || !strand || !subStrand) {
      return res.status(400).json({ success: false, message: 'grade, strand and subStrand query parameters are required.' });
    }

    const doc = await SchemeOfWork.findOne({ grade, strand, subStrand }).sort({ week: 1, lessonNumber: 1 });
    if (!doc) {
      return res.status(404).json({ success: false, message: 'No matching scheme found.' });
    }

    return res.status(200).json({ success: true, scheme: doc });
  } catch (err) {
    console.error('Find scheme error:', err);
    return res.status(500).json({ success: false, message: 'Server error finding scheme.' });
  }
});

// GET /api/lesson-plans/scheme-options
router.get('/lesson-plans/scheme-options', async (req, res) => {
  try {
    const lessons = await SchemeOfWork.aggregate([
      {
        $group: {
          _id: {
            grade: '$grade',
            date: '$date',
            strand: '$strand',
            subStrand: '$subStrand',
            week: '$week',
            lessonNumber: '$lessonNumber',
          },
          documentId: { $first: '$_id' },
        },
      },
      {
        $project: {
          _id: 0,
          id: '$documentId',
          grade: '$_id.grade',
          date: '$_id.date',
          strand: '$_id.strand',
          subStrand: '$_id.subStrand',
          week: '$_id.week',
          lessonNumber: '$_id.lessonNumber',
        },
      },
      { $sort: { grade: 1, date: 1, strand: 1, subStrand: 1, lessonNumber: 1 } },
    ]);

    const grades = await SchemeOfWork.distinct('grade');
    const dates = await SchemeOfWork.distinct('date');
    const strands = await SchemeOfWork.distinct('strand');
    const subStrands = await SchemeOfWork.distinct('subStrand');

    res.status(200).json({
      success: true,
      options: { lessons, grades, dates, strands, subStrands },
    });
  } catch (err) {
    console.error('Fetch scheme options error:', err);
    res.status(500).json({ success: false, message: 'Server error fetching scheme options.' });
  }
});

// GET /api/lesson-plans/scheme-detail
router.get('/lesson-plans/scheme-detail', async (req, res) => {
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ success: false, message: 'Scheme ID is required.' });
    }

    const detail = await SchemeOfWork.findById(id);
    if (!detail) {
      return res.status(404).json({ success: false, message: 'Scheme detail not found.' });
    }

    res.status(200).json({
      success: true,
      detail,
    });
  } catch (err) {
    console.error('Fetch scheme detail error:', err);
    res.status(500).json({ success: false, message: 'Server error fetching scheme detail.' });
  }
});

// POST /api/lesson-plans
router.post('/lesson-plans', async (req, res) => {
  try {
    const {
      date,
      grade,
      strand,
      subStrand,
      week,
      lessonNumber,
      schemeDetails,
      pointFormInput,
      generatedPlan,
    } = req.body;

    if (!strand || !subStrand || !generatedPlan || !generatedPlan.lessonPlan) {
      return res.status(400).json({
        success: false,
        message: 'Required fields are missing.',
      });
    }

    const lessonPlan = await LessonPlan.create({
      teacherId: req.user._id,
      date: date || '',
      grade: grade || '',
      strand,
      subStrand,
      week: week || '',
      lessonNumber: lessonNumber || 0,
      schemeDetails: schemeDetails || {},
      pointFormInput: pointFormInput || {},
      generatedPlan,
      status: 'pending',
    });

    await Document.create({
      teacherId: req.user._id,
      strand,
      subStrand,
      objective: Array.isArray(pointFormInput?.objectives) ? pointFormInput.objectives[0] || '' : '',
      objectives: pointFormInput?.objectives || [],
      presentation: pointFormInput?.presentation || [],
      lessonPlan: generatedPlan.lessonPlan || {},
      recordOfWork: generatedPlan.recordOfWork || {},
      status: 'pending',
    });

    res.status(201).json({ success: true, message: 'Lesson plan saved successfully.', lessonPlan });
  } catch (err) {
    console.error('Save lesson plan error:', err);
    res.status(500).json({ success: false, message: 'Server error saving lesson plan.' });
  }
});

module.exports = router;
