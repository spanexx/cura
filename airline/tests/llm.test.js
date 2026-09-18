import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLlmRequest,
  callLlm,
  cleanAndParseJson,
  extractLlmText,
  isLocalOrigin,
  isLocalUrl,
  normalizeBaseUrl,
  resolveLlmParams
} from '../src/llm.js';

const originalFetch = globalThis.fetch;
let fetchCalls = [];

/** Minimal stand-in for a fetch Response. */
const jsonResponse = (payload, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  json: async () => payload,
  text: async () => JSON.stringify(payload)
});

const geminiEnvelope = (text) => ({ candidates: [{ content: { parts: [{ text }] } }] });
const openAiEnvelope = (text) => ({ choices: [{ message: { content: text } }] });

/** Replaces global fetch and records every call. */
const stubFetch = (handler) => {
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url, init });
    return handler(url, init);
  };
};

/** Settings as they exist in the component: mostly strings from the settings inputs. */
const settings = (overrides = {}) => ({
  provider: 'gemini',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'test-key',
  modelId: 'gemini-3-flash-preview',
  systemPrompt: 'You are a passenger chatting with a Ryanair agent.',
  chatHistory: [],
  jsonSchema: null,
  temperature: '0.7',
  topP: '0.95',
  maxTokens: '2048',
  ...overrides
});

