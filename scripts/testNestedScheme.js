/**
 * testNestedScheme.js
 * Verifies that the new nested hierarchical SchemeOfWork model correctly
 * persists and retrieves strands and sub-strands in the expected structure.
 *
 * Usage: node scripts/testNestedScheme.js
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const SchemeOfWork = require('../models/SchemeOfWork');
const User = require('../models/User');

const targetEmail = 'fancy@gmail.com';

// Mock hierarchical scheme matching the new model
const mockScheme = {
  grade: 'Grade 7',
  strands: [
    {
      strandName: 'Numbers',
      subStrands: [
        {
          subStrandName: 'Place Value',
          specificLearningOutcomes: [
            'Discuss the place value chart.',
            'Prepare a place value chart.',
          ],
          keyInquiryQuestions: ['Why do we write numbers in words?'],
          learningExperiences: ['Identify and write place value of digits using charts'],
          learningResources: ['Place value charts', 'Number cards'],
          assessmentMethods: ['Observation', 'Written exercises'],
        },
        {
          subStrandName: 'Rounding Off',
          specificLearningOutcomes: ['Round off numbers to the nearest millions.'],
          keyInquiryQuestions: ['How do we round off large numbers?'],
          learningExperiences: ['Use number lines to round off numbers'],
          learningResources: ['Number cards', 'Textbooks'],
          assessmentMethods: ['Oral questions', 'Peer assessment'],
        },
      ],
    },
    {
      strandName: 'Geometry',
      subStrands: [
        {
          subStrandName: 'Lines and Angles',
          specificLearningOutcomes: ['Identify different types of angles.'],
          keyInquiryQuestions: ['What is the difference between acute and obtuse angles?'],
          learningExperiences: ['Measure angles using a protractor'],
          learningResources: ['Protractor', 'Geometry set'],
          assessmentMethods: ['Practical test', 'Written exercises'],
        },
      ],
    },
  ],
};

(async () => {
  try {
    console.log('=== Nested Hierarchical Scheme Verification ===\n');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to Database:', mongoose.connection.db.databaseName);

    const teacher = await User.findOne({ email: targetEmail });
    if (!teacher) {
      throw new Error(`Teacher ${targetEmail} not found. Run makeAdmin.js first.`);
    }
    console.log(`Teacher found: ${teacher.firstName} ${teacher.lastName} (${teacher._id})\n`);

    // ─── 1. Clear previous data ──────────────────────────────────────────
    console.log('--- 1. Clearing previous SchemeOfWork documents ---');
    await SchemeOfWork.deleteMany({ teacherId: teacher._id });
    console.log('✅ Cleared.\n');

    // ─── 2. Insert the nested scheme via upsert ─────────────────────────
    console.log('--- 2. Upserting Grade 7 nested scheme ---');
    const upsertedDoc = await SchemeOfWork.findOneAndUpdate(
      { teacherId: teacher._id, grade: mockScheme.grade },
      {
        teacherId: teacher._id,
        grade: mockScheme.grade,
        strands: mockScheme.strands,
      },
      { upsert: true, new: true, runValidators: true }
    );
    console.log(`✅ Upserted document _id: ${upsertedDoc._id}`);
    console.log(`   Grade: ${upsertedDoc.grade}`);
    console.log(`   Strands count: ${upsertedDoc.strands.length}\n`);

    // ─── 3. Re-read from DB and validate nesting ────────────────────────
    console.log('--- 3. Reading back from database ---');
    const readBack = await SchemeOfWork.findOne({
      teacherId: teacher._id,
      grade: 'Grade 7',
    }).lean();

    if (!readBack) {
      throw new Error('Read-back failed: document not found in DB.');
    }

    console.log(`   Grade: ${readBack.grade}`);
    console.log(`   Strands: ${readBack.strands.map((s) => s.strandName).join(', ')}`);

    const numbersStrand = readBack.strands.find((s) => s.strandName === 'Numbers');
    const geometryStrand = readBack.strands.find((s) => s.strandName === 'Geometry');

    if (!numbersStrand || !geometryStrand) {
      throw new Error('Missing expected strands in read-back.');
    }

    console.log(`   Numbers sub-strands: ${numbersStrand.subStrands.map((ss) => ss.subStrandName).join(', ')}`);
    console.log(`   Geometry sub-strands: ${geometryStrand.subStrands.map((ss) => ss.subStrandName).join(', ')}`);

    const placeValue = numbersStrand.subStrands.find((ss) => ss.subStrandName === 'Place Value');
    if (!placeValue) {
      throw new Error('Place Value sub-strand not found.');
    }
    console.log(`   Place Value outcomes: ${placeValue.specificLearningOutcomes.join('; ')}`);
    console.log(`   Place Value resources: ${placeValue.learningResources.join(', ')}\n`);

    // ─── 4. Build cascading hierarchy (replicates /schemes/data logic) ──
    console.log('--- 4. Building cascading hierarchy ---');
    const schemes = await SchemeOfWork.find({ teacherId: teacher._id }).lean();
    const hierarchy = {};

    schemes.forEach((scheme) => {
      hierarchy[scheme.grade] = {};
      (scheme.strands || []).forEach((strand) => {
        hierarchy[scheme.grade][strand.strandName] = (strand.subStrands || []).map(
          (ss) => ss.subStrandName
        );
      });
    });

    console.log(JSON.stringify(hierarchy, null, 2));

    // ─── 5. Validate expected structure ─────────────────────────────────
    console.log('\n--- 5. Validation ---');
    const g7 = hierarchy['Grade 7'];
    if (
      g7 &&
      g7['Numbers'] &&
      g7['Numbers'].includes('Place Value') &&
      g7['Numbers'].includes('Rounding Off') &&
      g7['Geometry'] &&
      g7['Geometry'].includes('Lines and Angles')
    ) {
      console.log('✅ PASS: Nested hierarchy matches expected structure exactly!');
    } else {
      console.log('❌ FAIL: Hierarchy does not match expected structure.');
    }

    // ─── 6. Test upsert (overwrite) ─────────────────────────────────────
    console.log('\n--- 6. Testing upsert (re-insert same grade) ---');
    const updatedStrands = [
      {
        strandName: 'Numbers',
        subStrands: [
          {
            subStrandName: 'Place Value',
            specificLearningOutcomes: ['UPDATED: Demonstrate place value chart on board.'],
            keyInquiryQuestions: ['UPDATED: Why is place value important?'],
            learningExperiences: ['UPDATED: Interactive board exercise'],
            learningResources: ['Smart board', 'Number cards'],
            assessmentMethods: ['Oral evaluation'],
          },
        ],
      },
    ];

    await SchemeOfWork.findOneAndUpdate(
      { teacherId: teacher._id, grade: 'Grade 7' },
      { strands: updatedStrands },
      { upsert: true, new: true }
    );

    const afterUpsert = await SchemeOfWork.findOne({ teacherId: teacher._id, grade: 'Grade 7' }).lean();
    const docCount = await SchemeOfWork.countDocuments({ teacherId: teacher._id, grade: 'Grade 7' });
    console.log(`   Documents for Grade 7 after upsert: ${docCount} (should be 1)`);
    console.log(`   Strands after upsert: ${afterUpsert.strands.map((s) => s.strandName).join(', ')}`);
    const pv = afterUpsert.strands[0]?.subStrands[0];
    console.log(`   Place Value outcomes: ${pv?.specificLearningOutcomes?.join('; ')}`);

    if (docCount === 1 && pv?.specificLearningOutcomes?.[0]?.startsWith('UPDATED')) {
      console.log('✅ PASS: Upsert correctly overwrote the existing Grade 7 document!');
    } else {
      console.log('❌ FAIL: Upsert did not behave as expected.');
    }

  } catch (err) {
    console.error('❌ Verification failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB.');
    process.exit(0);
  }
})();
