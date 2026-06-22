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

    function initTagInput(wrapper, textInput, hidden) {
        const tagList = wrapper.querySelector('.tag-list');
        let tags = [];

        function renderTags() {
            tagList.querySelectorAll('.tag-item').forEach(el => el.remove());
            tags.forEach(function (tag, idx) {
                const item = document.createElement('span');
                item.className = 'tag-item';
                item.setAttribute('role', 'listitem');

                const text = document.createElement('span');
                text.className = 'tag-item__text';
                text.textContent = tag;

                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'tag-item__remove';
                removeBtn.setAttribute('aria-label', 'Remove ' + tag);
                removeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
                removeBtn.addEventListener('click', function () {
                    tags.splice(idx, 1);
                    renderTags();
                    syncHidden();
                });

                item.appendChild(text);
                item.appendChild(removeBtn);
                tagList.appendChild(item);
            });
        }

        function addTag(value) {
            const trimmed = value.trim().replace(/,+$/, '');
            if (!trimmed || tags.includes(trimmed)) return;
            tags.push(trimmed);
            renderTags();
            syncHidden();
        }

        function syncHidden() {
            hidden.value = JSON.stringify(tags);
        }

        function setTags(arr) {
            tags = Array.isArray(arr) ? arr.slice() : [];
            renderTags();
            syncHidden();
        }

        wrapper.addEventListener('click', function () { textInput.focus(); });

        textInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag(textInput.value);
                textInput.value = '';
            } else if (e.key === 'Backspace' && textInput.value === '' && tags.length > 0) {
                tags.pop();
                renderTags();
                syncHidden();
            }
        });

        textInput.addEventListener('blur', function () {
            if (textInput.value.trim()) {
                addTag(textInput.value);
                textInput.value = '';
            }
        });

        wrapper._setTags = setTags;
        wrapper._getTags = function () { return tags.slice(); };
    }

    // ── Init static tag inputs ────────────────────────

    function initStaticTagInput(wrapperId, inputId, hiddenId) {
        const wrapper = document.getElementById(wrapperId);
        const input   = document.getElementById(inputId);
        const hidden  = document.getElementById(hiddenId);
        if (wrapper && input && hidden) initTagInput(wrapper, input, hidden);
        return wrapper;
    }

    const skillsWrapper             = initStaticTagInput('skills-tag-wrapper',             'skills-input',             'skills-hidden');
    const blockedIndustriesWrapper  = initStaticTagInput('blocked-industries-tag-wrapper',  'blocked-industries-input', 'blocked-industries-hidden');
    const workStyleWrapper          = initStaticTagInput('work-style-tag-wrapper',          'work-style-input',         'work-style-hidden');
    const blockedCompaniesWrapper   = initStaticTagInput('blocked-companies-tag-wrapper',   'blocked-companies-input',  'blocked-companies-hidden');
    const blockedTitlesWrapper      = initStaticTagInput('blocked-titles-tag-wrapper',      'blocked-titles-input',     'blocked-titles-hidden');
    const blockedDetailsWrapper     = initStaticTagInput('blocked-details-tag-wrapper',     'blocked-details-input',    'blocked-details-hidden');

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

    // ══════════════════════════════════════════════════
    // DEGREE SEARCHABLE DROPDOWN
    // ══════════════════════════════════════════════════

    function initDegDropdown(root) {
        if (!root || root._degInit) return;
        root._degInit = true;

        var trigger   = root.querySelector('.deg-dropdown__trigger');
        var menu      = root.querySelector('.deg-dropdown__menu');
        var search    = root.querySelector('.deg-dropdown__search');
        var list      = root.querySelector('.deg-dropdown__list');
        var empty     = root.querySelector('.deg-dropdown__empty');
        var customBtn = root.querySelector('.deg-dropdown__custom-btn');
        var customLbl = root.querySelector('.deg-dropdown__custom-label');
        var hidden    = root.querySelector('.deg-dropdown__hidden');
        var textSpan  = root.querySelector('.deg-dropdown__text');

        function openMenu() {
            // Close any other open deg-dropdowns first
            document.querySelectorAll('.deg-dropdown__menu.is-open').forEach(function (m) {
                if (m !== menu) closeMenu(m.closest('.deg-dropdown'));
            });
            menu.classList.add('is-open');
            trigger.setAttribute('aria-expanded', 'true');
            search.value = '';
            filterItems('');
            setTimeout(function () { search.focus(); }, 60);
        }

        function closeMenu(r) {
            var target = r || root;
            var m = target.querySelector('.deg-dropdown__menu');
            var t = target.querySelector('.deg-dropdown__trigger');
            if (m) m.classList.remove('is-open');
            if (t) t.setAttribute('aria-expanded', 'false');
        }

        function isOpen() {
            return menu.classList.contains('is-open');
        }

        function selectItem(value) {
            hidden.value = value;
            textSpan.textContent = value;
            textSpan.classList.remove('deg-dropdown__text--placeholder');
            list.querySelectorAll('.deg-dropdown__item').forEach(function (it) {
                it.classList.toggle('is-selected', it.getAttribute('data-value') === value);
            });
            closeMenu();
        }

        function filterItems(q) {
            var query = q.toLowerCase().trim();
            var visibleCount = 0;

            list.querySelectorAll('.deg-dropdown__item').forEach(function (it) {
                var text = (it.getAttribute('data-value') + ' ' + it.textContent).toLowerCase();
                var show = !query || text.includes(query);
                it.classList.toggle('is-hidden', !show);
                if (show) visibleCount++;
            });

            // Hide group labels whose entire group is hidden
            list.querySelectorAll('.deg-dropdown__group-label').forEach(function (gl) {
                var next = gl.nextElementSibling;
                var anyVisible = false;
                while (next && !next.classList.contains('deg-dropdown__group-label')) {
                    if (!next.classList.contains('is-hidden')) anyVisible = true;
                    next = next.nextElementSibling;
                }
                gl.style.display = anyVisible ? '' : 'none';
            });

            empty.classList.toggle('is-visible', visibleCount === 0);

            if (q.trim()) {
                var exactMatch = Array.from(list.querySelectorAll('.deg-dropdown__item')).some(function (it) {
                    return it.getAttribute('data-value').toLowerCase() === q.toLowerCase().trim();
                });
                customBtn.classList.toggle('is-visible', !exactMatch);
                if (customLbl) customLbl.textContent = 'Add "' + q.trim() + '"';
            } else {
                customBtn.classList.remove('is-visible');
            }
        }

        /**
         * Programmatic value setter (used when loading from Supabase).
         * If the value isn't in the list it is added as a custom item.
         */
        function setValue(rawValue) {
            if (rawValue == null || rawValue === '') return;
            var match = Array.from(list.querySelectorAll('.deg-dropdown__item')).find(function (it) {
                return it.getAttribute('data-value').toLowerCase() === rawValue.toLowerCase();
            });
            if (match) {
                selectItem(match.getAttribute('data-value'));
            } else {
                // Unknown value from DB — inject it as a new list item and select it
                var newItem = document.createElement('div');
                newItem.className = 'deg-dropdown__item';
                newItem.setAttribute('data-value', rawValue);
                newItem.setAttribute('role', 'option');
                newItem.textContent = rawValue;
                list.appendChild(newItem);
                newItem.addEventListener('click', function () { selectItem(rawValue); });
                selectItem(rawValue);
            }
        }

        // ── Event wiring ─────────────────────────────────

        trigger.addEventListener('click', function (e) {
            e.stopPropagation();
            isOpen() ? closeMenu() : openMenu();
        });

        search.addEventListener('click', function (e) { e.stopPropagation(); });

        search.addEventListener('input', function () { filterItems(search.value); });

        search.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                var q = search.value.trim();
                if (!q) return;
                var visible = Array.from(list.querySelectorAll('.deg-dropdown__item:not(.is-hidden)'));
                if (visible.length === 1) {
                    selectItem(visible[0].getAttribute('data-value'));
                } else {
                    setValue(q);
                }
            } else if (e.key === 'Escape') {
                closeMenu();
            }
        });

        list.addEventListener('click', function (e) {
            var item = e.target.closest('.deg-dropdown__item');
            if (!item) return;
            selectItem(item.getAttribute('data-value'));
        });

        customBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            var q = search.value.trim();
            if (q) setValue(q);
        });

        document.addEventListener('click', function (e) {
            if (!root.contains(e.target)) closeMenu();
        });

        // Public API
        root._degSetValue = setValue;
        root._degGetValue = function () { return hidden.value; };
    }

    /** Convenience: set the degree dropdown value on a card by card element. */
    function setDegreeValue(card, rawValue) {
        var dd = card.querySelector('.deg-dropdown');
        if (dd && dd._degSetValue) dd._degSetValue(rawValue);
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
        const degDd = card.querySelector('.deg-dropdown');
        if (degDd) initDegDropdown(degDd);

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
    // SKELETON / ERROR UX
    // ══════════════════════════════════════════════════

    function showSectionSkeletons() {
        const skeletonHTML = `
            <div class="skeleton-block" aria-hidden="true">
                <div class="skeleton-line skeleton-line--wide"></div>
                <div class="skeleton-line skeleton-line--medium"></div>
                <div class="skeleton-line skeleton-line--short"></div>
            </div>`;
        ['educationEntries', 'certificationEntries', 'experienceEntries'].forEach(function (id) {
            const el = document.getElementById(id);
            if (el) el.innerHTML = skeletonHTML;
        });
    }

    function clearSectionSkeletons() {
        document.querySelectorAll('.skeleton-block').forEach(function (el) { el.remove(); });
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

    async function loadUserInfo() {
        showSectionSkeletons();
        const MAX_RETRIES = 3;
        const BACKOFF_BASE = 800;

        async function attempt(n) {
            try {
                return await apiFetch('/dashboard/api/user-info/');
            } catch (err) {
                if (n < MAX_RETRIES) {
                    const delay = BACKOFF_BASE * Math.pow(2, n - 1) + Math.random() * 300;
                    console.warn('loadUserInfo attempt ' + n + ' failed, retrying in ' + Math.round(delay) + 'ms…', err);
                    await new Promise(function (res) { setTimeout(res, delay); });
                    return attempt(n + 1);
                }
                throw err;
            }
        }

        try {
            const data = await attempt(1);
            clearSectionSkeletons();
            if (!data || Object.keys(data).length === 0) return;

            // Personal
            setFieldValue('field-name',     data.name);
            setFieldValue('field-phone',    data.phone);
            setFieldValue('field-linkedin', data.linkedin);
            setFieldValue('field-website',  data.website);
            setFieldValue('field-location', data.location);

            // Skills
            if (skillsWrapper && Array.isArray(data.skills)) skillsWrapper._setTags(data.skills);

            // Education
            if (Array.isArray(data.education)) {
                data.education.forEach(function (edu) {
                    const card = addEntryCard('educationEntries', 'education-entry-template', 'Degree');
                    if (!card) return;
                    setDegreeValue(card, edu.degree || null);
                    setCardField(card, 'edu_major[]',      edu.major);
                    setCardField(card, 'edu_institution[]', edu.institution);
                    setCardField(card, 'edu_start_year[]', toYearInput(edu.start_year));
                    setCardField(card, 'edu_end_year[]',   toYearInput(edu.end_year));
                    setCardField(card, 'edu_gpa[]',        edu.gpa != null ? edu.gpa : '');
                    setCardField(card, 'edu_honors[]',     edu.honors);
                    const actWrapper = card.querySelector('.edu-activities-wrapper');
                    if (actWrapper && actWrapper._setTags && Array.isArray(edu.activities)) {
                        actWrapper._setTags(edu.activities);
                    }
                });
            }

            // Certifications
            if (Array.isArray(data.certifications)) {
                data.certifications.forEach(function (cert) {
                    const card = addEntryCard('certificationEntries', 'certification-entry-template', 'Certification');
                    if (!card) return;
                    setCardField(card, 'cert_name[]',       cert.certification_name || cert.name       || null);
                    setCardField(card, 'cert_issuer[]',     cert.organization       || cert.issuer     || null);
                    setCardField(card, 'cert_issue_date[]', toMonthInput(cert.date  || cert.issue_date || null));
                });
            }

            // Experience
            if (Array.isArray(data.experience)) {
                data.experience.forEach(function (exp) {
                    const card = addEntryCard('experienceEntries', 'experience-entry-template', 'Experience');
                    if (!card) return;
                    setCardField(card, 'exp_job_title[]',  exp.job_title);
                    setCardField(card, 'exp_company[]',    exp.company);
                    setCardField(card, 'exp_start_date[]', toMonthInput(exp.start_date));
                    setCardField(card, 'exp_end_date[]',   toMonthInput(exp.end_date));
                    const bulletsWrapper = card.querySelector('.exp-bullets-wrapper');
                    if (bulletsWrapper && bulletsWrapper._setTags && Array.isArray(exp.bullets)) {
                        bulletsWrapper._setTags(exp.bullets);
                    }
                });
            }

            // Blocked
            if (blockedIndustriesWrapper && Array.isArray(data.blocked_industries)) blockedIndustriesWrapper._setTags(data.blocked_industries);
            if (workStyleWrapper         && Array.isArray(data.work_style))         workStyleWrapper._setTags(data.work_style);
            if (blockedCompaniesWrapper  && Array.isArray(data.blocked_companies))  blockedCompaniesWrapper._setTags(data.blocked_companies);
            if (blockedTitlesWrapper     && Array.isArray(data.blocked_titles))     blockedTitlesWrapper._setTags(data.blocked_titles);
            if (blockedDetailsWrapper    && Array.isArray(data.blocked_details))    blockedDetailsWrapper._setTags(data.blocked_details);

        } catch (err) {
            clearSectionSkeletons();
            console.error('Failed to load user info after retries:', err);
            showLoadError();
        }
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
                name:       getAll('cert_name[]')[i]       || '',
                issuer:     getAll('cert_issuer[]')[i]     || '',
                issue_date: getAll('cert_issue_date[]')[i] || null,
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

    document.getElementById('infoForm')?.addEventListener('submit', async function (e) {
        e.preventDefault();
        const saveBtn     = document.getElementById('saveInfoBtn');
        const originalHTML = saveBtn.innerHTML;

        saveBtn.disabled = true;
        saveBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Saving\u2026';

        try {
            await apiFetch('/dashboard/api/user-info/save/', 'POST', collectFormData());
            saveBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> Saved!';
            setTimeout(function () { saveBtn.innerHTML = originalHTML; saveBtn.disabled = false; }, 2000);
        } catch (err) {
            console.error('Save failed:', err);
            saveBtn.innerHTML = 'Save failed \u2014 retry';
            saveBtn.disabled = false;
            setTimeout(function () { saveBtn.innerHTML = originalHTML; }, 3000);
        }
    });

    // ── INIT ──────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', loadUserInfo);

})();
