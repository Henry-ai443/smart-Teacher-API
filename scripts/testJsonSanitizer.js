/**
 * Sanitizer and Parser Verification Test
 * Run with: node scripts/testJsonSanitizer.js
 */
const { sanitizeJsonResponse } = require('../services/aiService/shared');

console.log('=== Starting JSON Sanitizer & Parser Verification Test ===');
console.log('This test verifies that the robust post-processing sanitizeJsonResponse logic');
console.log('can successfully handle different kinds of malformed output formats.');
console.log('----------------------------------------------------------------------');

const testCases = [
  {
    name: 'Clean JSON Object',
    input: '{"projectName": "Axiom", "status": "active", "tags": ["education", "teacher"]}',
    shouldPass: true
  },
  {
    name: 'JSON wrapped in markdown backticks (with json header)',
    input: '```json\n{\n  "projectName": "Axiom",\n  "status": "active",\n  "tags": ["education", "teacher"]\n}\n```',
    shouldPass: true
  },
  {
    name: 'JSON wrapped in plain backticks',
    input: '```\n{"projectName": "Axiom", "status": "active", "tags": ["education", "teacher"]}\n```',
    shouldPass: true
  },
  {
    name: 'JSON with leading/trailing conversational filler',
    input: 'Sure! Here is the JSON representation you requested:\n\n{\n  "projectName": "Axiom",\n  "status": "active",\n  "tags": ["education", "teacher"]\n}\n\nHope this helps!',
    shouldPass: true
  },
  {
    name: 'JSON with backticks AND conversational filler',
    input: 'Here is the data:\n```json\n{\n  "projectName": "Axiom",\n  "status": "active",\n  "tags": ["education", "teacher"]\n}\n```\nLet me know if you need anything else.',
    shouldPass: true
  },
  {
    name: 'Invalid JSON that should fail',
    input: '{"projectName": "Axiom", "status": "active", "tags": ',
    shouldPass: false
  }
];

let allPassed = true;

testCases.forEach((tc, idx) => {
  console.log(`\nTest Case #${idx + 1}: ${tc.name}`);
  console.log('Raw Input length:', tc.input.length);
  
  const sanitized = sanitizeJsonResponse(tc.input);
  console.log('Sanitized output:');
  console.log(sanitized);

  try {
    const parsed = JSON.parse(sanitized);
    console.log('Parsed JavaScript Object:', parsed);
    if (tc.shouldPass) {
      console.log('✅ Success: Correctly parsed valid input.');
    } else {
      console.log('❌ Failure: Input should have failed parsing but passed.');
      allPassed = false;
    }
  } catch (err) {
    if (!tc.shouldPass) {
      console.log('✅ Success: Correctly rejected invalid input. Error message:', err.message);
    } else {
      console.log('❌ Failure: Failed to parse input. Error:', err.message);
      allPassed = false;
    }
  }
  console.log('-'.repeat(70));
});

if (allPassed) {
  console.log('\n🎉 ALL SANITIZATION AND PARSING TESTS PASSED SUCCESSFULY! 🎉');
} else {
  console.log('\n❌ SOME TEST CASES FAILED. Please review output.');
  process.exit(1);
}
