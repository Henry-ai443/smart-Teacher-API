/**
 * Gemini AI Provider Strategy
 *
 * Uses the Google Generative AI SDK to call Gemini models.
 * Implements the uniform provider interface: generateContent(system, prompt, options)
 *
 * Gemini has native PDF/vision support via inlineData parts, which is used
 * for document extraction.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { isServiceUnavailableError, retryOn503 } = require('./shared');

// ─── Client initialization ─────────────────────────────────────────────────
const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
if (!apiKey) {
  console.warn('⚠️  Warning: GEMINI_API_KEY is not defined in environment variables.');
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;
const MODEL_NAME = 'gemini-2.5-flash';

// ─── Uniform interface ─────────────────────────────────────────────────────

/**
 * Generate content using Gemini.
 * @param {string} systemInstruction - System-level prompt
 * @param {string} userPrompt - User-level prompt
 * @param {object} [options] - Extra options (max_tokens → maxOutputTokens, temperature, etc.)
 * @returns {Promise<string>} Raw text response from the model
 */
async function generateContent(systemInstruction, userPrompt, options = {}) {
  if (!genAI) {
    throw new Error('Gemini API key is not configured. Please set GEMINI_API_KEY in your .env file.');
  }

  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  // Map OpenAI-style options to Gemini generationConfig
  const generationConfig = {
    responseMimeType: 'application/json',
    temperature: options.temperature !== undefined ? options.temperature : 0.1,
  };
  if (options.max_tokens) generationConfig.maxOutputTokens = options.max_tokens;

  const contents = [
    {
      role: 'user',
      parts: [{ text: userPrompt }],
    },
  ];

  const response = await retryOn503(async () => {
    const result = await model.generateContent({
      contents,
      systemInstruction,
      generationConfig,
    });

    const text = result.response.text();
    if (!text) {
      throw new Error('Gemini returned an empty response.');
    }
    return text;
  });

  return response;
}

/**
 * Extract structured data from a file using Gemini Vision.
 * Gemini natively supports inline file parts (PDFs, images), so the binary
 * data is sent directly as an inlineData part rather than embedded in the prompt.
 * @param {string} base64Data - Base64-encoded file content
 * @param {string} mimeType - MIME type of the file (e.g. 'application/pdf')
 * @param {string} systemInstruction - System-level prompt
 * @param {string} userPrompt - User-level extraction prompt
 * @param {object} [options] - Extra options (max_tokens, temperature, etc.)
 * @returns {Promise<string>} Raw text response from the model
 */
async function extractFromFile(base64Data, mimeType, systemInstruction, userPrompt, options = {}) {
  if (!genAI) {
    throw new Error('Gemini API key is not configured. Please set GEMINI_API_KEY in your .env file.');
  }

  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const generationConfig = {
    responseMimeType: 'application/json',
    temperature: options.temperature !== undefined ? options.temperature : 0.1,
  };
  if (options.max_tokens) generationConfig.maxOutputTokens = options.max_tokens;

  const contents = [
    {
      role: 'user',
      parts: [
        {
          inline_data: {
            mime_type: mimeType,
            data: base64Data,
          },
        },
        { text: userPrompt },
      ],
    },
  ];

  const response = await retryOn503(async () => {
    const result = await model.generateContent({
      contents,
      systemInstruction,
      generationConfig,
    });

    const text = result.response.text();
    if (!text) {
      throw new Error('Gemini returned an empty response.');
    }
    return text;
  });

  return response;
}

module.exports = {
  name: 'gemini',
  generateContent,
  extractFromFile,
};
