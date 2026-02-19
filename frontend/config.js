// v8.21.0: Global error handlers — catch uncaught exceptions and unhandled promise rejections
window.onerror = function(msg, url, line, col, error) {
    try {
        if (typeof ADALog !== 'undefined') {
            ADALog.err('GLOBAL', 'Uncaught: ' + msg, { url: url, line: line, col: col, stack: error && error.stack ? error.stack.substring(0, 500) : '' });
        }
    } catch (_) {}
    return false; // Don't suppress console error
};
window.onunhandledrejection = function(event) {
    try {
        var reason = event.reason || {};
        var msg = reason.message || reason.toString ? reason.toString() : 'Unknown rejection';
        if (typeof ADALog !== 'undefined') {
            ADALog.err('PROMISE', msg, { stack: reason.stack ? reason.stack.substring(0, 500) : '' });
        }
    } catch (_) {}
};

// ADA v8.10.1 - Configuration
const ADA_AUTH_TOKEN_KEY = 'ada_auth_token';
const API_BASE_URL = (window && window.ADA_API_BASE_URL) ? window.ADA_API_BASE_URL : 'http://127.0.0.1:3000';

function setAuthToken(token) {
    try {
        if (token) {
            localStorage.setItem(ADA_AUTH_TOKEN_KEY, token);
        } else {
            localStorage.removeItem(ADA_AUTH_TOKEN_KEY);
        }
    } catch (e) {}
}

function getAuthToken() {
    try {
        return localStorage.getItem(ADA_AUTH_TOKEN_KEY) || '';
    } catch (e) {
        return '';
    }
}

function clearAuthToken() {
    setAuthToken('');
}

// PR3: Global spinner for slow/failing API calls
var _globalSpinnerEl = null;
var _globalSpinnerCount = 0;

function _showGlobalSpinner(message, isError) {
    if (!_globalSpinnerEl) {
        _globalSpinnerEl = document.createElement('div');
        _globalSpinnerEl.id = 'global-fetch-spinner';
        _globalSpinnerEl.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;' +
            'display:none;align-items:center;justify-content:center;gap:12px;' +
            'padding:12px 24px;font-size:14px;font-weight:600;transition:all 0.3s;';
        document.body.appendChild(_globalSpinnerEl);
        var style = document.createElement('style');
        style.textContent = '@keyframes ada-pulse{0%,100%{opacity:.3}50%{opacity:1}}';
        document.head.appendChild(style);
    }
    var bg = isError ? '#fef2f2' : '#eff6ff';
    var fg = isError ? '#991b1b' : '#1e40af';
    var bd = isError ? '#fecaca' : '#93c5fd';
    _globalSpinnerEl.style.background = bg;
    _globalSpinnerEl.style.color = fg;
    _globalSpinnerEl.style.borderBottom = '2px solid ' + bd;
    _globalSpinnerEl.innerHTML =
        '<div style="display:flex;gap:4px;">' +
        '<span style="width:8px;height:8px;border-radius:50%;background:currentColor;animation:ada-pulse 1.2s infinite;"></span>' +
        '<span style="width:8px;height:8px;border-radius:50%;background:currentColor;animation:ada-pulse 1.2s infinite 0.2s;"></span>' +
        '<span style="width:8px;height:8px;border-radius:50%;background:currentColor;animation:ada-pulse 1.2s infinite 0.4s;"></span>' +
        '</div><span>' + (message || '') + '</span>';
    _globalSpinnerEl.style.display = 'flex';
}

function _hideGlobalSpinner() {
    if (_globalSpinnerEl) _globalSpinnerEl.style.display = 'none';
}

