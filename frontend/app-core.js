// ADA v8.7.0 - Core Application Functions

// State variables
let currentTemplate = 'generale';
let currentLang = 'IT';
let photos = [];
let vitalsData = [];
let historyData = [];
let medications = [];
let appointments = []; // Legacy - feature removed in v7, kept for data compat
let hideEmptyFields = false;
let vitalsChart = null;
let currentEditingSOAPIndex = -1;
let currentEditingHistoryId = null; // id-based selection for Archivio
let _historySchemaMigrated = false;
let fullscreenTargetId = null;
let lastResetDate = null;
let tipsData = [];
let debugLogEnabled = true;

// ============================================
// JSON EXTRACTION HELPERS (robust parsing from model output)
// ============================================

function _extractJsonObject(text) {
    const t = String(text || '');
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    const candidate = t.slice(start, end + 1);
    try { return JSON.parse(candidate); } catch (e) { return null; }
}

function _extractJsonArray(text) {
    const t = String(text || '');
    const start = t.indexOf('[');
    const end = t.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) return null;
    const candidate = t.slice(start, end + 1);
    try { return JSON.parse(candidate); } catch (e) { return null; }
}

// ============================================
// LOGIN / SESSION
// ============================================

async function login() {
    const emailEl = document.getElementById('emailInput');
    const email = emailEl ? emailEl.value.trim() : '';
    const password = document.getElementById('passwordInput').value;
    const loginError = document.getElementById('loginError');
    const loginBtn = document.getElementById('loginButton');
    const spinnerWrap = document.getElementById('loginSpinner');
    const spinnerText = document.getElementById('loginSpinnerText');

    if (loginError) loginError.style.display = 'none';

    if (!email) {
        if (loginError) {
            loginError.textContent = 'Inserisci la tua email';
            loginError.style.display = 'block';
        }
        return;
    }

    // Show spinner, disable button
    if (loginBtn) loginBtn.disabled = true;
    if (spinnerWrap) spinnerWrap.style.display = 'block';
    if (spinnerText) spinnerText.textContent = '';

    const isDebug = (typeof debugLogEnabled !== 'undefined' && debugLogEnabled);
    let elapsed = 0;
    const tickId = setInterval(() => {
        elapsed++;
        if (!isDebug || !spinnerText) return;
        if (elapsed <= 3) {
            spinnerText.textContent = `In attesa della risposta del server\u2026 (${elapsed}s)`;
        } else if (elapsed <= 15) {
            spinnerText.textContent = `Il server si sta avviando\u2026 (${elapsed}s)`;
        } else {
            spinnerText.textContent = `Avvio del server in corso, ancora un momento\u2026 (${elapsed}s)`;
        }
    }, 1000);

    let token = '';
    let loginData = null;

    try {
        const response = await fetch(`${API_BASE_URL}/auth/login/v2`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        if (response.ok) {
            loginData = await response.json();
            token = loginData?.token || '';
        }
    } catch (e) {}

    clearInterval(tickId);
    if (loginBtn) loginBtn.disabled = false;
    if (spinnerWrap) spinnerWrap.style.display = 'none';

    if (token) {
        setAuthToken(token);
        const sessionKey = btoa(email + ':' + Date.now());
        localStorage.setItem('ada_session', sessionKey);
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appContainer').classList.add('active');
        loadData();
        initApp();
    } else {
        if (loginError) {
            loginError.textContent = 'Email o password non validi';
            loginError.style.display = 'block';
        }
    }
}

async function checkSession() {
    try { applyVersionInfo(); } catch (e) {}
    const session = localStorage.getItem('ada_session');
    const token = getAuthToken();
    if (session && token) {
        try {
            atob(session);
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('appContainer').classList.add('active');
            loadData();
            initApp();
            return;
        } catch (e) {}
    }
}

function logout() {
    localStorage.removeItem('ada_session');
    clearAuthToken();
    location.reload();
}

function handleAuthFailure() {
    // Guard: skip if already on login screen (prevents clearing fields on repeated 401s)
    const loginScreen = document.getElementById('loginScreen');
    if (loginScreen && getComputedStyle(loginScreen).display !== 'none') return;

    localStorage.removeItem('ada_session');
    clearAuthToken();
    const appContainer = document.getElementById('appContainer');
    if (appContainer) appContainer.classList.remove('active');
    if (loginScreen) loginScreen.style.display = 'flex';
    const loginError = document.getElementById('loginError');
    if (loginError) {
        loginError.textContent = 'Sessione scaduta. Accedi di nuovo.';
        loginError.style.display = 'block';
    }
}

// ============================================
// INITIALIZATION
// ============================================

async function initApp() {
    initNavigation();
    initTemplateSelector();
    initVisualizer();
    initVitalsChart();
    initChecklist();
    initHideEmptyToggle();
    initLanguageSelectors();
    initVitalsDateTime();
    initDebugLogSetting();
    initChunkingSettings();
    initChunkingSectionToggle();
    initVetNameSetting();
    initClinicLogoSetting();
    restoreClinicLogoSectionState();
    applyVersionInfo();
    await initSpeakersDB();
    await initMultiPetSystem(); // Initialize multi-pet system

    // Initialize role system (PR 4)
    initRoleSystem();

    // Initialize chip selectors (SPEC-COMP-03)
    initChipSelectors();

    // Initialize Lucide icons (SPEC-DS-03)
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Render account info and settings visibility
    try { renderAccountInfo(); } catch(e) {}
    try { updateSettingsSectionsVisibility(); } catch(e) {}

    // Load global debug mode from server (overrides local setting)
    try { await loadGlobalDebugMode(); } catch(e) {}

    // Initialize documents module (PR 8)
    try { if (typeof initDocuments === 'function') initDocuments(); } catch(e) {}

    // Restore any draft content (transcription/SOAP/notes) saved when the tab lost focus
    restoreTextDrafts();
    syncLangSelectorsForCurrentDoc();

    // Restore progressive transcription state for chunking sessions (if any)
    try { if (typeof restoreChunkVisitDraft === 'function') await restoreChunkVisitDraft(); } catch (e) {}
    renderPhotos();
    renderHistory();
    renderMedications();
    renderSpeakersSettings();
    restoreSpeakersSectionState();
    updateHistoryBadge();
    updateCostDisplay();
    restoreLastPage(); // Restore last viewed page

    // Initialize communication socket and unread badge (real-time notifications)
    try {
        if (typeof initCommSocket === 'function') initCommSocket();
        if (typeof updateCommUnreadBadge === 'function') updateCommUnreadBadge();
        if (typeof startCommBadgePolling === 'function') startCommBadgePolling();
    } catch(e) { console.warn('[CORE] Communication init failed:', e); }
}

function makeFilterableSelect(selectId) {
    var select = document.getElementById(selectId);
    if (!select || select.dataset.filterable === 'true') return;
    select.dataset.filterable = 'true';
    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;width:100%;';
    select.parentNode.insertBefore(wrapper, select);
    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Cerca...';
    input.style.cssText = 'width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:14px;box-sizing:border-box;';
    var dropdown = document.createElement('div');
    dropdown.style.cssText = 'position:absolute;top:100%;left:0;right:0;max-height:200px;overflow-y:auto;background:#fff;border:1px solid #ddd;border-top:none;border-radius:0 0 6px 6px;z-index:1000;display:none;box-shadow:0 4px 6px rgba(0,0,0,0.1);';
    wrapper.appendChild(input);
    wrapper.appendChild(dropdown);
    select.style.display = 'none';
    function updateDropdown() {
        var filter = input.value.toLowerCase();
        var html = '';
        for (var i = 0; i < select.options.length; i++) {
            var opt = select.options[i];
            if (!filter || opt.text.toLowerCase().indexOf(filter) !== -1) {
                var bg = opt.value === select.value ? '#e8f0fe' : '#fff';
                html += '<div data-value="' + opt.value + '" style="padding:8px 12px;cursor:pointer;font-size:13px;background:' + bg + ';" onmouseover="this.style.background=\'#f0f4ff\'" onmouseout="this.style.background=\'' + bg + '\'">' + opt.text + '</div>';
            }
        }
        dropdown.innerHTML = html || '<div style="padding:8px 12px;color:#999;">Nessun risultato</div>';
        dropdown.style.display = '';
    }
    input.addEventListener('focus', function() { if (!select.disabled) updateDropdown(); });
    input.addEventListener('input', function() { if (!select.disabled) updateDropdown(); });
    dropdown.addEventListener('click', function(e) {
        var target = e.target.closest ? e.target.closest('[data-value]') : e.target;
        while (target && !target.dataset.value) target = target.parentElement;
        if (target && target.dataset.value !== undefined) {
            select.value = target.dataset.value;
            input.value = target.textContent;
            dropdown.style.display = 'none';
            select.dispatchEvent(new Event('change'));
        }
    });
    document.addEventListener('click', function(e) {
        if (!wrapper.contains(e.target)) dropdown.style.display = 'none';
    });
    if (select.selectedIndex > 0) input.value = select.options[select.selectedIndex].text;

    // Sync disabled state from <select> to the filterable input wrapper
    function _syncDisabledState() {
        var isDisabled = select.disabled;
        input.disabled = isDisabled;
        input.style.backgroundColor = isDisabled ? '#f5f5f5' : '#fff';
        input.style.color = isDisabled ? '#999' : '#333';
        input.style.cursor = isDisabled ? 'not-allowed' : 'text';
        if (isDisabled) dropdown.style.display = 'none';
    }
    _syncDisabledState();
    var observer = new MutationObserver(function() { _syncDisabledState(); });
    observer.observe(select, { attributes: true, attributeFilter: ['disabled'] });
}

function formatUserNameWithRole(displayName, role) {
    var name = displayName || '';
    if (role === 'vet_int') return name + ' (Vet. interno)';
    if (role === 'vet_ext') return name + ' (Vet. esterno)';
    return name;
}

function getProductImageUrl(item) {
    var baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '';
    if (!item) return baseUrl + _randomProductPlaceholderUrl();
    if (item.image_cached_at || item.image_cached_mime) {
        return baseUrl + '/api/promo-items/' + (item.promo_item_id || item.id) + '/image';
    }
    if (item.image_url) {
        // Prepend API base for relative backend paths (e.g. /api/seed-assets/...)
        if (item.image_url.charAt(0) === '/') return baseUrl + item.image_url;
        return item.image_url;
    }
    return baseUrl + _randomProductPlaceholderUrl();
}

function _randomProductPlaceholderUrl() {
    var idx = String(Math.floor(Math.random() * 45) + 1).padStart(2, '0');
    return '/api/seed-assets/placeholder-prodotti/Prodotto_' + idx + '.png';
}

function applyVersionInfo() {
    const versionEl = document.getElementById('appVersion');
    const releaseNotesEl = document.getElementById('appReleaseNotesVersion');
    const loginVersionEl = document.getElementById('loginVersion');
    if (versionEl) versionEl.textContent = ADA_VERSION;
    if (releaseNotesEl) releaseNotesEl.textContent = ADA_VERSION;
    var releaseNotesTextEl = document.getElementById('appReleaseNotesText');
    if (releaseNotesTextEl) releaseNotesTextEl.textContent = typeof ADA_RELEASE_NOTES !== 'undefined' ? ADA_RELEASE_NOTES : '';
    if (loginVersionEl) loginVersionEl.textContent = 'v' + ADA_VERSION;
    if (document && document.title) {
        document.title = `ADA v${ADA_VERSION} - AI Driven AbuPet`;
    }
}

function initNavigation() {
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            navigateToPage(page);
        });
    });

    // Bottom nav click handlers (SPEC-MOB-01)
    document.querySelectorAll('.bottom-nav-item[data-page]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            navigateToPage(btn.dataset.page);
        });
    });
    
    // Save scroll position when scrolling
    document.querySelector('.main-content')?.addEventListener('scroll', debounce(() => {
        const activePage = document.querySelector('.page.active');
        if (activePage) {
            localStorage.setItem('ada_scroll_position', document.querySelector('.main-content').scrollTop);
        }
    }, 200));
    
    // Save state when app loses focus
    window.addEventListener('blur', saveCurrentPageState);
    window.addEventListener('pagehide', saveCurrentPageState);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            saveCurrentPageState();
        } else if (document.visibilityState === 'visible') {
            // v8.22.0: Refresh pets cache when user returns to the app
            if (typeof fetchPetsFromServer === 'function') {
                fetchPetsFromServer().then(function() {
                    if (typeof rebuildPetSelector === 'function') rebuildPetSelector();
                });
            }
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        const sidebar = document.getElementById('sidebar');
        if (sidebar && sidebar.classList.contains('open')) {
            setSidebarOpen(false);
            event.preventDefault();
        }
    });
}

