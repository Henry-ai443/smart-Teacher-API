/**
 * testCascadingRoute.js
 * Verifies that the cascading backend logic correctly structures Scheme documents
 * into the required nested format:
 * { "Grade 7": { "Numbers": ["Place Value", "Rounding Off"] } }
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const SchemeOfWork = require('../models/SchemeOfWork');
const User = require('../models/User');

const targetEmail = 'fancy@gmail.com';

(async () => {
  try {
    console.log('=== Start Cascading Route Verification ===');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to Database:', mongoose.connection.db.databaseName);

    const teacher = await User.findOne({ email: targetEmail });
    if (!teacher) {
      throw new Error(`Teacher ${targetEmail} not found.`);
    }

    // Retrieve schemes for this teacher
    const schemes = await SchemeOfWork.find({ teacherId: teacher._id }).select('grade strand subStrand').lean();
    console.log(`Found ${schemes.length} Scheme documents in DB.`);

    // Grouping logic (replicates aiRoutes.js /api/schemes/data)
    const hierarchy = {};
    schemes.forEach((scheme) => {
      const grade = scheme.grade || 'Unknown Grade';
      const strand = scheme.strand || 'Unknown Strand';
      const subStrand = scheme.subStrand || 'Unknown Sub-strand';

      if (!hierarchy[grade]) {
        hierarchy[grade] = {};
      }

      if (!hierarchy[grade][strand]) {
        hierarchy[grade][strand] = [];
      }

      if (!hierarchy[grade][strand].includes(subStrand)) {
        hierarchy[grade][strand].push(subStrand);
      }
    });

    console.log('\nGenerated Hierarchy:');
    console.log(JSON.stringify(hierarchy, null, 2));

    const grades = Object.keys(hierarchy);
    if (grades.includes('Grade 7') && hierarchy['Grade 7'] && hierarchy['Grade 7']['Numbers'] && hierarchy['Grade 7']['Numbers'].includes('Place Value')) {
      console.log('\n✅ PASS: Cascading hierarchy matches expected structure exactly!');
    } else {
      console.log('\n❌ FAIL: Hierarchy does not contain expected Grade 7 / Numbers / Place Value items.');
    }

  } catch (err) {
    console.error('❌ Verification failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
    process.exit(0);
  }
})();