async function fetchApi(path, options = {}) {
    var headers = new Headers((options || {}).headers || {});
    var token = getAuthToken();
    if (token) headers.set('Authorization', 'Bearer ' + token);

    // Correlation ID propagation
    if (typeof ADALog !== 'undefined' && ADALog.getCorrelationId()) {
        headers.set('X-Correlation-Id', ADALog.getCorrelationId());
    }

    var method = (options.method || 'GET').toUpperCase();
    var startMs = Date.now();

    if (typeof ADALog !== 'undefined' && method !== 'GET') {
        ADALog.dbg('API', method + ' ' + path + ' started', null);
    }

    // PR3: Show spinner after 5s, abort after 30s (skip for paths that manage their own timeout)
    var _spinnerTimer = null;
    var _abortTimer = null;
    var _internalController = null;
    var skipSpinner = (options._skipGlobalSpinner === true) || (options.signal != null);

    if (!skipSpinner) {
        _spinnerTimer = setTimeout(function() {
            _globalSpinnerCount++;
            _showGlobalSpinner('Il server sta rispondendo…');
        }, 5000);
        _internalController = new AbortController();
        _abortTimer = setTimeout(function() { _internalController.abort(); }, 30000);
        if (!options.signal) options.signal = _internalController.signal;
    }

    function _clearTimers() {
        if (_spinnerTimer) clearTimeout(_spinnerTimer);
        if (_abortTimer) clearTimeout(_abortTimer);
        if (!skipSpinner) {
            _globalSpinnerCount = Math.max(0, _globalSpinnerCount - 1);
            if (_globalSpinnerCount === 0) _hideGlobalSpinner();
        }
    }

    try {
        var response = await fetch(API_BASE_URL + path, { ...options, headers: headers });
        var durationMs = Date.now() - startMs;
        _clearTimers();

        if (response.status === 401 && token) {
            clearAuthToken();
            if (typeof handleAuthFailure === 'function') handleAuthFailure();
        }

        if (typeof ADALog !== 'undefined') {
            if (!response.ok) {
                ADALog.warn('API', method + ' ' + path + ' → ' + response.status, {
                    durationMs: durationMs, status: response.status
                });
            } else if (durationMs > 3000) {
                ADALog.perf('API', method + ' ' + path + ' slow', { durationMs: durationMs });
            }
        }
        return response;
    } catch (err) {
        _clearTimers();
        if (err.name === 'AbortError' && !skipSpinner) {
            _showGlobalSpinner('Il server non risponde. Riprova tra qualche secondo…', true);
            setTimeout(_hideGlobalSpinner, 8000);
        } else if (err.message && err.message.indexOf('Failed to fetch') !== -1) {
            _showGlobalSpinner('Errore di connessione. Verificare la rete.', true);
            setTimeout(_hideGlobalSpinner, 8000);
        }
        if (typeof ADALog !== 'undefined') {
            ADALog.err('API', method + ' ' + path + ' network error', {
                durationMs: Date.now() - startMs,
                error: err.message || 'unknown',
                isAbort: err.name === 'AbortError'
            });
        }
        throw err;
    }
}

// Version
const ADA_VERSION = '8.22.40';
const ADA_RELEASE_NOTES = 'Fix: Cardiac+Renal phantom IDs — seed invalidates stale AI matches, auto-cleanup on read, description filter aligned.';

// ============================================
// ROLE SYSTEM (PR 4)
// ============================================

const ROLE_VETERINARIO = 'veterinario';
const ROLE_PROPRIETARIO = 'proprietario';
const ADA_ACTIVE_ROLE_KEY = 'ada_active_role';