async function navigateToPage(page) {
    // Debug logging (PR 13)
    if (typeof ADALog !== 'undefined') {
        var fromPage = localStorage.getItem('ada_current_page') || 'unknown';
        ADALog.info('CORE', 'navigateToPage', { from: fromPage, to: page, role: typeof getActiveRole === 'function' ? getActiveRole() : 'unknown' });
    }

    // PR 3: Redirect appointment to home
    if (page === 'appointment') page = getDefaultPageForRole();

    if (page === 'debug' && !debugLogEnabled) page = getDefaultPageForRole();

    // PR 5: Route guard — check role permissions
    if (typeof isPageAllowedForRole === 'function' && !isPageAllowedForRole(page)) {
        const defaultPage = getDefaultPageForRole();
        if (page !== defaultPage) {
            showToast('Pagina non disponibile per il ruolo attuale', 'error');
            page = defaultPage;
        }
    }

    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (navItem) navItem.classList.add('active');

    // Update bottom nav active state (SPEC-MOB-01)
    document.querySelectorAll('.bottom-nav-item').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.page === page);
    });
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageEl = document.getElementById('page-' + page);
    if (pageEl) pageEl.classList.add('active');
    if (window.innerWidth < 800) setSidebarOpen(false);

    // Save current page
    localStorage.setItem('ada_current_page', page);

    if (page === 'costs') updateCostDisplay();
    if (page === 'vitals') setTimeout(() => { try { if (!vitalsChart) initVitalsChart(); } catch(e) {} try { updateVitalsChart(); } catch(e) {} }, 100);
    if (page === 'photos') renderPhotos();
    if (page === 'settings') {
        renderSpeakersSettings();
        try { renderAccountInfo(); } catch(e) {}
        try { updateSettingsSectionsVisibility(); } catch(e) {}
        try { initOpenAiOptimizationsSettingsUI(); } catch(e) {}
        try { if (typeof loadAiSettingsUI === 'function') loadAiSettingsUI('ai-settings-container'); } catch(e) {}
    }
    if (page === 'communication') {
        try { if (typeof initCommunication === 'function') await initCommunication('communication-container'); } catch(e) { console.error('[CORE] initCommunication failed:', e); }
    }
    if (page === 'qna-report') renderQnaReportDropdown();
    if (page === 'tips') {
        try { if (typeof restoreTipsDataForCurrentPet === 'function') restoreTipsDataForCurrentPet(); } catch(e) {}
        try { if (typeof updateTipsMeta === 'function') updateTipsMeta(); } catch(e) {}
        try { if (typeof renderTips === 'function') renderTips(); } catch(e) {}
    }
    if (page === 'history') {
        try { if (typeof renderDocumentsInHistory === 'function') renderDocumentsInHistory(); } catch(e) {}
        try { if (typeof loadPetConversations === 'function') loadPetConversations(typeof getCurrentPetId === 'function' ? getCurrentPetId() : null); } catch(e) {}
        try { if (typeof _renderNutritionInHistory === 'function') _renderNutritionInHistory(typeof getCurrentPetId === 'function' ? getCurrentPetId() : null); } catch(e) {}
    }
    if (page === 'ai-petdesc') {
        try { if (typeof updateAiPetDescriptionUI === 'function') updateAiPetDescriptionUI(); } catch(e) {}
    }
    syncLangSelectorsForCurrentDoc();

    // Update document AI buttons based on role
    try { updateDocumentButtonsByRole(); } catch(e) {}

    // Render promo slots per page context (PR 3) - only for proprietario role (or forceMultiService)
    try {
        var promoRole = typeof getActiveRole === 'function' ? getActiveRole() : null;
        var forceMultiService = (typeof isDebugForceMultiService === 'function' && isDebugForceMultiService());
        if (typeof renderPromoSlot === 'function' && (promoRole === 'proprietario' || forceMultiService)) {
            if (page === 'patient') renderPromoSlot('patient-promo-container', 'pet_profile');
            if (page === 'soap') renderPromoSlot('soap-promo-container', 'post_visit');
            if (page === 'owner') renderPromoSlot('owner-promo-container', 'home_feed');
            if (page === 'qna') renderPromoSlot('qna-promo-container', 'faq_view');
        }
        // Nutrition slot (multi-service) — SOLO per proprietario in Dati Pet
        if (typeof renderNutritionSlot === 'function' && (promoRole === 'proprietario' || forceMultiService)) {
            if (page === 'patient') renderNutritionSlot('patient-nutrition-container', typeof getCurrentPetId === 'function' ? getCurrentPetId() : null);
        }
        // Nutrition dedicated page
        if (page === 'nutrition') {
            try {
                if (typeof renderNutritionPage === 'function') {
                    renderNutritionPage(typeof getCurrentPetId === 'function' ? getCurrentPetId() : null);
                }
            } catch(e) { console.error('[CORE] renderNutritionPage failed:', e); }
        }
            // Insurance slot (multi-service)
            if (typeof renderInsuranceSlot === 'function' && (promoRole === 'proprietario' || forceMultiService)) {
                if (page === 'patient') renderInsuranceSlot('patient-insurance-container', typeof getCurrentPetId === 'function' ? getCurrentPetId() : null);
            }
        if (typeof renderVetFlagButton === 'function' && page === 'patient' && typeof getActiveRole === 'function' && getActiveRole() === 'veterinario') {
            renderVetFlagButton('patient-vet-flag-container', typeof getCurrentPetId === 'function' ? getCurrentPetId() : null);
        }
        if (typeof renderConsentBanner === 'function' && page === 'settings') {
            renderConsentBanner('settings-consent-container');
        }
        if (typeof renderConsentCenter === 'function' && page === 'settings') {
            renderConsentCenter('settings-consent-container');
        }
        // Admin pages (PR 4)
        if (page === 'admin-dashboard' && typeof loadAdminDashboard === 'function') {
            loadAdminDashboard('admin-dashboard-content', '30d');
        }
        if (page === 'admin-wizard' && typeof initCsvWizard === 'function') {
            initCsvWizard('admin-wizard-content');
        }
        if (page === 'admin-catalog' && typeof loadAdminCatalog === 'function') {
            loadAdminCatalog('admin-catalog-content');
        }
        if (page === 'admin-campaigns' && typeof loadAdminCampaigns === 'function') {
            loadAdminCampaigns('admin-campaigns-content');
        }
        if (page === 'superadmin-users' && typeof loadSuperadminUsers === 'function') {
            loadSuperadminUsers('superadmin-users-content');
        }
        if (page === 'superadmin-tenants' && typeof loadSuperadminTenants === 'function') {
            loadSuperadminTenants('superadmin-tenants-content');
        }
        if (page === 'superadmin-policies' && typeof loadSuperadminPolicies === 'function') {
            loadSuperadminPolicies('superadmin-policies-content');
        }
        if (page === 'superadmin-tags' && typeof loadSuperadminTags === 'function') {
            loadSuperadminTags('superadmin-tags-content');
        }
        if (page === 'superadmin-audit' && typeof loadSuperadminAudit === 'function') {
            loadSuperadminAudit('superadmin-audit-content');
        }
        if (page === 'superadmin-sources' && typeof loadSuperadminSources === 'function') {
            loadSuperadminSources('superadmin-sources-content');
        }
        if (page === 'superadmin-knowledge' && typeof initKnowledgePage === 'function') {
            initKnowledgePage();
        }
        if (page === 'seed' && typeof _seedLoadOwnerVetDropdowns === 'function') {
            _seedLoadOwnerVetDropdowns();
        }
    } catch(e) {}

    // Hide internal notes from proprietario (only vet sees them on SOAP page)
    try {
        const internalNotesSection = document.getElementById('internalNotesSection');
        if (internalNotesSection) internalNotesSection.style.display = (page === 'soap' && getActiveRole() !== ROLE_PROPRIETARIO) ? '' : 'none';
    } catch(e) {}

    // Diary page: v7.1.0 dual mode — both vet and owner can generate/save their own profiles
    if (page === 'diary') {
        try {
            const isVet = getActiveRole() === ROLE_VETERINARIO;
            const diaryTextEl = document.getElementById('diaryText');
            if (diaryTextEl) diaryTextEl.readOnly = false;
            // Both roles can use all diary buttons
            ['btnGenerateDiary', 'btnSaveDiary', 'btnExportDiaryTXT', 'btnExportDiaryPDF', 'diaryLangSelector', 'btnSpeakDiary'].forEach(function (id) {
                var el = document.getElementById(id);
                if (el) el.style.display = '';
            });
            // Load the correct diary content for the current role
            try { if (typeof loadDiaryForCurrentRole === 'function') loadDiaryForCurrentRole(); } catch(e) {}
            // Remove legacy read-only notice
            var roNotice = document.getElementById('diaryVetReadonlyNotice');
            if (roNotice) roNotice.style.display = 'none';
        } catch(e) {}
    }
}

function toggleInternalNotes() {
    const body = document.getElementById('internalNotesBody');
    const icon = document.getElementById('internalNotesToggleIcon');
    if (!body) return;
    body.classList.toggle('open');
    if (icon) icon.textContent = body.classList.contains('open') ? '▲' : '▼';
}

// ============================================
// ROLE SWITCHING (PR 4 + PR 5)
// ============================================

function toggleActiveRole() {
    const currentRole = getActiveRole();
    const newRole = (currentRole === ROLE_VETERINARIO) ? ROLE_PROPRIETARIO : ROLE_VETERINARIO;
    setActiveRole(newRole);
    applyRoleUI(newRole);
    const defaultPage = getDefaultPageForRole(newRole);
    navigateToPage(defaultPage);
    showToast('Ruolo: ' + (newRole === ROLE_VETERINARIO ? 'Veterinario' : 'Proprietario'), 'success');
}

function applyRoleUI(role) {
    const r = role || getActiveRole();
    var _isSA = typeof isSuperAdmin === 'function' && isSuperAdmin();

    // For super_admin, use multi-role array; for others, single role
    var activeRoles = _isSA && typeof getActiveRoles === 'function' ? getActiveRoles() : [r];

    // Update sidebar sections based on ALL active roles
    const vetSection = document.getElementById('sidebar-vet');
    const ownerSection = document.getElementById('sidebar-owner');
    const adminSection = document.getElementById('sidebar-admin');
    const testDemoSection = document.getElementById('sidebar-test-demo');

    var showVet = activeRoles.indexOf(ROLE_VETERINARIO) !== -1 || activeRoles.indexOf('vet_int') !== -1 || activeRoles.indexOf('vet_ext') !== -1;
    var showOwner = activeRoles.indexOf(ROLE_PROPRIETARIO) !== -1;
    var showAdmin = activeRoles.indexOf('admin_brand') !== -1 || activeRoles.indexOf('super_admin') !== -1;
    var showTestDemo = _isSA && activeRoles.indexOf('super_admin') !== -1;

    if (vetSection) vetSection.style.display = showVet ? '' : 'none';
    if (ownerSection) ownerSection.style.display = showOwner ? '' : 'none';
    if (adminSection) adminSection.style.display = showAdmin ? '' : 'none';
    if (testDemoSection) testDemoSection.style.display = showTestDemo ? '' : 'none';

    // Hide addpet nav for vet_ext
    var jwtR = typeof getJwtRole === 'function' ? getJwtRole() : '';
    var addPetNav = document.querySelector('[data-page="addpet"]');
    if (addPetNav) addPetNav.style.display = (jwtR === 'vet_ext') ? 'none' : '';

    // Show super_admin-only nav items
    var hasSARole = activeRoles.indexOf('super_admin') !== -1;
    var gestEl = document.getElementById('nav-superadmin-gestione');
    if (gestEl) gestEl.style.display = hasSARole ? '' : 'none';
    var knowledgeEl = document.getElementById('nav-superadmin-knowledge');
    if (knowledgeEl) knowledgeEl.style.display = hasSARole ? '' : 'none';
    var auditBtn = document.getElementById('debug-audit-btn');
    if (auditBtn) auditBtn.style.display = hasSARole ? '' : 'none';

    // Update toggle button (show primary/first role)
    const icon = document.getElementById('roleToggleIcon');
    const labelEl = document.getElementById('roleToggleLabel');
    var roleIcons = { 'veterinario': '🩺', 'proprietario': '🐾', 'admin_brand': '📊', 'super_admin': '⚡' };
    var roleLabelsMap = { 'veterinario': 'Veterinario', 'proprietario': 'Proprietario', 'admin_brand': 'Admin Brand', 'super_admin': 'Super Admin' };
    if (icon) icon.textContent = roleIcons[r] || '🩺';
    if (labelEl) labelEl.textContent = roleLabelsMap[r] || 'Veterinario';

    // Hide role toggle button and label for all users
    var roleToggleContainer = document.getElementById('roleToggleContainer');
    var roleToggleLabelBlock = document.getElementById('roleToggleLabelBlock');
    if (roleToggleContainer) roleToggleContainer.style.display = 'none';
    if (roleToggleLabelBlock) roleToggleLabelBlock.style.display = 'none';

    // Show super_admin role selector (checkboxes) if user is super_admin
    var saSelector = document.getElementById('superAdminRoleSelector');
    if (saSelector) {
        saSelector.style.display = _isSA ? '' : 'none';
        // Sync checkbox states
        if (_isSA) {
            var cbMap = { 'saRoleVetInt': 'vet_int', 'saRoleVetExt': 'vet_ext', 'saRoleOwner': 'proprietario', 'saRoleAdmin': 'admin_brand', 'saRoleSA': 'super_admin' };
            Object.keys(cbMap).forEach(function(cbId) {
                var cb = document.getElementById(cbId);
                if (cb) cb.checked = activeRoles.indexOf(cbMap[cbId]) !== -1;
            });
        }
    }

    // Settings: Sistema section visibility and debug checkbox access control
    try { updateSettingsSystemVisibility(); } catch(e) {}

    // Re-init nav items for the new sidebar section
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
        item.onclick = null;
        item.addEventListener('click', () => navigateToPage(item.dataset.page));
    });

    // Update bottom nav visibility based on role (SPEC-MOB-01)
    document.querySelectorAll('.bottom-nav-item[data-vet]').forEach(function(btn) {
        btn.style.display = showVet ? '' : 'none';
    });

    // Re-init Lucide icons after sidebar changes
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Update debug visibility
    try { updateDebugToolsVisibility(); } catch(e) {}

    // Update history badge in owner section
    try { updateHistoryBadge(); } catch(e) {}

    // Update document AI buttons based on role
    try { updateDocumentButtonsByRole(); } catch(e) {}

    // Show "Spiegami il documento" on SOAP page only for proprietario
    try {
        const explainSoapBtn = document.getElementById('btnGenerateOwnerExplanation');
        if (explainSoapBtn) explainSoapBtn.style.display = (r === ROLE_PROPRIETARIO) ? '' : 'none';
    } catch(e) {}

    // Internal notes: only visible to vet
    try {
        const internalNotesSection = document.getElementById('internalNotesSection');
        if (internalNotesSection) internalNotesSection.style.display = (r === ROLE_PROPRIETARIO) ? 'none' : '';
    } catch(e) {}
}

function updateDocumentButtonsByRole() {
    const role = getActiveRole();
    const readBtn = document.getElementById('btnDocRead');
    const explainBtn = document.getElementById('btnDocExplain');
    // Vet: "Trascrivi" visible, "Spiegami" hidden
    // Owner: "Trascrivi" hidden, "Spiegami" visible
    if (readBtn) readBtn.style.display = (role === ROLE_VETERINARIO) ? '' : 'none';
    if (explainBtn) explainBtn.style.display = (role === ROLE_PROPRIETARIO) ? '' : 'none';
}

function initRoleSystem() {
    // Set initial active role based on JWT role (first login or no saved role)
    var jwtRole = typeof getJwtRole === 'function' ? getJwtRole() : null;
    var storedRole = null;
    try { storedRole = localStorage.getItem(ADA_ACTIVE_ROLE_KEY); } catch(e) {}

    if (jwtRole && !storedRole) {
        // First login: set default role based on JWT role
        if (jwtRole === 'vet_int') {
            setActiveRole(ROLE_VETERINARIO);
        } else if (jwtRole === 'owner') {
            setActiveRole(ROLE_PROPRIETARIO);
        } else if (jwtRole === 'admin_brand') {
            setActiveRole('admin_brand');
        } else if (jwtRole === 'super_admin') {
            // super_admin: default to vet_int + super_admin on first login
            if (typeof setActiveRoles === 'function') {
                setActiveRoles(['vet_int', 'super_admin']);
            } else {
                setActiveRole(ROLE_VETERINARIO);
            }
        }
    }

    const role = getActiveRole();
    applyRoleUI(role);
}

function saveCurrentPageState() {
    const activePage = document.querySelector('.page.active');
    if (activePage) {
        const pageId = activePage.id.replace('page-', '');
        localStorage.setItem('ada_current_page', pageId);
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            localStorage.setItem('ada_scroll_position', mainContent.scrollTop);
        }
    }

    // Persist drafts of user-edited fields so they don't get lost when the tab loses focus
    saveTextDrafts();
}

// ============================================
// TEXT DRAFT PERSISTENCE
// ============================================

const ADA_DRAFT_FIELD_IDS = [
    'transcriptionText',
    'soap-s', 'soap-o', 'soap-a', 'soap-p',
    'ownerExplanation',
    'qnaQuestion', 'qnaAnswer',
    'medName', 'medDosage', 'medFrequency', 'medDuration', 'medInstructions'
];

// Draft persistence for template-specific extras/checklist (v6.16.2)
let _templateDraftSaveTimer = null;

function _getDraftPetKey() {
    try {
        if (typeof getCurrentPetId === 'function') {
            const pid = getCurrentPetId();
            if (pid) return `pet${pid}`;
        }
    } catch (e) {}
    try {
        if (typeof currentPetId !== 'undefined' && currentPetId) return `pet${currentPetId}`;
    } catch (e) {}
    return 'global';
}

