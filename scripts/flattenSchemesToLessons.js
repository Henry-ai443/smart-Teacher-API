#!/usr/bin/env node
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI in environment. Please set it and retry.');
  process.exit(1);
}

const oldSchemeSchema = new mongoose.Schema({}, { strict: false, collection: 'schemesofwork' });
const OldScheme = mongoose.model('OldScheme', oldSchemeSchema);

const lessonSchema = new mongoose.Schema(
  {
    grade: { type: String, default: '' },
    strand: { type: String, default: '' },
    subStrand: { type: String, default: '' },
    week: { type: String, default: '' },
    lessonNumber: { type: Number, default: 0 },
    date: { type: String, default: '' },
    specificLearningOutcomes: { type: [String], default: [] },
    keyInquiryQuestions: { type: [String], default: [] },
    learningExperiences: { type: [String], default: [] },
    learningResources: { type: [String], default: [] },
    rawText: { type: String, default: '' },
    sourceSchemeId: { type: mongoose.Schema.Types.ObjectId, ref: 'OldScheme' },
  },
  { collection: 'lessons', timestamps: true }
);

const Lesson = mongoose.model('Lesson', lessonSchema);

function safeParseMaybeJsonArray(input) {
  if (!input) return null;
  if (Array.isArray(input)) return input;
  if (typeof input === 'object') return input;
  if (typeof input !== 'string') return null;

  // Trim and attempt parse
  const trimmed = input.trim();
  try {
    const parsed = JSON.parse(trimmed);
    return parsed;
  } catch (err) {
    // Try to extract JSON array from surrounding text
    const first = trimmed.indexOf('[');
    const last = trimmed.lastIndexOf(']');
    if (first !== -1 && last !== -1 && last > first) {
      const sub = trimmed.slice(first, last + 1);
      try {
        return JSON.parse(sub);
      } catch (e) {
        return null;
      }
    }
    return null;
  }
}

async function run() {
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB.');

  const cursor = OldScheme.find().cursor();
  let totalSource = 0;
  let totalInserted = 0;

  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    totalSource += 1;
    const sourceId = doc._id;

    // field could be named `schemeOfWork` or `schemeOfWorkText` depending on import
    const raw = doc.schemeOfWork || doc.scheme_of_work || doc.scheme || null;
    const parsed = safeParseMaybeJsonArray(raw);

    if (!parsed || !Array.isArray(parsed)) {
      console.warn(`[${sourceId}] No parseable schemeOfWork array found; skipping.`);
      continue;
    }

    const lessonsToInsert = [];
    for (let idx = 0; idx < parsed.length; idx += 1) {
      const item = parsed[idx] || {};

      const lesson = {
        grade: item.grade || doc.grade || item.GRADE || '',
        strand: item.strand || doc.strand || item.STRAND || '',
        subStrand: item.subStrand || item.sub_strand || doc.subStrand || doc.sub_strand || '',
        week: item.week || doc.week || '',
        lessonNumber: item.lessonNumber || item.lesson_number || (typeof item.lessonNumber === 'number' ? item.lessonNumber : idx + 1),
        date: item.date || doc.date || '',
        specificLearningOutcomes: item.specificLearningOutcomes || item.specific_learning_outcomes || item.outcomes || [],
        keyInquiryQuestions: item.keyInquiryQuestions || item.key_inquiry_questions || item.keyQuestions || [],
        learningExperiences: item.learningExperiences || item.learning_experiences || item.activities || [],
        learningResources: item.learningResources || item.learning_resources || item.resources || [],
        rawText: JSON.stringify(item),
        sourceSchemeId: sourceId,
      };

      lessonsToInsert.push(lesson);
    }

    if (lessonsToInsert.length) {
      try {
        const inserted = await Lesson.insertMany(lessonsToInsert, { ordered: false });
        totalInserted += inserted.length;
        console.log(`Inserted ${inserted.length} lessons for source ${sourceId}`);
      } catch (err) {
        // insertMany can throw on duplicates; report partial
        if (err && err.insertedDocs) {
          totalInserted += err.insertedDocs.length;
          console.log(`Inserted ${err.insertedDocs.length} (partial) lessons for source ${sourceId}`);
        } else {
          console.error(`Failed inserting lessons for source ${sourceId}:`, err.message || err);
        }
      }
    }
  }

  console.log(`Completed. Processed ${totalSource} source docs. Inserted ${totalInserted} lesson docs.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Unexpected error during flattening:', err);
  process.exit(1);
});
