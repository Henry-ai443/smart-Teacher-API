/**
 * Shared utilities used by all AI provider strategies.
 */

function isServiceUnavailableError(err) {
  const status = err?.response?.status || err?.status || err?.statusCode || null;
  if (status === 503) return true;
  const message = String(err?.message || '').toLowerCase();
  return message.includes('503') || message.includes('service unavailable');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry helper for 503 errors with exponential backoff (2s → 4s → 8s).
 * @param {Function} fn - Async function to attempt
 * @param {number} attempts - Maximum number of attempts
 * @returns {Promise<*>} Result of fn()
 */
async function retryOn503(fn, attempts = 3) {
  let delay = 2000;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (isServiceUnavailableError(err)) {
        if (i === attempts - 1) {
          throw new Error('The AI service is busy. Please try submitting again in a moment.');
        }
        await sleep(delay);
        delay *= 2;
        continue;
      }
      throw err;
    }
  }
}

/**
 * Sanitize raw AI response text to extract clean JSON.
 * Handles common LLM quirks:
 *   1. Markdown code fences (```json ... ``` or ``` ... ```)
 *   2. Conversational text before the JSON body
 *   3. Leading/trailing whitespace
 *
 * Trailing conversational filler is handled dynamically during parsing by
 * the backtracking parser.
 *
 * @param {string} raw - Raw response text from the AI provider
 * @returns {string} Cleaned string
 */
function sanitizeJsonResponse(raw) {
  if (!raw || typeof raw !== 'string') return raw;

  let cleaned = raw.trim();

  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Find the first { or [ and remove any conversational header before it
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let start = -1;

  if (firstBrace !== -1 && firstBracket !== -1) {
    start = Math.min(firstBrace, firstBracket);
  } else if (firstBrace !== -1) {
    start = firstBrace;
  } else if (firstBracket !== -1) {
    start = firstBracket;
  }

  if (start !== -1) {
    cleaned = cleaned.slice(start);
  }

  return cleaned;
}

/**
 * Close open brackets, braces, and quotes to repair truncated JSON.
 * @param {string} str - Raw candidate string
 * @returns {string} Repaired candidate string
 */
function closeOpenStructures(str) {
  let inString = false;
  let escape = false;
  const stack = [];

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{' || char === '[') {
        stack.push(char);
      } else if (char === '}') {
        if (stack[stack.length - 1] === '{') stack.pop();
      } else if (char === ']') {
        if (stack[stack.length - 1] === '[') stack.pop();
      }
    }
  }

  let result = str;
  if (inString) {
    result += '"';
  }

  // Close open brackets and braces in reverse order
  while (stack.length > 0) {
    const openChar = stack.pop();
    if (openChar === '{') {
      result += '}';
    } else if (openChar === '[') {
      result += ']';
    }
  }

  return result;
}

/**
 * Attempts to parse a JSON string. If parsing fails, it tries to repair
 * the JSON (in case it was cut off or truncated) by backtracking to the nearest
 * delimiter and closing any open structures.
 *
 * @param {string} rawJson - The JSON string to parse
 * @returns {object|array} The parsed JavaScript object or array
 */
function repairAndParseJson(rawJson) {
  if (!rawJson || typeof rawJson !== 'string') {
    throw new Error('Invalid JSON input: input must be a string');
  }

  // 1. Try parsing the input directly
  const cleaned = rawJson.trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Continue to repair attempts
  }

  // 2. Backtrack backwards searching for delimiters to find a clean cut-off point
  const delimiters = [',', '}', ']', '{', '[', '"'];
  
  for (let i = cleaned.length - 1; i >= 0; i--) {
    const char = cleaned[i];
    if (delimiters.includes(char)) {
      const candidate = cleaned.slice(0, i + 1);
      const repaired = closeOpenStructures(candidate);
      if (repaired) {
        try {
          return JSON.parse(repaired);
        } catch (e) {
          // Keep backtracking to the next delimiter
        }
      }
    }
  }

  // 3. If backtracking fails, try closing the entire string as-is
  try {
    const repaired = closeOpenStructures(cleaned);
    return JSON.parse(repaired);
  } catch (e) {
    throw new Error(`Failed to parse JSON even after repair attempts: ${e.message}`);
  }
}

module.exports = {
  isServiceUnavailableError,
  sleep,
  retryOn503,
  sanitizeJsonResponse,
  repairAndParseJson,
};
