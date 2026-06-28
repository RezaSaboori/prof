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
    const dropzone  = document.getElementById('resumeDropzone');
    const fileInput = document.getElementById('resumeFileInput');
    const uploadBtn = document.getElementById('resumeUploadBtn');
    const fileList  = document.getElementById('resumeFileList');
    const footer    = document.getElementById('resumeFooter');
    const sendBtn   = document.getElementById('resumeSendBtn');

    if (!dropzone || !fileInput || !uploadBtn || !fileList || !footer || !sendBtn) return;

    // ── Constants ─────────────────────────────────────────────────────────────
    const ALL_GLASS_CLASSES  = ['indigo-glass', 'purple-glass', 'teal-glass', 'green-glass', 'red-glass'];
    const POLL_INTERVAL_MS   = 3000;   // poll every 3 s
    const MIN_STATE_HOLD_MS  = 2000;   // minimum time to display each glass state
    const FETCH_TIMEOUT_MS   = 8000;   // abort fetch after 8 s
    const STATUS_URL         = '/dashboard/api/resume-status/';

    // ── State ─────────────────────────────────────────────────────────────────
    let activeUploads      = 0;
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
        if (hasError)                          return 'red-glass';
        if (resumeStatus === 3 || resumeStatus === 4) return 'green-glass';
        if (resumeStatus === 1 || resumeStatus === 2) return 'teal-glass';
        // status === 0 (or unknown)
        if (isDragOver || activeUploads > 0)   return 'purple-glass';
        return 'indigo-glass';
    }

    /**
     * Apply a glass class to the dropzone, respecting MIN_STATE_HOLD_MS.
     * If the minimum hold time hasn't elapsed, the update is deferred.
     */
    function applyGlass(newGlass) {
        if (newGlass === currentGlass) return;

        const now     = Date.now();
        const elapsed = now - lastStateChangeAt;

        if (elapsed >= MIN_STATE_HOLD_MS) {
            _setGlass(newGlass);
        } else {
            // Defer until the hold window expires.
            // IMPORTANT: do NOT capture newGlass — re-evaluate at fire time
            // so a stale deferred call never overwrites a fresher state.
            const delay = MIN_STATE_HOLD_MS - elapsed;
            setTimeout(() => {
                const fresh = resolveGlass(_cachedStatus, _hasError);
                _setGlass(fresh);
            }, delay);
        }
    }

    function _setGlass(newGlass) {
        if (newGlass === currentGlass) return;
        ALL_GLASS_CLASSES.forEach(cls => dropzone.classList.remove(cls));
        dropzone.classList.add(newGlass);
        currentGlass      = newGlass;
        lastStateChangeAt = Date.now();
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
    dropzone.addEventListener('dragenter', e => {
        e.preventDefault();
        isDragOver = true;
        dropzone.classList.add('drag-over');
        applyGlass(resolveGlass(_cachedStatus, _hasError));
    });

    dropzone.addEventListener('dragover', e => {
        e.preventDefault();
        if (!isDragOver) {
            isDragOver = true;
            dropzone.classList.add('drag-over');
            applyGlass(resolveGlass(_cachedStatus, _hasError));
        }
    });

    dropzone.addEventListener('dragleave', e => {
        e.preventDefault();
        isDragOver = false;
        dropzone.classList.remove('drag-over');
        applyGlass(resolveGlass(_cachedStatus, _hasError));
    });

    dropzone.addEventListener('drop', e => {
        e.preventDefault();
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
        if (fileDialogOpen) return;
        fileDialogOpen = true;
        fileInput.click();
    });

    window.addEventListener('focus', () => {
        setTimeout(() => { fileDialogOpen = false; }, 300);
    });

    fileInput.addEventListener('change', () => {
        fileDialogOpen = false;
        if (fileInput.files && fileInput.files.length > 0) {
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
        Array.from(files).forEach(file => {
            if (!isAccepted(file)) {
                alert(`"${file.name}" is not a supported format. Please upload a PDF file.`);
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

                // Immediately poll status — server sets status=1 after upload
                fetchResumeStatus();
            } else {
                fill.classList.add('upload-progress-bar__fill--error');
                dot.classList.remove('upload-status-dot--uploading');
                dot.classList.add('upload-status-dot--error');
                label.textContent  = 'Upload failed (' + xhr.status + ')';
                item.dataset.state = 'error';
                _hasError = true;
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
            _hasError = true;
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
            _cachedStatus = 1;
            _hasError     = false;
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
    startPolling();

})();