const ROLE_PERMISSIONS = {
    veterinario: {
        pages: ['patient', 'addpet', 'recording', 'soap', 'soap-readonly', 'owner', 'history', 'diary', 'settings', 'debug', 'costs', 'document', 'vitals', 'photos', 'medications', 'qna', 'qna-pet', 'qna-report', 'tips', 'communication', 'ai-petdesc'],
        actions: ['record', 'transcribe', 'generate_soap', 'archive', 'read_document', 'explain_document', 'export_pdf', 'sync', 'communicate']
    },
    proprietario: {
        pages: ['patient', 'addpet', 'diary', 'vitals', 'medications', 'history', 'soap-readonly', 'owner', 'qna', 'qna-pet', 'qna-report', 'photos', 'tips', 'settings', 'debug', 'document', 'costs', 'communication', 'ai-petdesc'],
        actions: ['view_profile', 'ask_question', 'view_history', 'explain_document', 'view_vitals', 'view_medications', 'view_photos', 'sync', 'communicate', 'use_chatbot']
    },
    admin_brand: {
        pages: ['admin-dashboard', 'admin-catalog', 'admin-campaigns', 'admin-wizard', 'settings'],
        actions: ['manage_catalog', 'manage_campaigns', 'view_dashboard', 'export_reports', 'run_wizard']
    },
    vet_int: {
        pages: ['patient', 'addpet', 'recording', 'soap', 'soap-readonly', 'owner', 'history', 'diary', 'settings', 'debug', 'costs', 'document', 'vitals', 'photos', 'medications', 'qna', 'qna-pet', 'qna-report', 'tips', 'communication', 'ai-petdesc'],
        actions: ['record', 'transcribe', 'generate_soap', 'archive', 'read_document', 'explain_document', 'export_pdf', 'sync', 'communicate']
    },
    vet_ext: {
        pages: ['patient', 'soap-readonly', 'owner', 'history', 'settings', 'debug', 'document', 'communication'],
        actions: ['view_profile', 'view_history', 'explain_document', 'communicate']
    },
    super_admin: {
        pages: ['admin-dashboard', 'admin-catalog', 'admin-campaigns', 'admin-wizard',
                'superadmin-gestione', 'superadmin-tenants', 'superadmin-policies', 'superadmin-tags', 'superadmin-audit',
                'superadmin-users', 'superadmin-sources', 'settings', 'debug',
                'patient', 'addpet', 'recording', 'soap', 'soap-readonly', 'owner', 'history', 'diary', 'vitals', 'medications', 'photos', 'qna', 'qna-pet', 'qna-report', 'tips', 'document', 'costs', 'seed', 'communication', 'ai-petdesc'],
        actions: ['manage_catalog', 'manage_campaigns', 'view_dashboard', 'export_reports',
                  'run_wizard', 'manage_tenants', 'manage_policies', 'manage_tags', 'view_audit',
                  'manage_users', 'manage_sources', 'record', 'transcribe', 'generate_soap', 'archive', 'read_document', 'explain_document', 'export_pdf', 'sync']
    }
};

function getActiveRole() {
    try {
        // Check JWT v2 role first (admin_brand, super_admin)
        if (typeof getJwtRole === 'function') {
            var jwtRole = getJwtRole();
            if (jwtRole === 'admin_brand') {
                return 'admin_brand';
            }
            // super_admin can switch between all roles; use localStorage choice
            if (jwtRole === 'super_admin') {
                var stored = localStorage.getItem(ADA_ACTIVE_ROLE_KEY);
                if (stored === ROLE_PROPRIETARIO) return ROLE_PROPRIETARIO;
                if (stored === ROLE_VETERINARIO) return ROLE_VETERINARIO;
                if (stored === 'admin_brand') return 'admin_brand';
                if (stored === 'super_admin') return 'super_admin';
                // Default: last saved or veterinario
                return stored || ROLE_VETERINARIO;
            }
        }
        // For vet_int/vet_ext JWT roles, default to veterinario
        if (typeof getJwtRole === 'function') {
            var jr = getJwtRole();
            if (jr === 'vet_int' || jr === 'vet_ext' || jr === 'vet') return ROLE_VETERINARIO;
            if (jr === 'owner') return ROLE_PROPRIETARIO;
        }
        var storedRole = localStorage.getItem(ADA_ACTIVE_ROLE_KEY);
        if (storedRole === ROLE_PROPRIETARIO) return ROLE_PROPRIETARIO;
        return ROLE_VETERINARIO;
    } catch (e) {
        return ROLE_VETERINARIO;
    }
}

function setActiveRole(role) {
    const validRoles = [ROLE_PROPRIETARIO, ROLE_VETERINARIO, 'admin_brand', 'super_admin'];
    const validRole = validRoles.indexOf(role) !== -1 ? role : ROLE_VETERINARIO;
    try {
        localStorage.setItem(ADA_ACTIVE_ROLE_KEY, validRole);
    } catch (e) {}
    return validRole;
}

const ADA_ACTIVE_ROLES_KEY = 'ada_active_roles';

function getActiveRoles() {
    try {
        if (typeof isSuperAdmin === 'function' && isSuperAdmin()) {
            var stored = localStorage.getItem(ADA_ACTIVE_ROLES_KEY);
            if (stored) {
                var roles = stored.split(',').filter(Boolean);
                if (roles.length > 0) return roles;
            }
            // Fallback: read single role from legacy key
            var single = getActiveRole();
            return [single];
        }
        return [getActiveRole()];
    } catch (e) {
        return [getActiveRole()];
    }
}