function _draftKeyForTemplate(templateKey) {
    const tpl = (templateKey || currentTemplate || 'generale').toString();
    const petKey = _getDraftPetKey();

    // If we are editing a specific archived report, store drafts per-report (not per-template)
    try {
        if (typeof currentEditingHistoryId !== 'undefined' && currentEditingHistoryId) {
            return `ada_draft_rep_${petKey}_${currentEditingHistoryId}_${tpl}`;
        }
    } catch (e) {}

    return `ada_draft_tpl_${petKey}_${tpl}`;
}

function saveTemplateDraftState() {}
function scheduleTemplateDraftSave() {}
function restoreTemplateDraftState() {}

function saveTextDrafts() {
    try {
        ADA_DRAFT_FIELD_IDS.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (typeof el.value !== 'string') return;
            localStorage.setItem(`ada_draft_${id}`, el.value);
        });

    } catch (e) {
        // non-fatal
    }
}

function restoreTextDrafts() {
    try {
        ADA_DRAFT_FIELD_IDS.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const v = localStorage.getItem(`ada_draft_${id}`);
            if (v === null) return;
            // Don't overwrite existing values (e.g., when loading a pet)
            if (!el.value) el.value = v;
        });

        // Restore transcription UI state
        const savedMode = localStorage.getItem('ada_transcription_mode');
        if (savedMode === 'audio' || savedMode === 'text') {
            transcriptionMode = savedMode;
        }
        const ta = document.getElementById('transcriptionText');
        if (ta && ta.value && (!transcriptionMode || transcriptionMode === 'none')) {
            transcriptionMode = 'text';
        }
        applyTranscriptionUI();

        applyHideEmptyVisibility();
    } catch (e) {
        // non-fatal
    }
}

function restoreLastPage() {
    const lastPage = localStorage.getItem('ada_current_page');
    const scrollPosition = localStorage.getItem('ada_scroll_position');
    const safePage = (!debugLogEnabled && lastPage === 'debug') ? 'recording' : lastPage;

    if (safePage) {
        navigateToPage(safePage);
        if (scrollPosition) {
            setTimeout(() => {
                const mainContent = document.querySelector('.main-content');
                if (mainContent) mainContent.scrollTop = parseInt(scrollPosition);
            }, 100);
        }
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function setSidebarOpen(isOpen) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (!sidebar) return;
    sidebar.classList.toggle('open', isOpen);
    if (overlay) overlay.classList.toggle('open', isOpen);
}

function toggleSidebar(forceOpen) { 
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    if (typeof forceOpen === 'boolean') {
        setSidebarOpen(forceOpen);
        return;
    }
    setSidebarOpen(!sidebar.classList.contains('open'));
}

// ============================================
// TEXT FILE UPLOAD
// ============================================

// Transcription mode controls the UX and what we send to the SOAP generator
// - 'audio': transcription generated from audio => read-only
// - 'text': transcription loaded from a .txt => editable
// - 'none': nothing loaded yet
let transcriptionMode = 'none';

function showTranscriptionCard() {
    const card = document.getElementById('transcriptionCard');
    if (card) card.style.display = '';
}

function hideTranscriptionCard() {
    const card = document.getElementById('transcriptionCard');
    if (card) card.style.display = 'none';
    const row = document.getElementById('generateSoapRow');
    if (row) row.style.display = 'none';
}

function applyTranscriptionUI() {
    const titleEl = document.getElementById('transcriptionTitle');
    const ta = document.getElementById('transcriptionText');
    const note = document.getElementById('transcriptionReadOnlyNote');
    const row = document.getElementById('generateSoapRow');

    if (!ta) return;

    if (transcriptionMode === 'none') {
        hideTranscriptionCard();
        return;
    }

    showTranscriptionCard();
    if (row) row.style.display = 'flex';

    const isAudio = transcriptionMode === 'audio';
    if (titleEl) titleEl.textContent = isAudio ? 'Testo trascritto' : 'Testo caricato';
    ta.readOnly = isAudio;
    ta.classList.toggle('readonly-transcription', isAudio);
    if (note) note.style.display = isAudio ? '' : 'none';

    // Persist mode for UX continuity
    try { localStorage.setItem('ada_transcription_mode', transcriptionMode); } catch (e) {}
}

function setTranscriptionFromTextFile(text) {
    // New transcription implies a new referto draft (avoid overwriting an archived record)
    try { if (typeof resetSoapDraftLink === 'function') resetSoapDraftLink(); } catch (e) {}

    const ta = document.getElementById('transcriptionText');
    if (ta) ta.value = (text || '').toString();

    transcriptionMode = 'text';

    // IMPORTANT: when loading a text file we must NOT use segments
    try {
        if (typeof transcriptionSegments !== 'undefined') transcriptionSegments = [];
    } catch (e) {}
    try {
        if (typeof lastTranscriptionResult !== 'undefined') lastTranscriptionResult = { text: (text || '').toString(), segments: [] };
        if (typeof lastTranscriptionDiarized !== 'undefined') lastTranscriptionDiarized = false;
    } catch (e) {}

    applyTranscriptionUI();
}

// Called by app-recording.js when an audio transcription is ready
function setTranscriptionFromAudio(text, segments = [], diarized = false) {
    // New transcription implies a new referto draft (avoid overwriting an archived record)
    try { if (typeof resetSoapDraftLink === 'function') resetSoapDraftLink(); } catch (e) {}

    const ta = document.getElementById('transcriptionText');
    if (ta) ta.value = (text || '').toString();

    transcriptionMode = 'audio';

    try {
        if (typeof transcriptionSegments !== 'undefined') transcriptionSegments = Array.isArray(segments) ? segments : [];
    } catch (e) {}
    try {
        if (typeof lastTranscriptionResult !== 'undefined') lastTranscriptionResult = { text: (text || '').toString(), segments: Array.isArray(segments) ? segments : [] };
        if (typeof lastTranscriptionDiarized !== 'undefined') lastTranscriptionDiarized = !!diarized;
    } catch (e) {}

    applyTranscriptionUI();
}

function triggerTextUpload() {
    document.getElementById('textFileInput').click();
}

function handleTextUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result || '';
        setTranscriptionFromTextFile(text);
        showToast('File testo caricato', 'success');
    };
    reader.onerror = () => {
        showToast('Errore nella lettura del file', 'error');
    };
    reader.readAsText(file);
    event.target.value = '';
}

// ============================================
// FULLSCREEN TEXT READING
// ============================================

let fullscreenSpeaking = false;

async function speakFullscreenText() {
    const text = document.getElementById('fullscreenTextarea').value;
    
    if (!text.trim()) {
        showToast('Nessun testo da leggere', 'error');
        return;
    }
    
    // Use the global speak function with OpenAI TTS
    if (isSpeaking) {
        stopSpeaking();
    } else {
        await speak(text, 'IT');
    }
}

function initTemplateSelector() {
    // Restore last template
    const savedTemplate = localStorage.getItem('ada_last_template');
    const selector = document.getElementById('templateSelector');
    if (savedTemplate) {
        currentTemplate = savedTemplate;
        if (selector) selector.value = templateTitleFromKey(savedTemplate);
    } else {
        currentTemplate = 'generale';
        if (selector) selector.value = '';
    }
    applyHideEmptyVisibility();
}

// v7.1.0: Reverse mapping from display title to template key
var _titleToKey = {};
if (typeof templateTitles !== 'undefined') {
    for (var _k in templateTitles) { if (templateTitles.hasOwnProperty(_k)) _titleToKey[templateTitles[_k]] = _k; }
}
// Add extra entries for datalist options that may not be in templateTitles
var _extraTitleMap = { 'Cardiologia': 'cardiologia', 'Controllo': 'controllo', 'Medicina interna': 'medicina_interna', 'Neurologia': 'neurologia', 'Oncologia': 'oncologia', 'Ortopedia': 'ortopedia', 'Pre-Chirurgia': 'prechirurgia' };
for (var _ek in _extraTitleMap) { if (!_titleToKey[_ek]) _titleToKey[_ek] = _extraTitleMap[_ek]; }

function templateKeyFromTitle(title) {
    if (_titleToKey[title]) return _titleToKey[title];
    return 'generale'; // fallback for custom text
}

function templateTitleFromKey(key) {
    return (typeof templateTitles !== 'undefined' && templateTitles[key]) ? templateTitles[key] : (key || 'Visita Generale');
}

// Called by the <input> onchange in the SOAP page
function onTemplateSelectorInput(text) {
    var key = templateKeyFromTitle(text);
    onTemplateChange(key);
}

function onTemplateChange(value) {
    // Save current template drafts before switching
    saveTemplateDraftState();

    currentTemplate = value;
    localStorage.setItem('ada_last_template', value);

    applyHideEmptyVisibility();
}


// ============================================
// VETERINARIAN NAME (Settings 5A)
// ============================================

const ADA_VET_NAME_KEY = 'ada_vet_name';

function getVetName() {
    try {
        // Use account display name from JWT as primary source
        if (typeof getJwtDisplayName === 'function') {
            var jwtName = getJwtDisplayName();
            if (jwtName && jwtName.trim()) return jwtName.trim();
        }
        // Fallback to localStorage (legacy or manually set)
        return (localStorage.getItem(ADA_VET_NAME_KEY) || '').trim();
    } catch (e) {
        return '';
    }
}

function saveVetName(value) {
    try {
        const v = (value || '').toString().trim();
        localStorage.setItem(ADA_VET_NAME_KEY, v);
    } catch (e) {}
}

function initVetNameSetting() {
    // If JWT has display_name, the fallback input is hidden (renderAccountInfo handles it).
    // Otherwise, populate the fallback input from localStorage so users can set their name.
    var elInput = document.getElementById('vetNameFallbackInput');
    if (elInput) {
        elInput.value = (localStorage.getItem(ADA_VET_NAME_KEY) || '').trim();
    }
}

function saveVetNameFromAccount() {
    var elInput = document.getElementById('vetNameFallbackInput');
    if (!elInput) return;
    var val = elInput.value.trim();
    saveVetName(val);
    var elName = document.getElementById('accountDisplayName');
    if (elName) elName.textContent = val || '—';
}

// ============================================
// ACCOUNT INFO & SETTINGS VISIBILITY
// ============================================

function renderAccountInfo() {
    var email = typeof getJwtEmail === 'function' ? getJwtEmail() : null;
    var jwtName = typeof getJwtDisplayName === 'function' ? getJwtDisplayName() : null;
    var role = typeof getJwtRole === 'function' ? getJwtRole() : null;
    var tenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;

    var elEmail = document.getElementById('accountEmail');
    var elName = document.getElementById('accountDisplayName');
    var elRole = document.getElementById('accountRole');
    var elTenantRow = document.getElementById('accountTenantRow');
    var elTenant = document.getElementById('accountTenant');
    var elNameEditRow = document.getElementById('accountNameEditRow');

    if (elEmail) elEmail.textContent = email || '—';

    // If JWT provides display_name, show it read-only and hide the fallback input.
    // Otherwise show the localStorage-backed fallback input so users can set their name.
    var hasJwtName = jwtName && jwtName.trim();
    if (hasJwtName) {
        if (elName) elName.textContent = jwtName.trim();
        if (elNameEditRow) elNameEditRow.style.display = 'none';
    } else {
        var fallback = (localStorage.getItem(ADA_VET_NAME_KEY) || '').trim();
        if (elName) elName.textContent = fallback || '—';
        if (elNameEditRow) elNameEditRow.style.display = '';
    }

    var roleLabels = {
        'vet_int': 'Veterinario',
        'vet_ext': 'Veterinario Esterno',
        'owner': 'Proprietario',
        'admin_brand': 'Admin Brand',
        'super_admin': 'Super Admin'
    };
    if (elRole) elRole.textContent = roleLabels[role] || role || '—';

    if (elTenantRow && elTenant) {
        if (tenantId) {
            elTenantRow.style.display = '';
            elTenant.style.display = '';
            elTenant.textContent = tenantId;
        } else {
            elTenantRow.style.display = 'none';
            elTenant.style.display = 'none';
        }
    }
}

function updateSettingsSectionsVisibility() {
    var isSA = typeof isSuperAdmin === 'function' && isSuperAdmin();
    var speakersCard = document.getElementById('settingsSpeakersCard');
    var clinicCard = document.getElementById('settingsClinicCard');

    if (speakersCard) speakersCard.style.display = isSA ? '' : 'none';
    if (clinicCard) clinicCard.style.display = isSA ? '' : 'none';

    // Sistema card: role-based access control
    try { updateSettingsSystemVisibility(); } catch(e) {}
}

// ============================================
// CHANGE PASSWORD
// ============================================

function openChangePasswordModal() {
    var modal = document.getElementById('changePasswordModal');
    if (modal) modal.classList.add('active');
    // Clear fields
    var ids = ['cpCurrentPassword', 'cpNewPassword', 'cpConfirmPassword'];
    ids.forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; });
    var err = document.getElementById('cpError');
    if (err) err.style.display = 'none';
}

function closeChangePasswordModal() {
    var modal = document.getElementById('changePasswordModal');
    if (modal) modal.classList.remove('active');
}

async function submitChangePassword() {
    var currentPw = (document.getElementById('cpCurrentPassword')?.value || '').trim();
    var newPw = (document.getElementById('cpNewPassword')?.value || '');
    var confirmPw = (document.getElementById('cpConfirmPassword')?.value || '');
    var errEl = document.getElementById('cpError');

    function showErr(msg) {
        if (errEl) { errEl.textContent = msg; errEl.style.display = ''; }
    }

    if (!currentPw) { showErr('Inserisci la password attuale.'); return; }
    if (!newPw) { showErr('Inserisci la nuova password.'); return; }
    if (newPw.length < 6) { showErr('La nuova password deve avere almeno 6 caratteri.'); return; }
    if (newPw !== confirmPw) { showErr('Le password non coincidono.'); return; }
    if (newPw === currentPw) { showErr('La nuova password deve essere diversa dalla precedente.'); return; }

    if (errEl) errEl.style.display = 'none';

    try {
        var resp = await fetchApi('/api/me/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw })
        });
        var data = await resp.json();
        if (!resp.ok) {
            var messages = {
                'wrong_current_password': 'La password attuale non è corretta.',
                'password_too_short': 'La nuova password deve avere almeno 6 caratteri.',
                'legacy_token_not_supported': 'Cambio password non disponibile per questa sessione.',
                'database_not_configured': 'Database non configurato.'
            };
            showErr(messages[data.error] || data.error || 'Errore sconosciuto');
            return;
        }
        closeChangePasswordModal();
        showToast('Password cambiata con successo', 'success');
    } catch (e) {
        showErr('Errore di rete: ' + (e.message || 'riprova'));
    }
}

// ============================================
// SUPER ADMIN ROLE SELECTOR
// ============================================

function onSuperAdminRoleChange(role) {
    // Backward compat wrapper — sets a single role
    if (typeof setActiveRoles === 'function') {
        setActiveRoles([role]);
    } else {
        setActiveRole(role);
    }
    applyRoleUI(role);
    var defaultPage = getDefaultPageForRole(role);
    navigateToPage(defaultPage);
    var labels = {
        'veterinario': 'Veterinario',
        'proprietario': 'Proprietario',
        'admin_brand': 'Admin Brand',
        'super_admin': 'Super Admin'
    };
    showToast('Ruolo: ' + (labels[role] || role), 'success');
}

