/**
 * Verification test for DeepSeek JSON extraction and parsing.
 * Run with: node scripts/testDeepSeekJson.js
 */
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

// Ensure AI_PROVIDER is deepseek
process.env.AI_PROVIDER = 'deepseek';

const aiService = require('../services/aiService');

async function testDeepSeekExtraction() {
  console.log('=== Starting DeepSeek JSON Verification Test ===');
  console.log(`Current AI_PROVIDER: ${process.env.AI_PROVIDER}`);
  console.log(`DeepSeek API Key configured: ${process.env.DEEPSEEK_API_KEY ? 'Yes' : 'No'}`);
  console.log('------------------------------------------------');

  const systemInstruction = 
    'You are a JSON assistant. Respond ONLY with a valid JSON object. ' +
    'The object must contain three fields: "projectName" (string), "status" (string), and "tags" (array of strings). ' +
    'Do not add any conversational filler, explanation, or markdown fences.';

  const userPrompt = 'Please generate metadata for a teacher curriculum app.';

  try {
    console.log('Sending request to DeepSeek API...');
    const startTime = Date.now();
    
    // Call deepseekProvider.generateContent directly to see the sanitized raw string
    const rawContent = await aiService.generateContent(systemInstruction, userPrompt, {
      temperature: 0.1
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`API response received in ${duration}s.`);
    console.log('------------------------------------------------');
    console.log('Raw Sanitized Content from API:');
    console.log(rawContent);
    console.log('------------------------------------------------');

    console.log('Attempting to parse output with JSON.parse()...');
    const parsed = JSON.parse(rawContent);
    console.log('✅ JSON parsing successful!');
    console.log('Parsed JavaScript Object:', parsed);
    console.log('------------------------------------------------');

    if (parsed.projectName && parsed.status && Array.isArray(parsed.tags)) {
      console.log('✅ Schema validation PASSED! All expected fields are present.');
    } else {
      console.log('❌ Schema validation FAILED. Some fields are missing.');
    }

  } catch (err) {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  }
}

testDeepSeekExtraction();
