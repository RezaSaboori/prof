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

    // ── TAG INPUT ──────────────────────────────────────

    /**
     * Initialise a tag input widget.
     * @param {HTMLElement} wrapper   - .tag-input-wrapper
     * @param {HTMLInputElement} textInput - the visible text field
     * @param {HTMLInputElement} hidden    - the hidden field that stores JSON array
     */
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

        wrapper.addEventListener('click', function () {
            textInput.focus();
        });

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

        // Expose for programmatic population
        wrapper._setTags = setTags;
        wrapper._getTags = function () { return tags.slice(); };
    }

    // ── INIT static tag inputs (skills + blocked fields) ──

    function initStaticTagInput(wrapperId, inputId, hiddenId) {
        const wrapper = document.getElementById(wrapperId);
        const input = document.getElementById(inputId);
        const hidden = document.getElementById(hiddenId);
        if (wrapper && input && hidden) {
            initTagInput(wrapper, input, hidden);
        }
        return wrapper;
    }

    const skillsWrapper = initStaticTagInput('skills-tag-wrapper', 'skills-input', 'skills-hidden');
    const blockedIndustriesWrapper = initStaticTagInput('blocked-industries-tag-wrapper', 'blocked-industries-input', 'blocked-industries-hidden');
    const workStyleWrapper = initStaticTagInput('work-style-tag-wrapper', 'work-style-input', 'work-style-hidden');
    const blockedCompaniesWrapper = initStaticTagInput('blocked-companies-tag-wrapper', 'blocked-companies-input', 'blocked-companies-hidden');
    const blockedTitlesWrapper = initStaticTagInput('blocked-titles-tag-wrapper', 'blocked-titles-input', 'blocked-titles-hidden');
    const blockedDetailsWrapper = initStaticTagInput('blocked-details-tag-wrapper', 'blocked-details-input', 'blocked-details-hidden');

    // ── DYNAMIC ENTRY CARDS ────────────────────────────

    function addEntryCard(containerId, templateId, labelText) {
        const container = document.getElementById(containerId);
        const template = document.getElementById(templateId);
        if (!container || !template) return;

        const clone = template.content.cloneNode(true);
        const card = clone.querySelector('.entry-card');

        // Update label count
        const label = card.querySelector('.entry-card__label');
        if (label) label.textContent = labelText + ' ' + (container.children.length + 1);

        // Wire remove button
        const removeBtn = card.querySelector('.entry-card__remove');
        removeBtn.addEventListener('click', function () {
            card.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
            card.style.opacity = '0';
            card.style.transform = 'translateY(-4px)';
            setTimeout(function () {
                card.remove();
                renumberEntries(container, labelText);
            }, 200);
        });

        // Wire activity tag inputs inside education cards
        const actWrapper = card.querySelector('.edu-activities-wrapper');
        if (actWrapper) {
            const actInput = actWrapper.querySelector('.tag-input');
            const actHidden = actWrapper.querySelector('input[type="hidden"]');
            initTagInput(actWrapper, actInput, actHidden);
        }

        // Wire bullets tag inputs inside experience cards
        const bulletsWrapper = card.querySelector('.exp-bullets-wrapper');
        if (bulletsWrapper) {
            const bulletsInput = bulletsWrapper.querySelector('.tag-input');
            const bulletsHidden = bulletsWrapper.querySelector('input[type="hidden"]');
            initTagInput(bulletsWrapper, bulletsInput, bulletsHidden);
        }

        container.appendChild(card);

        // Animate in
        card.style.opacity = '0';
        card.style.transform = 'translateY(8px)';
        card.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
        requestAnimationFrame(function () {
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        });
    }

    function renumberEntries(container, labelText) {
        Array.from(container.children).forEach(function (card, idx) {
            const label = card.querySelector('.entry-card__label');
            if (label) label.textContent = labelText + ' ' + (idx + 1);
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

    // ── DJANGO API HELPERS ─────────────────────────────

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

    // ── LOAD DATA ──────────────────────────────────────

    async function loadUserInfo() {
        try {
            const data = await apiFetch('/dashboard/api/user-info/');
            if (!data || Object.keys(data).length === 0) return;

            setValue('field-name', data.name);
            setValue('field-phone', data.phone);
            setValue('field-linkedin', data.linkedin);
            setValue('field-website', data.website);
            setValue('field-location', data.location);

            if (skillsWrapper && Array.isArray(data.skills)) {
                skillsWrapper._setTags(data.skills);
            }

            if (Array.isArray(data.education)) {
                data.education.forEach(function (edu) {
                    addEntryCard('educationEntries', 'education-entry-template', 'Degree');
                    const cards = document.querySelectorAll('#educationEntries .entry-card');
                    const card = cards[cards.length - 1];
                    setCardField(card, 'edu_degree[]', edu.degree);
                    setCardField(card, 'edu_major[]', edu.major);
                    setCardField(card, 'edu_institution[]', edu.institution);
                    setCardField(card, 'edu_start_year[]', edu.start_year);
                    setCardField(card, 'edu_end_year[]', edu.end_year);
                    setCardField(card, 'edu_gpa[]', edu.gpa);
                    setCardField(card, 'edu_honors[]', edu.honors);
                    const actWrapper = card.querySelector('.edu-activities-wrapper');
                    if (actWrapper && Array.isArray(edu.activities)) actWrapper._setTags(edu.activities);
                });
            }

            if (Array.isArray(data.certifications)) {
                data.certifications.forEach(function (cert) {
                    addEntryCard('certificationEntries', 'certification-entry-template', 'Certification');
                    const cards = document.querySelectorAll('#certificationEntries .entry-card');
                    const card = cards[cards.length - 1];
                    setCardField(card, 'cert_name[]', cert.name);
                    setCardField(card, 'cert_issuer[]', cert.issuer);
                    setCardField(card, 'cert_issue_date[]', cert.issue_date);
                });
            }

            if (Array.isArray(data.experience)) {
                data.experience.forEach(function (exp) {
                    addEntryCard('experienceEntries', 'experience-entry-template', 'Experience');
                    const cards = document.querySelectorAll('#experienceEntries .entry-card');
                    const card = cards[cards.length - 1];
                    setCardField(card, 'exp_job_title[]', exp.job_title);
                    setCardField(card, 'exp_company[]', exp.company);
                    setCardField(card, 'exp_start_date[]', exp.start_date);
                    setCardField(card, 'exp_end_date[]', exp.end_date);
                    const bulletsWrapper = card.querySelector('.exp-bullets-wrapper');
                    if (bulletsWrapper && Array.isArray(exp.bullets)) bulletsWrapper._setTags(exp.bullets);
                });
            }

            const blocked = data.blocked || {};
            if (blockedIndustriesWrapper && Array.isArray(blocked.blocked_industries)) blockedIndustriesWrapper._setTags(blocked.blocked_industries);
            if (workStyleWrapper && Array.isArray(blocked.work_style)) workStyleWrapper._setTags(blocked.work_style);
            if (blockedCompaniesWrapper && Array.isArray(blocked.blocked_companies)) blockedCompaniesWrapper._setTags(blocked.blocked_companies);
            if (blockedTitlesWrapper && Array.isArray(blocked.blocked_titles)) blockedTitlesWrapper._setTags(blocked.blocked_titles);
            if (blockedDetailsWrapper && Array.isArray(blocked.blocked_details)) blockedDetailsWrapper._setTags(blocked.blocked_details);

        } catch (err) {
            console.error('Failed to load user info:', err);
        }
    }

    function setValue(id, value) {
        const el = document.getElementById(id);
        if (el && value != null) el.value = value;
    }

    function setCardField(card, name, value) {
        const el = card.querySelector('[name="' + name + '"]');
        if (el && value != null) el.value = value;
    }

    // ── COLLECT & SAVE ─────────────────────────────────

    function collectFormData() {
        function getAll(name) {
            return Array.from(document.querySelectorAll('[name="' + name + '"]')).map(function (el) { return el.value; });
        }
        function getTagsFrom(wrapper) { return wrapper ? wrapper._getTags() : []; }

        var education = getAll('edu_degree[]').map(function (_, i) {
            var actWrappers = document.querySelectorAll('.edu-activities-wrapper');
            return {
                degree:      getAll('edu_degree[]')[i] || '',
                major:       getAll('edu_major[]')[i] || '',
                institution: getAll('edu_institution[]')[i] || '',
                start_year:  getAll('edu_start_year[]')[i] || null,
                end_year:    getAll('edu_end_year[]')[i] || null,
                gpa:         getAll('edu_gpa[]')[i] || '',
                honors:      getAll('edu_honors[]')[i] || '',
                activities:  actWrappers[i] ? actWrappers[i]._getTags() : [],
            };
        });

        var certifications = getAll('cert_name[]').map(function (_, i) {
            return {
                name:       getAll('cert_name[]')[i] || '',
                issuer:     getAll('cert_issuer[]')[i] || '',
                issue_date: getAll('cert_issue_date[]')[i] || null,
            };
        });

        var bulletsWrappers = document.querySelectorAll('.exp-bullets-wrapper');
        var experience = getAll('exp_job_title[]').map(function (_, i) {
            return {
                job_title:  getAll('exp_job_title[]')[i] || '',
                company:    getAll('exp_company[]')[i] || '',
                start_date: getAll('exp_start_date[]')[i] || null,
                end_date:   getAll('exp_end_date[]')[i] || null,
                bullets:    bulletsWrappers[i] ? bulletsWrappers[i]._getTags() : [],
            };
        });

        // Flat structure matching real table columns
        return {
            name:               document.getElementById('field-name')?.value || '',
            phone:              document.getElementById('field-phone')?.value || '',
            linkedin:           document.getElementById('field-linkedin')?.value || '',
            website:            document.getElementById('field-website')?.value || '',
            location:           document.getElementById('field-location')?.value || '',
            skills:             getTagsFrom(skillsWrapper),
            education:          education,
            certifications:     certifications,
            experience:         experience,
            // Blocked fields as flat top-level keys
            blocked_industries: getTagsFrom(blockedIndustriesWrapper),
            work_style:         getTagsFrom(workStyleWrapper),
            blocked_companies:  getTagsFrom(blockedCompaniesWrapper),
            blocked_titles:     getTagsFrom(blockedTitlesWrapper),
            blocked_details:    getTagsFrom(blockedDetailsWrapper),
        };
    }

    document.getElementById('infoForm')?.addEventListener('submit', async function (e) {
        e.preventDefault();
        var saveBtn = document.getElementById('saveInfoBtn');
        var originalHTML = saveBtn.innerHTML;

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

    // ── INIT ───────────────────────────────────────────
    loadUserInfo();

})();