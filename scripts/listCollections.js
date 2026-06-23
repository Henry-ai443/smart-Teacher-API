#!/usr/bin/env node
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI in environment. Please set it in .env or the environment.');
  process.exit(1);
}

async function run() {
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const db = mongoose.connection.db;
  try {
    const cols = await db.listCollections().toArray();
    console.log('Collections in database:');
    cols.forEach((c) => console.log(' -', c.name));
  } catch (err) {
    console.error('Failed to list collections:', err.message || err);
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error('Unexpected error listing collections:', err);
  process.exit(1);
});
