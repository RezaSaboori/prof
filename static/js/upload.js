/**
 * upload.js
 * Handles master resume drag-and-drop / click upload for infos.html
 * Depends on: upload.css, Django CSRF cookie
 */

(function () {
    'use strict';

    // ── DOM refs ──────────────────────────────────────────────────────────────
    const dropzone  = document.getElementById('resumeDropzone');
    const dropTarget = dropzone;
    const fileInput = document.getElementById('resumeFileInput');
    const uploadBtn = document.getElementById('resumeUploadBtn');
    const fileList  = document.getElementById('resumeFileList');

    if (!dropzone || !dropTarget || !fileInput || !uploadBtn || !fileList) return;

    // ── CSRF helper ───────────────────────────────────────────────────────────
    function getCsrfToken() {
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) return meta.getAttribute('content');
        const match = document.cookie.match(/csrftoken=([^;]+)/);
        return match ? match[1] : '';
    }

    // ── Accepted MIME types / extensions ─────────────────────────────────────
    const ACCEPTED_TYPES = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    const ACCEPTED_EXT = ['.pdf', '.doc', '.docx'];

    function isAccepted(file) {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        return ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXT.includes(ext);
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    // ── Drag events — attached to the whole hero card for wide drop target ────
    dropzone.addEventListener('dragenter', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragover',  e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', e => { e.preventDefault(); dropzone.classList.remove('drag-over'); });
    dropzone.addEventListener('drop', e => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });

    // ── Move fileInput outside the dropzone to prevent click bubbling loops ──
    document.body.appendChild(fileInput);
    // ── Guard against double-open (some browsers fire click twice) ───────────
    let fileDialogOpen = false;

    // ── Upload button — ONLY trigger for click-to-browse ─────────────────────
    uploadBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (fileDialogOpen) return;
        fileDialogOpen = true;
        fileInput.click();
    });

    // ── Reset guard only when the file dialog truly closes (window regains focus) ──
    window.addEventListener('focus', () => {
        setTimeout(() => { fileDialogOpen = false; }, 300);
    });

    // ── File input change ─────────────────────────────────────────────────────
    fileInput.addEventListener('change', () => {
        fileDialogOpen = false;
        if (fileInput.files && fileInput.files.length > 0) {
            handleFiles(fileInput.files);
        }
        fileInput.value = '';
    });

    // ── Build file item card ──────────────────────────────────────────────────
    function createFileItem(file) {
        const item = document.createElement('div');
        item.className = 'upload-file-item glass';
        item.dataset.state = 'uploading';
        item.setAttribute('role', 'listitem');

        item.innerHTML = `
            <div class="upload-file-item__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                </svg>
            </div>

            <div class="upload-file-item__name" title="${file.name}">${file.name}</div>

            <div class="upload-file-item__actions">
                <button type="button" class="upload-action-btn upload-action-btn--cancel" aria-label="Cancel upload" title="Cancel">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                </button>
                <button type="button" class="upload-action-btn upload-action-btn--delete" aria-label="Delete file" title="Delete">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
                        <path d="M9 6V4h6v2"/>
                    </svg>
                </button>
                <button type="button" class="upload-action-btn upload-action-btn--accept" aria-label="Accept file" title="Accept">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </button>
                <span class="upload-accepted-badge" aria-live="polite">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Saved
                </span>
            </div>

            <div class="upload-file-item__progress-row">
                <div class="upload-file-item__meta">
                    <span class="upload-file-size">${formatSize(file.size)}</span>
                </div>
                <div class="upload-progress-bar" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" aria-label="Upload progress for ${file.name}">
                    <div class="upload-progress-bar__fill"></div>
                </div>
                <span class="upload-progress-label">Uploading…</span>
            </div>
        `;

        fileList.appendChild(item);
        return item;
    }

    // ── Handle files ──────────────────────────────────────────────────────────
    function handleFiles(files) {
        Array.from(files).forEach(file => {
            if (!isAccepted(file)) {
                alert(`"${file.name}" is not a supported format. Please upload a PDF, DOC or DOCX file.`);
                return;
            }
            uploadFile(file);
        });
    }

    function uploadFile(file) {
        const item      = createFileItem(file);
        const fill      = item.querySelector('.upload-progress-bar__fill');
        const label     = item.querySelector('.upload-progress-label');
        const bar       = item.querySelector('.upload-progress-bar');
        const cancelBtn = item.querySelector('.upload-action-btn--cancel');
        const deleteBtn = item.querySelector('.upload-action-btn--delete');
        const acceptBtn = item.querySelector('.upload-action-btn--accept');

        const formData = new FormData();
        formData.append('resume', file);

        const xhr = new XMLHttpRequest();

        cancelBtn.addEventListener('click', () => {
            xhr.abort();
            item.remove();
        });

        deleteBtn.addEventListener('click', () => {
            if (confirm(`Delete "${file.name}"?`)) item.remove();
        });

        acceptBtn.addEventListener('click', () => {
            item.dataset.state = 'accepted';
            label.textContent  = file.name + ' ready';
        });

        xhr.upload.addEventListener('progress', e => {
            if (!e.lengthComputable) return;
            const pct = Math.round((e.loaded / e.total) * 100);
            fill.style.width = pct + '%';
            bar.setAttribute('aria-valuenow', pct);
            label.textContent = `Uploading… ${pct}%`;
        });

        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                fill.style.width = '100%';
                fill.classList.add('upload-progress-bar__fill--complete');
                bar.setAttribute('aria-valuenow', 100);
                label.textContent = 'Upload complete — click ✓ to accept';
                item.dataset.state = 'done';
            } else {
                fill.style.backgroundColor = 'var(--color-red)';
                label.textContent = `Upload failed (${xhr.status})`;
                item.dataset.state = 'error';
            }
        });

        xhr.addEventListener('error', () => {
            label.textContent = 'Upload failed — check your connection';
            fill.style.backgroundColor = 'var(--color-red)';
        });

        xhr.addEventListener('abort', () => {
            label.textContent = 'Cancelled';
        });

        xhr.open('POST', '/dashboard/api/upload-resume/');
        xhr.setRequestHeader('X-CSRFToken', getCsrfToken());
        xhr.send(formData);
    }

    // ── Send button ───────────────────────────────────────────────────────────
    const sendBtn = document.getElementById('resumeSendBtn');
    if (sendBtn) {
        sendBtn.addEventListener('click', () => {
            const accepted = fileList.querySelector('[data-state="accepted"], [data-state="done"]');
            if (!accepted) {
                alert('Please upload and confirm a resume file first.');
            } else {
                // Hook into your backend submit flow here
                sendBtn.textContent = 'Sent ✓';
                sendBtn.disabled = true;
            }
        });
    }

})();