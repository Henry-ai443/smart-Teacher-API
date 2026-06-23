/**
 * AI Service — Strategy Pattern Factory
 *
 * Reads process.env.AI_PROVIDER ('gemini' | 'deepseek') and delegates all
 * AI calls to the selected provider. Both providers implement the same
 * interface so the rest of the app is provider-agnostic.
 *
 * Exports:
 *   - generateContent(systemInstruction, userPrompt, options)
 *   - extractSchemeOfWorkText(filePath)
 *   - generateLessonPlanAndRecord(teacherId, submissionData)
 */

const fs = require('fs');
const path = require('path');
const User = require('../../models/User');
const { isServiceUnavailableError, sanitizeJsonResponse, repairAndParseJson } = require('./shared');

// ─── Provider selection ─────────────────────────────────────────────────────

const AI_PROVIDER = (process.env.AI_PROVIDER || 'gemini').toLowerCase();

let provider;

switch (AI_PROVIDER) {
  case 'gemini':
    provider = require('./geminiProvider');
    break;
  case 'deepseek':
    provider = require('./deepseekProvider');
    break;
  default:
    throw new Error(
      `Unknown AI_PROVIDER "${AI_PROVIDER}". Supported values: gemini, deepseek.`
    );
}

console.log(`🤖 AI Provider: ${provider.name}`);

// ─── Uniform public API ─────────────────────────────────────────────────────

/**
 * Generate text content using the active AI provider.
 * @param {string} systemInstruction - System-level prompt
 * @param {string} userPrompt - User-level prompt
 * @param {object} [options] - Provider options (max_tokens, temperature, etc.)
 * @returns {Promise<string>} Raw text response
 */
async function generateContent(systemInstruction, userPrompt, options = {}) {
  return provider.generateContent(systemInstruction, userPrompt, options);
}

// ─── Domain functions (provider-agnostic) ───────────────────────────────────

/**
 * Extracts structured Scheme of Work JSON from an uploaded PDF.
 * Delegates file handling to the active provider's extractFromFile method.
 * @param {string} filePath - Absolute path to the uploaded PDF document
 * @returns {Promise<string>} Clean JSON string representation of the Scheme of Work
 */
async function extractSchemeOfWorkText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.pdf') {
    throw new Error('Only PDF uploads are supported for Scheme of Work extraction.');
  }

  const rawBuffer = fs.readFileSync(filePath);
  const base64Data = rawBuffer.toString('base64');

  const systemInstruction =
    'You are an expert curriculum assistant. Analyze the provided document and return ONLY a valid JSON object representing a hierarchical Scheme of Work. ' +
    'The JSON structure MUST be exactly: ' +
    '{ "grade": "<grade string>", "strands": [ { "strandName": "<strand>", "subStrands": [ { "subStrandName": "<sub-strand>", ' +
    '"specificLearningOutcomes": ["..."], "keyInquiryQuestions": ["..."], "learningExperiences": ["..."], ' +
    '"learningResources": ["..."], "assessmentMethods": ["..."] } ] } ] }. ' +
    'Group all strands under the document\'s grade. Each strand contains its sub-strands with full curriculum details. ' +
    'Do not include any explanation, markdown formatting, or code fences — return raw JSON only.';

  const userPrompt =
    'Read the attached scheme of work document and return ONLY the hierarchical JSON representation with grade, strands, and sub-strands.';

  try {
    const responseText = await provider.extractFromFile(
      base64Data,
      'application/pdf',
      systemInstruction,
      userPrompt,
      { max_tokens: 8192, temperature: 0.1 }
    );

    if (!responseText) {
      throw new Error('AI provider did not return any extracted content.');
    }

    // Sanitize and safely parse/repair in case of truncation or malformed parts.
    const sanitized = sanitizeJsonResponse(responseText);
    const parsed = repairAndParseJson(sanitized);
    return JSON.stringify(parsed);
  } catch (err) {
    console.error(`[${provider.name}] extract error:`, err);
    if (isServiceUnavailableError(err)) {
      throw new Error('The document extraction service is busy. Please try again shortly.');
    }
    if (err instanceof SyntaxError) {
      throw new Error('The AI provider returned malformed JSON. Please try again with a different document or upload quality.');
    }
    throw new Error(err.message || 'Failed to extract the Scheme of Work from the document.');
  }
}

/**
 * Performs RAG: Retrieves the stored Scheme of Work text, combines it with
 * form inputs, and calls the active AI provider to generate a Lesson Plan
 * and a Record of Work.
 * @param {string} teacherId - MongoDB user ID of the teacher
 * @param {object} submissionData - { strand, subStrand, objectives, presentation, conclusion, date, time, roll, grade }
 * @returns {Promise<object>} Parsed JSON containing { lessonPlan, recordOfWork }
 */
