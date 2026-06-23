/* ============================================
   DASHBOARD INFO — Tag inputs, dynamic entries,
   Supabase data fetch & save
   ============================================ */

(function () {
    'use strict';
    if (window.__dashboardInfoInit) return;
    window.__dashboardInfoInit = true;

    // ── Supabase config (injected by Django template) ──
    const SUPABASE_URL = window.SUPABASE_URL || '';
    const SUPABASE_KEY = window.SUPABASE_KEY || '';
    const USER_ID = window.USER_ID || '';

    // ══════════════════════════════════════════════════
    // TAG INPUT
    // ══════════════════════════════════════════════════

    // ── Init static tag inputs ────────────────────────

    function initStaticTagInput(wrapperId, inputId, hiddenId) {
        const wrapper = document.getElementById(wrapperId);
        const input   = document.getElementById(inputId);
        const hidden  = document.getElementById(hiddenId);
        if (wrapper && input && hidden) initTagInput(wrapper, input, hidden);
        return wrapper;
    }

    // These are initialised lazily after clearSectionSkeletons() restores the DOM.
    // Declaring as let so they can be reassigned each time loadUserInfo() runs.
    let skillsWrapper             = null;
    let blockedIndustriesWrapper  = null;
    let workStyleWrapper          = null;
    let blockedCompaniesWrapper   = null;
    let blockedTitlesWrapper      = null;
    let blockedDetailsWrapper     = null;
    // True while loadUserInfo() is in flight — blocks Save to prevent overwriting DB with empty DOM
    let _isLoading = false;

    // ══════════════════════════════════════════════════
    // DATE FORMAT NORMALIZERS
    // ══════════════════════════════════════════════════

    var MONTH_MAP = {
        jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
        jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12',
        january:'01', february:'02', march:'03', april:'04', june:'06',
        july:'07', august:'08', september:'09', october:'10', november:'11', december:'12'
    };

    /**
     * Normalises any date string to "YYYY-MM" for <input type="month">.
     * Handles: "20240501", "2025", "2025-12", "2025-12-02", "Dec 2025",
     *          "March 2026", ISO datetime, null/""
     * Year-only "2025" → "2025-01"
     */
    function toMonthInput(raw) {
        if (raw == null) return '';
        var s = String(raw).trim();
        if (!s) return '';

        if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.substring(0, 7);
        if (/^\d{4}-\d{2}$/.test(s))        return s;
        if (/^\d{4}-\d{2}-\d{2}$/.test(s))  return s.substring(0, 7);
        if (/^\d{8}$/.test(s))              return s.substring(0, 4) + '-' + s.substring(4, 6);
        if (/^\d{6}$/.test(s))              return s.substring(0, 4) + '-' + s.substring(4, 6);
        if (/^\d{4}$/.test(s))              return s + '-01';

        var monYear = s.match(/^([a-zA-Z]+)\s+(\d{4})$/);
        if (monYear) {
            var mm = MONTH_MAP[monYear[1].toLowerCase()];
            if (mm) return monYear[2] + '-' + mm;
        }

        var yearMon = s.match(/^(\d{4})\s+([a-zA-Z]+)$/);
        if (yearMon) {
            var mm2 = MONTH_MAP[yearMon[2].toLowerCase()];
            if (mm2) return yearMon[1] + '-' + mm2;
        }

        var d = new Date(s);
        if (!isNaN(d.getTime())) {
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        }

        return '';
    }

    /**
     * Normalises any date string to a plain 4-digit year for <input type="number">.
     * "2026", "2026-03", "20260315", "Mar 2026" → "2026"
     */
    function toYearInput(raw) {
        if (raw == null) return '';
        var s = String(raw).trim();
        if (!s) return '';
        if (/^\d{4}$/.test(s))  return s;
        var m = s.match(/^(\d{4})[\-\/\s]/);
        if (m) return m[1];
        if (/^\d{8}$/.test(s)) return s.substring(0, 4);
        var monYear = s.match(/^[a-zA-Z]+\s+(\d{4})$/);
        if (monYear) return monYear[1];
        return '';
    }

    /** Convenience: set the dropdown value on a card by card element. */
    function setDegreeValue(card, rawValue) {
        var dd = card.querySelector('.dropdown-menu');
        if (dd && dd._dropdownSetValue) dd._dropdownSetValue(rawValue);
    }

    // ══════════════════════════════════════════════════
    // DYNAMIC ENTRY CARDS
    // ══════════════════════════════════════════════════

    function addEntryCard(containerId, templateId, labelText) {
        const container = document.getElementById(containerId);
        const template  = document.getElementById(templateId);
        if (!container || !template) return;

        const clone = template.content.cloneNode(true);
        const card  = clone.querySelector('.entry-card');

        // Label count
        const labelEl = card.querySelector('.entry-card__label');
        if (labelEl) labelEl.textContent = labelText + ' ' + (container.children.length + 1);

        // Remove button
        const removeBtn = card.querySelector('.entry-card__remove');
        removeBtn.addEventListener('click', function () {
            card.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
            card.style.opacity    = '0';
            card.style.transform  = 'translateY(-4px)';
            setTimeout(function () {
                card.remove();
                renumberEntries(container, labelText);
            }, 200);
        });

        // Wire degree searchable dropdown (education cards only)
        const degDd = card.querySelector('.dropdown-menu');
        if (degDd) initDropdown(degDd);

        // Wire activity tag input (education cards)
        const actWrapper = card.querySelector('.edu-activities-wrapper');
        if (actWrapper) {
            const actInput  = actWrapper.querySelector('.tag-input');
            const actHidden = actWrapper.querySelector('input[type="hidden"]');
            if (actInput && actHidden) initTagInput(actWrapper, actInput, actHidden);
        }

        // Wire bullets tag input (experience cards)
        const bulletsWrapper = card.querySelector('.exp-bullets-wrapper');
        if (bulletsWrapper) {
            const bulletsInput  = bulletsWrapper.querySelector('.tag-input');
            const bulletsHidden = bulletsWrapper.querySelector('input[type="hidden"]');
            if (bulletsInput && bulletsHidden) initTagInput(bulletsWrapper, bulletsInput, bulletsHidden);
        }

        container.appendChild(card);

        // Animate in
        card.style.opacity   = '0';
        card.style.transform = 'translateY(8px)';
        card.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
        requestAnimationFrame(function () {
            card.style.opacity   = '1';
            card.style.transform = 'translateY(0)';
        });

        return card;
    }

    function renumberEntries(container, labelText) {
        Array.from(container.children).forEach(function (card, idx) {
            const labelEl = card.querySelector('.entry-card__label');
            if (labelEl) labelEl.textContent = labelText + ' ' + (idx + 1);
        });
    }

    document.getElementById('addEducationBtn')?.addEventListener('click', function () {
        addEntryCard('educationEntries', 'education-entry-template', 'Degree');
    });
    document.getElementById('addCertificationBtn')?.addEventListener('click', function () {
        addEntryCard('certificationEntries', 'certification-entry-template', 'Certification');
    });
    document.getElementById('addExperienceBtn')?.addEventListener('click', function () {
        addEntryCard('experienceEntries', 'experience-entry-template', 'Experience');
    });

    // ══════════════════════════════════════════════════
    // DJANGO API HELPERS
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
    // SKELETON / ERROR UX  (uses dashboard-skeleton.js)
    // ══════════════════════════════════════════════════

    // Skeleton configs per section container id
    var SECTION_SKELETONS = {
        // Personal — 5 inputs in a grid
        'section-personal-body': {
            type: 'personal',
            count: 1,
        },
        // Education — 1 card placeholder
        'educationEntries': {
            type: 'education',
            count: 1,
        },
        // Certifications — 1 card placeholder
        'certificationEntries': {
            type: 'certification',
            count: 1,
        },
        // Experience — 1 card placeholder
        'experienceEntries': {
            type: 'experience',
            count: 1,
        },
        // Skills — tag cloud
        'section-skills-body': {
            type: 'tags',
            count: 1,
        },
        // Blocked — 5 tag inputs
        'section-blocked-body': {
            type: 'blocked',
            count: 1,
        },
    };

    // Inline skeleton HTML per custom type
    var SKELETON_HTML = {
        personal: `
            <div class="skeleton-group" aria-hidden="true">
                <div class="skeleton-grid skeleton-grid--2" style="margin-bottom:var(--spacing-sm);">
                    <div style="display:flex;flex-direction:column;gap:var(--spacing-xs);">
                        <div class="skeleton skeleton-line" style="width:80px;height:0.8em;"></div>
                        <div class="skeleton skeleton-input"></div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:var(--spacing-xs);">
                        <div class="skeleton skeleton-line" style="width:60px;height:0.8em;"></div>
                        <div class="skeleton skeleton-input"></div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:var(--spacing-xs);">
                        <div class="skeleton skeleton-line" style="width:100px;height:0.8em;"></div>
                        <div class="skeleton skeleton-input"></div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:var(--spacing-xs);">
                        <div class="skeleton skeleton-line" style="width:70px;height:0.8em;"></div>
                        <div class="skeleton skeleton-input"></div>
                    </div>
                </div>
                <div style="display:flex;flex-direction:column;gap:var(--spacing-xs);">
                    <div class="skeleton skeleton-line" style="width:70px;height:0.8em;"></div>
                    <div class="skeleton skeleton-input"></div>
                </div>
            </div>`,

        education: `
            <div class="skeleton-card" aria-hidden="true" style="padding:var(--spacing-md);margin-bottom:var(--spacing-md);">
                <div class="skeleton-row" style="margin-bottom:var(--spacing-md);">
                    <div class="skeleton skeleton-line" style="width:90px;height:1em;flex:1;"></div>
                    <div class="skeleton skeleton-icon skeleton-icon--sm"></div>
                </div>
                <div class="skeleton-grid skeleton-grid--2" style="gap:var(--spacing-sm);">
                    <div class="skeleton skeleton-input"></div>
                    <div class="skeleton skeleton-input"></div>
                    <div class="skeleton skeleton-input" style="grid-column:1/-1;"></div>
                    <div class="skeleton skeleton-input"></div>
                    <div class="skeleton skeleton-input"></div>
                    <div class="skeleton skeleton-input"></div>
                    <div class="skeleton skeleton-input"></div>
                </div>
                <div class="skeleton skeleton-input" style="margin-top:var(--spacing-sm);height:38px;"></div>
            </div>`,

        certification: `
            <div class="skeleton-card" aria-hidden="true" style="padding:var(--spacing-md);margin-bottom:var(--spacing-md);">
                <div class="skeleton-row" style="margin-bottom:var(--spacing-md);">
                    <div class="skeleton skeleton-line" style="width:110px;height:1em;flex:1;"></div>
                    <div class="skeleton skeleton-icon skeleton-icon--sm"></div>
                </div>
                <div style="display:flex;flex-direction:column;gap:var(--spacing-sm);">
                    <div class="skeleton skeleton-input"></div>
                    <div class="skeleton-grid skeleton-grid--2" style="gap:var(--spacing-sm);">
                        <div class="skeleton skeleton-input"></div>
                        <div class="skeleton skeleton-input"></div>
                    </div>
                </div>
            </div>`,

        experience: `
            <div class="skeleton-card" aria-hidden="true" style="padding:var(--spacing-md);margin-bottom:var(--spacing-md);">
                <div class="skeleton-row" style="margin-bottom:var(--spacing-md);">
                    <div class="skeleton skeleton-line" style="width:100px;height:1em;flex:1;"></div>
                    <div class="skeleton skeleton-icon skeleton-icon--sm"></div>
                </div>
                <div class="skeleton-grid skeleton-grid--2" style="gap:var(--spacing-sm);">
                    <div class="skeleton skeleton-input"></div>
                    <div class="skeleton skeleton-input"></div>
                    <div class="skeleton skeleton-input"></div>
                    <div class="skeleton skeleton-input"></div>
                </div>
                <div class="skeleton skeleton-input" style="margin-top:var(--spacing-sm);height:60px;"></div>
            </div>`,

        tags: `
            <div class="skeleton-group" aria-hidden="true">
                <div class="skeleton skeleton-line" style="width:50px;height:0.8em;margin-bottom:var(--spacing-xs);"></div>
                <div style="display:flex;flex-wrap:wrap;gap:var(--spacing-xs);">
                    ${[80,60,95,70,55,85,65,75].map(function(w){
                        return '<div class="skeleton skeleton-tag" style="width:'+w+'px;"></div>';
                    }).join('')}
                </div>
            </div>`,

        blocked: `
            <div class="skeleton-group" aria-hidden="true" style="gap:var(--spacing-md);">
                ${['Blocked Industries','Work Style','Blocked Companies','Blocked Titles','Blocked Details'].map(function(){
                    return `<div>
                        <div class="skeleton skeleton-line" style="width:130px;height:0.8em;margin-bottom:var(--spacing-xs);"></div>
                        <div style="display:flex;flex-wrap:wrap;gap:var(--spacing-xs);">
                            ${[75,60,90,65,80].map(function(w){
                                return '<div class="skeleton skeleton-tag" style="width:'+w+'px;"></div>';
                            }).join('')}
                        </div>
                    </div>`;
                }).join('')}
            </div>`,
    };

    // Track original content so we can restore it
    var _sectionOriginals = {};

    function showSectionSkeletons() {
        Object.keys(SECTION_SKELETONS).forEach(function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            var type = SECTION_SKELETONS[id].type;
            _sectionOriginals[id] = el.innerHTML;
            el.innerHTML = SKELETON_HTML[type] || '';
            el.setAttribute('aria-busy', 'true');
        });
    }

    function clearSectionSkeletons() {
        Object.keys(SECTION_SKELETONS).forEach(function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            if (_sectionOriginals[id] !== undefined) {
                el.innerHTML = _sectionOriginals[id];
                delete _sectionOriginals[id];
            }
            el.removeAttribute('aria-busy');
        });
    }

    /**
     * Clears the skeleton for a single section body by its element ID.
     * Used by the two-phase loader to reveal Phase-1 data (personal scalars)
     * immediately, without waiting for Phase-2 (JSON arrays) to complete.
     *
     * @param {string} sectionBodyId - The id attribute of the section body element.
     */
    function clearSingleSectionSkeleton(sectionBodyId) {
        var el = document.getElementById(sectionBodyId);
        if (!el || !_sectionOriginals[sectionBodyId]) return;
        el.innerHTML = _sectionOriginals[sectionBodyId];
        delete _sectionOriginals[sectionBodyId];
        el.removeAttribute('aria-busy');
    }

    function showLoadError() {
        const banner = document.createElement('div');
        banner.className = 'info-load-error';
        banner.setAttribute('role', 'alert');
        banner.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
            + ' Could not load your saved data. <button type="button" id="retryLoadBtn">Retry</button>';
        const form = document.getElementById('infoForm');
        if (form) form.prepend(banner);
        document.getElementById('retryLoadBtn')?.addEventListener('click', function () {
            banner.remove();
            loadUserInfo();
        });
    }

    // ══════════════════════════════════════════════════
    // LOAD DATA
    // ══════════════════════════════════════════════════

    /**
     * Two-phase profile loader.
     *
     * Architecture:
     *   Phase 1 — /api/user-info/personal/
     *     Fetches only the 5 scalar fields (name, phone, linkedin, website,
     *     location). The payload is ~200 bytes and returns in < 1 s even on
     *     a cold Supabase connection. The Personal Information section is
     *     populated and its skeleton cleared immediately.
     *
     *   Phase 2 — /api/user-info/
     *     Fetches the full row including all JSON array columns (skills,
     *     blocked_*, education, certifications, experience). Called right
     *     after Phase 1 resolves. Each section's skeleton is cleared as
     *     soon as the data arrives.
     *
     * To add a new scalar field: populate it in _applyPersonalData().
     * To add a new JSON section: populate it in _applyArrayData().
     * Tag-input wrappers are re-initialised here after skeleton clear
     * because showSectionSkeletons() replaces innerHTML, which detaches
     * the old DOM nodes that initStaticTagInput() originally bound to.
     */
    function _updateSaveBtnLoadingState() {
        var btn = document.getElementById('saveInfoBtn');
        if (!btn) return;
        if (_isLoading) {
            btn.disabled = true;
            btn.setAttribute('title', 'Please wait while your data is loading…');
        } else {
            btn.disabled = false;
            btn.removeAttribute('title');
        }
    }

    async function loadUserInfo() {
        _isLoading = true;
        _updateSaveBtnLoadingState();
        showSectionSkeletons();

        // ── Phase 1: personal scalars ────────────────────────────────────────────
        try {
            const personalResp = await fetch('/dashboard/api/user-info/personal/', {
                credentials: 'same-origin',
            });
            clearSingleSectionSkeleton('section-personal-body');
            if (personalResp.ok) {
                const personal = await personalResp.json();
                _applyPersonalData(personal);
            }
        } catch (err) {
            console.error('[Phase 1] personal load failed:', err);
            clearSingleSectionSkeleton('section-personal-body');
        }

        // ── Phase 2: JSON array sections ─────────────────────────────────────────
        try {
            const fullResp = await fetch('/dashboard/api/user-info/', {
                credentials: 'same-origin',
            });
            if (!fullResp.ok) throw new Error('HTTP ' + fullResp.status);
            const data = await fullResp.json();

            clearSectionSkeletons();

            skillsWrapper             = initStaticTagInput('skills-tag-wrapper',             'skills-input',             'skills-hidden');
            blockedIndustriesWrapper  = initStaticTagInput('blocked-industries-tag-wrapper',  'blocked-industries-input', 'blocked-industries-hidden');
            workStyleWrapper          = initStaticTagInput('work-style-tag-wrapper',          'work-style-input',         'work-style-hidden');
            blockedCompaniesWrapper   = initStaticTagInput('blocked-companies-tag-wrapper',   'blocked-companies-input',  'blocked-companies-hidden');
            blockedTitlesWrapper      = initStaticTagInput('blocked-titles-tag-wrapper',      'blocked-titles-input',     'blocked-titles-hidden');
            blockedDetailsWrapper     = initStaticTagInput('blocked-details-tag-wrapper',     'blocked-details-input',    'blocked-details-hidden');

            _applyArrayData(data);

        } catch (err) {
            console.error('[Phase 2] full load failed:', err);
            clearSectionSkeletons();
            showLoadError();
        } finally {
            _isLoading = false;
            _updateSaveBtnLoadingState();
        }
    }

    /** Populates only scalar input fields from the personal endpoint response. */
    function _applyPersonalData(data) {
        var set = function (id, val) { var el = document.getElementById(id); if (el) el.value = val || ''; };
        set('field-name',     data.name);
        set('field-phone',    data.phone);
        set('field-linkedin', data.linkedin);
        set('field-website',  data.website);
        set('field-location', data.location);
    }

    /** Populates all JSON array sections from the full endpoint response. */
    function _applyArrayData(data) {
        if (!data || !Object.keys(data).length) return;

        // Education
        (data.education || []).forEach(function (e) {
            var card = addEntryCard('educationEntries', 'education-entry-template', 'Degree');
            if (!card) return;
            setDegreeValue(card, e.degree);
            setCardField(card, 'edu_major[]',       e.major);
            setCardField(card, 'edu_institution[]',  e.institution);
            setCardField(card, 'edu_start_year[]',   toYearInput(e.start_year));
            setCardField(card, 'edu_end_year[]',     toYearInput(e.end_year));
            setCardField(card, 'edu_gpa[]',          e.gpa);
            setCardField(card, 'edu_honors[]',       e.honors);
            var actWrapper = card.querySelector('.edu-activities-wrapper');
            if (actWrapper && actWrapper._setTags) actWrapper._setTags(e.activities || []);
        });

        // Certifications
        (data.certifications || []).forEach(function (e) {
            var card = addEntryCard('certificationEntries', 'certification-entry-template', 'Certification');
            if (!card) return;
            setCardField(card, 'cert_name[]',        e.certification_name);
            setCardField(card, 'cert_issuer[]',      e.organization);
            setCardField(card, 'cert_issue_date[]',  toMonthInput(e.date));
        });

        // Experience
        (data.experience || []).forEach(function (e) {
            var card = addEntryCard('experienceEntries', 'experience-entry-template', 'Experience');
            if (!card) return;
            setCardField(card, 'exp_job_title[]',  e.job_title);
            setCardField(card, 'exp_company[]',    e.company);
            setCardField(card, 'exp_start_date[]', toMonthInput(e.start_date));
            setCardField(card, 'exp_end_date[]',   toMonthInput(e.end_date));
            var bulletsWrapper = card.querySelector('.exp-bullets-wrapper');
            if (bulletsWrapper && bulletsWrapper._setTags) bulletsWrapper._setTags(e.bullets || []);
        });

        // Tag inputs — wrappers must already be re-initialised before calling _setTags
        if (skillsWrapper && skillsWrapper._setTags)            skillsWrapper._setTags(data.skills             || []);
        if (blockedIndustriesWrapper && blockedIndustriesWrapper._setTags) blockedIndustriesWrapper._setTags(data.blocked_industries || []);
        if (workStyleWrapper && workStyleWrapper._setTags)         workStyleWrapper._setTags(data.work_style        || []);
        if (blockedCompaniesWrapper && blockedCompaniesWrapper._setTags)  blockedCompaniesWrapper._setTags(data.blocked_companies  || []);
        if (blockedTitlesWrapper && blockedTitlesWrapper._setTags)     blockedTitlesWrapper._setTags(data.blocked_titles    || []);
        if (blockedDetailsWrapper && blockedDetailsWrapper._setTags)    blockedDetailsWrapper._setTags(data.blocked_details   || []);
    }

    function setFieldValue(id, value) {
        const el = document.getElementById(id);
        if (el && value != null) el.value = value;
    }

    // Keep old name as alias so nothing else breaks
    var setValue = setFieldValue;

    function setCardField(card, name, value) {
        const el = card.querySelector('[name="' + name + '"]');
        if (el && value != null) el.value = value;
    }

    // ══════════════════════════════════════════════════
    // COLLECT & SAVE
    // ══════════════════════════════════════════════════

    function collectFormData() {
        function getAll(name) {
            return Array.from(document.querySelectorAll('[name="' + name + '"]')).map(function (el) { return el.value; });
        }
        function getTagsFrom(wrapper) { return wrapper ? wrapper._getTags() : []; }

        // edu_degree[] is the hidden input inside .deg-dropdown, so getAll reads it correctly
        var education = getAll('edu_degree[]').map(function (_, i) {
            var actWrappers = document.querySelectorAll('.edu-activities-wrapper');
            return {
                degree:      getAll('edu_degree[]')[i]      || '',
                major:       getAll('edu_major[]')[i]       || '',
                institution: getAll('edu_institution[]')[i] || '',
                start_year:  getAll('edu_start_year[]')[i]  || null,
                end_year:    getAll('edu_end_year[]')[i]    || null,
                gpa:         getAll('edu_gpa[]')[i]         || '',
                honors:      getAll('edu_honors[]')[i]      || '',
                activities:  actWrappers[i] ? actWrappers[i]._getTags() : [],
            };
        });

        var certifications = getAll('cert_name[]').map(function (_, i) {
            return {
                certification_name: getAll('cert_name[]')[i]       || '',
                organization:       getAll('cert_issuer[]')[i]     || '',
                date:               getAll('cert_issue_date[]')[i] || null,
            };
        });

        var bulletsWrappers = document.querySelectorAll('.exp-bullets-wrapper');
        var experience = getAll('exp_job_title[]').map(function (_, i) {
            return {
                job_title:  getAll('exp_job_title[]')[i]  || '',
                company:    getAll('exp_company[]')[i]    || '',
                start_date: getAll('exp_start_date[]')[i] || null,
                end_date:   getAll('exp_end_date[]')[i]   || null,
                bullets:    bulletsWrappers[i] ? bulletsWrappers[i]._getTags() : [],
            };
        });

        return {
            name:               document.getElementById('field-name')?.value     || '',
            phone:              document.getElementById('field-phone')?.value    || '',
            linkedin:           document.getElementById('field-linkedin')?.value || '',
            website:            document.getElementById('field-website')?.value  || '',
            location:           document.getElementById('field-location')?.value || '',
            skills:             getTagsFrom(skillsWrapper),
            education:          education,
            certifications:     certifications,
            experience:         experience,
            blocked_industries: getTagsFrom(blockedIndustriesWrapper),
            work_style:         getTagsFrom(workStyleWrapper),
            blocked_companies:  getTagsFrom(blockedCompaniesWrapper),
            blocked_titles:     getTagsFrom(blockedTitlesWrapper),
            blocked_details:    getTagsFrom(blockedDetailsWrapper),
        };
    }

    // ── SAVE BUTTON STATE MACHINE ──────────────────────────────────────────────

    var LOADING_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="20" height="20" fill="currentColor" aria-hidden="true"><circle cx="16" cy="3" r="0"><animate attributeName="r" values="0;3;0;0" dur="1s" repeatCount="indefinite" begin="0s" keySplines="0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8" calcMode="spline"/></circle><circle transform="rotate(45 16 16)" cx="16" cy="3" r="0"><animate attributeName="r" values="0;3;0;0" dur="1s" repeatCount="indefinite" begin="0.125s" keySplines="0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8" calcMode="spline"/></circle><circle transform="rotate(90 16 16)" cx="16" cy="3" r="0"><animate attributeName="r" values="0;3;0;0" dur="1s" repeatCount="indefinite" begin="0.25s" keySplines="0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8" calcMode="spline"/></circle><circle transform="rotate(135 16 16)" cx="16" cy="3" r="0"><animate attributeName="r" values="0;3;0;0" dur="1s" repeatCount="indefinite" begin="0.375s" keySplines="0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8" calcMode="spline"/></circle><circle transform="rotate(180 16 16)" cx="16" cy="3" r="0"><animate attributeName="r" values="0;3;0;0" dur="1s" repeatCount="indefinite" begin="0.5s" keySplines="0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8" calcMode="spline"/></circle><circle transform="rotate(225 16 16)" cx="16" cy="3" r="0"><animate attributeName="r" values="0;3;0;0" dur="1s" repeatCount="indefinite" begin="0.625s" keySplines="0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8" calcMode="spline"/></circle><circle transform="rotate(270 16 16)" cx="16" cy="3" r="0"><animate attributeName="r" values="0;3;0;0" dur="1s" repeatCount="indefinite" begin="0.75s" keySplines="0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8" calcMode="spline"/></circle><circle transform="rotate(315 16 16)" cx="16" cy="3" r="0"><animate attributeName="r" values="0;3;0;0" dur="1s" repeatCount="indefinite" begin="0.875s" keySplines="0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8;0.2 0.2 0.4 0.8" calcMode="spline"/></circle></svg>';

    var CHECK_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';

    var SAVE_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>';

    var LOADING_MESSAGES = [
        'Saving\u2026',
        'Almost there\u2026',
        'Still working\u2026',
        'Hang tight\u2026',
        'Just a moment\u2026',
        'Nearly done\u2026',
    ];

    function _buildSaveBtn(btn) {
        btn.innerHTML = '';
        var iconSpan = document.createElement('span');
        iconSpan.className = 'save-btn__icon';
        iconSpan.innerHTML = SAVE_ICON_SVG;
        var textSpan = document.createElement('span');
        textSpan.className = 'save-btn__text';
        textSpan.textContent = 'Save Changes';
        btn.appendChild(iconSpan);
        btn.appendChild(textSpan);
        btn.setAttribute('data-state', 'idle');
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

    document.getElementById('infoForm')?.addEventListener('submit', async function (e) {
        e.preventDefault();
        var saveBtn = document.getElementById('saveInfoBtn');

        // Ensure structured markup exists (idempotent)
        if (!saveBtn.querySelector('.save-btn__icon')) {
            _buildSaveBtn(saveBtn);
        }

        saveBtn.disabled = true;
        saveBtn.setAttribute('data-state', 'loading');
        _transitionBtnIcon(saveBtn, LOADING_ICON_SVG);
        _transitionBtnText(saveBtn, LOADING_MESSAGES[0]);

        // Progressive loading messages
        var msgIndex = 1;
        var msgTimer = setInterval(function () {
            if (msgIndex < LOADING_MESSAGES.length) {
                _transitionBtnText(saveBtn, LOADING_MESSAGES[msgIndex]);
                msgIndex++;
            }
        }, 3000);

        try {
            await apiFetch('/dashboard/api/user-info/save/', 'POST', collectFormData());
            clearInterval(msgTimer);
            saveBtn.setAttribute('data-state', 'success');
            _transitionBtnIcon(saveBtn, CHECK_ICON_SVG);
            _transitionBtnText(saveBtn, 'Saved!');
            setTimeout(function () {
                saveBtn.setAttribute('data-state', 'idle');
                _transitionBtnIcon(saveBtn, SAVE_ICON_SVG);
                _transitionBtnText(saveBtn, 'Save Changes');
                saveBtn.disabled = false;
            }, 2200);
        } catch (err) {
            clearInterval(msgTimer);
            console.error('Save failed:', err);
            saveBtn.setAttribute('data-state', 'idle');
            _transitionBtnIcon(saveBtn, SAVE_ICON_SVG);
            _transitionBtnText(saveBtn, 'Save failed \u2014 retry');
            saveBtn.disabled = false;
            setTimeout(function () {
                _transitionBtnText(saveBtn, 'Save Changes');
            }, 3000);
        }
    });

    // ── INIT ──────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', loadUserInfo);

})();