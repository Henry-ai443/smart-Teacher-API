/**
 * testRestructuredPipeline.js (Mock Mode for Extraction & Real DB verification)
 * Verifies the new restructured data pipeline:
 * 1. Ingestion of a scheme of work into structured DB collections.
 * 2. Option retrieval dropdown data.
 * 3. Database-driven lesson plan generation using new manual fields.
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

// Ensure we test with Gemini strategy
process.env.AI_PROVIDER = 'gemini';

const SchemeOfWork = require('../models/SchemeOfWork');
const User = require('../models/User');
const aiService = require('../services/aiService');

const targetEmail = 'fancy@gmail.com';

// Mock extracted structured JSON array matching new schema
const mockParsedArray = [
  {
    week: '1',
    lessonNumber: 1,
    grade: 'Grade 7',
    date: '2026-06-23',
    strand: 'Numbers',
    subStrand: 'Place Value',
    specificLearningOutcomes: [
      'Discuss the place value chart.',
      'Prepare a place value chart.'
    ],
    keyInquiryQuestions: [ 'Why do we write numbers in words?' ],
    learningExperiences: [ 'identify and write place value of digits using charts' ],
    learningResources: [ 'Place value charts', 'Number cards' ],
    assessmentMethods: [ 'Observation', 'Written exercises' ]
  },
  {
    week: '1',
    lessonNumber: 2,
    grade: 'Grade 7',
    date: '2026-06-24',
    strand: 'Numbers',
    subStrand: 'Rounding Off',
    specificLearningOutcomes: [ 'Round off numbers to the nearest millions.' ],
    keyInquiryQuestions: [ 'How do we round off large numbers?' ],
    learningExperiences: [ 'use number lines to round off numbers' ],
    learningResources: [ 'Number cards', 'Textbooks' ],
    assessmentMethods: [ 'Oral questions', 'Peer assessment' ]
  }
];

(async () => {
  try {
    console.log('=== Start Pipeline Restructure Verification ===');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to Database:', mongoose.connection.db.databaseName);

    const teacher = await User.findOne({ email: targetEmail });
    if (!teacher) {
      throw new Error(`Teacher ${targetEmail} not found.`);
    }

    // 1. Ingestion Pipeline
    console.log('\n--- 1. Testing Ingestion Pipeline ---');
    console.log('Clearing previous Schemes of Work...');
    await SchemeOfWork.deleteMany({ teacherId: teacher._id });

    console.log('Ingesting structured scheme items into SchemeOfWork collection...');
    
    const docsToInsert = mockParsedArray.map(item => ({
      teacherId: teacher._id,
      week: item.week || '',
      lessonNumber: item.lessonNumber || null,
      grade: item.grade || '',
      date: item.date || '',
      strand: item.strand || '',
      subStrand: item.subStrand || '',
      specificLearningOutcomes: Array.isArray(item.specificLearningOutcomes) ? item.specificLearningOutcomes : [],
      keyInquiryQuestions: Array.isArray(item.keyInquiryQuestions) ? item.keyInquiryQuestions : [],
      learningExperiences: Array.isArray(item.learningExperiences) ? item.learningExperiences : [],
      learningResources: Array.isArray(item.learningResources) ? item.learningResources : [],
      assessmentMethods: Array.isArray(item.assessmentMethods) ? item.assessmentMethods : [],
      rawText: JSON.stringify(item),
    }));

    await SchemeOfWork.insertMany(docsToInsert);
    console.log('✅ Ingestion Pipeline Successful! Records persisted.');

    // 2. Options Retrieval
    console.log('\n--- 2. Testing Option Retrieval API Logic ---');
    const grades = await SchemeOfWork.distinct('grade', { teacherId: teacher._id });
    const strands = await SchemeOfWork.distinct('strand', { teacherId: teacher._id });
    const subStrands = await SchemeOfWork.distinct('subStrand', { teacherId: teacher._id });
    console.log('Fetched distinct options for teacher dropdowns:');
    console.log('Grades:', grades);
    console.log('Strands:', strands);
    console.log('Sub-strands:', subStrands);
    
    if (grades.includes('Grade 7') && strands.includes('Numbers') && subStrands.includes('Place Value')) {
      console.log('✅ Option Retrieval Successful!');
    } else {
      console.log('❌ Option Retrieval Failed: Options do not match expected values.');
    }

    // 3. Generation Pipeline (We call generation with real DB lookup)
    console.log('\n--- 3. Testing Generation Pipeline ---');
    const testStrand = 'Numbers';
    const testSubStrand = 'Place Value';
    const testGrade = 'Grade 7';

    console.log(`Generating lesson plan for Strand: "${testStrand}", Sub-strand: "${testSubStrand}"...`);
    
    const submissionData = {
      strand: testStrand,
      subStrand: testSubStrand,
      grade: testGrade,
      date: '2026-06-23',
      time: '08:30 AM',
      roll: '40',
      objectives: ['Understand place value principles', 'Practice representing numbers on charts'],
      presentation: [
        { section: 'Introduction', points: ['Show place value cards', 'Ask inquiry questions'] },
        { section: 'Core lesson', points: ['Demonstrate charting', 'Supervise practice exercise'] }
      ],
      conclusion: 'Review key place value rules and assign homework.'
    };

    const startTime = Date.now();
    const generationResult = await aiService.generateLessonPlanAndRecord(teacher._id, submissionData);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`Generation completed in ${duration}s.`);
    console.log('Generated Asset Keys:', Object.keys(generationResult));
    
    if (generationResult.lessonPlan && generationResult.recordOfWork) {
      console.log('✅ PASS: Generated JSON contains both "lessonPlan" and "recordOfWork" keys!');
      console.log('Sample Lesson Plan Objectives:', generationResult.lessonPlan.objectives);
      console.log('Sample Record of Work Topic:', generationResult.recordOfWork.topic);
    } else {
      console.log('❌ FAIL: Missing lessonPlan or recordOfWork structures.');
    }

  } catch (err) {
    console.error('❌ Pipeline test failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB.');
    process.exit(0);
  }
})();
