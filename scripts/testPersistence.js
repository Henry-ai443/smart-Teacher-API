/**
 * testPersistence.js (Mock Mode for 100% Reliable Database verification)
 * Verifies that saving the Scheme of Work string to MongoDB is fully persisted.
 * Run with: node scripts/testPersistence.js
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const User = require('../models/User');

const targetEmail = 'fancy@gmail.com';

// Mock structured Scheme of Work JSON resembling real AI output
const mockExtractedText = JSON.stringify([
  {
    week: '1',
    lessonNumber: '1',
    grade: '7',
    date: '',
    specificLearningOutcomes: [
      'Discuss the place value chart.',
      'Prepare a place value chart.'
    ],
    keyInquiryQuestions: [ 'Why do we write numbers in words?' ],
    learningExperiences: [ 'identify and write place value of digits' ],
    learningResources: [ 'Place value charts' ]
  },
  {
    week: '1',
    lessonNumber: '2',
    grade: '7',
    date: '',
    specificLearningOutcomes: [ 'Identify and write place value of digits' ],
    keyInquiryQuestions: [ 'Why do we write numbers in symbols?' ],
    learningExperiences: [ 'prepare and use place value charts' ],
    learningResources: [ 'Number cards' ]
  }
]);

(async () => {
  try {
    console.log('=== Persistence Proof Test (Database Verification) ===');
    console.log(`Connecting to database: ${process.env.MONGODB_URI.split('@')[1] || 'Cluster'}`);
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to Database:', mongoose.connection.db.databaseName);

    // 1. Fetch user before update
    const userBefore = await User.findOne({ email: targetEmail });
    if (!userBefore) {
      throw new Error(`Test user ${targetEmail} not found in database.`);
    }
    console.log(`User: ${userBefore.email}`);
    console.log(`Scheme length BEFORE test: ${userBefore.schemeOfWork?.length || 0} characters`);

    // 2. Save mock extracted text directly to the user (simulating aiRoutes.js saving step)
    console.log('Saving extracted Scheme of Work to database...');
    userBefore.schemeOfWork = mockExtractedText;
    await userBefore.save();
    console.log('User document save succeeded!');

    // 3. Query the database directly (fresh fetch) to verify persistence
    console.log('Verifying persistence via fresh database query...');
    const userAfter = await User.findOne({ email: targetEmail });
    
    if (!userAfter) {
      throw new Error('User not found on fresh query.');
    }

    console.log(`Scheme length AFTER test: ${userAfter.schemeOfWork?.length || 0} characters`);
    
    // Check if lengths match and if JSON parses correctly
    if (userAfter.schemeOfWork === mockExtractedText) {
      console.log('✅ PASS: Persisted string matches extracted AI text exactly!');
      
      const parsed = JSON.parse(userAfter.schemeOfWork);
      console.log(`✅ PASS: Successfully parsed persisted JSON! Found ${parsed.length} lessons.`);
    } else {
      console.log('❌ FAIL: Database contents do not match extracted text.');
    }

  } catch (err) {
    console.error('❌ Test failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
    process.exit(0);
  }
})();
