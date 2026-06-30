/* ============================================
   DASHBOARD SEARCH PREFERENCES
   Handles fetch, skeleton, retry, save & undo
   for the Search Preferences section on the
   dashboard home page.
   ============================================ */

(function () {
    'use strict';
    if (window.__dashboardSearchPrefInit) return;
    window.__dashboardSearchPrefInit = true;

    // ── Re-entrancy / loading guard ───────────────────────────────────────────
    let _isLoading = false;
    let _btnSaving = false;
    let _savedSnapshot = null;

    // ── Tag wrapper references (re-wired after each skeleton clear) ───────────
    let _blockedIndustriesWrapper = null;
    let _workStyleWrapper         = null;
    let _blockedCompaniesWrapper  = null;
    let _blockedTitlesWrapper     = null;
    let _blockedDetailsWrapper    = null;

    // ══════════════════════════════════════════════════
    // CSRF
    // ══════════════════════════════════════════════════

    function getCsrfToken() {
        const el = document.querySelector('[name=csrfmiddlewaretoken]');
        return el ? el.value : '';
    }

    async function apiFetch(url, method, body) {
        const opts = {
            method: method || 'GET',
            headers: { 'X-CSRFToken': getCsrfToken(), 'Content-Type': 'application/json' },
            credentials: 'same-origin',
        };
        if (body) opts.body = JSON.stringify(body);
        const resp = await fetch(url, opts);
        if (!resp.ok) throw new Error('API error ' + resp.status);
        return resp.status === 204 ? null : resp.json();
    }

    // ══════════════════════════════════════════════════
    // TAG INPUT WIRING  (delegates to tags.js via
    // the global initTagInput injected by tags.js)
    // ══════════════════════════════════════════════════

    function _initTagInput(wrapperId, inputId, hiddenId) {
        const wrapper = document.getElementById(wrapperId);
        const input   = document.getElementById(inputId);
        const hidden  = document.getElementById(hiddenId);
        if (wrapper && input && hidden && typeof initTagInput === 'function') {
            initTagInput(wrapper, input, hidden);
        }
        return wrapper;
    }

    function _rewireTagInputs() {
        _blockedIndustriesWrapper = _initTagInput(
            'sp-blocked-industries-tag-wrapper',
            'sp-blocked-industries-input',
            'sp-blocked-industries-hidden'
        );
        _workStyleWrapper = _initTagInput(
            'sp-work-style-tag-wrapper',
            'sp-work-style-input',
            'sp-work-style-hidden'
        );
        _blockedCompaniesWrapper = _initTagInput(
            'sp-blocked-companies-tag-wrapper',
            'sp-blocked-companies-input',
            'sp-blocked-companies-hidden'
        );
        _blockedTitlesWrapper = _initTagInput(
            'sp-blocked-titles-tag-wrapper',
            'sp-blocked-titles-input',
            'sp-blocked-titles-hidden'
        );
        _blockedDetailsWrapper = _initTagInput(
            'sp-blocked-details-tag-wrapper',
            'sp-blocked-details-input',
            'sp-blocked-details-hidden'
        );
    }

    // ══════════════════════════════════════════════════
    // SKELETON
    // ══════════════════════════════════════════════════

    var SKELETON_HTML = `
        <div class="skeleton-group" aria-hidden="true" style="gap:var(--spacing-md);">
            ${['Blocked Industries','Work Style','Blocked Companies','Blocked Titles','Blocked Details'].map(function () {
                return `<div>
                    <div class="skeleton skeleton-line" style="width:130px;height:0.8em;margin-bottom:var(--spacing-xs);"></div>
                    <div style="display:flex;flex-wrap:wrap;gap:var(--spacing-xs);">
                        ${[75,60,90,65,80].map(function (w) {
                            return '<div class="skeleton skeleton-tag" style="width:' + w + 'px;"></div>';
                        }).join('')}
                    </div>
                </div>`;
            }).join('')}
        </div>`;

    var _sectionOriginal = null;

    function _showSkeleton() {
        var el = document.getElementById('section-search-pref-body');
        if (!el) return;
        _sectionOriginal = el.innerHTML;
        el.innerHTML = SKELETON_HTML;
        el.setAttribute('aria-busy', 'true');
    }

    function _clearSkeleton() {
        var el = document.getElementById('section-search-pref-body');
        if (!el) return;
        if (_sectionOriginal !== null) {
            el.innerHTML = _sectionOriginal;
            _sectionOriginal = null;
        }
        el.removeAttribute('aria-busy');
    }

    // ══════════════════════════════════════════════════
    // ERROR BANNER
    // ══════════════════════════════════════════════════

    function _showLoadError() {
        var existing = document.getElementById('searchPrefLoadError');
        if (existing) existing.remove();

        var banner = document.createElement('div');
        banner.id = 'searchPrefLoadError';
        banner.className = 'info-load-error';
        banner.setAttribute('role', 'alert');
        banner.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
            + ' Could not load your search preferences. <button type="button" id="searchPrefRetryBtn">Retry</button>';

        var form = document.getElementById('searchPrefForm');
        if (form) form.prepend(banner);

        document.getElementById('searchPrefRetryBtn')?.addEventListener('click', function () {
            banner.remove();
            _loadSearchPreferences();
        });
    }

    // ══════════════════════════════════════════════════
    // LOAD
    // ══════════════════════════════════════════════════

    async function _loadSearchPreferences() {
        if (_isLoading) return;
        _isLoading = true;
        _updateSaveBtnLoadingState();
        _showSkeleton();

        try {
            const resp = await fetch('/dashboard/api/user-info/', { credentials: 'same-origin' });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const data = await resp.json();

            _clearSkeleton();
            _rewireTagInputs();
            _applyData(data);

        } catch (err) {
            console.error('[SearchPref] load failed:', err);
            _clearSkeleton();
            _showLoadError();
        } finally {
            _isLoading = false;
            _updateSaveBtnLoadingState();
        }
    }

    function _applyData(data) {
        if (!data) return;
        var setTags = function (wrapper, arr) {
            if (wrapper && wrapper._setTags) wrapper._setTags(arr || []);
        };
        setTags(_blockedIndustriesWrapper, data.blocked_industries);
        setTags(_workStyleWrapper,         data.work_style);
        setTags(_blockedCompaniesWrapper,  data.blocked_companies);
        setTags(_blockedTitlesWrapper,     data.blocked_titles);
        setTags(_blockedDetailsWrapper,    data.blocked_details);
    }

    // ══════════════════════════════════════════════════
    // COLLECT
    // ══════════════════════════════════════════════════

    function _collectFormData() {
        function getTags(wrapper) { return wrapper ? wrapper._getTags() : []; }
        return {
            blocked_industries: getTags(_blockedIndustriesWrapper),
            work_style:         getTags(_workStyleWrapper),
            blocked_companies:  getTags(_blockedCompaniesWrapper),
            blocked_titles:     getTags(_blockedTitlesWrapper),
            blocked_details:    getTags(_blockedDetailsWrapper),
        };
    }

    // ══════════════════════════════════════════════════
    // SNAPSHOT / DIRTY
    // ══════════════════════════════════════════════════

    function _captureSnapshot() {
        _savedSnapshot = JSON.stringify(_collectFormData());
    }

    function _isFormDirty() {
        if (_savedSnapshot === null) return false;
        return JSON.stringify(_collectFormData()) !== _savedSnapshot;
    }

    // ══════════════════════════════════════════════════
    // SAVE BUTTON STATE MACHINE
    // ══════════════════════════════════════════════════

    var LOADING_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="20" height="20" fill="currentColor" aria-hidden="true"><circle cx="16" cy="3" r="0"><animate attributeName="r" values="0;3;0;0" dur="1s" repeatCount="indefinite" begin="0s" keySplines="0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8" calcMode="spline"/></circle><circle transform="rotate(45 16 16)" cx="16" cy="3" r="0"><animate attributeName="r" values="0;3;0;0" dur="1s" repeatCount="indefinite" begin="0.125s" keySplines="0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8" calcMode="spline"/></circle><circle transform="rotate(90 16 16)" cx="16" cy="3" r="0"><animate attributeName="r" values="0;3;0;0" dur="1s" repeatCount="indefinite" begin="0.25s" keySplines="0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8" calcMode="spline"/></circle><circle transform="rotate(135 16 16)" cx="16" cy="3" r="0"><animate attributeName="r" values="0;3;0;0" dur="1s" repeatCount="indefinite" begin="0.375s" keySplines="0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8" calcMode="spline"/></circle><circle transform="rotate(180 16 16)" cx="16" cy="3" r="0"><animate attributeName="r" values="0;3;0;0" dur="1s" repeatCount="indefinite" begin="0.5s" keySplines="0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8" calcMode="spline"/></circle><circle transform="rotate(225 16 16)" cx="16" cy="3" r="0"><animate attributeName="r" values="0;3;0;0" dur="1s" repeatCount="indefinite" begin="0.625s" keySplines="0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8" calcMode="spline"/></circle><circle transform="rotate(270 16 16)" cx="16" cy="3" r="0"><animate attributeName="r" values="0;3;0;0" dur="1s" repeatCount="indefinite" begin="0.75s" keySplines="0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8" calcMode="spline"/></circle><circle transform="rotate(315 16 16)" cx="16" cy="3" r="0"><animate attributeName="r" values="0;3;0;0" dur="1s" repeatCount="indefinite" begin="0.875s" keySplines="0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8" calcMode="spline"/></circle></svg>';

    var CHECK_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';

    var SAVE_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>';

    var LOADING_MESSAGES = [
        'Saving\u2026', 'Almost there\u2026', 'Still working\u2026',
        'Hang tight\u2026', 'Just a moment\u2026', 'Nearly done\u2026',
    ];

    function _setBtnGlass(btn, state) {
        btn.classList.remove('glass', 'blue-glass', 'indigo-glass', 'green-glass');
        if (state === 'loading')       btn.classList.add('indigo-glass');
        else if (state === 'success')  btn.classList.add('green-glass');
        else if (state === 'pristine') { btn.classList.add('glass'); btn.disabled = true; }
        else                           { btn.classList.add('blue-glass'); btn.disabled = false; }
    }

    function _transitionBtnIcon(btn, newIconHTML) {
        var iconSpan = btn.querySelector('.save-btn__icon');
        if (!iconSpan) return;
        iconSpan.classList.remove('save-btn__icon--enter');
        iconSpan.classList.add('save-btn__icon--exit');
        setTimeout(function () {
            iconSpan.innerHTML = newIconHTML;
            iconSpan.classList.remove('save-btn__icon--exit');
            iconSpan.classList.add('save-btn__icon--enter');
        }, 210);
    }

    function _transitionBtnText(btn, newText) {
        var textSpan = btn.querySelector('.save-btn__text');
        if (!textSpan) return;
        textSpan.classList.remove('save-btn__text--enter');
        textSpan.classList.add('save-btn__text--exit');
        setTimeout(function () {
            textSpan.textContent = newText;
            textSpan.classList.remove('save-btn__text--exit');
            textSpan.classList.add('save-btn__text--enter');
        }, 210);
    }

    function _updateSaveBtnLoadingState() {
        var btn = document.getElementById('searchPrefSaveBtn');
        if (!btn) return;
        if (_isLoading) {
            btn.disabled = true;
            btn.setAttribute('title', 'Please wait while your data is loading\u2026');
        } else {
            btn.removeAttribute('title');
            _captureSnapshot();
            _syncSaveBtn();
        }
    }

    function _syncSaveBtn() {
        var btn = document.getElementById('searchPrefSaveBtn');
        if (!btn || _btnSaving || _isLoading) return;

        if (_isFormDirty()) {
            btn.setAttribute('data-state', 'idle');
            _setBtnGlass(btn, 'idle');
            var t = btn.querySelector('.save-btn__text');
            if (t) t.textContent = 'Save Changes';
            _showUndoBtn();
        } else {
            var currentState = btn.getAttribute('data-state');
            if (currentState !== 'success') {
                btn.setAttribute('data-state', 'idle');
                _setBtnGlass(btn, 'pristine');
            }
            _hideUndoBtn();
        }
    }

    function _showUndoBtn() {
        var btn = document.getElementById('searchPrefUndoBtn');
        if (btn) btn.classList.add('undo-visible');
    }

    function _hideUndoBtn() {
        var btn = document.getElementById('searchPrefUndoBtn');
        if (btn) btn.classList.remove('undo-visible');
    }

    // ── Hover glass swap ──────────────────────────────────────────────────────

    document.getElementById('searchPrefSaveBtn')?.addEventListener('mouseenter', function () {
        if (this.getAttribute('data-state') === 'idle' && !this.disabled) {
            this.classList.remove('glass', 'blue-glass', 'indigo-glass', 'green-glass');
            this.classList.add('indigo-glass');
        }
    });
    document.getElementById('searchPrefSaveBtn')?.addEventListener('mouseleave', function () {
        if (this.getAttribute('data-state') === 'idle' && !this.disabled) {
            this.classList.remove('glass', 'blue-glass', 'indigo-glass', 'green-glass');
            this.classList.add('blue-glass');
        }
    });

    document.getElementById('searchPrefUndoBtn')?.addEventListener('mouseenter', function () {
        this.classList.remove('orange-glass');
        this.classList.add('pink-glass');
    });
    document.getElementById('searchPrefUndoBtn')?.addEventListener('mouseleave', function () {
        this.classList.remove('pink-glass');
        this.classList.add('orange-glass');
    });

    // ── Undo click ────────────────────────────────────────────────────────────

    document.getElementById('searchPrefUndoBtn')?.addEventListener('click', function () {
        if (_savedSnapshot === null || _btnSaving) return;
        var snapshot = JSON.parse(_savedSnapshot);
        _rewireTagInputs();
        _applyData(snapshot);
        _syncSaveBtn();
    });

    // ── Form submit ───────────────────────────────────────────────────────────

    document.getElementById('searchPrefForm')?.addEventListener('submit', async function (e) {
        e.preventDefault();
        var saveBtn = document.getElementById('searchPrefSaveBtn');

        _btnSaving = true;
        saveBtn.disabled = true;
        saveBtn.setAttribute('data-state', 'loading');
        _setBtnGlass(saveBtn, 'loading');
        _transitionBtnIcon(saveBtn, LOADING_ICON_SVG);
        _transitionBtnText(saveBtn, LOADING_MESSAGES[0]);

        var msgIndex = 1;
        var msgTimer = setInterval(function () {
            if (msgIndex < LOADING_MESSAGES.length) {
                _transitionBtnText(saveBtn, LOADING_MESSAGES[msgIndex]);
                msgIndex++;
            }
        }, 3000);

        try {
            await apiFetch('/dashboard/api/user-info/save/', 'POST', _collectFormData());

            clearInterval(msgTimer);
            _captureSnapshot();
            _hideUndoBtn();
            _btnSaving = false;

            saveBtn.setAttribute('data-state', 'success');
            _setBtnGlass(saveBtn, 'success');
            _transitionBtnIcon(saveBtn, CHECK_ICON_SVG);
            _transitionBtnText(saveBtn, 'Saved!');
            saveBtn.disabled = true;

            setTimeout(function () {
                var btn2 = document.getElementById('searchPrefSaveBtn');
                if (!btn2) return;
                btn2.setAttribute('data-state', 'idle');
                if (!_isFormDirty()) {
                    _setBtnGlass(btn2, 'pristine');
                } else {
                    _setBtnGlass(btn2, 'idle');
                }
                _transitionBtnIcon(btn2, SAVE_ICON_SVG);
                _transitionBtnText(btn2, 'Save Changes');
            }, 2500);

        } catch (err) {
            clearInterval(msgTimer);
            console.error('[SearchPref] save failed:', err);
            _btnSaving = false;
            saveBtn.setAttribute('data-state', 'idle');
            _setBtnGlass(saveBtn, 'idle');
            _transitionBtnIcon(saveBtn, SAVE_ICON_SVG);
            _transitionBtnText(saveBtn, 'Save failed \u2014 retry');
            saveBtn.disabled = false;
            setTimeout(function () {
                _transitionBtnText(saveBtn, 'Save Changes');
            }, 3000);
        }
    });

    // ══════════════════════════════════════════════════
    // INIT
    // ══════════════════════════════════════════════════

    document.addEventListener('DOMContentLoaded', function () {
        _loadSearchPreferences();

        var form = document.getElementById('searchPrefForm');
        if (form) {
            form.addEventListener('input', _syncSaveBtn);
            form.addEventListener('change', _syncSaveBtn);
        }
        window._markSearchPrefFormDirty = _syncSaveBtn;
    });

})();