function setActiveRoles(rolesArray) {
    var validRoles = ['veterinario', 'vet_int', 'vet_ext', 'proprietario', 'admin_brand', 'super_admin'];
    var filtered = (rolesArray || []).filter(function(r) { return validRoles.indexOf(r) !== -1; });
    if (filtered.length === 0) filtered = ['veterinario'];
    try {
        localStorage.setItem(ADA_ACTIVE_ROLES_KEY, filtered.join(','));
        // Keep legacy single-role key in sync (first role)
        localStorage.setItem(ADA_ACTIVE_ROLE_KEY, filtered[0]);
    } catch (e) {}
    return filtered;
}

function isPageAllowedForRole(pageId, role) {
    var r = role || getActiveRole();
    // super_admin JWT users: check ALL active roles
    if (typeof isSuperAdmin === 'function' && isSuperAdmin()) {
        var roles = getActiveRoles();
        for (var i = 0; i < roles.length; i++) {
            var rp = ROLE_PERMISSIONS[roles[i]];
            if (rp && rp.pages.indexOf(pageId) !== -1) return true;
        }
        var saPerms = ROLE_PERMISSIONS['super_admin'];
        if (saPerms && saPerms.pages.indexOf(pageId) !== -1) return true;
        return false;
    }
    var perms = ROLE_PERMISSIONS[r];
    if (!perms) return false;
    return perms.pages.indexOf(pageId) !== -1;
}

function isActionAllowedForRole(action, role) {
    var r = role || getActiveRole();
    // super_admin JWT users: check ALL active roles
    if (typeof isSuperAdmin === 'function' && isSuperAdmin()) {
        var roles = getActiveRoles();
        for (var i = 0; i < roles.length; i++) {
            var rp = ROLE_PERMISSIONS[roles[i]];
            if (rp && rp.actions.indexOf(action) !== -1) return true;
        }
        var saPerms = ROLE_PERMISSIONS['super_admin'];
        if (saPerms && saPerms.actions.indexOf(action) !== -1) return true;
        return false;
    }
    var perms = ROLE_PERMISSIONS[r];
    if (!perms) return false;
    return perms.actions.indexOf(action) !== -1;
}

function getDefaultPageForRole(role) {
    const r = role || getActiveRole();
    if (r === ROLE_PROPRIETARIO) return 'patient';
    if (r === 'admin_brand' || r === 'super_admin') return 'admin-dashboard';
    return 'recording';
}

// Template titles
const templateTitles = {
    'generale': 'Visita Generale',
    'vaccinazione': 'Vaccinazione',
    'emergenza': 'Pronto Soccorso',
    'dermatologia': 'Dermatologia',
    'postchirurgico': 'Post-Chirurgico'
};

// Language map for TTS
const langMap = { 'IT': 'it', 'EN': 'en', 'DE': 'de', 'FR': 'fr', 'ES': 'es' };
const langNames = { 'IT': 'italiano', 'EN': 'inglese', 'DE': 'tedesco', 'FR': 'francese', 'ES': 'spagnolo' };
const voiceMap = { 'IT': 'nova', 'EN': 'alloy', 'DE': 'nova', 'FR': 'nova', 'ES': 'nova' };

// API costs (estimated, USD - standard tier)
const API_COSTS = {
    'gpt4o_transcribe_minutes': { label: 'gpt-4o-transcribe-diarize', costPerUnit: 0.006, unit: 'min' },
    'whisper_minutes': { label: 'whisper-1', costPerUnit: 0.006, unit: 'min' },
    'gpt4o_input_tokens': { label: 'gpt-4o (input)', costPerUnit: 2.50 / 1000000, unit: 'tokens' },
    'gpt4o_output_tokens': { label: 'gpt-4o (output)', costPerUnit: 10.00 / 1000000, unit: 'tokens' },
    'gpt4o_mini_input_tokens': { label: 'gpt-4o-mini (input)', costPerUnit: 0.15 / 1000000, unit: 'tokens' },
    'gpt4o_mini_output_tokens': { label: 'gpt-4o-mini (output)', costPerUnit: 0.60 / 1000000, unit: 'tokens' },
    'tts_input_chars': { label: 'tts-1', costPerUnit: 15.00 / 1000000, unit: 'caratteri' }
};