function onSuperAdminRoleToggle() {
    var cbMap = { 'saRoleVetInt': 'vet_int', 'saRoleVetExt': 'vet_ext', 'saRoleOwner': 'proprietario', 'saRoleAdmin': 'admin_brand', 'saRoleSA': 'super_admin' };
    var selected = [];
    Object.keys(cbMap).forEach(function(cbId) {
        var cb = document.getElementById(cbId);
        if (cb && cb.checked) selected.push(cbMap[cbId]);
    });
    // Ensure at least one role is selected
    if (selected.length === 0) {
        selected = ['vet_int'];
        var vetCb = document.getElementById('saRoleVetInt');
        if (vetCb) vetCb.checked = true;
    }
    if (typeof setActiveRoles === 'function') {
        setActiveRoles(selected);
    }
    applyRoleUI(selected[0]);
    var labels = {
        'vet_int': 'Vet Interno',
        'vet_ext': 'Vet Esterno',
        'proprietario': 'Proprietario',
        'admin_brand': 'Admin Brand',
        'super_admin': 'Super Admin'
    };
    var names = selected.map(function(r) { return labels[r] || r; });
    showToast('Ruoli attivi: ' + names.join(', '), 'success');
}

// ============================================
// EDIT PET MODAL
// ============================================

function openEditPetModal() {
    if (!currentPetId) {
        showToast('Nessun pet selezionato', 'error');
        return;
    }

    // Load current values into edit modal fields
    var fields = {
        'editPetName': document.getElementById('petName')?.value || '',
        'editPetSpecies': document.getElementById('petSpecies')?.value || '',
        'editPetBreed': document.getElementById('petBreed')?.value || '',
        'editPetBirthdate': document.getElementById('petBirthdate')?.value || '',
        'editPetSex': document.getElementById('petSex')?.value || '',
        'editPetMicrochip': document.getElementById('petMicrochip')?.value || '',
        'editOwnerPhone': document.getElementById('ownerPhone')?.value || '',
        'editVisitDate': document.getElementById('visitDate')?.value || ''
    };
    for (var id in fields) {
        var el = document.getElementById(id);
        if (el) el.value = fields[id];
    }

    // Load owner/vet dropdowns for edit modal
    var pet = petsCache.find(function(p) { return (p.id || p.pet_id) === currentPetId; });
    var currentOwnerId = pet ? pet.owner_user_id : null;
    var currentVetId = pet ? pet.referring_vet_user_id : null;
    _loadOwnerAndVetDropdowns('editOwnerName', 'editOwnerReferringVet', currentOwnerId, currentVetId);
    // Owner/Vet Esterno: only vet/vet_int/super_admin can edit assignment
    setTimeout(function() {
        var _jr = typeof getJwtRole === 'function' ? getJwtRole() : '';
        var canEditAssignment = (_jr === 'vet_int' || _jr === 'super_admin');
        var canEditVetReferral = canEditAssignment || (_jr === 'owner');
        var eo = document.getElementById('editOwnerName');
        var ev = document.getElementById('editOwnerReferringVet');
        if (eo) eo.disabled = !canEditAssignment;
        if (ev) ev.disabled = !canEditVetReferral;
    }, 100);

    // Lifestyle fields
    var lifestyleMapping = {
        'editPetLifestyle': 'petLifestyle',
        'editPetActivityLevel': 'petActivityLevel',
        'editPetDietType': 'petDietType',
        'editPetDietPreferences': 'petDietPreferences',
        'editPetKnownConditions': 'petKnownConditions',
        'editPetCurrentMeds': 'petCurrentMeds',
        'editPetBehaviorNotes': 'petBehaviorNotes',
        'editPetLocation': 'petLocation',
        'editPetIdealWeight': 'petIdealWeight',
        'editPetMealsPerDay': 'petMealsPerDay',
        'editPetFoodAllergies': 'petFoodAllergies'
    };
    for (var editId in lifestyleMapping) {
        var srcEl = document.getElementById(lifestyleMapping[editId]);
        var dstEl = document.getElementById(editId);
        if (srcEl && dstEl) dstEl.value = srcEl.value || '';
    }

    // Household chip selector
    if (typeof getChipValues === 'function' && typeof setChipValues === 'function') {
        var srcValues = getChipValues('petHousehold');
        setChipValues('editPetHousehold', srcValues);
    }

    // Close lifestyle section by default
    var ls = document.getElementById('editPetLifestyleSection');
    if (ls) ls.classList.remove('open');

    // v3: Update breed datalist for edit modal
    if (typeof _updateBreedDatalist === 'function') _updateBreedDatalist('editPetSpecies', 'editPetBreedList');
    var editSpeciesEl = document.getElementById('editPetSpecies');
    if (editSpeciesEl) editSpeciesEl.addEventListener('change', function() { if (typeof _updateBreedDatalist === 'function') _updateBreedDatalist('editPetSpecies', 'editPetBreedList'); });

    var modal = document.getElementById('editPetModal');
    if (modal) modal.classList.add('active');
}

function toggleEditPetLifestyleSection() {
    var section = document.getElementById('editPetLifestyleSection');
    if (section) section.classList.toggle('open');
}

async function saveEditPet() {
    // vet_ext cannot modify pets
    var _jr = typeof getJwtRole === 'function' ? getJwtRole() : '';
    if (_jr === 'vet_ext') {
        if (typeof showToast === 'function') showToast('Il veterinario esterno non può modificare pet', 'error');
        return;
    }
    var petName = (document.getElementById('editPetName')?.value || '').trim();
    var petSpecies = document.getElementById('editPetSpecies')?.value || '';

    if (!petName) { alert('Nome del pet è obbligatorio'); return; }
    if (!petSpecies) { alert('Specie è obbligatoria'); return; }

    // Copy values from edit modal to main fields
    var mapping = {
        'petName': 'editPetName',
        'petSpecies': 'editPetSpecies',
        'petBreed': 'editPetBreed',
        'petBirthdate': 'editPetBirthdate',
        'petSex': 'editPetSex',
        'petMicrochip': 'editPetMicrochip',
        'ownerPhone': 'editOwnerPhone',
        'visitDate': 'editVisitDate'
    };
    for (var mainId in mapping) {
        var src = document.getElementById(mapping[mainId]);
        var dst = document.getElementById(mainId);
        if (src && dst) dst.value = src.value;
    }
    // Copy dropdown selections (owner + vet referral)
    var editOwnerSel = document.getElementById('editOwnerName');
    var mainOwnerSel = document.getElementById('ownerName');
    if (editOwnerSel && mainOwnerSel) mainOwnerSel.value = editOwnerSel.value;
    var editVetSel = document.getElementById('editOwnerReferringVet');
    var mainVetSel = document.getElementById('ownerReferringVet');
    if (editVetSel && mainVetSel) mainVetSel.value = editVetSel.value;

    // Lifestyle
    var lifestyleMapping = {
        'petLifestyle': 'editPetLifestyle',
        'petActivityLevel': 'editPetActivityLevel',
        'petDietType': 'editPetDietType',
        'petDietPreferences': 'editPetDietPreferences',
        'petKnownConditions': 'editPetKnownConditions',
        'petCurrentMeds': 'editPetCurrentMeds',
        'petBehaviorNotes': 'editPetBehaviorNotes',
        'petLocation': 'editPetLocation',
        'petIdealWeight': 'editPetIdealWeight',
        'petMealsPerDay': 'editPetMealsPerDay',
        'petFoodAllergies': 'editPetFoodAllergies'
    };
    for (var lmId in lifestyleMapping) {
        var lSrc = document.getElementById(lifestyleMapping[lmId]);
        var lDst = document.getElementById(lmId);
        if (lSrc && lDst) lDst.value = lSrc.value;
    }

    // Household chip selector
    if (typeof getChipValues === 'function' && typeof setChipValues === 'function') {
        var editValues = getChipValues('editPetHousehold');
        setChipValues('petHousehold', editValues);
    }

    // Close modal
    var modal = document.getElementById('editPetModal');
    if (modal) modal.classList.remove('active');

    // Save via the existing save flow
    await saveCurrentPet();

    // PR2: Force refresh from server after save to guarantee owner/vet consistency
    var currentPetId = typeof getCurrentPetId === 'function' ? getCurrentPetId() : null;
    if (currentPetId) {
        setTimeout(async function() {
            try {
                if (typeof refreshPetsFromServer === 'function') {
                    await refreshPetsFromServer(false);
                }
                var freshPet = typeof getPetById === 'function' ? await getPetById(currentPetId) : null;
                if (freshPet && typeof loadPetIntoMainFields === 'function') loadPetIntoMainFields(freshPet);
            } catch(e) {}
        }, 500);
    }
}

function cancelEditPet() {
    var modal = document.getElementById('editPetModal');
    if (modal) modal.classList.remove('active');
}

// ============================================
// API KEY SELECTION (General vs Costs)
// ============================================

// ============================================
// DEBUG LOG SETTINGS
// ============================================

function initDebugLogSetting() {
    const saved = localStorage.getItem('ada_debug_log');
    debugLogEnabled = saved !== 'false';
    const checkbox = document.getElementById('debugLogEnabled');
    if (checkbox) checkbox.checked = debugLogEnabled;

    // Multi-service debug flag
    try { _debugForceMultiService = localStorage.getItem('ada_debug_force_multi_service') === 'true'; } catch(e) {}
    var fmsEl = document.getElementById('debugForceMultiService');
    if (fmsEl) fmsEl.checked = _debugForceMultiService;
}

var _debugForceMultiService = false;

function toggleDebugForceMultiService(enabled) {
    _debugForceMultiService = !!enabled;
    try { localStorage.setItem('ada_debug_force_multi_service', enabled ? 'true' : 'false'); } catch(e) {}
    showToast(enabled ? 'Multi-servizio forzato ON' : 'Multi-servizio forzato OFF', 'success');
    var currentPage = document.querySelector('.page.active');
    if (currentPage) navigateToPage(currentPage.id.replace('page-', ''));
}

function isDebugForceMultiService() {
    return _debugForceMultiService;
}

function toggleDebugLog(enabled) {
    debugLogEnabled = enabled;
    localStorage.setItem('ada_debug_log', enabled ? 'true' : 'false');

    // If super_admin, persist globally via policies
    if (typeof isSuperAdmin === 'function' && isSuperAdmin()) {
        fetchApi('/api/superadmin/policies/debug_mode_enabled', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: enabled, description: 'Debug mode for all users' })
        }).catch(function() {});
    }

    showToast(enabled ? 'Log debug attivato' : 'Log debug disattivato', 'success');

    // Debug ON exposes test-only UI tools (long audio/text loaders) and audio cache controls
    try { updateDebugToolsVisibility(); } catch (e) {}
    try { updateSettingsSystemVisibility(); } catch (e) {}
    try { if (typeof refreshAudioCacheInfo === 'function') refreshAudioCacheInfo(); } catch (e) {}
}

async function loadGlobalDebugMode() {
    try {
        const resp = await fetchApi('/api/settings/debug-mode');
        if (resp.ok) {
            const data = await resp.json();
            debugLogEnabled = !!data.debug_mode_enabled;
            const cb = document.getElementById('debugLogEnabled');
            if (cb) cb.checked = debugLogEnabled;
            updateSettingsSystemVisibility();
            updateDebugToolsVisibility();
        }
    } catch (_) {}
}

// ============================================
// CLINIC LOGO SETTINGS
// ============================================

const ADA_CLINIC_LOGO_KEY = 'ada_clinic_logo';
const ADA_DEFAULT_LOGO_SRC = 'logo-anicura.png';

function getClinicLogoSrc() {
    try {
        return localStorage.getItem(ADA_CLINIC_LOGO_KEY) || ADA_DEFAULT_LOGO_SRC;
    } catch (e) {
        return ADA_DEFAULT_LOGO_SRC;
    }
}

function setClinicLogoSrc(value) {
    try {
        if (!value || value === ADA_DEFAULT_LOGO_SRC) {
            localStorage.removeItem(ADA_CLINIC_LOGO_KEY);
        } else {
            localStorage.setItem(ADA_CLINIC_LOGO_KEY, value);
        }
    } catch (e) {}
}

function applyClinicLogo(src) {
    const logo = document.getElementById('clinicLogo');
    const preview = document.getElementById('clinicLogoPreview');
    const hidden = document.getElementById('anicuraLogoImg');
    if (logo) logo.src = src;
    if (preview) preview.src = src;
    if (hidden) {
        hidden.src = src;
        hidden.crossOrigin = 'anonymous';
    }
}

function handleClinicLogoUpload(event) {
    const input = event?.target;
    const file = input?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        const src = String(reader.result || '');
        if (!src) return;
        setClinicLogoSrc(src);
        applyClinicLogo(src);
        showToast('Logo aggiornato', 'success');
        if (input) input.value = '';
    };
    reader.readAsDataURL(file);
}

function resetClinicLogo() {
    setClinicLogoSrc(ADA_DEFAULT_LOGO_SRC);
    applyClinicLogo(ADA_DEFAULT_LOGO_SRC);
    showToast('Logo ripristinato', 'success');
}

function initClinicLogoSetting() {
    const input = document.getElementById('clinicLogoInput');
    applyClinicLogo(getClinicLogoSrc());
    if (input) input.addEventListener('change', handleClinicLogoUpload);
}

const ADA_CLINIC_LOGO_SECTION_KEY = 'ada_clinic_logo_section_open';

function toggleClinicLogoSection(forceOpen) {
    const body = document.getElementById('clinicLogoSectionBody');
    const icon = document.getElementById('clinicLogoToggleIcon');
    if (!body) return;
    const isOpenNow = body.style.display !== 'none' && body.style.display !== ''
        ? true
        : (getComputedStyle(body).display !== 'none');
    const nextOpen = (typeof forceOpen === 'boolean') ? forceOpen : !isOpenNow;
    body.style.display = nextOpen ? '' : 'none';
    if (icon) icon.textContent = nextOpen ? '▾' : '▸';
    try { localStorage.setItem(ADA_CLINIC_LOGO_SECTION_KEY, nextOpen ? 'true' : 'false'); } catch (e) {}
}

function restoreClinicLogoSectionState() {
    let open = true;
    try {
        const stored = localStorage.getItem(ADA_CLINIC_LOGO_SECTION_KEY);
        if (stored !== null) open = stored !== 'false';
    } catch (e) {}
    toggleClinicLogoSection(open);
}

// ============================================
// CHUNK RECORDING SETTINGS (v6.17.3)
// ============================================

const ADA_CHUNKING_ENABLED_KEY = 'ada_chunking_enabled';
const ADA_CHUNKING_PROFILE_KEY = 'ada_chunking_profile';
const ADA_CHUNKING_CONFIG_KEY_PREFIX = 'ada_chunking_config_';
const ADA_CHUNKING_SECTION_OPEN_KEY = 'ada_chunking_section_open';

function toggleChunkingSection(forceOpen) {
    const body = document.getElementById('chunkingSectionBody');
    const icon = document.getElementById('chunkingToggleIcon');
    if (!body) return;
    const isOpen = typeof forceOpen === 'boolean' ? forceOpen : body.style.display === 'none';
    body.style.display = isOpen ? '' : 'none';
    if (icon) icon.textContent = isOpen ? '▾' : '▸';
    try { localStorage.setItem(ADA_CHUNKING_SECTION_OPEN_KEY, isOpen ? 'true' : 'false'); } catch (e) {}
}

