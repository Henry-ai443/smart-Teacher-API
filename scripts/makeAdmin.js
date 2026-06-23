/**
 * makeAdmin.js
 * Creates or updates user henrymaina2024@outlook.com as an 'admin' with the password 'Hm@0724356198'.
 * Run with: node scripts/makeAdmin.js
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const User = require('../models/User');

const targetEmail = 'henrymaina2024@outlook.com';
const targetPassword = 'Hm@0724356198';

(async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to Database:', mongoose.connection.db.databaseName);

    console.log(`Searching for user with email: ${targetEmail}`);
    let user = await User.findOne({ email: targetEmail });

    if (user) {
      console.log(`Found existing user: ${user.firstName} ${user.lastName}`);
      console.log("Updating password and upgrading role to 'admin'...");
      user.password = targetPassword;
      user.role = 'admin';
      await user.save();
      console.log('✅ Existing user successfully updated and upgraded to Admin!');
    } else {
      console.log('User not found. Creating new admin user...');
      user = new User({
        firstName: 'Henry',
        lastName: 'Maina',
        email: targetEmail,
        password: targetPassword,
        role: 'admin'
      });
      await user.save();
      console.log('✅ New Admin user successfully created!');
    }

    // Verify after saving
    const verifiedUser = await User.findOne({ email: targetEmail });
    console.log('------------------------------------------------');
    console.log('Verified Account details in Database:');
    console.log({
      id: verifiedUser._id,
      name: `${verifiedUser.firstName} ${verifiedUser.lastName}`,
      email: verifiedUser.email,
      role: verifiedUser.role,
      createdAt: verifiedUser.createdAt
    });
    console.log('------------------------------------------------');

  } catch (err) {
    console.error('❌ Failed to create/update admin user:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
    process.exit(0);
  }
})();