// API usage tracking
let apiUsage = {
    gpt4o_transcribe_minutes: 0,
    whisper_minutes: 0,
    gpt4o_input_tokens: 0,
    gpt4o_output_tokens: 0,
    gpt4o_mini_input_tokens: 0,
    gpt4o_mini_output_tokens: 0,
    tts_input_chars: 0
};

// Medical abbreviations expansion
const MEDICAL_ABBREVIATIONS = {
    'q4h': 'ogni quattro ore',
    'q6h': 'ogni sei ore',
    'q8h': 'ogni otto ore',
    'q12h': 'ogni dodici ore',
    'q24h': 'ogni ventiquattro ore',
    'BID': 'due volte al giorno',
    'TID': 'tre volte al giorno',
    'SID': 'una volta al giorno',
    'QID': 'quattro volte al giorno',
    'PRN': 'al bisogno',
    'PO': 'per bocca',
    'SC': 'sottocute',
    'IM': 'intramuscolo',
    'IV': 'endovena',
    'mg': 'milligrammi',
    'ml': 'millilitri',
    'kg': 'chilogrammi',
    'g': 'grammi',
    '1/2 cp': 'mezza compressa',
    '1/4 cp': 'un quarto di compressa'
};

// SOAP JSON Schema (strict mode)
const SOAP_JSON_SCHEMA = {
    "name": "vet_soap_report",
    "strict": true,
    "schema": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
            "meta": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                    "language": { "type": "string", "enum": ["it"] },
                    "visit_datetime_local": { "type": ["string", "null"] },
                    "species": { "type": ["string", "null"], "enum": ["cane", "gatto", null] },
                    "age_text": { "type": ["string", "null"] },
                    "sex": { "type": ["string", "null"], "enum": ["M", "F", "sconosciuto", null] },
                    "sterilized": { "type": ["boolean", "null"] },
                    "speakers": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "properties": {
                                "speaker_label": { "type": "string" },
                                "role": { "type": "string", "enum": ["veterinario", "proprietario", "altro_personale", "terzo", "sconosciuto"] },
                                "display_name": { "type": ["string", "null"] },
                                "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
                                "supporting_segment_ids": { "type": "array", "items": { "type": "integer", "minimum": 0 } }
                            },
                            "required": ["speaker_label", "role", "display_name", "confidence", "supporting_segment_ids"]
                        }
                    },
                    "disclaimers": { "type": "array", "items": { "type": "string" } }
                },
                "required": ["language", "visit_datetime_local", "species", "age_text", "sex", "sterilized", "speakers", "disclaimers"]
            },
            "S": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                    "chief_complaint": { "type": ["string", "null"] },
                    "history": { "type": "array", "items": { "type": "string" } },
                    "symptoms": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "properties": {
                                "name": { "type": "string" },
                                "onset": { "type": ["string", "null"] },
                                "duration": { "type": ["string", "null"] },
                                "frequency": { "type": ["string", "null"] },
                                "severity": { "type": ["string", "null"] },
                                "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
                                "supporting_segment_ids": { "type": "array", "items": { "type": "integer", "minimum": 0 } }
                            },
                            "required": ["name", "onset", "duration", "frequency", "severity", "confidence", "supporting_segment_ids"]
                        }
                    },
                    "diet": { "type": ["string", "null"] },
                    "environment": { "type": ["string", "null"] },
                    "medications_current": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "properties": {
                                "drug_name": { "type": "string" },
                                "dose_text": { "type": ["string", "null"] },
                                "route": { "type": ["string", "null"] },
                                "frequency": { "type": ["string", "null"] },
                                "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
                                "supporting_segment_ids": { "type": "array", "items": { "type": "integer", "minimum": 0 } }
                            },
                            "required": ["drug_name", "dose_text", "route", "frequency", "confidence", "supporting_segment_ids"]
                        }
                    },
                    "allergies": { "type": "array", "items": { "type": "string" } },
                    "vaccination_prevention": { "type": ["string", "null"] },
                    "supporting_segment_ids": { "type": "array", "items": { "type": "integer", "minimum": 0 } }
                },
                "required": ["chief_complaint", "history", "symptoms", "diet", "environment", "medications_current", "allergies", "vaccination_prevention", "supporting_segment_ids"]
            },
            "O": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                    "vitals": {
                        "type": "object",
                        "additionalProperties": false,
                        "properties": {
                            "weight": { "type": ["string", "null"] },
                            "temperature": { "type": ["string", "null"] },
                            "heart_rate": { "type": ["string", "null"] },
                            "resp_rate": { "type": ["string", "null"] },
                            "mm_color": { "type": ["string", "null"] },
                            "crt": { "type": ["string", "null"] }
                        },
                        "required": ["weight", "temperature", "heart_rate", "resp_rate", "mm_color", "crt"]
                    },
                    "physical_exam": { "type": "array", "items": { "type": "string" } },
                    "tests_performed": { "type": "array", "items": { "type": "string" } },
                    "test_results": { "type": "array", "items": { "type": "string" } },
                    "supporting_segment_ids": { "type": "array", "items": { "type": "integer", "minimum": 0 } }
                },
                "required": ["vitals", "physical_exam", "tests_performed", "test_results", "supporting_segment_ids"]
            },
            "A": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                    "problem_list": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "properties": {
                                "problem": { "type": "string" },
                                "status": { "type": ["string", "null"] },
                                "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
                                "supporting_segment_ids": { "type": "array", "items": { "type": "integer", "minimum": 0 } }
                            },
                            "required": ["problem", "status", "confidence", "supporting_segment_ids"]
                        }
                    },
                    "differentials": { "type": "array", "items": { "type": "string" } },
                    "triage_urgency": { "type": "string", "enum": ["bassa", "media", "alta"] },
                    "uncertainties_and_conflicts": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "properties": {
                                "topic": { "type": "string" },
                                "conflict_summary": { "type": "string" },
                                "supporting_segment_ids": { "type": "array", "items": { "type": "integer", "minimum": 0 } }
                            },
                            "required": ["topic", "conflict_summary", "supporting_segment_ids"]
                        }
                    },
                    "supporting_segment_ids": { "type": "array", "items": { "type": "integer", "minimum": 0 } }
                },
                "required": ["problem_list", "differentials", "triage_urgency", "uncertainties_and_conflicts", "supporting_segment_ids"]
            },
            "P": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                    "diagnostics_planned": { "type": "array", "items": { "type": "string" } },
                    "treatment_plan": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "properties": {
                                "action": { "type": "string" },
                                "dose_text": { "type": ["string", "null"] },
                                "duration": { "type": ["string", "null"] },
                                "notes": { "type": ["string", "null"] },
                                "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
                                "supporting_segment_ids": { "type": "array", "items": { "type": "integer", "minimum": 0 } }
                            },
                            "required": ["action", "dose_text", "duration", "notes", "confidence", "supporting_segment_ids"]
                        }
                    },
                    "client_instructions": { "type": "array", "items": { "type": "string" } },
                    "follow_up": { "type": "array", "items": { "type": "string" } },
                    "red_flags": { "type": "array", "items": { "type": "string" } },
                    "supporting_segment_ids": { "type": "array", "items": { "type": "integer", "minimum": 0 } }
                },
                "required": ["diagnostics_planned", "treatment_plan", "client_instructions", "follow_up", "red_flags", "supporting_segment_ids"]
            },
            "audit": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                    "coverage_notes": { "type": "array", "items": { "type": "string" } },
                    "low_confidence_items": { "type": "array", "items": { "type": "string" } }
                },
                "required": ["coverage_notes", "low_confidence_items"]
            }
        },
        "required": ["meta", "S", "O", "A", "P", "audit"]
    }
};