function initChunkingSectionToggle() {
    let open = true;
    try {
        const stored = localStorage.getItem(ADA_CHUNKING_SECTION_OPEN_KEY);
        if (stored !== null) open = stored !== 'false';
    } catch (e) {}
    toggleChunkingSection(open);
}

function detectRecordingProfile() {
    const ua = (navigator.userAgent || '').toString();
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/.test(ua);
    const isWindows = /Windows/.test(ua);
    if (isIOS) return 'iphone';
    if (isAndroid) return 'android';
    if (isWindows) return 'windows';
    return 'desktop';
}

function chooseBestSupportedMimeType(profile) {
    // Prefer Opus/WebM on desktop/Android, MP4/AAC on iPhone if available.
    const candidates = profile === 'iphone'
        ? ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
        : ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];

    try {
        for (const t of candidates) {
            if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
        }
    } catch (e) {}
    return ''; // let the browser choose
}

function _defaultChunkingConfig(profile) {
    // Defaults tuned to stay under the 25MB transcription cap and reduce iPhone instability.
    if (profile === 'iphone') {
        return {
            chunkDurationSec: 1200,
            timesliceMs: 1000,
            maxPendingChunks: 2,
            maxConcurrentTranscriptions: 1,
            uploadRetryCount: 2,
            uploadRetryBackoffMs: 1800,
            hardStopAtMb: 23,
            warnBeforeSplitSec: 25,
            autoSplitGraceMs: 450
        };
    }
    if (profile === 'android') {
        return {
            chunkDurationSec: 900,
            timesliceMs: 1000,
            maxPendingChunks: 3,
            maxConcurrentTranscriptions: 1,
            uploadRetryCount: 2,
            uploadRetryBackoffMs: 1500,
            hardStopAtMb: 23,
            warnBeforeSplitSec: 20,
            autoSplitGraceMs: 250
        };
    }
    // windows/desktop
    return {
        chunkDurationSec: 600,
        timesliceMs: 1000,
        maxPendingChunks: 4,
        maxConcurrentTranscriptions: 1,
        uploadRetryCount: 2,
        uploadRetryBackoffMs: 1300,
        hardStopAtMb: 23,
        warnBeforeSplitSec: 20,
        autoSplitGraceMs: 200
    };
}

function getChunkingEnabled() {
    const v = localStorage.getItem(ADA_CHUNKING_ENABLED_KEY);
    if (v === null) return true; // default ON
    return v !== 'false';
}

function setChunkingEnabled(enabled) {
    localStorage.setItem(ADA_CHUNKING_ENABLED_KEY, enabled ? 'true' : 'false');
}

function loadChunkingConfig(profile) {
    const key = ADA_CHUNKING_CONFIG_KEY_PREFIX + profile;
    try {
        const raw = localStorage.getItem(key);
        if (raw) {
            const parsed = JSON.parse(raw);
            return { ..._defaultChunkingConfig(profile), ...(parsed || {}) };
        }
    } catch (e) {}
    return _defaultChunkingConfig(profile);
}

function saveChunkingConfig(profile, cfg) {
    const key = ADA_CHUNKING_CONFIG_KEY_PREFIX + profile;
    try { localStorage.setItem(key, JSON.stringify(cfg || {})); } catch (e) {}
}

function toggleChunkingEnabled(enabled) {
    setChunkingEnabled(!!enabled);
    showToast(enabled ? 'Chunking attivato' : 'Chunking disattivato', 'success');
    try { if (typeof updateChunkingBadgesFromSettings === 'function') updateChunkingBadgesFromSettings(); } catch (e) {}
}

/**
 * Settings page: role-based visibility of the Sistema section and Debug checkbox.
 * - super_admin: always sees and can modify
 * - admin_brand, vet, owner: debug ON → see read-only; debug OFF → hidden
 */
function updateSettingsSystemVisibility() {
    var card = document.getElementById('settingsSystemCard');
    var checkbox = document.getElementById('debugLogEnabled');
    if (!card) return;
    var _isSA = typeof isSuperAdmin === 'function' && isSuperAdmin();
    var dbg = !!debugLogEnabled;
    if (_isSA) {
        // super_admin always sees and can modify
        card.style.display = '';
        if (checkbox) { checkbox.disabled = false; checkbox.style.pointerEvents = ''; }
    } else if (dbg) {
        // non-super_admin with debug ON: visible, read-only
        card.style.display = '';
        if (checkbox) { checkbox.disabled = true; checkbox.style.pointerEvents = 'none'; }
    } else {
        // non-super_admin with debug OFF: hidden
        card.style.display = 'none';
    }
}

function updateDebugToolsVisibility() {
    const dbg = !!debugLogEnabled;
    const el1 = document.getElementById('debugTestTools');
    const el2 = document.getElementById('audioCacheTools');
    const nav = document.getElementById('nav-debug');
    const page = document.getElementById('page-debug');
    const runtime = document.getElementById('chunkingRuntime');
    if (el1) el1.style.display = dbg ? '' : 'none';
    if (el2) el2.style.display = dbg ? '' : 'none';
    if (nav) nav.style.display = dbg ? '' : 'none';
    if (page) page.style.display = dbg ? '' : 'none';
    if (!dbg && runtime) runtime.style.display = 'none';
    var aiPetDescNav = document.getElementById('nav-ai-petdesc');
    if (aiPetDescNav) aiPetDescNav.style.display = dbg ? '' : 'none';
    var aiPetDescPage = document.getElementById('page-ai-petdesc');
    if (aiPetDescPage) aiPetDescPage.style.display = dbg ? '' : 'none';

    if (!dbg) {
        const activePage = document.querySelector('.page.active');
        if (activePage && (activePage.id === 'page-debug' || activePage.id === 'page-ai-petdesc')) {
            navigateToPage('recording');
        }
    }

    if (dbg) {
        try { if (typeof updateAudioCacheInfo === 'function') updateAudioCacheInfo(); } catch (e) {}
    }
}

function initChunkingSettings() {
    // Device profile is auto-detected and shown read-only.
    const profile = detectRecordingProfile();
    try { localStorage.setItem(ADA_CHUNKING_PROFILE_KEY, profile); } catch (e) {}

    const profileEl = document.getElementById('chunkingProfile');
    if (profileEl) profileEl.value = profile;

    const mime = chooseBestSupportedMimeType(profile) || '(auto)';
    const mimeEl = document.getElementById('chunkingMimeType');
    if (mimeEl) mimeEl.value = mime;

    // Enabled toggle
    const enabledEl = document.getElementById('chunkingEnabled');
    if (enabledEl) enabledEl.checked = getChunkingEnabled();

    const cfg = loadChunkingConfig(profile);

    const bindNum = (id, key, min, max) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = cfg[key];
        el.addEventListener('input', () => {
            let v = Number(el.value);
            if (!Number.isFinite(v)) v = cfg[key];
            if (min !== undefined) v = Math.max(min, v);
            if (max !== undefined) v = Math.min(max, v);
            cfg[key] = v;
            saveChunkingConfig(profile, cfg);
            try { if (typeof updateChunkingBadgesFromSettings === 'function') updateChunkingBadgesFromSettings(); } catch (e) {}
        });
    };

    bindNum('chunkDurationSec', 'chunkDurationSec', 60, 60 * 60);
    bindNum('timesliceMs', 'timesliceMs', 250, 10000);
    bindNum('maxPendingChunks', 'maxPendingChunks', 1, 20);
    bindNum('maxConcurrentTranscriptions', 'maxConcurrentTranscriptions', 1, 4);
    bindNum('uploadRetryCount', 'uploadRetryCount', 0, 10);
    bindNum('uploadRetryBackoffMs', 'uploadRetryBackoffMs', 200, 20000);
    bindNum('hardStopAtMb', 'hardStopAtMb', 1, 24);
    bindNum('warnBeforeSplitSec', 'warnBeforeSplitSec', 0, 180);
    bindNum('autoSplitGraceMs', 'autoSplitGraceMs', 0, 5000);

    // Ensure debug-only controls are in the right visibility on startup
    try { updateDebugToolsVisibility(); } catch (e) {}

    // Let recording module refresh its UI badges at startup
    try { if (typeof updateChunkingBadgesFromSettings === 'function') updateChunkingBadgesFromSettings(); } catch (e) {}
}

function initVisualizer() {
    const visualizer = document.getElementById('visualizer');
    if (!visualizer) return;
    visualizer.innerHTML = '';
    for (let i = 0; i < 20; i++) {
        const bar = document.createElement('div');
        bar.className = 'visualizer-bar';
        bar.style.height = '5px';
        visualizer.appendChild(bar);
    }
}

// ============================================
// 8B: HIDE-EMPTY + EXTRAS + CHECKLIST (template)
// ============================================

const ADA_HIDE_EMPTY_KEY = 'ada_hide_empty_fields';

// Chip selector helpers (SPEC-COMP-03)
function initChipSelectors() {
    document.querySelectorAll('.chip-selector').forEach(function(container) {
        container.addEventListener('click', function(e) {
            var btn = e.target.closest('.chip-option');
            if (!btn) return;
            btn.classList.toggle('selected');
        });
    });
}
function getChipValues(id) {
    var chips = document.querySelectorAll('#' + id + ' .chip-option.selected');
    return Array.from(chips).map(function(c) { return c.dataset.value; });
}
function setChipValues(id, values) {
    var arr = Array.isArray(values) ? values : [];
    document.querySelectorAll('#' + id + ' .chip-option').forEach(function(c) {
        c.classList.toggle('selected', arr.indexOf(c.dataset.value) !== -1);
    });
}

function initHideEmptyToggle() {
    try {
        hideEmptyFields = localStorage.getItem(ADA_HIDE_EMPTY_KEY) === 'true';
    } catch (e) {
        hideEmptyFields = false;
    }
    const t = document.getElementById('hideEmptyToggle');
    if (t) t.checked = hideEmptyFields;

    // Live update visibility when editing SOAP
    ['soap-s', 'soap-o', 'soap-a', 'soap-p'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => {
            if (hideEmptyFields) applyHideEmptyVisibility();
        });
    });

    applyHideEmptyVisibility();
}

function setHideEmptyFields(enabled) {
    hideEmptyFields = !!enabled;
    try { localStorage.setItem(ADA_HIDE_EMPTY_KEY, hideEmptyFields ? 'true' : 'false'); } catch (e) {}
    applyHideEmptyVisibility();
}

function applyHideEmptyVisibility() {
    // SOAP sections (hide if empty when toggle ON)
    ['soap-s', 'soap-o', 'soap-a', 'soap-p'].forEach(id => {
        const ta = document.getElementById(id);
        if (!ta) return;
        const wrapper = ta.closest('.soap-section');
        if (!wrapper) return;
        const empty = !String(ta.value || '').trim();
        wrapper.style.display = (hideEmptyFields && empty) ? 'none' : '';
        wrapper.classList.toggle('missing', empty && !hideEmptyFields);
    });
}

// Stubs for backward compat (functions may be called from archived data)
function renderTemplateExtras() {}
function renderChecklistInSOAP() {}
function applyMissingHighlights() {}
function initChecklist() {}
function toggleChecklist() {}
function resetChecklist() {}
function toggleChecklistItem() {}
function updateExtraField() {}


// ============================================
// FULLSCREEN TEXTAREA
// ============================================

let fullscreenCorrectionRecorder = null;
let fullscreenCorrectionChunks = [];

function expandTextarea(textareaId, title) {
    fullscreenTargetId = textareaId;
    const target = document.getElementById(textareaId);
    const fullscreenTitle = document.getElementById('fullscreenTitle');
    const fullscreenTa = document.getElementById('fullscreenTextarea');
    const btnCorrect = document.getElementById('btnCorrectFullscreen');

    const isTranscription = textareaId === 'transcriptionText';
    const isReadOnly = isTranscription && transcriptionMode === 'audio';
    const resolvedTitle = isTranscription
        ? (isReadOnly ? 'Testo trascritto' : 'Testo caricato')
        : (title || 'Testo');

    if (fullscreenTitle) fullscreenTitle.textContent = resolvedTitle;
    if (fullscreenTa) {
        fullscreenTa.value = target ? target.value : '';
        fullscreenTa.readOnly = !!isReadOnly;
        fullscreenTa.classList.toggle('readonly-transcription', !!isReadOnly);
    }
    document.getElementById('textareaFullscreen').classList.add('active');
    // Reset correction state
    document.getElementById('fullscreenCorrectionButtons').style.display = 'none';
    if (btnCorrect) btnCorrect.style.display = isReadOnly ? 'none' : '';
}

function closeFullscreenTextarea() {
    if (fullscreenTargetId) {
        const target = document.getElementById(fullscreenTargetId);
        const fullscreenTa = document.getElementById('fullscreenTextarea');
        // Do not overwrite read-only fields (e.g., audio transcription)
        if (target && fullscreenTa && !target.readOnly) {
            target.value = fullscreenTa.value;
        }
    }
    document.getElementById('textareaFullscreen').classList.remove('active');
    fullscreenTargetId = null;
    // Cancel any ongoing correction
    if (fullscreenCorrectionRecorder && fullscreenCorrectionRecorder.state === 'recording') {
        fullscreenCorrectionRecorder.stop();
    }
}

async function startFullscreenCorrection() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        fullscreenCorrectionRecorder = new MediaRecorder(stream);
        fullscreenCorrectionChunks = [];
        
        fullscreenCorrectionRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) fullscreenCorrectionChunks.push(e.data);
        };
        
        fullscreenCorrectionRecorder.onstop = () => {
            stream.getTracks().forEach(track => track.stop());
        };
        
        fullscreenCorrectionRecorder.start();
        
        document.getElementById('btnCorrectFullscreen').style.display = 'none';
        document.getElementById('fullscreenCorrectionButtons').style.display = 'flex';
        showToast('🎤 Registrazione correzione avviata', 'success');
        
    } catch (err) {
        showToast('Errore accesso microfono: ' + err.message, 'error');
    }
}

function cancelFullscreenCorrection() {
    if (fullscreenCorrectionRecorder && fullscreenCorrectionRecorder.state === 'recording') {
        fullscreenCorrectionRecorder.stop();
    }
    fullscreenCorrectionChunks = [];
    document.getElementById('fullscreenCorrectionButtons').style.display = 'none';
    document.getElementById('btnCorrectFullscreen').style.display = '';
    showToast('Correzione annullata', 'success');
}

