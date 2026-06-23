/**
 * Debug Gemini extraction using the factory and the repair parser.
 * Run with: node scripts/debugGeminiExtract.js
 */
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config();
process.env.AI_PROVIDER = 'gemini';

const aiService = require('../services/aiService');

const uploadsDir = path.join(__dirname, '../uploads');
const files = fs.readdirSync(uploadsDir).filter(f => f.endsWith('.pdf'));

if (files.length === 0) {
  console.error('No PDF files found in uploads directory.');
  process.exit(1);
}

const pdfPath = path.join(uploadsDir, files[0]);
console.log(`Analyzing PDF: ${pdfPath}`);

(async () => {
  try {
    console.log('Calling extractSchemeOfWorkText...');
    const startTime = Date.now();
    const resultJson = await aiService.extractSchemeOfWorkText(pdfPath);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`Extraction complete in ${duration}s.`);
    const parsed = JSON.parse(resultJson);
    console.log('✅ Successfully parsed final JSON!');
    console.log('Number of lessons extracted:', Array.isArray(parsed) ? parsed.length : 'Not an array');
    if (Array.isArray(parsed) && parsed.length > 0) {
      console.log('Sample lesson structure:', parsed[0]);
    }
  } catch (err) {
    console.error('❌ Failed:', err);
  }
})();
