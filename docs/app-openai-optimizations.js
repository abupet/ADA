// docs/app-openai-optimizations.js v1
// OpenAI optimization layer — model routing + policy cache

(function () {
  'use strict';

  const CACHE_KEY = 'ada_openai_opt_flags';
  const CACHE_TS_KEY = 'ada_openai_opt_fetched_at';
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minuti
  const DEFAULTS = { enabled: false, smart_diarization: false };

  // ---- Cache read/write ----
  function _readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const ts = parseInt(localStorage.getItem(CACHE_TS_KEY) || '0', 10);
      if (Date.now() - ts > CACHE_TTL_MS) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function _writeCache(flags) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(flags));
      localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
    } catch (e) { /* quota exceeded */ }
  }

  // ---- Public API ----

  window.getOpenAiOptimizationFlags = function () {
    return _readCache() || { ...DEFAULTS };
  };

  window.refreshOpenAiOptimizationFlags = async function (force) {
    if (!force) {
      const cached = _readCache();
      if (cached) return cached;
    }
    try {
      const resp = await fetchApi('/api/policies/openai-optimizations');
      if (resp.ok) {
        const flags = await resp.json();
        const result = { enabled: !!flags.enabled, smart_diarization: !!flags.smart_diarization };
        _writeCache(result);
        return result;
      }
    } catch (e) { console.warn('refreshOpenAiOptimizationFlags error:', e); }
    return _readCache() || { ...DEFAULTS };
  };

  window.isOpenAiOptimizationsEnabled = function () {
    return !!(getOpenAiOptimizationFlags().enabled);
  };

  window.isSmartDiarizationEnabled = function () {
    const f = getOpenAiOptimizationFlags();
    return !!(f.enabled && f.smart_diarization);
  };

  // ---- Model routing ----

  const TASK_MODEL_MAP = {
    translate:         { model: 'gpt-4o-mini', temperature: 0.2, max_tokens: 800 },
    text_correction:   { model: 'gpt-4o-mini', temperature: 0.2, max_tokens: 800 },
    diary_generate:    { model: 'gpt-4o-mini', temperature: 0.5, max_tokens: 1200 },
    qna_answer:        { model: 'gpt-4o-mini', temperature: 0.5, max_tokens: 1200 },
    qna_faq:           { model: 'gpt-4o-mini', temperature: 0.5, max_tokens: 1200 },
    tips_generate:     { model: 'gpt-4o-mini', temperature: 0.6, max_tokens: 3600 },
    owner_explanation: { model: 'gpt-4o-mini', temperature: 0.5, max_tokens: 1600 },
    glossary_generate: { model: 'gpt-4o-mini', temperature: 0.4, max_tokens: 800 },
    faq_generate:      { model: 'gpt-4o-mini', temperature: 0.5, max_tokens: 1200 },
    // SOAP generation: NON presente qui → usa sempre il default (gpt-4o)
  };

  window.getAiModelForTask = function (task, defaultModel) {
    defaultModel = defaultModel || 'gpt-4o';
    if (!isOpenAiOptimizationsEnabled()) return defaultModel;
    const entry = TASK_MODEL_MAP[task];
    return entry ? entry.model : defaultModel;
  };

  window.getAiParamsForTask = function (task) {
    if (!isOpenAiOptimizationsEnabled()) return {};
    const entry = TASK_MODEL_MAP[task];
    if (!entry) return {};
    const result = {};
    if (entry.temperature !== undefined) result.temperature = entry.temperature;
    if (entry.max_tokens !== undefined) result.max_tokens = entry.max_tokens;
    return result;
  };

})();