// SOAP Generation Instructions
const SOAP_SYSTEM_INSTRUCTIONS = `Sei un assistente clinico veterinario esperto. Produci un referto SOAP strutturato dalla trascrizione fornita.

REGOLE FONDAMENTALI:
1) ESTRAI TUTTO IL POSSIBILE: popola i campi con tutte le informazioni clinicamente rilevanti trovate.
2) Lingua: italiano.
3) Tracciabilità: usa supporting_segment_ids (array di interi segment_index) per collegare le informazioni ai segmenti. Se non hai segment_index, usa [].
4) S (Soggettivo): informazioni dal proprietario - motivo visita, storia clinica, sintomi riferiti, dieta, farmaci in corso.
5) O (Oggettivo): osservazioni del veterinario - parametri vitali, esame fisico, esami eseguiti e risultati.
6) A (Assessment/Analisi): diagnosi, diagnosi differenziali, valutazione clinica menzionate.
7) P (Piano): terapie prescritte, esami da fare, istruzioni al proprietario, follow-up.
8) Se il ruolo del parlante è "unknown", deduci dal contenuto: terminologia medica = veterinario, descrizioni in linguaggio comune = proprietario.
9) Confidenza: 0-1 per item. Se incerto, usa 0.5-0.7 ma INCLUDI comunque l'informazione.
10) NON lasciare sezioni completamente vuote se ci sono informazioni rilevanti nella trascrizione.
11) Privacy: generalizza i nomi propri.`;

