/**
 * upload.js
 * Handles master resume drag-and-drop / click upload for infos.html.
 *
 * Glass state machine for #resumeDropzone:
 *   indigo-glass  → status=0, idle
 *   purple-glass  → status=0 + drag-over OR file is currently uploading
 *   teal-glass    → status=1 or 2  (processing / extracting)
 *   green-glass   → status=3 or 4  (complete / confirmed)
 *   red-glass     → any fetch/network error
 *
 * Polling: every 3 s while page is visible; min display time 2 s per state.
 */

(function () {
    'use strict';

    // ── DOM refs ──────────────────────────────────────────────────────────────
    const dropzone    = document.getElementById('resumeDropzone');
    const fileInput   = document.getElementById('resumeFileInput');
    const uploadBtn   = document.getElementById('resumeUploadBtn');
    const fileList    = document.getElementById('resumeFileList');
    const footer      = document.getElementById('resumeFooter');
    const sendBtn     = document.getElementById('resumeSendBtn');
    const heroIconImg = document.getElementById('resumeHeroIconImg'); // status-driven icon

    if (!dropzone || !fileInput || !uploadBtn || !fileList || !footer || !sendBtn) return;

    // ── Constants ─────────────────────────────────────────────────────────────
    const ALL_GLASS_CLASSES  = ['indigo-glass', 'purple-glass', 'teal-glass', 'green-glass', 'red-glass'];
    const POLL_INTERVAL_MS   = 3000;   // poll every 3 s
    const MIN_STATE_HOLD_MS  = 2000;   // minimum time to display each glass state
    const FETCH_TIMEOUT_MS   = 8000;   // abort fetch after 8 s
    const STATUS_URL         = '/dashboard/api/resume-status/';

    // ── Upload hero status names ───────────────────────────────────────────────
    // Each glass class maps to a named status for clarity across the codebase.
    //   uploading  → indigo-glass / purple-glass  (idle or file in-flight)
    //   analyzing  → teal-glass                   (server processing, status 1–2)
    //   extracted  → green-glass                  (complete / confirmed, status 3–4)
    //   error      → red-glass                    (network or XHR-level failure)
    const UPLOAD_HERO_STATUS = {
        UPLOADING: 'uploading',   // indigo-glass (idle) or purple-glass (active upload / drag)
        ANALYZING: 'analyzing',   // teal-glass
        EXTRACTED: 'extracted',   // green-glass
        ERROR:     'error',       // red-glass
    };

    // ── Upload hero status → icon mapping ─────────────────────────────────────
    // Maps each named upload hero status to its corresponding SVG icon file.
    const UPLOAD_HERO_ICON = {
        [UPLOAD_HERO_STATUS.UPLOADING]: '/static/img/document.svg',
        [UPLOAD_HERO_STATUS.ANALYZING]: '/static/img/process.svg',
        [UPLOAD_HERO_STATUS.EXTRACTED]: '/static/img/confirm.svg',
        [UPLOAD_HERO_STATUS.ERROR]:     '/static/img/error.svg',
    };

    // ── Upload hero status → label & hints content ────────────────────────────
    // Maps each named upload hero status to the drag-label HTML and hints spans.
    const UPLOAD_HERO_CONTENT = {
        [UPLOAD_HERO_STATUS.UPLOADING]: {
            label: 'Drag &amp; Drop here<br>or <button type="button" class="upload-choose-btn" id="resumeUploadBtn" aria-label="Choose resume file to upload">choose file</button>',
            hints: [
                'Upload your Resume in PDF format (max 15 MB).',
                'Our system will automatically extract your information — this takes a few minutes. Come back here to review and confirm before our agents start working.',
            ],
        },
        [UPLOAD_HERO_STATUS.ANALYZING]: {
            label: 'AI Processing<br>in Progress',
            hints: [
                'Our AI agents are extracting and organizing your information.',
                'This may take a few minutes. <strong>You can leave this page and return later</strong> — your progress will be saved automatically.',
            ],
        },
        [UPLOAD_HERO_STATUS.EXTRACTED]: {
            label: 'Review and<br>Confirm',
            hints: [
                'We\'ve extracted the key information from your resume.',
                'Please <strong>review, edit, and confirm your details</strong> before we continue. This helps ensure the highest accuracy before our agents proceed.',
            ],
        },
        [UPLOAD_HERO_STATUS.ERROR]: {
            label: 'Drag &amp; Drop here<br>or <button type="button" class="upload-choose-btn" id="resumeUploadBtn" aria-label="Choose resume file to upload">choose file</button>',
            hints: [
                'Upload your Resume in PDF format (max 15 MB).',
                'Our system will automatically extract your information — this takes a few minutes. Come back here to review and confirm before our agents start working.',
            ],
        },
    };

    // ── State ─────────────────────────────────────────────────────────────────
    let activeUploads      = 0;   // files currently in-flight (XHR not yet settled)
    let hasUploadedFile    = false; // ≥1 file card is in 'done' state, Send not clicked
    let hasFileError       = false; // ≥1 file card is in 'error' state (XHR-level error)
    let isDragOver         = false;
    let currentGlass       = 'indigo-glass';
    let lastStateChangeAt  = Date.now();
    let pollTimer          = null;
    let fetchController    = null;   // AbortController for in-flight status fetch

    // ── Helpers ───────────────────────────────────────────────────────────────
    function getCsrfToken() {
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) return meta.getAttribute('content');
        const match = document.cookie.match(/csrftoken=([^;]+)/);
        return match ? match[1] : '';
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + 'KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function isAccepted(file) {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        return file.type === 'application/pdf' || ext === '.pdf';
    }

    // ── Glass state machine ───────────────────────────────────────────────────

    /**
     * Resolve which glass class SHOULD be applied right now based on
     * resumeStatus + interaction flags, without touching the DOM yet.
     */
    function resolveGlass(resumeStatus, hasError) {
        // Poll/network error (status unreachable)
        if (hasError)                                    return 'red-glass';
        // Server-confirmed terminal states
        if (resumeStatus === 3 || resumeStatus === 4)    return 'green-glass';
        if (resumeStatus === 1 || resumeStatus === 2)    return 'teal-glass';
        // status === 0: XHR-level file error — keep red until file is deleted
        if (hasFileError)                                return 'red-glass';
        // status === 0: any active interaction keeps purple
        // (uploading, drag-over, or file uploaded but Send not yet clicked)
        if (isDragOver || activeUploads > 0 || hasUploadedFile) return 'purple-glass';
        return 'indigo-glass';
    }

    // Single pending deferred-glass timer — only one can be queued at a time.
    let _pendingGlassTimer = null;

    /**
     * Apply a glass class to the dropzone, respecting MIN_STATE_HOLD_MS.
     *
     * Rules:
     *  1. If newGlass === currentGlass → no-op.
     *  2. If the current state has been shown for >= MIN_STATE_HOLD_MS → apply immediately.
     *  3. Otherwise → cancel any existing pending timer and schedule ONE new deferred
     *     evaluation. At fire time, re-evaluate resolveGlass() from live state —
     *     never use a captured value.
     *  4. A deferred timer will NEVER downgrade to indigo/purple while
     *     isDragOver=true or activeUploads>0 — those flags are re-checked live.
     */
    function applyGlass(newGlass) {
        if (newGlass === currentGlass) return;

        const elapsed = Date.now() - lastStateChangeAt;

        if (elapsed >= MIN_STATE_HOLD_MS) {
            _cancelPendingGlass();
            _setGlass(newGlass);
        } else {
            // Cancel any previously scheduled deferred evaluation —
            // only the most-recent intended transition should fire.
            _cancelPendingGlass();
            const delay = MIN_STATE_HOLD_MS - elapsed;
            _pendingGlassTimer = setTimeout(() => {
                _pendingGlassTimer = null;
                // Re-evaluate live — never use the captured newGlass.
                _setGlass(resolveGlass(_cachedStatus, _hasError));
            }, delay);
        }
    }

    function _cancelPendingGlass() {
        if (_pendingGlassTimer !== null) {
            clearTimeout(_pendingGlassTimer);
            _pendingGlassTimer = null;
        }
    }

    /**
     * Reveals the upload hero for the first time after the stage is known.
     * Runs once — subsequent calls are no-ops once the hero is revealed.
     */
    function _revealHeroIfPending() {
        if (!dropzone.classList.contains('upload-hero--pending')) return;
        dropzone.classList.remove('upload-hero--pending');
        dropzone.classList.add('upload-hero--revealed');
        // Clean up the revealed class after the animation completes
        dropzone.addEventListener('animationend', function onRevealEnd() {
            dropzone.classList.remove('upload-hero--revealed');
            dropzone.removeEventListener('animationend', onRevealEnd);
        });
    }

    function _setGlass(newGlass) {
        if (newGlass === currentGlass && !dropzone.classList.contains('upload-hero--pending')) return;

        // Is this the very first reveal? Capture before committing glass.
        const isFirstReveal = dropzone.classList.contains('upload-hero--pending');

        ALL_GLASS_CLASSES.forEach(cls => dropzone.classList.remove(cls));
        dropzone.classList.add(newGlass);
        currentGlass      = newGlass;
        lastStateChangeAt = Date.now();

        // When status reaches green-glass (status 3/4), force the info-form to reload.
        if (newGlass === 'green-glass' && typeof window._reloadInfoForm === 'function') {
            window._reloadInfoForm();
        }

        // ── Sync upload hero icon + content to the new glass status ───────
        {
            let heroStatus;
            if (newGlass === 'teal-glass') {
                heroStatus = UPLOAD_HERO_STATUS.ANALYZING;
            } else if (newGlass === 'green-glass') {
                heroStatus = UPLOAD_HERO_STATUS.EXTRACTED;
            } else if (newGlass === 'red-glass') {
                heroStatus = UPLOAD_HERO_STATUS.ERROR;
            } else {
                heroStatus = UPLOAD_HERO_STATUS.UPLOADING;
            }

            const heroContent = UPLOAD_HERO_CONTENT[heroStatus];
            const dragLabelEl = document.getElementById('resumeHeroDragLabel');
            const hintsEl     = document.getElementById('resumeHeroHints');
            const targets     = [heroIconImg, dragLabelEl, hintsEl].filter(Boolean);
            const EXIT_MS     = 300;

            if (isFirstReveal) {
                // First reveal: the hero is invisible — swap content instantly
                // with no exit animation, then reveal the whole hero.
                if (heroIconImg) heroIconImg.src = UPLOAD_HERO_ICON[heroStatus];
                if (dragLabelEl && heroContent) {
                    dragLabelEl.innerHTML = heroContent.label;
                    const newUploadBtn = dragLabelEl.querySelector('#resumeUploadBtn');
                    if (newUploadBtn) {
                        newUploadBtn.addEventListener('click', e => {
                            e.stopPropagation();
                            if (!isDropAllowed()) return;
                            if (fileDialogOpen) return;
                            fileDialogOpen = true;
                            fileInput.click();
                        });
                    }
                }
                if (hintsEl && heroContent) {
                    hintsEl.innerHTML = heroContent.hints
                        .map(h => `<span>${h}</span>`)
                        .join('');
                }
                // Reveal the hero with scale+blur animation
                _revealHeroIfPending();
            } else {
                // Normal transition: exit → swap → enter
                // Phase 1 — exit: scale up + blur out all three elements together
                targets.forEach(el => {
                    el.classList.remove('upload-hero-content--entering');
                    el.classList.add('upload-hero-content--exiting');
                });

                // Phase 2 — after exit completes: swap content then enter
                setTimeout(() => {
                    if (heroIconImg) heroIconImg.src = UPLOAD_HERO_ICON[heroStatus];

                    if (dragLabelEl && heroContent) {
                        dragLabelEl.innerHTML = heroContent.label;
                        const newUploadBtn = dragLabelEl.querySelector('#resumeUploadBtn');
                        if (newUploadBtn) {
                            newUploadBtn.addEventListener('click', e => {
                                e.stopPropagation();
                                if (!isDropAllowed()) return;
                                if (fileDialogOpen) return;
                                fileDialogOpen = true;
                                fileInput.click();
                            });
                        }
                    }

                    if (hintsEl && heroContent) {
                        hintsEl.innerHTML = heroContent.hints
                            .map(h => `<span>${h}</span>`)
                            .join('');
                    }

                    targets.forEach(el => {
                        el.classList.remove('upload-hero-content--exiting');
                        el.classList.add('upload-hero-content--entering');
                    });

                    setTimeout(() => {
                        targets.forEach(el => el.classList.remove('upload-hero-content--entering'));
                    }, 450);
                }, EXIT_MS);
            }
        }
    }

    /**
     * Recount hasUploadedFile and hasFileError from the live DOM.
     * Called whenever a file card is removed so flags stay accurate.
     */
    function _recountFileFlags() {
        const cards = fileList.querySelectorAll('.upload-file-item');
        hasUploadedFile = Array.from(cards).some(c => c.dataset.state === 'done');
        hasFileError    = Array.from(cards).some(c => c.dataset.state === 'error');
    }

    // ── Status polling ────────────────────────────────────────────────────────

    let _cachedStatus = 0;
    let _hasError     = false;

    async function fetchResumeStatus() {
        // Cancel any previous in-flight request
        if (fetchController) fetchController.abort();
        fetchController = new AbortController();

        const timeoutId = setTimeout(() => fetchController.abort(), FETCH_TIMEOUT_MS);

        try {
            const resp = await fetch(STATUS_URL, {
                method:  'GET',
                headers: { 'X-CSRFToken': getCsrfToken() },
                signal:  fetchController.signal,
            });

            clearTimeout(timeoutId);

            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }

            const data = await resp.json();

            if (data.error) {
                throw new Error(data.error);
            }

            _cachedStatus = typeof data.original_resume_status === 'number'
                ? data.original_resume_status
                : 0;
            _hasError = false;

        } catch (err) {
            clearTimeout(timeoutId);

            if (err.name === 'AbortError') {
                // Aborted intentionally (new request started or tab hidden) — not an error
                return;
            }

            console.warn('[upload] resume status fetch failed:', err.message);
            _hasError = true;
        }

        applyGlass(resolveGlass(_cachedStatus, _hasError));
    }

    function startPolling() {
        if (pollTimer !== null) return;   // already running
        fetchResumeStatus();              // immediate first call
        pollTimer = setInterval(fetchResumeStatus, POLL_INTERVAL_MS);
    }

    function stopPolling() {
        if (pollTimer !== null) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
        if (fetchController) {
            fetchController.abort();
            fetchController = null;
        }
    }

    // Pause polling when the tab is hidden; resume when visible again
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopPolling();
        } else {
            startPolling();
        }
    });


    // ── Drag events ───────────────────────────────────────────────────────────

    /**
     * Drag-and-drop and file selection are only permitted when the upload hero
     * is in uploading status (original_resume_status === 0 ).
     * Any other status silently blocks all interaction.
     */
    function isDropAllowed() {
        return _cachedStatus === 0;
    }

    dropzone.addEventListener('dragenter', e => {
        e.preventDefault();
        if (!isDropAllowed()) return;
        isDragOver = true;
        dropzone.classList.add('drag-over');
        applyGlass(resolveGlass(_cachedStatus, _hasError));
    });

    dropzone.addEventListener('dragover', e => {
        e.preventDefault();
        if (!isDropAllowed()) return;
        if (!isDragOver) {
            isDragOver = true;
            dropzone.classList.add('drag-over');
            applyGlass(resolveGlass(_cachedStatus, _hasError));
        }
    });

    dropzone.addEventListener('dragleave', e => {
        e.preventDefault();
        if (!isDropAllowed()) return;
        isDragOver = false;
        dropzone.classList.remove('drag-over');
        applyGlass(resolveGlass(_cachedStatus, _hasError));
    });

    dropzone.addEventListener('drop', e => {
        e.preventDefault();
        if (!isDropAllowed()) return;
        isDragOver = false;
        dropzone.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
        // Glass update deferred to uploadFile() which sets activeUploads
    });

    // ── File input ────────────────────────────────────────────────────────────
    // Move fileInput outside dropzone to prevent click loop
    document.body.appendChild(fileInput);
    let fileDialogOpen = false;

    uploadBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (!isDropAllowed()) return;
        if (fileDialogOpen) return;
        fileDialogOpen = true;
        fileInput.click();
    });

    window.addEventListener('focus', () => {
        setTimeout(() => { fileDialogOpen = false; }, 300);
    });

    fileInput.addEventListener('change', () => {
        fileDialogOpen = false;
        if (isDropAllowed() && fileInput.files && fileInput.files.length > 0) {
            handleFiles(fileInput.files);
        }
        fileInput.value = '';
    });

    // ── Footer state ──────────────────────────────────────────────────────────
    function updateFooterState() {
        const hasFiles = fileList.children.length > 0;
        if (hasFiles) {
            footer.classList.remove('upload-hero__footer--hidden');
        } else {
            footer.classList.add('upload-hero__footer--hidden');
        }
        sendBtn.disabled = activeUploads > 0;
    }

    // ── File item card ────────────────────────────────────────────────────────
    function createFileItem(file) {
        const totalFmt = formatSize(file.size);
        const item     = document.createElement('div');
        item.className = 'upload-file-item glass';
        item.dataset.state = 'uploading';
        item.setAttribute('role', 'listitem');

        item.innerHTML = `
            <div class="upload-file-item__icon" aria-hidden="true">
                <img src="/static/img/pdf.svg" alt="" width="28" height="28">
            </div>
            <div class="upload-file-item__content">
                <div class="upload-file-item__header">
                    <div class="upload-file-item__name" title="${file.name}">${file.name}</div>
                    <div class="upload-file-item__actions">
                        <button type="button" class="upload-action-btn upload-action-btn--delete" aria-label="Remove file" title="Remove">
                            <i class="fa-regular fa-trash-can"></i>
                        </button>
                    </div>
                </div>
                <div class="upload-file-item__progress-row">
                    <div class="upload-file-item__status-line">
                        <span class="upload-file-size">0KB of ${totalFmt}</span>
                        <span class="upload-status-dot upload-status-dot--uploading"></span>
                        <span class="upload-progress-label">Uploading ...</span>
                    </div>
                    <div class="upload-progress-bar" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" aria-label="Upload progress for ${file.name}">
                        <div class="upload-progress-bar__fill"></div>
                    </div>
                </div>
            </div>
        `;

        fileList.appendChild(item);
        return item;
    }

    // ── Handle files ──────────────────────────────────────────────────────────
    function handleFiles(files) {
        if (!isDropAllowed()) return;
        Array.from(files).forEach(file => {
            if (!isAccepted(file)) {
                window.notify({
                    type:     'error',
                    category: 'Error',
                    body:     `"${file.name}" is not a supported format. Please upload a PDF file.`,
                });
                return;
            }
            uploadFile(file);
        });
    }

    // ── Upload a single file ──────────────────────────────────────────────────
    function uploadFile(file) {
        const item       = createFileItem(file);
        const fill       = item.querySelector('.upload-progress-bar__fill');
        const bar        = item.querySelector('.upload-progress-bar');
        const dot        = item.querySelector('.upload-status-dot');
        const label      = item.querySelector('.upload-progress-label');
        const sizeEl     = item.querySelector('.upload-file-size');
        const deleteBtn  = item.querySelector('.upload-action-btn--delete');
        const totalBytes = file.size;

        activeUploads++;
        updateFooterState();
        applyGlass(resolveGlass(_cachedStatus, _hasError));

        const formData = new FormData();
        formData.append('resume', file);

        const xhr = new XMLHttpRequest();

        deleteBtn.addEventListener('click', () => {
            xhr.abort();
            item.remove();
            activeUploads = Math.max(0, activeUploads - 1);
            // Recount file-level flags from remaining DOM cards
            _recountFileFlags();
            updateFooterState();
            applyGlass(resolveGlass(_cachedStatus, _hasError));
        });

        xhr.upload.addEventListener('progress', e => {
            if (!e.lengthComputable) return;
            const pct    = Math.round((e.loaded / e.total) * 100);
            const loaded = formatSize(e.loaded);
            const total  = formatSize(totalBytes);
            fill.style.width = pct + '%';
            bar.setAttribute('aria-valuenow', pct);
            sizeEl.textContent = loaded + ' of ' + total;
            label.textContent  = 'Uploading ...';
        });

        xhr.addEventListener('load', () => {
            activeUploads = Math.max(0, activeUploads - 1);

            if (xhr.status >= 200 && xhr.status < 300) {
                fill.style.width = '100%';
                fill.classList.add('upload-progress-bar__fill--complete');
                bar.setAttribute('aria-valuenow', 100);
                dot.classList.remove('upload-status-dot--uploading');
                dot.classList.add('upload-status-dot--done');
                sizeEl.textContent = formatSize(totalBytes) + ' of ' + formatSize(totalBytes);
                label.textContent  = 'Uploaded';
                item.dataset.state = 'done';
                hasUploadedFile = true;   // keep purple until Send is clicked
            } else {
                fill.classList.add('upload-progress-bar__fill--error');
                dot.classList.remove('upload-status-dot--uploading');
                dot.classList.add('upload-status-dot--error');
                label.textContent  = 'Upload failed (' + xhr.status + ')';
                item.dataset.state = 'error';
                hasFileError = true;      // XHR-level error — NOT a poll error
            }

            updateFooterState();
            applyGlass(resolveGlass(_cachedStatus, _hasError));
        });

        xhr.addEventListener('error', () => {
            activeUploads = Math.max(0, activeUploads - 1);
            fill.classList.add('upload-progress-bar__fill--error');
            dot.classList.remove('upload-status-dot--uploading');
            dot.classList.add('upload-status-dot--error');
            label.textContent  = 'Upload failed — check your connection';
            item.dataset.state = 'error';
            hasFileError = true;          // XHR-level error — NOT a poll error
            updateFooterState();
            applyGlass(resolveGlass(_cachedStatus, _hasError));
        });

        xhr.addEventListener('abort', () => {
            // Item already removed by deleteBtn handler; nothing extra needed
        });

        xhr.open('POST', '/dashboard/api/upload-resume/');
        xhr.setRequestHeader('X-CSRFToken', getCsrfToken());
        xhr.send(formData);
    }

    // ── Send button ───────────────────────────────────────────────────────────
    sendBtn.addEventListener('click', async () => {
        if (sendBtn.disabled) return;

        sendBtn.disabled    = true;
        sendBtn.textContent = 'Sending...';

        try {
            const resp = await fetch('/dashboard/api/resume-status/set/', {
                method:  'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken':  getCsrfToken(),
                },
                body: JSON.stringify({ original_resume_status: 1 }),
            });

            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }

            const data = await resp.json();
            if (data.error) throw new Error(data.error);

            sendBtn.textContent = 'Sent';
            _cachedStatus   = 1;
            _hasError       = false;
            hasUploadedFile = false;   // Send consumed the uploaded state
            applyGlass(resolveGlass(_cachedStatus, _hasError));
            fetchResumeStatus();   // confirm server state immediately

        } catch (err) {
            console.error('[upload] send failed:', err.message);
            sendBtn.textContent = 'Retry';
            sendBtn.disabled    = false;
            _hasError = true;
            applyGlass(resolveGlass(_cachedStatus, _hasError));
        }
    });

    // ── Bootstrap ─────────────────────────────────────────────────────────────
    // The hero starts hidden via upload-hero--pending set directly in the HTML.
    // initHeroIcon is intentionally skipped — _setGlass handles all content
    // on first reveal so there is never a flash of the wrong state.

    startPolling();

})();

