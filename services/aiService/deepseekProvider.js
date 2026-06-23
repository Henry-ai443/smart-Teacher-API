/**
 * DeepSeek AI Provider Strategy
 *
 * Uses the OpenAI-compatible SDK to call DeepSeek's chat.completions API.
 * Implements the uniform provider interface: generateContent(system, prompt, options)
 *
 * Enforces JSON-only output via response_format and sanitization logic.
 */
const { OpenAI } = require('openai');
const { 
  isServiceUnavailableError, 
  retryOn503, 
  sanitizeJsonResponse 
} = require('./shared');

// ─── Client initialization ─────────────────────────────────────────────────
const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.warn('⚠️  Warning: DEEPSEEK_API_KEY is not defined in environment variables.');
}

const client = apiKey
  ? new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' })
  : null;

// ─── Uniform interface ─────────────────────────────────────────────────────

/**
 * Generate content using DeepSeek (chat.completions.create).
 * 
 * Sanitizes the response using sanitizeJsonResponse to guarantee 
 * the output is ready for JSON.parse().
 */
async function generateContent(systemInstruction, userPrompt, options = {}) {
  if (!client) {
    throw new Error('DeepSeek API key is not configured.');
  }

  // Reinforce JSON-only output in the system prompt
  const jsonEnforcedSystem = systemInstruction +
    '\n\nIMPORTANT: You MUST respond with ONLY valid JSON. ' +
    'Do NOT wrap the response in markdown code fences (```). ' +
    'Do NOT include any text before or after the JSON object.';

  const messages = [
    { role: 'system', content: jsonEnforcedSystem },
    { role: 'user', content: userPrompt },
  ];

  const requestPayload = {
    model: 'deepseek-chat',
    messages,
    response_format: { type: 'json_object' },
    ...options,
  };

  const response = await retryOn503(async () => {
    try {
      const result = await client.chat.completions.create(requestPayload);
      const content = result?.choices?.[0]?.message?.content;
      
      if (!content) {
        throw new Error('DeepSeek returned an empty response.');
      }

      // Apply the sanitization utility here
      return sanitizeJsonResponse(content);
    } catch (err) {
      if (isServiceUnavailableError(err)) {
        throw err;
      }
      throw err;
    }
  });

  return response;
}

/**
 * Extract structured data from a file using DeepSeek.
 */
async function extractFromFile(base64Data, mimeType, systemInstruction, userPrompt, options = {}) {
  const fullPrompt =
    `${userPrompt}\n\nThe following is a base64-encoded ${mimeType} document. ` +
    `Please decode and extract the requested data from it.\n\n` +
    `Base64 content:\n${base64Data}`;

  return generateContent(systemInstruction, fullPrompt, options);
}

module.exports = {
  name: 'deepseek',
  generateContent,
  extractFromFile,
};