async function sendFullscreenCorrection() {
    if (!fullscreenCorrectionRecorder) return;
    
    fullscreenCorrectionRecorder.stop();
    
    // Wait for data
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const audioBlob = new Blob(fullscreenCorrectionChunks, { type: 'audio/webm' });
    const currentText = document.getElementById('fullscreenTextarea').value;
    
    showProgress(true);
    document.getElementById('fullscreenCorrectionButtons').style.display = 'none';
    
    try {
        // Transcribe correction
        const formData = new FormData();
        formData.append('file', audioBlob, 'correction.webm');
        formData.append('model', 'whisper-1');
        formData.append('language', 'it');
        
        const transcribeResponse = await fetchApi('/api/transcribe', {
            method: 'POST',
            body: formData
        });
        
        const transcribeResult = await transcribeResponse.json();
        if (transcribeResult.error) throw new Error(transcribeResult.error.message);
        
        const correctionText = transcribeResult.text;
        
        // Apply correction using GPT
        const corrTaskModel = getAiModelForTask('text_correction', 'gpt-4o');
        const corrTaskParams = getAiParamsForTask('text_correction');
        const applyResponse = await fetchApi('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: corrTaskModel,
                messages: [
                    { role: 'system', content: 'Sei un assistente che applica correzioni testuali. Applica le modifiche richieste al testo originale e restituisci SOLO il testo corretto, senza spiegazioni.' },
                    { role: 'user', content: `TESTO ORIGINALE:\n${currentText}\n\nCORREZIONE RICHIESTA:\n${correctionText}\n\nApplica la correzione e restituisci il testo modificato.` }
                ],
                temperature: corrTaskParams.temperature ?? 0.3
            })
        });

        const applyResult = await applyResponse.json();
        if (applyResult.error) throw new Error(applyResult.error.message);
        if (applyResult.usage) trackChatUsage(corrTaskModel, applyResult.usage);

        const correctedText = applyResult.choices[0].message.content;
        document.getElementById('fullscreenTextarea').value = correctedText;
        
        showToast('✅ Correzione applicata', 'success');
        
    } catch (err) {
        logError('Correzione fullscreen', err.message);
        showToast('Errore: ' + err.message, 'error');
    }
    
    showProgress(false);
    document.getElementById('btnCorrectFullscreen').style.display = '';
    fullscreenCorrectionChunks = [];
}

// ============================================
// LIFESTYLE SECTION
// ============================================

function toggleLifestyleSection() {
    document.getElementById('lifestyleSection').classList.toggle('open');
}

// ============================================
// SETTINGS: SPEAKERS SECTION COLLAPSE
// ============================================

function toggleSpeakersSection(forceOpen) {
    const body = document.getElementById('speakersSectionBody');
    const icon = document.getElementById('speakersToggleIcon');
    if (!body || !icon) return;

    const isOpenNow = body.style.display !== "none" && body.style.display !== "" ? true : (getComputedStyle(body).display !== "none");
    const nextOpen = (typeof forceOpen === "boolean") ? forceOpen : !isOpenNow;

    body.style.display = nextOpen ? "" : "none";
    icon.textContent = nextOpen ? "▾" : "▸";

    try {
        localStorage.setItem('ada_speakers_section_open', nextOpen ? "1" : "0");
    } catch (e) {}
}

function restoreSpeakersSectionState() {
    // Default is CLOSED
    let open = false;
    try {
        open = localStorage.getItem('ada_speakers_section_open') === "1";
    } catch (e) {
        open = false;
    }
    toggleSpeakersSection(open);
}

// ============================================
// UTILITIES
// ============================================

function showToast(message, type) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast ' + type + ' show';
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function showProgress(show) { 
    document.getElementById('progressBar').classList.toggle('active', show); 
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// Global error logging function
function logError(context, errorMessage) {
    // Moved to app-debug-logger.js
}

function showApiMetrics() {
    try {
        if (typeof ADAObservability === 'undefined' || !ADAObservability.getReport) {
            showToast('ADAObservability non disponibile', 'error');
            return;
        }
        var report = ADAObservability.getReport();
        var msg = 'API Metrics:\n';
        if (report && report.endpoints) {
            Object.keys(report.endpoints).forEach(function(ep) {
                var d = report.endpoints[ep];
                msg += '  ' + ep + ': ' + d.count + ' calls, ' + d.errors + ' errors, avg ' + d.avgMs + 'ms\n';
            });
        } else {
            msg += '  (nessun dato disponibile)\n';
        }
        alert(msg);
    } catch (e) {
        showToast('Errore metriche API: ' + e.message, 'error');
    }
}

// Credit exhausted modal
function showCreditExhaustedModal() {
    document.getElementById('creditExhaustedModal').classList.add('active');
}

function closeCreditExhaustedModal() {
    document.getElementById('creditExhaustedModal').classList.remove('active');
}

// Check API response for credit issues
function checkCreditExhausted(errorText) {
    if (errorText && (errorText.includes('insufficient_quota') || 
        errorText.includes('exceeded') || 
        errorText.includes('billing') ||
        errorText.includes('rate_limit'))) {
        showCreditExhaustedModal();
        return true;
    }
    return false;
}

// ============================================
// VITALS
// ============================================

function initVitalsDateTime() {
    const dateTimeInput = document.getElementById('vitalDateTime');
    if (dateTimeInput) {
        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        const localISOTime = new Date(now - offset).toISOString().slice(0, 16);
        dateTimeInput.value = localISOTime;
    }
}

function initVitalsChart() {
    const canvas = document.getElementById('vitalsChart');
    if (!canvas) return;
    
    if (vitalsChart) vitalsChart.destroy();
    
    vitalsChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: 'Peso (kg)', data: [], borderColor: '#1e3a5f', backgroundColor: 'rgba(30,58,95,0.1)', tension: 0.1, yAxisID: 'y' },
                { label: 'Temperatura (°C)', data: [], borderColor: '#c24e17', backgroundColor: 'rgba(194,78,23,0.1)', tension: 0.1, yAxisID: 'y1' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { type: 'linear', position: 'left', title: { display: true, text: 'Peso (kg)' } },
                y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Temp (°C)' } }
            }
        }
    });
    updateVitalsChart();
}

function updateVitalsChart() {
    // Always render the list, even if the chart is not initialized yet
    try { renderVitalsList(); } catch (e) {}
    if (!vitalsChart) return;
    try { if (typeof vitalsChart.resize === 'function') vitalsChart.resize(); } catch (e) {}
    const sorted = [...vitalsData].sort((a, b) => new Date(a.date) - new Date(b.date));
    vitalsChart.data.labels = sorted.map(v => new Date(v.date).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }));
    vitalsChart.data.datasets[0].data = sorted.map(v => v.weight || null);
    vitalsChart.data.datasets[1].data = sorted.map(v => v.temp || null);
    vitalsChart.update();
}

function renderVitalsList() {
    const list = document.getElementById('vitalsList');
    if (!list) return;
    if (vitalsData.length === 0) {
        list.innerHTML = '<p style="color:#888;text-align:center;">Nessun parametro registrato</p>';
        return;
    }
    const sorted = [...vitalsData].sort((a, b) => new Date(b.date) - new Date(a.date));

    const fmt = (iso) => {
        try {
            return new Date(iso).toLocaleString('it-IT', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit'
            });
        } catch (_) {
            return new Date(iso).toLocaleString('it-IT');
        }
    };

    const vOrDash = (v) => (v === null || v === undefined || v === '' || Number.isNaN(v)) ? '-' : v;

    list.innerHTML = sorted.map((v) => {
        const idx = vitalsData.indexOf(v);
        const weight = vOrDash(v.weight);
        const temp = vOrDash(v.temp);
        const hr = vOrDash(v.hr);
        const rr = vOrDash(v.rr);
        const bcs = vOrDash(v.bcs);

        return `
        <div class="vital-record">
            <span class="vital-date">${_escapeHtml(fmt(v.date))}</span>
            <span>Peso: ${_escapeHtml(String(weight))} kg | T: ${_escapeHtml(String(temp))} °C | FC ${_escapeHtml(String(hr))} bpm | FR ${_escapeHtml(String(rr))} | BCS ${_escapeHtml(String(bcs))}/9</span>
            <button class="btn-small btn-danger" onclick="deleteVital(${idx})">🗑</button>
        </div>
    `;
    }).join('');
}


function deleteVital(index) {
    if (confirm('Eliminare questa rilevazione?')) {
        vitalsData.splice(index, 1);
        saveData();
        updateVitalsChart();
        showToast('Rilevazione eliminata', 'success');
    }
}

function recordVitals() {
    const dateTime = document.getElementById('vitalDateTime')?.value;
    const vital = {
        date: dateTime ? new Date(dateTime).toISOString() : new Date().toISOString(),
        weight: parseFloat(document.getElementById('vitalWeight').value) || null,
        temp: parseFloat(document.getElementById('vitalTemp').value) || null,
        hr: parseInt(document.getElementById('vitalHR').value) || null,
        rr: parseInt(document.getElementById('vitalRR').value) || null,
        bcs: parseInt(document.getElementById('vitalBCS').value) || null
    };
    if (!vital.weight && !vital.temp && !vital.hr && !vital.rr && !vital.bcs) {
        showToast('Inserisci almeno un parametro', 'error');
        return;
    }
    vitalsData.push(vital);
    saveData();
    updateVitalsChart();
    // Sync: se il peso è stato registrato, aggiornare anche il peso nel profilo pet
    if (vital.weight && vital.weight > 0) {
        var currentPet = getCurrentPetId();
        if (currentPet) {
            fetchApi('/api/pets/' + encodeURIComponent(currentPet), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ weight_kg: vital.weight })
            }).catch(function() { /* silent */ });
        }
    }
    document.getElementById('vitalWeight').value = '';
    document.getElementById('vitalTemp').value = '';
    document.getElementById('vitalHR').value = '';
    document.getElementById('vitalRR').value = '';
    document.getElementById('vitalBCS').value = '';
    initVitalsDateTime();
    showToast('Parametri registrati', 'success');
}

function resetVitals() {
    if (!confirm('Azzera tutti i parametri vitali registrati per questo paziente?')) return;
    vitalsData = [];
    saveData();
    updateVitalsChart();
    document.getElementById('vitalWeight').value = '';
    document.getElementById('vitalTemp').value = '';
    document.getElementById('vitalHR').value = '';
    document.getElementById('vitalRR').value = '';
    document.getElementById('vitalBCS').value = '';
    initVitalsDateTime();
    showToast('Parametri vitali azzerati', 'success');
}


// ============================================
// COST & USAGE TRACKING
// ============================================

function ensureApiUsageShape() {
    if (!apiUsage || typeof apiUsage !== 'object') {
        apiUsage = {
            gpt4o_transcribe_minutes: 0,
            whisper_minutes: 0,
            gpt4o_input_tokens: 0,
            gpt4o_output_tokens: 0,
            gpt4o_mini_input_tokens: 0,
            gpt4o_mini_output_tokens: 0,
            tts_input_chars: 0
        };
        return;
    }
    const defaults = {
        gpt4o_transcribe_minutes: 0,
        whisper_minutes: 0,
        gpt4o_input_tokens: 0,
        gpt4o_output_tokens: 0,
        gpt4o_mini_input_tokens: 0,
        gpt4o_mini_output_tokens: 0,
        tts_input_chars: 0
    };
    for (const [k, v] of Object.entries(defaults)) {
        if (typeof apiUsage[k] !== 'number') apiUsage[k] = v;
    }
}

function estimateTokensFromText(text) {
    // Rough estimate: ~4 characters per token
    const len = (text || '').length;
    return Math.max(1, Math.ceil(len / 4));
}

function trackChatUsage(model, usage) {
    if (!usage) return;
    ensureApiUsageShape();

    const pt = Number(usage.prompt_tokens || 0);
    const ct = Number(usage.completion_tokens || 0);

    if (String(model).startsWith('gpt-4o-mini')) {
        apiUsage.gpt4o_mini_input_tokens += pt;
        apiUsage.gpt4o_mini_output_tokens += ct;
    } else {
        apiUsage.gpt4o_input_tokens += pt;
        apiUsage.gpt4o_output_tokens += ct;
    }

    saveApiUsage();
    updateCostDisplay();
}

function trackTranscriptionMinutes(minutes, type = 'gpt4o') {
    ensureApiUsageShape();
    const m = Number(minutes || 0);
    if (!isFinite(m) || m <= 0) return;
    if (type === 'whisper') apiUsage.whisper_minutes += m;
    else apiUsage.gpt4o_transcribe_minutes += m;

    saveApiUsage();
    updateCostDisplay();
}

function trackTtsTokens(text) {
    // NOTE: tts-1 pricing is per 1M characters, not per text tokens.
    ensureApiUsageShape();
    apiUsage.tts_input_chars += (text || '').length;
    saveApiUsage();
    updateCostDisplay();
}


function updateCostDisplay() {
    const costList = document.getElementById('costList');
    if (!costList) return;

    ensureApiUsageShape();

    let total = 0;
    const rows = [
        { api: 'gpt-4o-transcribe-diarize', key: 'gpt4o_transcribe_minutes', icon: '🎤' },
        { api: 'whisper-1 (fallback)', key: 'whisper_minutes', icon: '🎧' },
        { api: 'gpt-4o input', key: 'gpt4o_input_tokens', icon: '🧠' },
        { api: 'gpt-4o output', key: 'gpt4o_output_tokens', icon: '🧾' },
        { api: 'gpt-4o-mini input', key: 'gpt4o_mini_input_tokens', icon: '🧩' },
        { api: 'gpt-4o-mini output', key: 'gpt4o_mini_output_tokens', icon: '🧩' },
        { api: 'tts-1', key: 'tts_input_chars', icon: '🔊' }
    ];

    costList.innerHTML = rows.map(row => {
        const usage = apiUsage[row.key] || 0;
        const costInfo = API_COSTS[row.key] || { costPerUnit: 0, unit: 'unità', label: row.api };
        const cost = usage * costInfo.costPerUnit;
        total += cost;

        const unitLabel = costInfo.unit === 'tokens' ? 'tokens' : costInfo.unit;
        const priceLabel = costInfo.unit === 'tokens'
            ? `$ ${(costInfo.costPerUnit * 1000000).toFixed(2)}/1M tokens`
            : (costInfo.unit === 'caratteri'
                ? `$ ${(costInfo.costPerUnit * 1000000).toFixed(2)}/1M caratteri`
                : `$ ${costInfo.costPerUnit.toFixed(4)}/${unitLabel}`);
        const usageLabel = costInfo.unit === 'tokens'
            ? Math.round(usage).toLocaleString('it-IT')
            : (costInfo.unit === 'caratteri'
                ? Math.round(usage).toLocaleString('it-IT')
                : usage.toFixed(2));

        return `
            <div class="cost-item">
                <div class="cost-item-header">${row.icon} ${costInfo.label || row.api}</div>
                <div class="cost-item-detail"><span>Prezzo</span><span>${priceLabel}</span></div>
                <div class="cost-item-detail"><span>Uso (${unitLabel})</span><span>${usageLabel}</span></div>
                <div class="cost-item-total">$ ${cost.toFixed(4)}</div>
            </div>
        `;
    }).join('');

    const totalEl = document.getElementById('totalCost');
    if (totalEl) totalEl.textContent = '$ ' + total.toFixed(2);

    const resetInfo = document.getElementById('lastResetInfo');
    if (resetInfo) {
        resetInfo.textContent = lastResetDate ? `Ultimo azzeramento: ${new Date(lastResetDate).toLocaleString('it-IT')}` : 'Ultimo azzeramento: mai';
    }
}

