const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Teacher reference is required'],
    },
    strand: {
      type: String,
      required: [true, 'Strand is required'],
      trim: true,
    },
    subStrand: {
      type: String,
      required: [true, 'Sub-strand is required'],
      trim: true,
    },
    grade: {
      type: String,
      trim: true,
    },
    date: {
      type: String,
      trim: true,
    },
    time: {
      type: String,
      trim: true,
    },
    roll: {
      type: String,
      trim: true,
    },
    conclusion: {
      type: String,
      trim: true,
    },
    objective: {
      type: String,
      required: [true, 'Objective is required'],
      trim: true,
    },
    objectives: {
      type: [String],
      required: [true, 'Objectives are required'],
      default: [],
    },
    presentation: {
      type: [
        new mongoose.Schema(
          {
            section: { type: String, required: true, trim: true },
            points: [{ type: String, trim: true }],
          },
          { _id: false }
        ),
      ],
      required: [true, 'Presentation structure is required'],
      default: [],
    },
    lessonPresentation: {
      type: String,
      trim: true,
      default: '',
    },
    lessonPlan: {
      objectives: { type: mongoose.Schema.Types.Mixed },
      materials: { type: mongoose.Schema.Types.Mixed },
      introduction: { type: mongoose.Schema.Types.Mixed },
      activities: { type: mongoose.Schema.Types.Mixed },
      evaluation: { type: mongoose.Schema.Types.Mixed },
    },
    recordOfWork: {
      type: mongoose.Schema.Types.Mixed, // Can be an array or object
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: {
      type: Date,
    },
    adminComments: {
      type: String,
      trim: true,
      default: '',
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: '',
    },
    history: {
      type: [
        {
          action: { type: String, required: true, trim: true },
          by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          byName: { type: String, trim: true },
          at: { type: Date, default: Date.now },
          notes: { type: String, trim: true },
        },
      ],
      default: [],
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
  },
  {
    timestamps: true,
  }
);

const Document = mongoose.model('Document', documentSchema);

module.exports = Document;