// Simplified SOAP schema for fallback (more permissive)
const SOAP_SIMPLE_SCHEMA = {
    type: "object",
    properties: {
        S: { type: "object", description: "Soggettivo - dal proprietario" },
        O: { type: "object", description: "Oggettivo - dal veterinario" },
        A: { type: "object", description: "Assessment/Analisi clinica" },
        P: { type: "object", description: "Piano terapeutico" },
        meta: { type: "object", description: "Metadati" }
    }
};

// ============================================
// JWT V2 HELPERS (PR 1 - Multi-user auth)
// ============================================

/**
 * Decode JWT payload (base64, no verification - verification is server-side).
 * Returns the payload object or null.
 */
function decodeJwtPayload(token) {
    try {
        if (!token) return null;
        var parts = token.split('.');
        if (parts.length !== 3) return null;
        var payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        var decoded = atob(payload);
        return JSON.parse(decoded);
    } catch (e) {
        return null;
    }
}

/**
 * Get the role from the current JWT token.
 * Returns 'owner', 'vet_int', 'vet_ext', 'admin_brand', 'super_admin', or null for legacy tokens.
 */
function getJwtRole() {
    var token = getAuthToken();
    var payload = decodeJwtPayload(token);
    if (!payload) return null;
    return payload.role || null;
}

/**
 * Get the tenantId from the current JWT token (v2 only).
 */
function getJwtTenantId() {
    var token = getAuthToken();
    var payload = decodeJwtPayload(token);
    if (!payload) return null;
    return payload.tenantId || null;
}

/**
 * Get the userId from the current JWT token.
 */
function getJwtUserId() {
    var token = getAuthToken();
    var payload = decodeJwtPayload(token);
    if (!payload) return null;
    return payload.sub || null;
}

/**
 * Get the display name from the current JWT token (v2 only).
 */
function getJwtDisplayName() {
    var token = getAuthToken();
    var payload = decodeJwtPayload(token);
    if (!payload) return null;
    return payload.display_name || null;
}

/**
 * Get the email from the current JWT token (v2 only).
 */
function getJwtEmail() {
    var token = getAuthToken();
    var payload = decodeJwtPayload(token);
    if (!payload) return null;
    return payload.email || null;
}

/**
 * Check if the current JWT user is a super_admin.
 */
function isSuperAdmin() {
    if (typeof getJwtRole !== 'function') return false;
    return getJwtRole() === 'super_admin';
}

function isVetExt() {
    return typeof getJwtRole === 'function' && getJwtRole() === 'vet_ext';
}

function isVetInt() {
    var r = typeof getJwtRole === 'function' ? getJwtRole() : '';
    return r === 'vet_int' || r === 'vet';
}

// Helper: blob to base64 data URL
async function blobToDataURL(blob) {
    const ab = await blob.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(ab);
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    return `data:${blob.type || "audio/webm"};base64,${base64}`;
}

// Helper: blob to base64 (clean, no prefix)
async function blobToBase64Clean(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
