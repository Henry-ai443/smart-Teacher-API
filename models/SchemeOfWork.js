const mongoose = require('mongoose');

// ─── Sub-strand schema (innermost level) ────────────────────────────────────
const subStrandSchema = new mongoose.Schema(
  {
    subStrandName: {
      type: String,
      required: [true, 'Sub-strand name is required'],
      trim: true,
    },
    specificLearningOutcomes: {
      type: [String],
      default: [],
    },
    keyInquiryQuestions: {
      type: [String],
      default: [],
    },
    learningExperiences: {
      type: [String],
      default: [],
    },
    learningResources: {
      type: [String],
      default: [],
    },
    assessmentMethods: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
);

// ─── Strand schema (middle level) ───────────────────────────────────────────
const strandSchema = new mongoose.Schema(
  {
    strandName: {
      type: String,
      required: [true, 'Strand name is required'],
      trim: true,
    },
    subStrands: {
      type: [subStrandSchema],
      default: [],
    },
  },
  { _id: false }
);

// ─── Root SchemeOfWork schema (one document per grade per teacher) ───────────
const schemeOfWorkSchema = new mongoose.Schema(
  {
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Teacher reference is required'],
    },
    grade: {
      type: String,
      required: [true, 'Grade is required'],
      trim: true,
    },
    strands: {
      type: [strandSchema],
      default: [],
    },
  },
  {
    collection: 'schemesofwork',
    timestamps: true,
  }
);

// Compound unique index: one scheme document per (teacherId, grade)
schemeOfWorkSchema.index({ teacherId: 1, grade: 1 }, { unique: true });

const SchemeOfWork = mongoose.model('SchemeOfWork', schemeOfWorkSchema, 'schemesofwork');
module.exports = SchemeOfWork;
