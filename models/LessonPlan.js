const mongoose = require('mongoose');

const lessonPlanSchema = new mongoose.Schema(
  {
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Teacher reference is required'],
    },
    date: {
      type: String,
      trim: true,
      default: '',
    },
    grade: {
      type: String,
      trim: true,
      default: '',
    },
    strand: {
      type: String,
      trim: true,
      required: [true, 'Strand is required'],
    },
    subStrand: {
      type: String,
      trim: true,
      required: [true, 'Sub-strand is required'],
    },
    week: {
      type: String,
      trim: true,
      default: '',
    },
    lessonNumber: {
      type: Number,
      default: 0,
    },
    schemeDetails: {
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
    },
    pointFormInput: {
      objectives: {
        type: [String],
        default: [],
      },
      presentation: {
        type: [
          new mongoose.Schema(
            {
              section: { type: String, trim: true, required: true },
              points: [{ type: String, trim: true }],
            },
            { _id: false }
          ),
        ],
        default: [],
      },
    },
    generatedPlan: {
      lessonPlan: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
      recordOfWork: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
    },
    status: {
      type: String,
      enum: ['draft', 'pending', 'approved', 'rejected'],
      default: 'pending',
    },
  },
  {
    timestamps: true,
  }
);

const LessonPlan = mongoose.model('LessonPlan', lessonPlanSchema);
module.exports = LessonPlan;
