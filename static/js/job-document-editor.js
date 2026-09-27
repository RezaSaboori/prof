(function() {
    'use strict';

    function initJobDocumentEditor() {
        const grid = document.querySelector('.jobs-grid');
        const dataScript = document.getElementById('jobs-data');
        const confirmation = document.getElementById('job-save-confirmation');

        if (!grid || !dataScript || !confirmation) {
            return;
        }

        let jobsData = [];

        try {
            jobsData = JSON.parse(dataScript.textContent);
        } catch (error) {
            console.error('Failed to parse jobs data:', error);
            return;
        }

        window.JOBS_DATA = jobsData;

        const saveEndpoint =
            grid.dataset.documentSaveEndpoint ||
            '/dashboard/api/jobs/document/save/';

        let activeDocument = null;
        let lastTrigger = null;

        function getCsrfToken() {
            const meta = document.querySelector('meta[name="csrf-token"]');

            if (meta) {
                return meta.getAttribute('content');
            }

            const match = document.cookie.match(/csrftoken=([^;]+)/);
            return match ? match[1] : '';
        }

        function syncBodyLock() {
            const documentModalOpen = Boolean(
                document.querySelector('.job-modal.active')
            );
            const confirmationOpen =
                confirmation.classList.contains('active');

            document.body.classList.toggle(
                'job-document-modal-open',
                documentModalOpen || confirmationOpen
            );
        }

        function renderDocument(source) {
            if (
                typeof marked === 'undefined' ||
                typeof DOMPurify === 'undefined'
            ) {
                const span = document.createElement('span');
                span.textContent = source || '';

                return span.innerHTML.replace(/\n/g, '<br>');
            }

            return DOMPurify.sanitize(
                marked.parse(source || '', { breaks: true })
            );
        }

        function clearSavedFeedbackTimer(documentState) {
            if (
                documentState &&
                documentState.savedFeedbackTimer
            ) {
                window.clearTimeout(
                    documentState.savedFeedbackTimer
                );
                documentState.savedFeedbackTimer = null;
            }
        }

        function setSaveState(state) {
            if (!activeDocument) {
                return;
            }

            clearSavedFeedbackTimer(activeDocument);

            const button = activeDocument.modal.querySelector(
                '[data-document-save]'
            );
            const label = activeDocument.modal.querySelector(
                '[data-document-save-label]'
            );
            const editIcon = activeDocument.modal.querySelector(
                '[data-document-edit-icon]'
            );
            const saveIcon = activeDocument.modal.querySelector(
                '[data-document-save-icon]'
            );

            if (
                !button ||
                !label ||
                !editIcon ||
                !saveIcon
            ) {
                return;
            }

            button.classList.remove(
                'blue-glass',
                'glass',
                'green-glass'
            );

            button.dataset.saveState = state;
            button.disabled = state === 'saving';

            editIcon.hidden = state !== 'edit';
            saveIcon.hidden = state === 'edit';

            label.textContent = '';

            if (state === 'edit') {
                button.classList.add('glass');
                button.setAttribute(
                    'aria-label',
                    'Edit document'
                );
                button.title = 'Edit';
                return;
            }

            if (state === 'saving') {
                button.classList.add('glass');
                button.setAttribute(
                    'aria-label',
                    'Saving'
                );
                button.title = 'Saving';
                label.textContent = 'Saving...';
                return;
            }

            if (state === 'saved-feedback') {
                button.classList.add('green-glass');
                button.setAttribute(
                    'aria-label',
                    'Saved'
                );
                button.title = 'Saved';
                label.textContent = 'Saved';
                return;
            }

            if (state === 'saved') {
                button.classList.add('green-glass');
                button.setAttribute(
                    'aria-label',
                    'Saved'
                );
                button.title = 'Saved';
                return;
            }

            button.classList.add('blue-glass');
            button.setAttribute(
                'aria-label',
                'Save document'
            );
            button.title = 'Save';
        }

        function showSavedFeedback() {
            if (!activeDocument) {
                return;
            }

            const documentState = activeDocument;

            setSaveState('saved-feedback');

            documentState.savedFeedbackTimer =
                window.setTimeout(function() {
                    if (
                        activeDocument !== documentState ||
                        isDirty()
                    ) {
                        return;
                    }

                    documentState.savedFeedbackTimer = null;
                    setSaveState('saved');
                }, 1200);
        }

        function isDirty() {
            return Boolean(
                activeDocument &&
                activeDocument.editor.value !== activeDocument.savedValue
            );
        }

        function enterEditMode() {
            if (!activeDocument) {
                return;
            }

            activeDocument.mode = 'edit';
            activeDocument.preview.hidden = true;
            activeDocument.editor.hidden = false;
            activeDocument.editor.readOnly = false;

            setSaveState('save');

            window.requestAnimationFrame(function() {
                activeDocument.editor.focus();
            });
        }

        function openDocument(trigger) {
            const modalType = trigger.dataset.modal;
            let modalId = '';
            let field = '';

            if (modalType === 'cover-letter') {
                modalId = 'cover-letter-modal';
                field = 'cover_letter';
            } else if (modalType === 'resume') {
                modalId = 'resume-modal';
                field = 'resume';
            } else {
                return;
            }

            const jobIndex =
                parseInt(trigger.dataset.jobId, 10) - 1;
            const job = jobsData[jobIndex];

            if (!job || job.id === undefined || job.id === null) {
                return;
            }

            const modal = document.getElementById(modalId);
            const editor = modal
                ? modal.querySelector('[data-document-editor]')
                : null;
            const preview = modal
                ? modal.querySelector('[data-document-preview]')
                : null;

            if (!modal || !editor || !preview) {
                return;
            }

            const storedValue =
                typeof job[field] === 'string'
                    ? job[field]
                    : job[field] == null
                        ? ''
                        : String(job[field]);

            lastTrigger = trigger;

            activeDocument = {
                modal: modal,
                editor: editor,
                preview: preview,
                jobIndex: jobIndex,
                jobId: job.id,
                field: field,
                savedValue: storedValue,
                saving: false,
                closeAfterSave: false,
                savedFeedbackTimer: null,
                mode: 'view',
            };

            editor.value = storedValue;
            editor.readOnly = false;
            editor.hidden = true;

            preview.innerHTML = renderDocument(storedValue);
            preview.hidden = false;

            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');

            setSaveState('edit');
            syncBodyLock();

            const actionButton = modal.querySelector(
                '[data-document-save]'
            );

            if (actionButton) {
                window.requestAnimationFrame(function() {
                    actionButton.focus();
                });
            }
        }

        function closeDocumentModal() {
            if (!activeDocument) {
                return;
            }

            const modal = activeDocument.modal;

            confirmation.classList.remove('active');
            confirmation.setAttribute('aria-hidden', 'true');

            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');

            clearSavedFeedbackTimer(activeDocument);
            activeDocument = null;
            syncBodyLock();

            if (
                lastTrigger &&
                document.documentElement.contains(lastTrigger)
            ) {
                lastTrigger.focus();
            }
        }

        function openConfirmation() {
            if (!activeDocument) {
                return;
            }

            confirmation.classList.add('active');
            confirmation.setAttribute('aria-hidden', 'false');
            syncBodyLock();

            const saveButton = confirmation.querySelector(
                '[data-confirm-save]'
            );

            if (saveButton) {
                window.requestAnimationFrame(function() {
                    saveButton.focus();
                });
            }
        }

        function closeConfirmation(restoreEditorFocus) {
            confirmation.classList.remove('active');
            confirmation.setAttribute('aria-hidden', 'true');
            syncBodyLock();

            if (
                restoreEditorFocus &&
                activeDocument
            ) {
                window.requestAnimationFrame(function() {
                    activeDocument.editor.focus();
                });
            }
        }

        function requestDocumentClose() {
            if (!activeDocument) {
                return;
            }

            if (activeDocument.saving) {
                activeDocument.closeAfterSave = true;
                return;
            }

            if (isDirty()) {
                openConfirmation();
                return;
            }

            closeDocumentModal();
        }

        function notifyError(message) {
            if (typeof window.notify !== 'function') {
                return;
            }

            window.notify({
                type: 'error',
                category: 'Error',
                body: message,
            });
        }

        async function saveDocument(closeAfterSave) {
            if (!activeDocument) {
                return false;
            }

            if (activeDocument.saving) {
                if (closeAfterSave) {
                    activeDocument.closeAfterSave = true;
                }

                return false;
            }

            if (!isDirty()) {
                if (closeAfterSave) {
                    closeDocumentModal();
                } else {
                    showSavedFeedback();
                }

                return true;
            }

            const state = activeDocument;
            const valueToSave = state.editor.value;

            state.saving = true;
            state.closeAfterSave = Boolean(closeAfterSave);
            state.editor.readOnly = true;

            setSaveState('saving');

            try {
                const response = await fetch(saveEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCsrfToken(),
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        id: state.jobId,
                        field: state.field,
                        value: valueToSave,
                    }),
                });

                let data = {};

                try {
                    data = await response.json();
                } catch (error) {
                    data = {};
                }

                if (!response.ok || !data.ok) {
                    throw new Error(
                        data.error || 'Document save failed'
                    );
                }

                if (activeDocument !== state) {
                    return true;
                }

                state.savedValue = valueToSave;
                state.saving = false;
                state.editor.readOnly = false;

                state.preview.innerHTML =
                    renderDocument(valueToSave);

                if (jobsData[state.jobIndex]) {
                    jobsData[state.jobIndex][state.field] =
                        valueToSave;
                }

                const shouldClose = state.closeAfterSave;
                state.closeAfterSave = false;

                if (shouldClose) {
                    closeDocumentModal();
                } else {
                    showSavedFeedback();
                }

                return true;
            } catch (error) {
                if (activeDocument === state) {
                    state.saving = false;
                    state.closeAfterSave = false;
                    state.editor.readOnly = false;

                    setSaveState(
                        isDirty() ? 'save' : 'saved'
                    );

                    notifyError(
                        'Could not save your changes. Your edited text has been kept so you can try again.'
                    );

                    window.requestAnimationFrame(function() {
                        state.editor.focus();
                    });
                }

                return false;
            }
        }

        async function copyText(text) {
            if (
                navigator.clipboard &&
                typeof navigator.clipboard.writeText === 'function' &&
                window.isSecureContext
            ) {
                try {
                    await navigator.clipboard.writeText(text);
                    return;
                } catch (error) {
                }
            }

            const helper = document.createElement('textarea');
            const previousFocus = document.activeElement;

            helper.className = 'job-modal__clipboard-helper';
            helper.value = text;
            helper.setAttribute('readonly', '');

            document.body.appendChild(helper);

            let copied = false;

            try {
                helper.focus();
                helper.select();
                copied = document.execCommand('copy');
            } finally {
                helper.remove();

                if (
                    previousFocus &&
                    typeof previousFocus.focus === 'function'
                ) {
                    previousFocus.focus();
                }
            }

            if (!copied) {
                throw new Error('Clipboard copy failed');
            }
        }

        function showCopyFeedback(button, state) {
            button.dataset.copyState = state;

            window.setTimeout(function() {
                if (button.dataset.copyState === state) {
                    delete button.dataset.copyState;
                }
            }, 1200);
        }

        async function copyDocument(button) {
            if (!activeDocument) {
                return;
            }

            try {
                await copyText(activeDocument.editor.value);
                showCopyFeedback(button, 'copied');
            } catch (error) {
                showCopyFeedback(button, 'error');

                notifyError(
                    'Could not copy the text to your clipboard.'
                );
            }
        }

        document.addEventListener('input', function(event) {
            if (
                !activeDocument ||
                event.target !== activeDocument.editor ||
                activeDocument.saving
            ) {
                return;
            }

            setSaveState(
                isDirty() ? 'save' : 'saved'
            );
        });

        document.addEventListener('click', function(event) {
            const trigger = event.target.closest('[data-modal]');

            if (trigger) {
                event.preventDefault();
                openDocument(trigger);
                return;
            }

            const saveButton = event.target.closest(
                '[data-document-save]'
            );

            if (
                saveButton &&
                activeDocument &&
                activeDocument.modal.contains(saveButton)
            ) {
                event.preventDefault();

                const state = saveButton.dataset.saveState;

                if (state === 'edit') {
                    enterEditMode();
                    return;
                }

                if (
                    state === 'saved' ||
                    state === 'saved-feedback'
                ) {
                    showSavedFeedback();
                    return;
                }

                saveDocument(false);
                return;
            }

            const copyButton = event.target.closest(
                '[data-document-copy]'
            );

            if (
                copyButton &&
                activeDocument &&
                activeDocument.modal.contains(copyButton)
            ) {
                event.preventDefault();
                copyDocument(copyButton);
                return;
            }

            const confirmationSave = event.target.closest(
                '[data-confirm-save]'
            );

            if (confirmationSave) {
                event.preventDefault();
                closeConfirmation(false);
                saveDocument(true);
                return;
            }

            const confirmationDiscard = event.target.closest(
                '[data-confirm-discard]'
            );

            if (confirmationDiscard) {
                event.preventDefault();

                if (activeDocument) {
                    activeDocument.editor.value =
                        activeDocument.savedValue;
                }

                closeDocumentModal();
                return;
            }

            const confirmationCancel = event.target.closest(
                '[data-confirm-cancel]'
            );

            if (confirmationCancel) {
                event.preventDefault();
                closeConfirmation(true);
                return;
            }

            if (
                event.target.classList.contains(
                    'job-save-confirmation__overlay'
                )
            ) {
                closeConfirmation(true);
                return;
            }

            const closeButton = event.target.closest(
                '[data-close-modal]'
            );

            if (
                closeButton &&
                activeDocument &&
                activeDocument.modal.contains(closeButton)
            ) {
                event.preventDefault();
                requestDocumentClose();
                return;
            }

            if (
                event.target.classList.contains(
                    'job-modal__overlay'
                ) &&
                activeDocument &&
                activeDocument.modal.contains(event.target)
            ) {
                requestDocumentClose();
            }
        });

        document.addEventListener('keydown', function(event) {
            if (event.key !== 'Escape') {
                return;
            }

            const notifyOverlay =
                document.getElementById('notifyModalOverlay');

            if (
                notifyOverlay &&
                !notifyOverlay.hidden
            ) {
                return;
            }

            if (confirmation.classList.contains('active')) {
                event.preventDefault();
                closeConfirmation(true);
                return;
            }

            if (
                activeDocument &&
                activeDocument.modal.classList.contains('active')
            ) {
                event.preventDefault();
                requestDocumentClose();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            initJobDocumentEditor
        );
    } else {
        initJobDocumentEditor();
    }
})();