// ── Notify Modal ─────────────────────────────────────────────────────────────
// Usage: window.notify({ type, category, title, body, okLabel })
//   type      : 'error' | 'warning' | 'success' | 'info'  (default: 'info')
//   category  : string shown in the header (e.g. 'Error', 'Warning')
//   title     : optional string — shown as a sub-heading if provided
//   body      : required string — the message text
//   okLabel   : optional button label (default: 'OK')
(function () {
    'use strict';

    function initNotifyModal() {
        const overlay    = document.getElementById('notifyModalOverlay');
        const panel      = overlay ? overlay.querySelector('.notify-modal-panel') : null;
        const categoryEl = document.getElementById('notifyModalCategory');
        const titleEl    = document.getElementById('notifyModalTitle');
        const bodyEl     = document.getElementById('notifyModalBody');
        const okBtn      = document.getElementById('notifyModalOkBtn');
        const closeBtn   = overlay ? overlay.querySelector('.auth-modal-close') : null;

        if (!overlay || !panel || !categoryEl || !titleEl || !bodyEl || !okBtn || !closeBtn) return;

        function openNotify(options) {
            const type     = options.type     || 'info';
            const category = options.category || (type.charAt(0).toUpperCase() + type.slice(1));
            const title    = options.title    || '';
            const body     = options.body     || '';
            const okLabel  = options.okLabel  || 'OK';

            panel.dataset.type     = type;
            categoryEl.textContent = category;
            bodyEl.textContent     = body;
            okBtn.textContent      = okLabel;

            if (title) {
                titleEl.textContent = title;
                titleEl.hidden      = false;
            } else {
                titleEl.textContent = '';
                titleEl.hidden      = true;
            }

            overlay.hidden = false;
            okBtn.focus();
        }

        function closeNotify() {
            overlay.hidden = true;
            panel.removeAttribute('data-type');
        }

        okBtn.addEventListener('click', closeNotify);
        closeBtn.addEventListener('click', closeNotify);

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) closeNotify();
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !overlay.hidden) closeNotify();
        });

        window.notify = openNotify;
    }

    document.addEventListener('DOMContentLoaded', initNotifyModal);
})();