function resetCosts() {
    if (confirm('Azzerare tutti i contatori?')) {
        apiUsage = {
            gpt4o_transcribe_minutes: 0,
            whisper_minutes: 0,
            gpt4o_input_tokens: 0,
            gpt4o_output_tokens: 0,
            gpt4o_mini_input_tokens: 0,
            gpt4o_mini_output_tokens: 0,
            tts_input_chars: 0
        };
        lastResetDate = new Date().toISOString();
        localStorage.setItem('ada_last_reset', lastResetDate);
        saveApiUsage();
        updateCostDisplay();
        showToast('Contatori azzerati', 'success');
    }
}

function saveApiUsage() {
    ensureApiUsageShape();
    localStorage.setItem('ada_api_usage', JSON.stringify(apiUsage));
}

function loadApiUsage() {
    const saved = localStorage.getItem('ada_api_usage');
    if (saved) {
        try { apiUsage = JSON.parse(saved); } catch { apiUsage = null; }
    } else {
        apiUsage = null;
    }
    ensureApiUsageShape();
    lastResetDate = localStorage.getItem('ada_last_reset');
}

// ============================================
// LANGUAGE SELECTORS
// ============================================

const ADA_LANG_STATE_PREFIX = 'ada_lang_state_';

function _getLangStateKey(selectorId) {
    if (selectorId === 'diaryLangSelector') {
        return `${ADA_LANG_STATE_PREFIX}${selectorId}`;
    }
    const docId = currentEditingHistoryId || 'draft';
    return `${ADA_LANG_STATE_PREFIX}${selectorId}_${docId}`;
}

function getStoredLangForSelector(selectorId) {
    try {
        return localStorage.getItem(_getLangStateKey(selectorId)) || 'IT';
    } catch (e) {
        return 'IT';
    }
}

function storeLangForSelector(selectorId, lang) {
    try {
        localStorage.setItem(_getLangStateKey(selectorId), lang);
    } catch (e) {}
}

function setActiveLangButton(selectorId, lang) {
    const selector = document.getElementById(selectorId);
    if (!selector) return;
    selector.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
    });
}

function syncLangSelectorsForCurrentDoc() {
    const soapLang = getStoredLangForSelector('soapLangSelector');
    setActiveLangButton('soapLangSelector', soapLang);
    try { updateSOAPLabels(soapLang); } catch (e) {}
    setActiveLangButton('ownerLangSelector', getStoredLangForSelector('ownerLangSelector'));
    setActiveLangButton('diaryLangSelector', getStoredLangForSelector('diaryLangSelector'));
}


function initLanguageSelectors() {
    document.querySelectorAll('.lang-selector').forEach(selector => {
        selector.querySelectorAll('.lang-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const lang = btn.dataset.lang;
                const selectorId = selector.id;
                const currentLang = getStoredLangForSelector(selectorId);
                if (lang === currentLang) return;

                storeLangForSelector(selectorId, lang);
                
                showProgress(true);
                try {
                    if (selectorId === 'soapLangSelector') {
                        // Translate SOAP labels
                        updateSOAPLabels(lang);
                        
                        // Translate content
                        for (const fieldId of ['soap-s', 'soap-o', 'soap-a', 'soap-p']) {
                            const field = document.getElementById(fieldId);
                            if (field && field.value.trim()) field.value = await translateText(field.value, lang);
                        }
                    } else if (selectorId === 'ownerLangSelector') {
                        const field = document.getElementById('ownerExplanation');
                        if (field && field.value.trim()) field.value = await translateText(field.value, lang);
                    } else if (selectorId === 'diaryLangSelector') {
                        const field = document.getElementById('diaryText');
                        if (field && field.value.trim()) field.value = await translateText(field.value, lang);
                    }
                    showToast('Traduzione completata', 'success');
                } catch (e) {
                    logError('Traduzione', e.message);
                    showToast('Errore traduzione', 'error');
                }
                showProgress(false);
            });
        });
    });
}

// SOAP label translations
const soapLabels = {
    IT: { S: 'Soggettivo', O: 'Oggettivo', A: 'Analisi clinica', P: 'Piano' },
    EN: { S: 'Subjective', O: 'Objective', A: 'Assessment', P: 'Plan' },
    DE: { S: 'Subjektiv', O: 'Objektiv', A: 'Beurteilung', P: 'Plan' },
    FR: { S: 'Subjectif', O: 'Objectif', A: 'Analyse', P: 'Plan' },
    ES: { S: 'Subjetivo', O: 'Objetivo', A: 'Análisis', P: 'Plan' }
};

function updateSOAPLabels(lang) {
    const labels = soapLabels[lang] || soapLabels.IT;
    document.getElementById('labelSoapS').textContent = labels.S;
    document.getElementById('labelSoapO').textContent = labels.O;
    document.getElementById('labelSoapA').textContent = labels.A;
    document.getElementById('labelSoapP').textContent = labels.P;
}

async function translateText(text, targetLang) {
    const taskModel = getAiModelForTask('translate', 'gpt-4o');
    const taskParams = getAiParamsForTask('translate');
    const response = await fetchApi('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: taskModel,
            messages: [{ role: 'user', content: `Traduci in ${langNames[targetLang]}. Rispondi SOLO con la traduzione:\n\n${text}` }],
            temperature: taskParams.temperature ?? 0.3
        })
    });
    const data = await response.json();
    trackChatUsage(taskModel, data.usage);
    return data.choices[0].message.content;
}

// ============================================
// HISTORY / ARCHIVIO (4A)
// ============================================

function resetSoapDraftLink() {
    currentEditingSOAPIndex = -1;
    currentEditingHistoryId = null;
  storeLangForSelector('soapLangSelector', 'IT');
  storeLangForSelector('ownerLangSelector', 'IT');
  syncLangSelectorsForCurrentDoc();
  try {
      const oe = document.getElementById('ownerExplanation');
      if (oe) oe.value = '';
      localStorage.removeItem('ada_draft_ownerExplanation');
  } catch (e) {}

}

// v7.1.0: "Nuova" button — clear recording + report fields for a fresh visit
function resetRecordingAndReport(options) {
    var opts = options || {};
    // Cancel any in-progress transcription / SOAP generation
    try { if (typeof visitAbortController !== 'undefined' && visitAbortController) visitAbortController.abort(); } catch (e) {}

    // Reset SOAP draft link (editing index, checklist, extras, languages)
    resetSoapDraftLink();

    // Clear transcription
    const tt = document.getElementById('transcriptionText');
    if (tt) tt.value = '';
    const titleEl = document.getElementById('transcriptionTitle');
    if (titleEl) titleEl.textContent = '';
    const statusEl = document.getElementById('recordingStatus');
    if (statusEl) statusEl.textContent = '';

    // Hide generate / auto-complete rows
    const genRow = document.getElementById('generateSoapRow');
    if (genRow) genRow.style.display = 'none';
    const autoRow = document.getElementById('autoSoapCompleteRow');
    if (autoRow) autoRow.style.display = 'none';

    // Reset template selector (empty — will auto-fill on save if still empty)
    const tplSel = document.getElementById('templateSelector');
    if (tplSel) tplSel.value = '';
    currentTemplate = 'generale';

    // Clear SOAP fields
    ['soap-s', 'soap-o', 'soap-a', 'soap-p', 'soap-internal-notes'].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    // Reset recording state
    try {
        if (typeof audioBlob !== 'undefined') audioBlob = null;
        if (typeof audioChunks !== 'undefined') audioChunks = [];
        if (typeof lastTranscriptionResult !== 'undefined') lastTranscriptionResult = null;
        if (typeof transcriptionSegments !== 'undefined') transcriptionSegments = [];
    } catch (e) {}

    // Reset record button
    const rb = document.getElementById('recordBtn');
    if (rb) { rb.disabled = false; rb.textContent = '🎤'; rb.classList.remove('recording', 'paused'); }

    // Clear draft from IndexedDB
    try { if (typeof clearVisitDraft === 'function') clearVisitDraft(); } catch (e) {}

    if (!opts.silent) showToast('Nuova visita pronta', 'success');
}

function _escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _generateArchiveId() {
    // deterministic enough for local storage (timestamp + random)
    return 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function _getTemplateKeyFromRecord(item) {
    return item.templateKey || item.template || item.template_id || 'generale';
}

function _getCreatedAtFromRecord(item) {
    return item.createdAt || item.date || new Date().toISOString();
}

function _getSoapFromRecord(item) {
    const sd = item.soapData || item.soap || null;
    if (sd && typeof sd === 'object') {
        return {
            s: sd.s ?? sd.S ?? item.s ?? '',
            o: sd.o ?? sd.O ?? item.o ?? '',
            a: sd.a ?? sd.A ?? item.a ?? '',
            p: sd.p ?? sd.P ?? item.p ?? ''
        };
    }
    return {
        s: item.s || '',
        o: item.o || '',
        a: item.a || '',
        p: item.p || ''
    };
}

function _normalizeHistoryRecord(item) {
    if (!item || typeof item !== 'object') return null;

    const templateKey = _getTemplateKeyFromRecord(item);
    const createdAt = _getCreatedAtFromRecord(item);
    const soap = _getSoapFromRecord(item);

    // Title: keep existing titleDisplay if present; otherwise derive from template title
    const baseTitle = (item.titleDisplay || '').trim() || (templateTitles[templateKey] || 'Referto');

    const normalized = {
        ...item,
        id: item.id || _generateArchiveId(),
        titleDisplay: baseTitle,
        createdAt,
        templateKey,
        soapData: {
            s: soap.s,
            o: soap.o,
            a: soap.a,
            p: soap.p
        },

        // Back-compat fields (older code expects these)
        template: templateKey,
        date: createdAt,
        s: soap.s,
        o: soap.o,
        a: soap.a,
        p: soap.p
    };

    return normalized;
}

function migrateLegacyHistoryDataIfNeeded() {
    if (_historySchemaMigrated) return false;
    if (!Array.isArray(historyData) || historyData.length === 0) {
        _historySchemaMigrated = true;
        return false;
    }

    let changed = false;
    historyData = historyData.map((it) => {
        const n = _normalizeHistoryRecord(it);
        if (!n) { changed = true; return null; }
        if (!it.id || !it.titleDisplay || !it.createdAt || !it.templateKey || !it.soapData) changed = true;
        return n;
    }).filter(Boolean);

    _historySchemaMigrated = true;

    // Persist migration best-effort
    try { if (changed && typeof saveData === 'function') saveData(); } catch (e) {}
    return changed;
}

function _computeDedupTitle(baseTitle, excludeId = null) {
    const base = String(baseTitle || '').trim() || 'Referto';
    const existing = new Set(
        (historyData || [])
            .filter(r => r && (!excludeId || r.id !== excludeId))
            .map(r => String(r.titleDisplay || '').trim())
            .filter(Boolean)
    );
    if (!existing.has(base)) return base;
    let n = 2;
    while (n < 9999) {
        const candidate = `${base} (${n})`;
        if (!existing.has(candidate)) return candidate;
        n++;
    }
    return `${base} (${Date.now()})`;
}


// ============================================
// Q&A — Report selector (6.16.2)
// ============================================

function renderQnaReportDropdown() {
    try { migrateLegacyHistoryDataIfNeeded(); } catch (e) {}

    const sel = document.getElementById('qnaReportSelect');
    if (!sel) return;

    const sorted = (typeof _getHistorySortedForUI === 'function') ? _getHistorySortedForUI() : (historyData || []).slice();

    sel.innerHTML = '<option value="">-- Seleziona --</option>';

    // Add SOAP reports
    if (Array.isArray(sorted) && sorted.length > 0) {
        sorted.forEach(item => {
            if (!item || !item.id) return;
            const date = new Date(_getCreatedAtFromRecord(item));
            const title = item.titleDisplay || (templateTitles[_getTemplateKeyFromRecord(item)] || 'Visita');
            const patientName = item.patient?.petName || 'Paziente';
            const diarizedBadge = item.diarized ? '✅' : '📋';
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = `${diarizedBadge} ${date.toLocaleDateString('it-IT')} — ${patientName} — ${title}`;
            sel.appendChild(opt);
        });
    }

    // Add uploaded documents from IndexedDB
    if (typeof getDocumentsForPet === 'function' && typeof getCurrentPetId === 'function') {
        const petId = getCurrentPetId();
        if (petId) {
            getDocumentsForPet(petId).then(docs => {
                if (!Array.isArray(docs) || docs.length === 0) {
                    if (sel.options.length <= 1) {
                        const opt = document.createElement('option');
                        opt.value = '';
                        opt.textContent = 'Nessun documento in archivio';
                        sel.appendChild(opt);
                    }
                    return;
                }
                docs.forEach(doc => {
                    if (!doc || !doc.document_id) return;
                    const date = new Date(doc.created_at || Date.now());
                    const name = doc.original_filename || 'Documento';
                    const aiIcon = doc.ai_status === 'complete' ? '✅' : '📄';
                    const opt = document.createElement('option');
                    opt.value = 'doc:' + doc.document_id;
                    opt.textContent = `${aiIcon} ${date.toLocaleDateString('it-IT')} — 📎 ${name}`;
                    sel.appendChild(opt);
                });
            }).catch(() => {});
        }
    }

    // Show empty message if no SOAP reports at all (docs loaded async above)
    if ((!Array.isArray(sorted) || sorted.length === 0) && sel.options.length <= 1) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Nessun documento in archivio';
        sel.appendChild(opt);
    }
}

async function openOrGenerateOwnerFromSelectedReport() {
    try { migrateLegacyHistoryDataIfNeeded(); } catch (e) {}

    const sel = document.getElementById('qnaReportSelect');
    const id = sel ? sel.value : '';
    if (!id) {
        showToast('Seleziona un documento', 'error');
        return;
    }

    // Handle uploaded documents (prefixed with 'doc:')
    if (id.startsWith('doc:')) {
        const docId = id.substring(4);
        if (typeof getDocumentById !== 'function') {
            showToast('Modulo documenti non disponibile', 'error');
            return;
        }
        try {
            const doc = await getDocumentById(docId);
            if (!doc) {
                showToast('Documento non trovato', 'error');
                return;
            }

            // Clear stale content
            try {
                const gc = document.getElementById('glossaryContent');
                if (gc) gc.innerHTML = '';
                const fl = document.getElementById('faqList');
                if (fl) fl.innerHTML = '';
                const oe = document.getElementById('ownerExplanation');
                if (oe) oe.value = '';
                localStorage.removeItem('ada_draft_ownerExplanation');
            } catch (e) {}

            // If explanation already exists, show it
            if (doc.owner_explanation && doc.owner_explanation.trim()) {
                const oe = document.getElementById('ownerExplanation');
                if (oe) oe.value = doc.owner_explanation;
                try { localStorage.setItem('ada_draft_ownerExplanation', doc.owner_explanation); } catch (e) {}
                navigateToPage('owner');
                showToast('Spiegazione documento aperta', 'success');
                return;
            }

            // Need to generate explanation — open the document and trigger explain
            if (typeof openDocument === 'function') {
                await openDocument(docId);
            }
            if (typeof explainDocument === 'function') {
                await explainDocument();
            }
        } catch (e) {
            showToast('Errore: ' + e.message, 'error');
        }
        return;
    }

    // Handle SOAP reports
    const index = (historyData || []).findIndex(r => r && r.id === id);
    if (index < 0) {
        showToast('Documento non trovato', 'error');
        return;
    }

    const item = historyData[index];

    // Load record context (SOAP + patient) so Owner/FAQ work consistently
    const soap = _getSoapFromRecord(item);
    document.getElementById('soap-s').value = soap.s || '';
    document.getElementById('soap-o').value = soap.o || '';
    document.getElementById('soap-a').value = soap.a || '';
    document.getElementById('soap-p').value = soap.p || '';

    setPatientData(item.patient || {});

    currentTemplate = _getTemplateKeyFromRecord(item);
    currentEditingSOAPIndex = index;
    currentEditingHistoryId = id;
    syncLangSelectorsForCurrentDoc();

    lastTranscriptionDiarized = item.diarized || false;
    lastSOAPResult = item.structuredResult || null;

    // Sync template selector
    try {
        const selector = document.getElementById('templateSelector');
        if (selector) selector.value = templateTitleFromKey(currentTemplate);
    } catch (e) {}
    try { applyHideEmptyVisibility(); } catch (e) {}

    // Clear glossary/FAQ to avoid stale content
    try {
        const gc = document.getElementById('glossaryContent');
        if (gc) gc.innerHTML = '';
        const fl = document.getElementById('faqList');
        if (fl) fl.innerHTML = '';
        const oe = document.getElementById('ownerExplanation');
        if (oe) oe.value = '';
        localStorage.removeItem('ada_draft_ownerExplanation');

    } catch (e) {}

    if (item.ownerExplanation && item.ownerExplanation.trim()) {
        const oe = document.getElementById('ownerExplanation');
        if (oe) oe.value = item.ownerExplanation;
        try { localStorage.setItem('ada_draft_ownerExplanation', item.ownerExplanation); } catch (e) {}
        navigateToPage('owner');
        showToast('Spiegazione documento aperta', 'success');
        return;
    }

    if (typeof generateOwnerExplanation !== 'function') {
        showToast('Funzione owner non disponibile', 'error');
        return;
    }

    await generateOwnerExplanation(soap, { saveToHistoryId: id, navigate: true });
}

