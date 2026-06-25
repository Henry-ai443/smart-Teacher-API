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

class AiExtractionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AiExtractionError';
  }
}

const SCHEME_FIELDS = [
  'subject',
  'grade',
  'strand',
  'subStrand',
  'specificLearningOutcomes',
  'keyInquiryQuestions',
  'learningExperiences',
  'learningResources',
  'assessmentMethods',
];

function validateSchemeEntry(entry) {
  const missing = [];
  if (!entry.subject) missing.push('subject');
  if (!entry.grade) missing.push('grade');
  if (!entry.strand) missing.push('strand');

  if (missing.length > 0) {
    throw new AiExtractionError(
      `AI extraction failed: missing required fields: ${missing.join(', ')}.`
    );
  }
}

function ensureExactSchemeSchema(entry) {
  const missingKeys = SCHEME_FIELDS.filter((field) => !(field in entry));
  if (missingKeys.length > 0) {
    throw new AiExtractionError(
      `AI extraction returned invalid JSON schema: missing fields ${missingKeys.join(', ')}.`
    );
  }
}

async function parseWeekBlock(block) {
  const systemInstruction = `You are a strict JSON extraction assistant. Extract curriculum information as an array of objects and return only valid JSON. Each item must include exactly these fields: subject, grade, strand, subStrand, specificLearningOutcomes, keyInquiryQuestions, learningExperiences, learningResources, assessmentMethods. If a field is missing in the source document, return null for scalar fields or an empty array for list fields. Do not omit, skip, truncate, rename, or invent fields. Return raw JSON only, with no markdown, labels, or explanation.`;
  const prompt = `Extract the following scheme of work text into clean JSON. Each item should be a JSON object with exactly these keys: subject, grade, strand, subStrand, specificLearningOutcomes, keyInquiryQuestions, learningExperiences, learningResources, assessmentMethods. Use arrays of strings for the list fields. If a field cannot be inferred, return an empty string for string fields, null for missing scalar values, or an empty array for list fields. Do not omit or remove any required field. Output only valid JSON without markdown, labels, or explanation.\n\nText:\n${block}`;

  const response = await geminiModel.generateContent({
    contents: [
      { role: 'system', parts: [{ text: systemInstruction }] },
      { role: 'user', parts: [{ text: prompt }] },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  });

  const raw = response.response.text();
  const parsed = parseJsonText(raw);
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  entries.forEach(ensureExactSchemeSchema);
  return entries;
}

function normalizeEntry(entry) {
  const normalizeArray = (value) => {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    return [];
  };

  return {
    subject: entry.subject ? String(entry.subject).trim() : '',
    grade: entry.grade ? String(entry.grade).trim() : '',
    strand: entry.strand ? String(entry.strand).trim() : '',
    subStrand: entry.subStrand ? String(entry.subStrand).trim() : '',
    specificLearningOutcomes: normalizeArray(entry.specificLearningOutcomes),
    keyInquiryQuestions: normalizeArray(entry.keyInquiryQuestions),
    learningExperiences: normalizeArray(entry.learningExperiences),
    learningResources: normalizeArray(entry.learningResources),
    assessmentMethods: normalizeArray(entry.assessmentMethods),
  };
}

async function upsertSchemeOfWorkItem(teacherId, entry) {
  const subStrandPayload = {
    subStrandName: entry.subStrand,
    specificLearningOutcomes: entry.specificLearningOutcomes,
    keyInquiryQuestions: entry.keyInquiryQuestions,
    learningExperiences: entry.learningExperiences,
    learningResources: entry.learningResources,
    assessmentMethods: entry.assessmentMethods,
  };

  const rootFilter = {
    teacherId,
    grade: entry.grade,
    subject: entry.subject,
  };

  const scheme = await SchemeOfWork.findOneAndUpdate(
    rootFilter,
    {
      $setOnInsert: {
        teacherId,
        grade: entry.grade,
        subject: entry.subject,
        strands: [],
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  const updatedSubStrand = await SchemeOfWork.findOneAndUpdate(
    {
      _id: scheme._id,
      'strands.strandName': entry.strand,
      'strands.subStrands.subStrandName': entry.subStrand,
    },
    {
      $set: {
        'strands.$[strand].subStrands.$[subStrand].specificLearningOutcomes': entry.specificLearningOutcomes,
        'strands.$[strand].subStrands.$[subStrand].keyInquiryQuestions': entry.keyInquiryQuestions,
        'strands.$[strand].subStrands.$[subStrand].learningExperiences': entry.learningExperiences,
        'strands.$[strand].subStrands.$[subStrand].learningResources': entry.learningResources,
        'strands.$[strand].subStrands.$[subStrand].assessmentMethods': entry.assessmentMethods,
      },
    },
    {
      arrayFilters: [
        { 'strand.strandName': entry.strand },
        { 'subStrand.subStrandName': entry.subStrand },
      ],
      new: true,
    }
  );

  if (updatedSubStrand) {
    return updatedSubStrand;
  }

  const updatedStrand = await SchemeOfWork.findOneAndUpdate(
    {
      _id: scheme._id,
      'strands.strandName': entry.strand,
    },
    {
      $push: {
        'strands.$[strand].subStrands': subStrandPayload,
      },
    },
    {
      arrayFilters: [{ 'strand.strandName': entry.strand }],
      new: true,
    }
  );

  if (updatedStrand) {
    return updatedStrand;
  }

  const updatedScheme = await SchemeOfWork.findByIdAndUpdate(
    scheme._id,
    {
      $push: {
        strands: {
          strandName: entry.strand,
          subStrands: [subStrandPayload],
        },
      },
    },
    { new: true }
  );

  return updatedScheme;
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
        const entry = normalizeEntry(rawEntry);
        validateSchemeEntry(entry);

        const document = await upsertSchemeOfWorkItem(req.user._id, entry);
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
    if (err instanceof AiExtractionError) {
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }
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
