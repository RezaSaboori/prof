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

        const EDIT_ICON_SVG =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';

        const SAVE_ICON_SVG =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>';

        const SAVE_BUTTON_EXPAND_MS = 400;
        const SAVE_CONTENT_SWAP_MS = 210;
        const SAVE_TEXT_ENTER_MS = 280;
        const SAVE_FEEDBACK_HOLD_MS = 1200;

        function wait(duration) {
            return new Promise(function(resolve) {
                window.setTimeout(resolve, duration);
            });
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

        function clearSaveText(button) {
            const label = button.querySelector(
                '[data-document-save-label]'
            );

            if (!label) {
                return;
            }

            label.classList.remove(
                'job-modal__save-label--enter',
                'job-modal__save-label--exit'
            );
            label.textContent = '';
        }

        function enterSaveText(button, text) {
            const label = button.querySelector(
                '[data-document-save-label]'
            );

            if (!label) {
                return;
            }

            label.classList.remove(
                'job-modal__save-label--enter',
                'job-modal__save-label--exit'
            );
            label.textContent = text;

            void label.offsetWidth;

            label.classList.add(
                'job-modal__save-label--enter'
            );
        }

        function transitionSaveText(button, text) {
            const label = button.querySelector(
                '[data-document-save-label]'
            );

            if (!label) {
                return Promise.resolve();
            }

            if (!label.textContent) {
                if (text) {
                    enterSaveText(button, text);

                    return wait(SAVE_TEXT_ENTER_MS);
                }

                return Promise.resolve();
            }

            label.classList.remove(
                'job-modal__save-label--enter'
            );
            label.classList.add(
                'job-modal__save-label--exit'
            );

            return wait(SAVE_CONTENT_SWAP_MS)
                .then(function() {
                    label.classList.remove(
                        'job-modal__save-label--exit'
                    );
                    label.textContent = text;

                    if (!text) {
                        return;
                    }

                    void label.offsetWidth;

                    label.classList.add(
                        'job-modal__save-label--enter'
                    );

                    return wait(SAVE_TEXT_ENTER_MS);
                });
        }

        function transitionActionIcon(
            button,
            iconHtml,
            iconName,
            animate
        ) {
            const icon = button.querySelector(
                '[data-document-action-icon]'
            );

            if (!icon || icon.dataset.icon === iconName) {
                return;
            }

            icon.classList.remove(
                'job-modal__action-icon--enter',
                'job-modal__action-icon--exit'
            );

            if (!animate) {
                icon.innerHTML = iconHtml;
                icon.dataset.icon = iconName;
                return;
            }

            icon.classList.add(
                'job-modal__action-icon--exit'
            );

            window.setTimeout(function() {
                icon.innerHTML = iconHtml;
                icon.dataset.icon = iconName;

                icon.classList.remove(
                    'job-modal__action-icon--exit'
                );
                icon.classList.add(
                    'job-modal__action-icon--enter'
                );
            }, SAVE_CONTENT_SWAP_MS);
        }

        function setSaveState(state, animateIcon) {
            if (!activeDocument) {
                return;
            }

            clearSavedFeedbackTimer(activeDocument);

            const button = activeDocument.modal.querySelector(
                '[data-document-save]'
            );

            if (!button) {
                return;
            }

            button.classList.remove(
                'blue-glass',
                'glass',
                'green-glass'
            );

            button.dataset.saveState = state;
            button.disabled = false;

            clearSaveText(button);

            if (state === 'edit') {
                button.classList.add('glass');
                button.setAttribute(
                    'aria-label',
                    'Edit document'
                );
                button.title = 'Edit';

                transitionActionIcon(
                    button,
                    EDIT_ICON_SVG,
                    'edit',
                    Boolean(animateIcon)
                );
                return;
            }

            transitionActionIcon(
                button,
                SAVE_ICON_SVG,
                'save',
                Boolean(animateIcon)
            );

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

        async function beginSavingAnimation(documentState) {
            if (
                !activeDocument ||
                activeDocument !== documentState
            ) {
                return;
            }

            const button = documentState.modal.querySelector(
                '[data-document-save]'
            );

            if (!button) {
                return;
            }

            clearSavedFeedbackTimer(documentState);

            button.classList.remove(
                'blue-glass',
                'glass',
                'green-glass'
            );
            button.classList.add('glass');

            button.dataset.saveState = 'saving-expand';
            button.disabled = true;
            button.setAttribute('aria-label', 'Saving');
            button.title = 'Saving';

            clearSaveText(button);

            transitionActionIcon(
                button,
                SAVE_ICON_SVG,
                'save',
                false
            );

            await wait(SAVE_BUTTON_EXPAND_MS);

            if (
                activeDocument !== documentState ||
                !documentState.saving
            ) {
                return;
            }

            button.dataset.saveState = 'saving';

            enterSaveText(button, 'Saving...');

            await wait(SAVE_TEXT_ENTER_MS);
        }

        async function collapseToSaveState(state) {
            if (!activeDocument) {
                return;
            }

            const documentState = activeDocument;
            const button = documentState.modal.querySelector(
                '[data-document-save]'
            );

            if (!button) {
                return;
            }

            await transitionSaveText(button, '');

            if (activeDocument !== documentState) {
                return;
            }

            setSaveState(state, false);
        }

        async function showSavedFeedback(alreadyExpanded) {
            if (!activeDocument) {
                return;
            }

            const documentState = activeDocument;
            const button = documentState.modal.querySelector(
                '[data-document-save]'
            );

            if (!button) {
                return;
            }

            clearSavedFeedbackTimer(documentState);

            button.classList.remove(
                'blue-glass',
                'glass',
                'green-glass'
            );
            button.classList.add('green-glass');

            button.disabled = true;
            button.setAttribute('aria-label', 'Saved');
            button.title = 'Saved';

            transitionActionIcon(
                button,
                SAVE_ICON_SVG,
                'save',
                false
            );

            if (alreadyExpanded) {
                button.dataset.saveState =
                    'saved-feedback';

                await transitionSaveText(
                    button,
                    'Saved'
                );
            } else {
                clearSaveText(button);

                button.dataset.saveState =
                    'saved-feedback-expand';

                await wait(SAVE_BUTTON_EXPAND_MS);

                if (activeDocument !== documentState) {
                    return;
                }

                button.dataset.saveState =
                    'saved-feedback';

                enterSaveText(button, 'Saved');

                await wait(SAVE_TEXT_ENTER_MS);
            }

            if (activeDocument !== documentState) {
                return;
            }

            documentState.savedFeedbackTimer =
                window.setTimeout(function() {
                    documentState.savedFeedbackTimer = null;

                    if (
                        activeDocument !== documentState ||
                        isDirty()
                    ) {
                        return;
                    }

                    transitionSaveText(button, '')
                        .then(function() {
                            if (
                                activeDocument !== documentState ||
                                isDirty()
                            ) {
                                return;
                            }

                            setSaveState(
                                'saved',
                                false
                            );
                        });
                }, SAVE_FEEDBACK_HOLD_MS);
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

            setSaveState('save', true);

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
                    showSavedFeedback(false);
                }

                return true;
            }

            const state = activeDocument;
            const valueToSave = state.editor.value;

            state.saving = true;
            state.closeAfterSave = Boolean(closeAfterSave);
            state.editor.readOnly = true;

            const savingAnimation =
                beginSavingAnimation(state);

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

                await savingAnimation;

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
                    showSavedFeedback(true);
                }

                return true;
            } catch (error) {
                await savingAnimation;

                if (activeDocument === state) {
                    state.saving = false;
                    state.closeAfterSave = false;
                    state.editor.readOnly = false;

                    collapseToSaveState(
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