/**
 * testRestructuredPipelineMock.js
 * Verifies the correctness of the restructured data pipeline offline by mocking
 * the underlying AI strategies while testing Mongoose database persistence,
 * dropdown option retrieval, and schema structure validation.
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const SchemeOfWork = require('../models/SchemeOfWork');
const User = require('../models/User');
const { sanitizeJsonResponse, repairAndParseJson } = require('../services/aiService/shared');

const targetEmail = 'fancy@gmail.com';

// Mock raw response from AI for PDF extraction (contains markdown code fences and conversational text)
const mockRawPdfExtraction = `
Here is the extracted scheme of work:
\`\`\`json
[
  {
    "week": "1",
    "lessonNumber": 1,
    "grade": "Grade 7",
    "date": "2026-06-23",
    "strand": "Numbers",
    "subStrand": "Place Value",
    "specificLearningOutcomes": [
      "Discuss the place value chart.",
      "Prepare a place value chart."
    ],
    "keyInquiryQuestions": [ "Why do we write numbers in words?" ],
    "learningExperiences": [ "identify and write place value of digits using charts" ],
    "learningResources": [ "Place value charts", "Number cards" ],
    "assessmentMethods": [ "Observation", "Written exercises" ]
  },
  {
    "week": "1",
    "lessonNumber": 2,
    "grade": "Grade 7",
    "date": "2026-06-24",
    "strand": "Numbers",
    "subStrand": "Rounding Off",
    "specificLearningOutcomes": [ "Round off numbers to the nearest millions." ],
    "keyInquiryQuestions": [ "How do we round off large numbers?" ],
    "learningExperiences": [ "use number lines to round off numbers" ],
    "learningResources": [ "Number cards", "Textbooks" ],
    "assessmentMethods": [ "Oral questions", "Peer assessment" ]
  }
]
\`\`\`
Hope this helps!
`;

// Mock raw response from AI for lesson generation
const mockRawLessonGeneration = `
Sure! Here is the lesson plan and record of work:
\`\`\`json
{
  "lessonPlan": {
    "objectives": ["Understand place value principles", "Practice representing numbers on charts"],
    "materials": ["Place value cards", "Chalkboard"],
    "introduction": "Recall basic numbers in symbols.",
    "activities": "Demonstrate charting. Students practice representing numbers.",
    "conclusion": "Review rules.",
    "evaluation": "Exercise on page 10."
  },
  "recordOfWork": {
    "week": "1",
    "date": "2026-06-23",
    "topic": "Numbers",
    "subTopic": "Place Value",
    "remarks": "Completed successfully."
  }
}
\`\`\`
`;

(async () => {
  try {
    console.log('=== Start Offline Pipeline Restructure Verification ===');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to Database:', mongoose.connection.db.databaseName);

    const teacher = await User.findOne({ email: targetEmail });
    if (!teacher) {
      throw new Error(`Teacher ${targetEmail} not found.`);
    }

    // 1. Ingestion Pipeline
    console.log('\n--- 1. Testing Ingestion & Sanitization Pipeline ---');
    console.log('Clearing previous Schemes of Work...');
    await SchemeOfWork.deleteMany({ teacherId: teacher._id });

    console.log('Sanitizing and parsing mock raw PDF extraction...');
    const sanitizedExt = sanitizeJsonResponse(mockRawPdfExtraction);
    const parsedArray = repairAndParseJson(sanitizedExt);

    console.log(`Parsed ${parsedArray.length} items. Saving to SchemeOfWork collection...`);
    
    const docsToInsert = parsedArray.map(item => ({
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

    // 3. Generation Pipeline (Offline Database and parsing lookup check)
    console.log('\n--- 3. Testing Generation Pipeline context gathering ---');
    const testStrand = 'Numbers';
    const testSubStrand = 'Place Value';

    console.log(`Fetching scheme detail from DB for Strand: "${testStrand}", Sub-strand: "${testSubStrand}"...`);
    const dbSchemeDetail = await SchemeOfWork.findOne({ teacherId: teacher._id, strand: testStrand, subStrand: testSubStrand });
    
    if (!dbSchemeDetail) {
      throw new Error('Scheme detail not found in database.');
    }
    console.log('✅ Successfully retrieved scheme detail from DB!');
    console.log('- Specific Learning Outcomes:', dbSchemeDetail.specificLearningOutcomes);
    console.log('- Assessment Methods:', dbSchemeDetail.assessmentMethods);

    console.log('Sanitizing and parsing mock raw Lesson Generation output...');
    const sanitizedGen = sanitizeJsonResponse(mockRawLessonGeneration);
    const parsedGen = repairAndParseJson(sanitizedGen);

    console.log('Generated Asset Keys:', Object.keys(parsedGen));
    if (parsedGen.lessonPlan && parsedGen.recordOfWork) {
      console.log('✅ PASS: Generated JSON contains both "lessonPlan" and "recordOfWork" keys!');
      console.log('- objectives:', parsedGen.lessonPlan.objectives);
      console.log('- remarks:', parsedGen.recordOfWork.remarks);
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
