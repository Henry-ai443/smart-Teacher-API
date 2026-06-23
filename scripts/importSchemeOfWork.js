#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const inputFile = process.argv[2];

if (!inputFile) {
  console.error('Usage: node importSchemeOfWork.js <path-to-scheme-text-file>');
  process.exit(1);
}

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI in environment. Please configure your MongoDB connection string.');
  process.exit(1);
}

if (!GEMINI_API_KEY) {
  console.error('Missing GEMINI_API_KEY or GOOGLE_API_KEY in environment.');
  process.exit(1);
}

const absolutePath = path.resolve(process.cwd(), inputFile);
if (!fs.existsSync(absolutePath)) {
  console.error(`Scheme of work file not found: ${absolutePath}`);
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

const schemeSchema = new mongoose.Schema(
  {
    week: { type: String, trim: true },
    date: { type: String, trim: true },
    topic: { type: String, trim: true },
    subTopic: { type: String, trim: true },
    remarks: { type: String, trim: true },
    rawText: { type: String },
  },
  {
    collection: 'schemesofwork',
    timestamps: true,
    strict: false,
  }
);

const SchemeOfWork = mongoose.model('SchemeOfWork', schemeSchema);

function splitByWeek(text) {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  const chunks = normalized.split(/(?=^Week\s*\d+)/gim);
  return chunks.map((chunk) => chunk.trim()).filter(Boolean);
}

function parseJsonFromText(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (primaryError) {
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first >= 0 && last > first) {
      const jsonString = trimmed.slice(first, last + 1);
      return JSON.parse(jsonString);
    }
    throw primaryError;
  }
}

async function structureWeek(chunk, index) {
  const prompt = `You are a curriculum extractor. Convert the following week block into a single JSON object with exactly these keys: week, date, topic, subTopic, remarks. If a field cannot be inferred, set it to an empty string. Return only valid JSON without markdown, explanation, or extra text.\n\nWeek block:\n${chunk}`;

  const response = await model.generateContent({
    contents: prompt,
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  const text = response.response.text();
  const parsed = parseJsonFromText(text);

  return {
    week: parsed.week || `Week ${index + 1}`,
    date: parsed.date || '',
    topic: parsed.topic || '',
    subTopic: parsed.subTopic || parsed.sub_topic || parsed['sub-topic'] || '',
    remarks: parsed.remarks || '',
    rawText: chunk,
  };
}

async function run() {
  await mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  console.log('Connected to MongoDB.');

  const fileContents = fs.readFileSync(absolutePath, 'utf-8');
  const weeklyBlocks = splitByWeek(fileContents);

  if (weeklyBlocks.length === 0) {
    console.error('No week blocks were found in the file. Make sure the text contains "Week 1", "Week 2", etc.');
    process.exit(1);
  }

  console.log(`Found ${weeklyBlocks.length} week block(s). Processing...`);

  for (let idx = 0; idx < weeklyBlocks.length; idx += 1) {
    const chunk = weeklyBlocks[idx];
    try {
      const document = await structureWeek(chunk, idx);
      const saved = await SchemeOfWork.create(document);
      console.log(`Saved document ${idx + 1}:`, { _id: saved._id, week: saved.week });
    } catch (err) {
      console.error(`Failed to process week block ${idx + 1}:`, err.message || err);
    }
  }

  console.log('Import complete.');
  await mongoose.disconnect();
}

run().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