async function generateLessonPlanAndRecord(teacherId, submissionData) {
  const teacher = await User.findById(teacherId);
  if (!teacher) {
    throw new Error('Teacher not found for lesson generation.');
  }

  const { strand, subStrand, objectives, presentation, date, time, roll, conclusion, grade } = submissionData;

  // Fetch the relevant Scheme of Work details from the nested hierarchical model
  const SchemeOfWork = require('../../models/SchemeOfWork');
  const schemeDoc = await SchemeOfWork.findOne({ teacherId, grade }).lean();

  let schemeDetailText = '';
  if (schemeDoc) {
    // Navigate the nested hierarchy: find the matching strand → subStrand
    const strandObj = (schemeDoc.strands || []).find((s) => s.strandName === strand);
    const subStrandObj = strandObj
      ? (strandObj.subStrands || []).find((ss) => ss.subStrandName === subStrand)
      : null;

    if (subStrandObj) {
      schemeDetailText = `
=== DATABASE SCHEME OF WORK DETAILS ===
- Grade: ${schemeDoc.grade}
- Strand: ${strandObj.strandName}
- Sub-strand: ${subStrandObj.subStrandName}
- Specific Learning Outcomes:
${(subStrandObj.specificLearningOutcomes || []).map((x) => `  - ${x}`).join('\n')}
- Key Inquiry Questions:
${(subStrandObj.keyInquiryQuestions || []).map((x) => `  - ${x}`).join('\n')}
- Learning Experiences:
${(subStrandObj.learningExperiences || []).map((x) => `  - ${x}`).join('\n')}
- Learning Resources:
${(subStrandObj.learningResources || []).map((x) => `  - ${x}`).join('\n')}
- Assessment Methods:
${(subStrandObj.assessmentMethods || []).map((x) => `  - ${x}`).join('\n')}
`;
    } else {
      schemeDetailText = `
=== DATABASE SCHEME OF WORK DETAILS ===
Grade "${grade}" was found but no exact match for Strand: "${strand}" / Sub-strand: "${subStrand}". Use standard educational guidelines for reference.
`;
    }
  } else {
    schemeDetailText = `
=== DATABASE SCHEME OF WORK DETAILS ===
No scheme document found for Grade: "${grade}". Use standard educational guidelines for reference.
`;
  }

  const formattedObjectives = Array.isArray(objectives)
    ? objectives.map((item, index) => `${index + 1}. ${item}`).join('\n')
    : `${objectives}`;

  const formattedPresentation = Array.isArray(presentation)
    ? presentation
        .map((section) => {
          const points = Array.isArray(section.points)
            ? section.points.map((point, idx) => `    ${idx + 1}. ${point}`).join('\n')
            : '';
          return `\n${section.section}:\n${points}`;
        })
        .join('\n')
    : `${presentation}`;

  const systemInstruction =
    'You are an expert curriculum designer. Given the Scheme of Work context and teacher manual inputs, generate a formal Lesson Plan and a matching Record of Work. ' +
    'The Lesson Plan must be formatted as a structured JSON object containing: objectives (array of strings), materials (array of strings), introduction (string), activities (string), conclusion (string), evaluation (string). ' +
    'The Record of Work must be formatted as a structured JSON object containing: week (string), date (string), topic (string), subTopic (string), remarks (string). ' +
    'Output ONLY a valid JSON object containing both structures under the keys "lessonPlan" and "recordOfWork". ' +
    'Do not include any explanation or markdown formatting.';

  const prompt = `
${schemeDetailText}

=== TEACHER MANUAL INPUTS ===
- Date: ${date || 'N/A'}
- Time: ${time || 'N/A'}
- Grade: ${grade || 'N/A'}
- Roll (Class Size): ${roll || 'N/A'}
- Objectives:
${formattedObjectives}

- Presentation:
${formattedPresentation}

- Conclusion:
${conclusion || 'N/A'}

Generate a formal Lesson Plan and corresponding Record of Work matching the database scheme details and teacher input.`;

  try {
    const responseText = await generateContent(systemInstruction, prompt, {
      max_tokens: 3000,
      temperature: 0.2,
    });

    if (!responseText) {
      throw new Error('AI provider returned an empty response.');
    }

    // Sanitize and safely parse/repair
    const sanitized = sanitizeJsonResponse(responseText);
    return repairAndParseJson(sanitized);
  } catch (err) {
    console.error(`[${provider.name}] lesson generation error:`, err);
    if (err instanceof SyntaxError) {
      throw new Error('The AI service returned malformed JSON. Please try again.');
    }
    throw new Error(err.message || 'AI generation failed. Please try again later.');
  }
}

module.exports = {
  generateContent,
  extractSchemeOfWorkText,
  generateLessonPlanAndRecord,
};
