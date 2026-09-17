/**
 * Persistence for the LLM settings, so a browser refresh does not throw away
 * the endpoint the agent just configured.
 *
 * Everything is validated on read: a stale, hand-edited or corrupted entry
 * falls back to defaults instead of poisoning component state.
 * `storage` is injectable so the logic can be exercised without a DOM.
 */

export const DEFAULT_LLM_SETTINGS = Object.freeze({
  provider: 'gemini',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  modelId: 'gemini-3-flash-preview',
  temperature: 0.7,
  topP: 0.95,
  maxTokens: 2048
});

export const PROVIDERS = ['gemini', 'openai_compatible'];

export const LLM_SETTINGS_STORAGE_KEY = 'ryanair-agent-simulator.llm-settings';

const asString = (value, fallback) => (typeof value === 'string' ? value : fallback);

/**
 * Keeps whatever type was typed (the number inputs yield strings) while
 * rejecting NaN, which is what a cleared input field produces.
 */
const asNumeric = (value, fallback) => (Number.isFinite(parseFloat(value)) ? value : fallback);

const readStore = (storage) => {
  try {
    return storage ?? globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** Reads the saved settings, always returning a complete, valid object. */
export const loadLlmSettings = (storage) => {
  const store = readStore(storage);
  if (!store) return { ...DEFAULT_LLM_SETTINGS };

  try {
    const raw = store.getItem(LLM_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LLM_SETTINGS };

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULT_LLM_SETTINGS };
    }

    return {
      provider: PROVIDERS.includes(parsed.provider) ? parsed.provider : DEFAULT_LLM_SETTINGS.provider,
      baseUrl: asString(parsed.baseUrl, DEFAULT_LLM_SETTINGS.baseUrl),
      apiKey: asString(parsed.apiKey, DEFAULT_LLM_SETTINGS.apiKey),
      modelId: asString(parsed.modelId, DEFAULT_LLM_SETTINGS.modelId),
      temperature: asNumeric(parsed.temperature, DEFAULT_LLM_SETTINGS.temperature),
      topP: asNumeric(parsed.topP, DEFAULT_LLM_SETTINGS.topP),
      maxTokens: asNumeric(parsed.maxTokens, DEFAULT_LLM_SETTINGS.maxTokens)
    };
  } catch {
    return { ...DEFAULT_LLM_SETTINGS };
  }
};

/** Best effort write: private mode, quota limits or a missing store must not break the app. */
export const saveLlmSettings = (settings, storage) => {
  const store = readStore(storage);
  if (!store) return false;

  try {
    store.setItem(LLM_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
};

export const clearLlmSettings = (storage) => {
  const store = readStore(storage);
  if (!store) return false;

  try {
    store.removeItem(LLM_SETTINGS_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
};