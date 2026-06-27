/**
 * upload.js
 * Handles master resume drag-and-drop / click upload for infos.html
 * Depends on: upload.css, Font Awesome (fa-regular fa-file-pdf / fa-file-word)
 */

(function () {
    'use strict';

    const dropzone  = document.getElementById('resumeDropzone');
    const fileInput = document.getElementById('resumeFileInput');
    const uploadBtn = document.getElementById('resumeUploadBtn');
    const fileList  = document.getElementById('resumeFileList');
    const footer    = document.getElementById('resumeFooter');
    const sendBtn   = document.getElementById('resumeSendBtn');

    if (!dropzone || !fileInput || !uploadBtn || !fileList || !footer || !sendBtn) return;

    // Track active uploads to manage Send button state
    let activeUploads = 0;

    function getCsrfToken() {
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) return meta.getAttribute('content');
        const match = document.cookie.match(/csrftoken=([^;]+)/);
        return match ? match[1] : '';
    }

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

    function getFileExt(file) {
        return file.name.split('.').pop().toLowerCase();
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + 'KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function getFileIconClass(file) {
        const ext = getFileExt(file);
        if (ext === 'pdf') return 'fa-regular fa-file-pdf';
        return 'fa-regular fa-file-word';
    }

    function updateFooterState() {
        const hasFiles = fileList.children.length > 0;
        if (hasFiles) {
            footer.classList.remove('upload-hero__footer--hidden');
        } else {
            footer.classList.add('upload-hero__footer--hidden');
        }
        sendBtn.disabled = activeUploads > 0;
    }

    // ── Drag events ──────────────────────────────────────────────────────────
    dropzone.addEventListener('dragenter', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragover',  e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', e => { e.preventDefault(); dropzone.classList.remove('drag-over'); });
    dropzone.addEventListener('drop', e => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });

    // ── Move fileInput outside dropzone to prevent click loop ────────────────
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

    // ── Build file item card ─────────────────────────────────────────────────
    function createFileItem(file) {
        const totalBytes = file.size;
        const totalFmt   = formatSize(totalBytes);
        const iconClass  = getFileIconClass(file);

        const item = document.createElement('div');
        item.className = 'upload-file-item glass';
        item.dataset.state = 'uploading';
        item.setAttribute('role', 'listitem');

        item.innerHTML = `
            <div class="upload-file-item__icon" aria-hidden="true">
                <i class="${iconClass}"></i>
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

    // ── Handle files ─────────────────────────────────────────────────────────
    function handleFiles(files) {
        Array.from(files).forEach(file => {
            if (!isAccepted(file)) {
                alert(`"${file.name}" is not a supported format. Please upload a PDF, DOC or DOCX file.`);
                return;
            }
            uploadFile(file);
        });
    }

    // ── Upload a single file ─────────────────────────────────────────────────
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

        const formData = new FormData();
        formData.append('resume', file);

        const xhr = new XMLHttpRequest();

        deleteBtn.addEventListener('click', () => {
            xhr.abort();
            item.remove();
            activeUploads = Math.max(0, activeUploads - 1);
            updateFooterState();
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
            } else {
                fill.classList.add('upload-progress-bar__fill--error');
                dot.classList.remove('upload-status-dot--uploading');
                dot.classList.add('upload-status-dot--error');
                label.textContent  = 'Upload failed (' + xhr.status + ')';
                item.dataset.state = 'error';
            }
            updateFooterState();
        });

        xhr.addEventListener('error', () => {
            activeUploads = Math.max(0, activeUploads - 1);
            fill.classList.add('upload-progress-bar__fill--error');
            dot.classList.remove('upload-status-dot--uploading');
            dot.classList.add('upload-status-dot--error');
            label.textContent  = 'Upload failed — check your connection';
            item.dataset.state = 'error';
            updateFooterState();
        });

        xhr.addEventListener('abort', () => {
            // item already removed in deleteBtn click handler
        });

        xhr.open('POST', '/dashboard/api/upload-resume/');
        xhr.setRequestHeader('X-CSRFToken', getCsrfToken());
        xhr.send(formData);
    }

    // ── Send button ──────────────────────────────────────────────────────────
    sendBtn.addEventListener('click', () => {
        if (sendBtn.disabled) return;
        sendBtn.textContent = 'Sent ✓';
        sendBtn.disabled = true;
    });

})();