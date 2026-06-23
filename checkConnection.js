/**
 * checkConnection.js
 * Quick utility to verify MongoDB connection and environment config.
 * Run with: node checkConnection.js
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

console.log('─── Environment Check ───');
console.log('MONGODB_URI:', MONGODB_URI || '⚠️  NOT SET');
console.log('');

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not defined. Check your .env file.');
  process.exit(1);
}

(async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);

    const dbName = mongoose.connection.db.databaseName;
    console.log('✅ Connected successfully!');
    console.log('Database name:', dbName);

    // List all collections to verify data exists
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('\n─── Collections ───');
    if (collections.length === 0) {
      console.log('⚠️  No collections found in this database.');
    } else {
      for (const col of collections) {
        const count = await mongoose.connection.db.collection(col.name).countDocuments();
        console.log(`  ${col.name}: ${count} documents`);
      }
    }

    console.log('\n✅ Connection check complete.');
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
})();