beforeEach(() => {
  fetchCalls = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('cleanAndParseJson', () => {
  it('parses a plain JSON object returned by the model', () => {
    assert.deepEqual(cleanAndParseJson('{"grade":"A","sopAccuracy":92}'), {
      grade: 'A',
      sopAccuracy: 92
    });
  });

  it('unwraps markdown code fences, which models emit even when asked for JSON', () => {
    const raw = '```json\n{"title":"Misspelled name","difficulty":"Easy"}\n```';
    assert.deepEqual(cleanAndParseJson(raw), {
      title: 'Misspelled name',
      difficulty: 'Easy'
    });
  });

  it('recovers the object when the model adds prose around it', () => {
    const raw = 'Sure! Here is the scenario you asked for:\n{"pnr":"AB1234"}\nLet me know if you want another.';
    assert.deepEqual(cleanAndParseJson(raw), { pnr: 'AB1234' });
  });

  it('repairs raw newlines inside a string value instead of failing', () => {
    const raw = '{"summary":"Line one\nLine two"}';
    assert.deepEqual(cleanAndParseJson(raw), { summary: 'Line one Line two' });
  });

  it('rejects an empty model response with a descriptive error', () => {
    assert.throws(() => cleanAndParseJson(''), /Empty or non-string response/);
    assert.throws(() => cleanAndParseJson(undefined), /Empty or non-string response/);
  });

  it('throws a diagnosable error when the text is not JSON at all', () => {
    assert.throws(() => cleanAndParseJson('I cannot help with that request.'), /Invalid JSON format/);
  });
});

describe('resolveLlmParams', () => {
  it('falls back to documented defaults when the settings inputs are blank', () => {
    assert.deepEqual(resolveLlmParams({ temperature: '', topP: '', maxTokens: '' }), {
      temperature: 0.7,
      topP: 0.95,
      maxTokens: 2048
    });
  });

  it('parses numeric strings typed into the settings modal', () => {
    assert.deepEqual(resolveLlmParams({ temperature: '0.2', topP: '0.5', maxTokens: '512' }), {
      temperature: 0.2,
      topP: 0.5,
      maxTokens: 512
    });
  });

  it('lets a caller override the configured token budget', () => {
    const params = resolveLlmParams({ temperature: '0.7', topP: '0.95', maxTokens: '512', overrideMaxTokens: 2048 });
    assert.equal(params.maxTokens, 2048);
  });
});

describe('buildLlmRequest (Google Gemini)', () => {
  it('targets generateContent for the selected model and trims the API key', () => {
    const { endpoint } = buildLlmRequest(settings({ apiKey: ' test-key ' }));
    assert.equal(
      endpoint,
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=test-key'
    );
  });

  it('falls back to the default model when none is set', () => {
    const { endpoint } = buildLlmRequest(settings({ modelId: '   ' }));
    assert.match(endpoint, /models\/gemini-3-flash-preview:generateContent/);
  });

  it('maps the agent to the user role and the passenger to the model role', () => {
    const { body } = buildLlmRequest(
      settings({
        chatHistory: [
          { sender: 'agent', text: 'Good morning, how can I help?' },
          { sender: 'customer', content: 'You charged me 70 euro at the gate!' },
          { sender: 'system', text: 'Customer placed on hold' }
        ]
      })
    );

    assert.deepEqual(body.contents, [
      { role: 'user', parts: [{ text: 'Good morning, how can I help?' }] },
      { role: 'model', parts: [{ text: 'You charged me 70 euro at the gate!' }] },
      { role: 'model', parts: [{ text: 'Customer placed on hold' }] }
    ]);
  });

  it('sends the system prompt both as an instruction and as the sole turn when history is empty', () => {
    const systemPrompt = 'You are an auditor.';
    const { body } = buildLlmRequest(settings({ systemPrompt, chatHistory: [] }));

    assert.deepEqual(body.systemInstruction, { parts: [{ text: systemPrompt }] });
    assert.deepEqual(body.contents, [{ role: 'user', parts: [{ text: systemPrompt }] }]);
  });

  it('applies the generation config with the configured sampling values', () => {
    const { body } = buildLlmRequest(settings({ temperature: '0.3', topP: '0.4', maxTokens: '1024' }));
    assert.deepEqual(body.generationConfig, { temperature: 0.3, topP: 0.4, maxOutputTokens: 1024 });
  });

  it('requests structured output only when a JSON schema is supplied', () => {
    const schema = { type: 'OBJECT', properties: { grade: { type: 'STRING' } } };

    const withSchema = buildLlmRequest(settings({ jsonSchema: schema }));
    assert.equal(withSchema.body.generationConfig.responseMimeType, 'application/json');
    assert.deepEqual(withSchema.body.generationConfig.responseSchema, schema);

    const withoutSchema = buildLlmRequest(settings());
    assert.equal('responseSchema' in withoutSchema.body.generationConfig, false);
    assert.equal('responseMimeType' in withoutSchema.body.generationConfig, false);
  });
});

describe('normalizeBaseUrl', () => {
  const originalLocation = globalThis.location;

  /** Runs fn with a faked page origin (null = no location at all). */
  const withLocation = (href, fn) => {
    globalThis.location = href == null ? undefined : { href };
    try {
      fn();
    } finally {
      globalThis.location = originalLocation;
    }
  };

  it('reroutes a localhost Base URL through the proxy when the app itself runs on localhost', () => {
    withLocation('http://localhost:4173/', () => {
      assert.equal(normalizeBaseUrl('http://localhost:3001/v1'), '/llm-proxy/v1');
    });
  });

  it('collapses a pathless loopback URL onto the proxy root and trims stray slashes', () => {
    withLocation('http://127.0.0.1:5173/chat', () => {
      assert.equal(normalizeBaseUrl('  http://127.0.0.1:11434  '), '/llm-proxy');
      assert.equal(normalizeBaseUrl('http://localhost:3001/v1/'), '/llm-proxy/v1');
    });
  });

  it('keeps loopback Base URLs as typed when the app is a deployed static page', () => {
    withLocation('https://example.github.io/ryanair-agent-simulator/', () => {
      assert.equal(normalizeBaseUrl('http://localhost:3001/v1'), 'http://localhost:3001/v1');
    });
  });

  it('keeps loopback Base URLs as typed when there is no page location at all', () => {
    withLocation(null, () => {
      assert.equal(normalizeBaseUrl('http://localhost:3001/v1'), 'http://localhost:3001/v1');
    });
  });

  it('never touches public hosts, same-origin paths or non-URLs', () => {
    withLocation('http://localhost:5173/', () => {
      assert.equal(normalizeBaseUrl('https://api.openai.com/v1'), 'https://api.openai.com/v1');
      assert.equal(normalizeBaseUrl('/llm-proxy/v1'), '/llm-proxy/v1');
      assert.equal(normalizeBaseUrl(''), '');
      assert.equal(normalizeBaseUrl('not a url'), 'not a url');
    });
  });
});

describe('isLocalUrl / isLocalOrigin', () => {
  it('recognises absolute loopback URLs only', () => {
    assert.equal(isLocalUrl('http://localhost:3001/v1'), true);
    assert.equal(isLocalUrl('http://[::1]:3001/v1'), true);
    assert.equal(isLocalUrl('https://api.openai.com/v1'), false);
    assert.equal(isLocalUrl('/llm-proxy/v1'), false);
    assert.equal(isLocalUrl(''), false);
  });

  it('reports the app origin as local only when served from this machine', () => {
    const originalLocation = globalThis.location;
    try {
      globalThis.location = { href: 'http://localhost:4173/chat' };
      assert.equal(isLocalOrigin(), true);
      globalThis.location = { href: 'https://example.github.io/' };
      assert.equal(isLocalOrigin(), false);
      globalThis.location = undefined;
      assert.equal(isLocalOrigin(), false);
    } finally {
      globalThis.location = originalLocation;
    }
  });
});

describe('buildLlmRequest (OpenAI-compatible)', () => {
  it('appends /chat/completions and sends auth, model and sampling settings', () => {
    const { provider, endpoint, headers, body } = buildLlmRequest(
      settings({
        provider: 'openai_compatible',
        baseUrl: 'http://localhost:3001/v1',
        apiKey: ' test-key ',
        modelId: '   ',
        chatHistory: [{ sender: 'customer', text: 'Hello?' }],
        jsonSchema: { type: 'OBJECT' }
      })
    );

    assert.equal(provider, 'openai_compatible');
    assert.equal(endpoint, 'http://localhost:3001/v1/chat/completions');
    assert.equal(headers.Authorization, 'Bearer test-key');
    assert.deepEqual(body.messages, [
      { role: 'system', content: 'You are a passenger chatting with a Ryanair agent.' },
      { role: 'assistant', content: 'Hello?' }
    ]);
    assert.equal(body.model, 'gpt-4o-mini');
    assert.equal(body.temperature, 0.7);
    assert.deepEqual(body.response_format, { type: 'json_object' });
  });

  it('does not duplicate /chat/completions when the Base URL already ends with it', () => {
    const { endpoint } = buildLlmRequest(
      settings({ provider: 'openai_compatible', baseUrl: 'https://api.openai.com/v1/chat/completions' })
    );
    assert.equal(endpoint, 'https://api.openai.com/v1/chat/completions');
  });
});

describe('callLlm', () => {
  it('posts the built request and returns the assistant text', async () => {
    stubFetch(() => jsonResponse(openAiEnvelope('Agent reply')));
    const text = await callLlm(
      settings({ provider: 'openai_compatible', baseUrl: 'https://api.openai.com/v1' })
    );

    assert.equal(text, 'Agent reply');
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(fetchCalls[0].init.method, 'POST');
  });

  it('surfaces non-2xx responses as a provider-labelled error', async () => {
    stubFetch(() => jsonResponse({ error: 'nope' }, { ok: false, status: 401 }));
    await assert.rejects(
      () => callLlm(settings({ provider: 'openai_compatible' })),
      /OpenAI Endpoint Error \(401\)/
    );
  });
});