function _getHistorySortedForUI() {
    return (historyData || [])
        .slice()
        .sort((a, b) => new Date(_getCreatedAtFromRecord(b)).getTime() - new Date(_getCreatedAtFromRecord(a)).getTime());
}

function renderHistory() {
    migrateLegacyHistoryDataIfNeeded();

    const list = document.getElementById('historyList');
    if (!list) return;
    if (!Array.isArray(historyData) || historyData.length === 0) {
        list.innerHTML = '<div class="empty-state"><div class="empty-state-icon"><i data-lucide="folder-open" style="width:48px;height:48px;stroke-width:1.5;color:var(--gray-300);"></i></div><h3 class="empty-state-title">Nessun referto ancora</h3><p class="empty-state-text">Registra la prima visita per iniziare l\'archivio sanitario</p></div>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

    const sorted = _getHistorySortedForUI();

    list.innerHTML = sorted.map((item) => {
        const id = item.id;
        const date = new Date(_getCreatedAtFromRecord(item));
        const diarizedBadge = item.diarized ? '✅' : '📋';
        const title = item.titleDisplay || (templateTitles[_getTemplateKeyFromRecord(item)] || 'Visita');
        const patientName = item.patient?.petName || 'Paziente';
        const aText = (item.soapData?.a || item.a || '').trim();

        return `
            <div class="history-item" onclick="loadHistoryById('${id}')">
                <div class="history-date">
                    <div class="day">${date.getDate()}</div>
                    <div class="month">${months[date.getMonth()]}</div>
                </div>
                <div class="history-info">
                    <h4>${diarizedBadge} ${_escapeHtml(patientName)} - ${_escapeHtml(title)}</h4>
                    <p>${aText ? _escapeHtml(aText.substring(0, 80) + (aText.length > 80 ? '...' : '')) : 'Nessuna diagnosi'}</p>
                </div>
                <button class="history-delete" onclick="event.stopPropagation(); deleteHistoryById('${id}')">×</button>
            </div>
        `;
    }).join('');
}


function loadHistoryById(id) {
    migrateLegacyHistoryDataIfNeeded();

    const index = (historyData || []).findIndex(r => r && r.id === id);
    if (index < 0) {
        showToast('Referto non trovato', 'error');
        return;
    }
    const item = historyData[index];

    const soap = _getSoapFromRecord(item);
    document.getElementById('soap-s').value = soap.s || '';
    document.getElementById('soap-o').value = soap.o || '';
    document.getElementById('soap-a').value = soap.a || '';
    document.getElementById('soap-p').value = soap.p || '';

    // Owner explanation (if stored)
    try {
        const oe = document.getElementById('ownerExplanation');
        if (oe) oe.value = item.ownerExplanation || '';
        localStorage.setItem('ada_draft_ownerExplanation', item.ownerExplanation || '');
    } catch (e) {}

    // Internal notes (if stored)
    try {
        const inEl = document.getElementById('soap-internal-notes');
        if (inEl) inEl.value = item.internalNotes || '';
    } catch (e) {}

    setPatientData(item.patient || {});

    currentTemplate = _getTemplateKeyFromRecord(item);
    currentEditingSOAPIndex = index; // keep for compatibility
    currentEditingHistoryId = id;
    syncLangSelectorsForCurrentDoc();

    
  // v6.16.3: restore per-report specialist extras
    lastTranscriptionDiarized = item.diarized || false;
    lastSOAPResult = item.structuredResult || null;

    // Sync selector UI
    try {
        const selector = document.getElementById('templateSelector');
        if (selector) selector.value = templateTitleFromKey(currentTemplate);
    } catch (e) {}

    applyHideEmptyVisibility();

    // Owner sees read-only view; vet sees editable SOAP
    const role = getActiveRole();
    if (role === ROLE_PROPRIETARIO) {
        renderSoapReadonly(item);
        navigateToPage('soap-readonly');
    } else {
        navigateToPage('soap');
    }
    showToast('Referto caricato', 'success');
}

function deleteHistoryById(id) {
    migrateLegacyHistoryDataIfNeeded();

    const index = (historyData || []).findIndex(r => r && r.id === id);
    if (index < 0) return;

    if (confirm('Eliminare questa visita?')) {
        historyData.splice(index, 1);

        if (currentEditingHistoryId === id) {
            resetSoapDraftLink();
        } else if (currentEditingSOAPIndex > index) {
            // legacy index correction
            currentEditingSOAPIndex--;
        }

        saveData();
        updateHistoryBadge();
        renderHistory();
        showToast('Visita eliminata', 'success');
    }
}

function updateHistoryBadge() {
    const soapCount = (historyData || []).length;
    const badge = document.getElementById('historyBadge');
    const badgeOwner = document.getElementById('historyBadgeOwner');

    // Set immediate count from SOAP reports
    if (badge) badge.textContent = soapCount;
    if (badgeOwner) badgeOwner.textContent = soapCount;

    // Also count uploaded documents asynchronously
    if (typeof getDocumentsForPet === 'function' && typeof getCurrentPetId === 'function') {
        const petId = getCurrentPetId();
        if (petId) {
            getDocumentsForPet(petId).then(docs => {
                const total = soapCount + (Array.isArray(docs) ? docs.length : 0);
                if (badge) badge.textContent = total;
                if (badgeOwner) badgeOwner.textContent = total;
            }).catch(() => {});
        }
    }
}

// ============================================
// SOAP READ-ONLY VIEW (for owner)
// ============================================

function renderSoapReadonly(item) {
    const container = document.getElementById('soapReadonlyContent');
    if (!container) return;

    const soap = _getSoapFromRecord(item);
    const title = item.titleDisplay || (templateTitles[_getTemplateKeyFromRecord(item)] || 'Referto');
    const patient = item.patient || {};
    const date = new Date(_getCreatedAtFromRecord(item));
    const dateStr = date.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });

    const metaParts = [];
    if (patient.petName) metaParts.push('Paziente: ' + _escapeHtml(patient.petName));
    if (patient.petSpecies) metaParts.push('Specie: ' + _escapeHtml(patient.petSpecies));
    if (patient.ownerName) metaParts.push('Proprietario: ' + _escapeHtml(patient.ownerName));
    metaParts.push('Data: ' + dateStr);

    const sections = [
        { key: 's', letter: 'S', title: 'Soggettivo', cls: 'soap-ro-s' },
        { key: 'o', letter: 'O', title: 'Oggettivo', cls: 'soap-ro-o' },
        { key: 'a', letter: 'A', title: 'Analisi clinica', cls: 'soap-ro-a' },
        { key: 'p', letter: 'P', title: 'Piano', cls: 'soap-ro-p' }
    ];

    let html = '';
    html += '<div class="soap-ro-header">';
    html += '<h3>' + _escapeHtml(title) + '</h3>';
    html += '<div class="soap-ro-meta">' + metaParts.join(' &middot; ') + '</div>';
    html += '</div>';

    for (const sec of sections) {
        const text = (soap[sec.key] || '').trim();
        if (!text) continue;
        html += '<div class="soap-ro-section ' + sec.cls + '">';
        html += '<span class="soap-ro-letter">' + sec.letter + '</span>';
        html += '<span class="soap-ro-title">' + sec.title + '</span>';
        html += '<div class="soap-ro-body">' + _escapeHtml(text) + '</div>';
        html += '</div>';
    }

    html += '<div class="soap-ro-footer">Generato con ADA v' + (typeof ADA_VERSION !== 'undefined' ? ADA_VERSION : '7.2.1') + ' - AI Driven AbuPet</div>';

    container.innerHTML = html;

    // Show/hide explain button depending on role
    const explainBtn = document.getElementById('btnExplainFromReadonly');
    if (explainBtn) {
        explainBtn.style.display = (getActiveRole() === ROLE_PROPRIETARIO) ? '' : 'none';
    }
}

function generateOwnerExplanationFromReadonly() {
    // Use the currently loaded SOAP data (already in textareas from loadHistoryById)
    const soap = {
        s: document.getElementById('soap-s')?.value || '',
        o: document.getElementById('soap-o')?.value || '',
        a: document.getElementById('soap-a')?.value || '',
        p: document.getElementById('soap-p')?.value || ''
    };

    if (!soap.a && !soap.p) {
        showToast('Nessun referto caricato', 'error');
        return;
    }

    generateOwnerExplanation(soap, { navigate: true });
}

// ============================================
// MEDICATIONS
// ============================================

let editingMedicationIndex = null;

function openMedicationModal(index = null) {
    const modal = document.getElementById('medicationModal');
    const title = document.getElementById('medicationModalTitle');
    const saveBtn = document.getElementById('medicationModalSaveBtn');

    editingMedicationIndex = (typeof index === 'number' && index >= 0) ? index : null;

    // Populate fields if editing
    if (editingMedicationIndex !== null && medications[editingMedicationIndex]) {
        const med = medications[editingMedicationIndex];
        document.getElementById('medName').value = med.name || '';
        document.getElementById('medDosage').value = med.dosage || '';
        document.getElementById('medFrequency').value = med.frequency || '';
        document.getElementById('medDuration').value = med.duration || '';
        document.getElementById('medInstructions').value = med.instructions || '';
        if (title) title.textContent = 'Modifica Farmaco';
        if (saveBtn) saveBtn.textContent = '✅ Salva';
    } else {
        // New medication
        ['medName', 'medDosage', 'medFrequency', 'medDuration', 'medInstructions'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        if (title) title.textContent = 'Aggiungi Farmaco';
        if (saveBtn) saveBtn.textContent = '✅ Aggiungi';
    }

    if (modal) modal.classList.add('active');
}

function editMedication(index) {
    openMedicationModal(index);
}

function closeMedicationModal() {
    const modal = document.getElementById('medicationModal');
    if (modal) modal.classList.remove('active');
    editingMedicationIndex = null;
    const title = document.getElementById('medicationModalTitle');
    const saveBtn = document.getElementById('medicationModalSaveBtn');
    if (title) title.textContent = 'Aggiungi Farmaco';
    if (saveBtn) saveBtn.textContent = '✅ Aggiungi';
    ['medName', 'medDosage', 'medFrequency', 'medDuration', 'medInstructions'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

// Backward compatible alias
function addMedication() { saveMedication(); }

function saveMedication() {
    const med = {
        name: document.getElementById('medName').value,
        dosage: document.getElementById('medDosage').value,
        frequency: document.getElementById('medFrequency').value,
        duration: document.getElementById('medDuration').value,
        instructions: document.getElementById('medInstructions').value
    };
    if (!med.name) { showToast('Inserisci il nome', 'error'); return; }

    if (editingMedicationIndex !== null && medications[editingMedicationIndex]) {
        medications[editingMedicationIndex] = med;
    } else {
        medications.push(med);
    }
    saveData();
    renderMedications();
    closeMedicationModal();
    showToast(editingMedicationIndex !== null ? 'Farmaco aggiornato' : 'Farmaco aggiunto', 'success');
}

function renderMedications() {
    const list = document.getElementById('medicationList');
    if (!list) return;
    if (medications.length === 0) {
        list.innerHTML = '<p style="color:#888;text-align:center;padding:20px;">Nessun farmaco</p>';
        return;
    }
    list.innerHTML = medications.map((med, i) => `
        <div class="medication-item">
            <span class="medication-icon">💊</span>
            <div class="medication-info">
                <h4>${_escapeHtml(med.name)}</h4>
                <p>${_escapeHtml(med.dosage)} - ${_escapeHtml(med.frequency)} - ${_escapeHtml(med.duration)}</p>
                ${med.instructions ? `<p><em>${_escapeHtml(med.instructions)}</em></p>` : ''}
            </div>
            <div class="medication-actions">
                <button class="medication-edit" onclick="editMedication(${i})" title="Modifica">✏️</button>
                <button class="medication-delete" onclick="deleteMedication(${i})" title="Elimina">🗑️</button>
            </div>
        </div>
    `).join('');
}

function deleteMedication(index) { 
    medications.splice(index, 1); 
    saveData(); 
    renderMedications(); 
}

// ============================================
// APPOINTMENTS (removed in v7 — redirect only, no UI)
// ============================================

function openCostsPage() {
    navigateToPage('costs');
    updateCostDisplay();
}

// ============================================
// OPENAI OPTIMIZATIONS SETTINGS (super_admin)
// ============================================

async function initOpenAiOptimizationsSettingsUI() {
    const card = document.getElementById('openaiOptCard');
    if (!card) return;
    if (getActiveRole() !== 'super_admin') { card.style.display = 'none'; return; }
    card.style.display = '';
    try {
        const flags = await refreshOpenAiOptimizationFlags(true);
        document.getElementById('openaiOptEnabled').checked = !!flags.enabled;
        document.getElementById('openaiOptSmartDiarization').checked = !!flags.smart_diarization;
    } catch (e) { console.warn('initOpenAiOptimizationsSettingsUI error:', e); }
}

async function saveOpenAiOptimizations() {
    const enabled = document.getElementById('openaiOptEnabled').checked;
    const smart_diarization = document.getElementById('openaiOptSmartDiarization').checked;
    try {
        const resp = await fetchApi('/api/superadmin/openai-optimizations', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled, smart_diarization })
        });
        if (!resp.ok) { const err = await resp.json().catch(() => null); throw new Error(err?.error || `HTTP ${resp.status}`); }
        await refreshOpenAiOptimizationFlags(true);
        showToast('Ottimizzazioni salvate', 'success');
    } catch (e) { showToast('Errore: ' + e.message, 'error'); }
}

// Initialize on load
window.onload = checkSession;
