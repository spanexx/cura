/**
 * LLM transport layer for the Ryanair Agent Simulator.
 *
 * Extracted from App.jsx so that request building, response extraction and
 * JSON repair can be exercised without a browser, a DOM or a live API key.
 * Every function here is pure except `callLlm`, which performs a single fetch.
 */

export const DEFAULT_TEMPERATURE = 0.7;
export const DEFAULT_TOP_P = 0.95;
export const DEFAULT_MAX_TOKENS = 2048;
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
export const DEFAULT_GEMINI_MODEL = 'gemini-3-flash-preview';
export const GEMINI_ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Safely parses JSON strings returned by LLMs.
 * Handles unescaped line breaks, markdown wrapping, and control characters.
 */
export const cleanAndParseJson = (text) => {
  if (!text || typeof text !== 'string') {
    throw new Error('Empty or non-string response received from model.');
  }

  let sanitized = text.trim();

  // Strip markdown code fences if present
  sanitized = sanitized
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/g, '')
    .trim();

  // Find boundaries of JSON object or array
  const startObj = sanitized.indexOf('{');
  const endObj = sanitized.lastIndexOf('}');

  if (startObj !== -1 && endObj !== -1 && endObj > startObj) {
    sanitized = sanitized.substring(startObj, endObj + 1);
  }

  // Attempt 1: Direct standard JSON parse
  try {
    return JSON.parse(sanitized);
  } catch (e1) {
    // Attempt 2: Replace raw unescaped newlines inside string values
    try {
      const fixedNewlines = sanitized.replace(/[\r\n]+/g, ' ');
      return JSON.parse(fixedNewlines);
    } catch (e2) {
      // Attempt 3: Aggressive control character removal
      try {
        const cleaned = sanitized
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
          .replace(/[\r\n]+/g, ' ');
        return JSON.parse(cleaned);
      } catch (e3) {
        throw new Error(`Invalid JSON format: ${e1.message}`);
      }
    }
  }
};

/** Normalises the free-text settings typed into the LLM Settings modal. */
export const resolveLlmParams = ({ temperature, topP, maxTokens, overrideMaxTokens = null }) => ({
  temperature: parseFloat(temperature) || DEFAULT_TEMPERATURE,
  topP: parseFloat(topP) || DEFAULT_TOP_P,
  maxTokens: overrideMaxTokens || parseInt(maxTokens) || DEFAULT_MAX_TOKENS
});

/** Maps the simulator's chat history onto an OpenAI-compatible role. */
const toOpenAiRole = (m) =>
  m.sender === 'agent' ? 'user' : m.sender === 'customer' ? 'assistant' : m.role || 'user';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Reroutes local LLM servers through the Vite proxy so the browser request
 * stays same-origin (local servers send no CORS headers, so a direct call is
 * blocked before it leaves the page and only surfaces as "Failed to fetch").
 *
 *   http://localhost:3001/v1  ->  /llm-proxy/v1
 *   http://127.0.0.1:11434    ->  /llm-proxy
 *   https://api.openai.com/v1 ->  unchanged (public host)
 *   /llm-proxy/v1             ->  unchanged (already same-origin)
 *
 * Pure: returns the Base URL that fetch should actually use.
 */
export const normalizeBaseUrl = (baseUrl) => {
  const raw = (baseUrl || '').trim();
  if (!raw || raw.startsWith('/')) return raw; // empty or already same-origin
  if (!/^https?:\/\//i.test(raw)) return raw; // not an absolute http(s) URL - leave as typed

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return raw;
  }

  if (!LOCAL_HOSTS.has(parsed.hostname)) return raw;

  const path = parsed.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  return path ? `/llm-proxy/${path}` : '/llm-proxy';
};

/**
 * Builds the endpoint, headers and JSON body for one provider.
 * Pure: takes the settings as plain values so it can be asserted directly.
 */
export const buildLlmRequest = ({
  provider,
  baseUrl = '',
  apiKey = '',
  modelId = '',
  systemPrompt,
  chatHistory = [],
  jsonSchema = null,
  temperature,
  topP,
  maxTokens,
  overrideMaxTokens = null
}) => {
  const { temperature: tempVal, topP: topPVal, maxTokens: maxTokVal } = resolveLlmParams({
    temperature,
    topP,
    maxTokens,
    overrideMaxTokens
  });

  if (provider === 'openai_compatible') {
    const cleanBaseUrl = normalizeBaseUrl(baseUrl).replace(/\/+$/, '');
    const endpoint = cleanBaseUrl.endsWith('/chat/completions')
      ? cleanBaseUrl
      : `${cleanBaseUrl}/chat/completions`;

    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    chatHistory.forEach((m) => {
      messages.push({ role: toOpenAiRole(m), content: m.text || m.content || '' });
    });

    const body = {
      model: modelId.trim() || DEFAULT_OPENAI_MODEL,
      messages,
      temperature: tempVal,
      top_p: topPVal,
      max_tokens: maxTokVal
    };

    if (jsonSchema) {
      body.response_format = { type: 'json_object' };
    }

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey.trim()) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }

    return { provider, endpoint, headers, body };
  }

  // Google Gemini API engine
  const selectedModel = modelId.trim() || DEFAULT_GEMINI_MODEL;
  const endpoint = `${GEMINI_ENDPOINT_BASE}/${selectedModel}:generateContent?key=${apiKey.trim()}`;

  const contents = chatHistory.map((m) => ({
    role: m.sender === 'agent' ? 'user' : 'model',
    parts: [{ text: m.text || m.content || '' }]
  }));

  if (contents.length === 0 && systemPrompt) {
    contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
  }

  const body = { contents };

  if (systemPrompt && contents.length > 0) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  body.generationConfig = {
    temperature: tempVal,
    topP: topPVal,
    maxOutputTokens: maxTokVal
  };

  if (jsonSchema) {
    body.generationConfig.responseMimeType = 'application/json';
    body.generationConfig.responseSchema = jsonSchema;
  }

  return { provider, endpoint, headers: { 'Content-Type': 'application/json' }, body };
};

/** Pulls the assistant text out of either provider's response envelope. */
export const extractLlmText = (provider, data) =>
  provider === 'openai_compatible'
    ? data?.choices?.[0]?.message?.content || ''
    : data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

/**
 * Performs one LLM round trip and returns the assistant text.
 * `signal` is optional and lets callers abort (e.g. a connection health check).
 */
export const callLlm = async ({ signal, ...config }) => {
  const { provider, endpoint, headers, body } = buildLlmRequest(config);

  const init = {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  };
  if (signal) {
    init.signal = signal;
  }

  const response = await fetch(endpoint, init);

  if (!response.ok) {
    const errorText = await response.text();
    const label = provider === 'openai_compatible' ? 'OpenAI' : 'Gemini';
    throw new Error(`${label} Endpoint Error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return extractLlmText(provider, data);
};