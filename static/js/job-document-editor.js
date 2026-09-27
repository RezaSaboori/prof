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

        function getHistorySnapshot() {
            if (!activeDocument) {
                return null;
            }

            return {
                value: activeDocument.editor.value,
                selectionStart:
                    activeDocument.editor.selectionStart || 0,
                selectionEnd:
                    activeDocument.editor.selectionEnd || 0,
            };
        }

        function setHistoryActionsVisible(visible) {
            if (!activeDocument) {
                return;
            }

            const actions = activeDocument.modal.querySelector(
                '[data-document-history-actions]'
            );
            const buttons = activeDocument.modal.querySelectorAll(
                '[data-document-undo], [data-document-redo]'
            );

            if (!actions) {
                return;
            }

            actions.classList.toggle(
                'is-visible',
                visible
            );
            actions.setAttribute(
                'aria-hidden',
                visible ? 'false' : 'true'
            );

            buttons.forEach(function(button) {
                button.tabIndex = visible ? 0 : -1;
            });
        }

        function syncHistoryButtons() {
            if (!activeDocument) {
                return;
            }

            const undoButton = activeDocument.modal.querySelector(
                '[data-document-undo]'
            );
            const redoButton = activeDocument.modal.querySelector(
                '[data-document-redo]'
            );

            if (!undoButton || !redoButton) {
                return;
            }

            const editing =
                activeDocument.mode === 'edit';
            const blocked =
                activeDocument.saving;

            undoButton.disabled =
                !editing ||
                blocked ||
                activeDocument.historyIndex <= 0;

            redoButton.disabled =
                !editing ||
                blocked ||
                activeDocument.historyIndex >=
                    activeDocument.history.length - 1;
        }

        function resetEditorHistory() {
            if (!activeDocument) {
                return;
            }

            const snapshot = getHistorySnapshot();

            activeDocument.history =
                snapshot ? [snapshot] : [];
            activeDocument.historyIndex =
                snapshot ? 0 : -1;
            activeDocument.historyApplying = false;

            syncHistoryButtons();
        }

        function pushEditorHistory() {
            if (
                !activeDocument ||
                activeDocument.historyApplying
            ) {
                return;
            }

            const snapshot = getHistorySnapshot();

            if (!snapshot) {
                return;
            }

            const current =
                activeDocument.history[
                    activeDocument.historyIndex
                ];

            if (
                current &&
                current.value === snapshot.value
            ) {
                current.selectionStart =
                    snapshot.selectionStart;
                current.selectionEnd =
                    snapshot.selectionEnd;
                syncHistoryButtons();
                return;
            }

            if (
                activeDocument.historyIndex <
                activeDocument.history.length - 1
            ) {
                activeDocument.history =
                    activeDocument.history.slice(
                        0,
                        activeDocument.historyIndex + 1
                    );
            }

            activeDocument.history.push(snapshot);

            if (activeDocument.history.length > 100) {
                activeDocument.history.shift();
            } else {
                activeDocument.historyIndex += 1;
            }

            syncHistoryButtons();
        }

        function applyHistorySnapshot(index) {
            if (
                !activeDocument ||
                index < 0 ||
                index >= activeDocument.history.length
            ) {
                return;
            }

            const snapshot =
                activeDocument.history[index];

            activeDocument.historyApplying = true;
            activeDocument.historyIndex = index;
            activeDocument.editor.value =
                snapshot.value;

            activeDocument.historyApplying = false;

            setSaveState(
                isDirty() ? 'save' : 'saved'
            );
            syncHistoryButtons();

            window.requestAnimationFrame(function() {
                if (
                    !activeDocument ||
                    activeDocument.mode !== 'edit'
                ) {
                    return;
                }

                activeDocument.editor.focus();
                activeDocument.editor.setSelectionRange(
                    snapshot.selectionStart,
                    snapshot.selectionEnd
                );
            });
        }

        function undoDocumentEdit() {
            if (
                !activeDocument ||
                activeDocument.saving ||
                activeDocument.historyIndex <= 0
            ) {
                return;
            }

            applyHistorySnapshot(
                activeDocument.historyIndex - 1
            );
        }

        function redoDocumentEdit() {
            if (
                !activeDocument ||
                activeDocument.saving ||
                activeDocument.historyIndex >=
                    activeDocument.history.length - 1
            ) {
                return;
            }

            applyHistorySnapshot(
                activeDocument.historyIndex + 1
            );
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

            resetEditorHistory();
            setHistoryActionsVisible(true);
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
                exitEditAfterSave: false,
                confirmationAction: null,
                savedFeedbackTimer: null,
                mode: 'view',
                history: [],
                historyIndex: -1,
                historyApplying: false,
            };

            editor.value = storedValue;
            editor.readOnly = false;
            editor.hidden = true;

            setHistoryActionsVisible(false);

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

        function exitEditMode() {
            if (!activeDocument) {
                return;
            }

            activeDocument.mode = 'view';
            activeDocument.confirmationAction = null;
            activeDocument.exitEditAfterSave = false;

            activeDocument.editor.hidden = true;
            activeDocument.editor.readOnly = false;

            activeDocument.preview.innerHTML =
                renderDocument(activeDocument.savedValue);
            activeDocument.preview.hidden = false;

            setHistoryActionsVisible(false);

            activeDocument.history = [];
            activeDocument.historyIndex = -1;
            activeDocument.historyApplying = false;

            setSaveState('edit', true);
        }

        function openConfirmation(action) {
            if (!activeDocument) {
                return;
            }

            activeDocument.confirmationAction =
                action || 'close-modal';

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

            if (activeDocument) {
                activeDocument.confirmationAction = null;
            }

            syncBodyLock();

            if (
                restoreEditorFocus &&
                activeDocument &&
                activeDocument.mode === 'edit'
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
                openConfirmation('close-modal');
                return;
            }

            closeDocumentModal();
        }

        function requestEditorClose() {
            if (
                !activeDocument ||
                activeDocument.mode !== 'edit'
            ) {
                return;
            }

            if (activeDocument.saving) {
                activeDocument.exitEditAfterSave = true;
                return;
            }

            if (isDirty()) {
                openConfirmation('close-editor');
                return;
            }

            exitEditMode();
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

        async function saveDocument(
            closeAfterSave,
            exitEditAfterSave
        ) {
            if (!activeDocument) {
                return false;
            }

            if (activeDocument.saving) {
                if (closeAfterSave) {
                    activeDocument.closeAfterSave = true;
                }

                if (exitEditAfterSave) {
                    activeDocument.exitEditAfterSave = true;
                }

                return false;
            }

            if (!isDirty()) {
                if (closeAfterSave) {
                    closeDocumentModal();
                } else if (exitEditAfterSave) {
                    exitEditMode();
                } else {
                    showSavedFeedback(false);
                }

                return true;
            }

            const state = activeDocument;
            const valueToSave = state.editor.value;

            state.saving = true;
            state.closeAfterSave = Boolean(closeAfterSave);
            state.exitEditAfterSave =
                Boolean(exitEditAfterSave);
            state.editor.readOnly = true;

            syncHistoryButtons();

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

                syncHistoryButtons();

                state.preview.innerHTML =
                    renderDocument(valueToSave);

                if (jobsData[state.jobIndex]) {
                    jobsData[state.jobIndex][state.field] =
                        valueToSave;
                }

                const shouldClose =
                    state.closeAfterSave;
                const shouldExitEdit =
                    state.exitEditAfterSave;

                state.closeAfterSave = false;
                state.exitEditAfterSave = false;

                if (shouldClose) {
                    closeDocumentModal();
                } else if (shouldExitEdit) {
                    exitEditMode();
                } else {
                    showSavedFeedback(true);
                }

                return true;
            } catch (error) {
                await savingAnimation;

                if (activeDocument === state) {
                    state.saving = false;
                    state.closeAfterSave = false;
                    state.exitEditAfterSave = false;
                    state.editor.readOnly = false;

                    syncHistoryButtons();

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
                activeDocument.saving ||
                activeDocument.historyApplying
            ) {
                return;
            }

            pushEditorHistory();

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

            const undoButton = event.target.closest(
                '[data-document-undo]'
            );

            if (
                undoButton &&
                activeDocument &&
                activeDocument.modal.contains(undoButton)
            ) {
                event.preventDefault();
                undoDocumentEdit();
                return;
            }

            const redoButton = event.target.closest(
                '[data-document-redo]'
            );

            if (
                redoButton &&
                activeDocument &&
                activeDocument.modal.contains(redoButton)
            ) {
                event.preventDefault();
                redoDocumentEdit();
                return;
            }

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

                const action = activeDocument
                    ? activeDocument.confirmationAction
                    : null;

                closeConfirmation(false);

                saveDocument(
                    action === 'close-modal',
                    action === 'close-editor'
                );
                return;
            }

            const confirmationDiscard = event.target.closest(
                '[data-confirm-discard]'
            );

            if (confirmationDiscard) {
                event.preventDefault();

                const action = activeDocument
                    ? activeDocument.confirmationAction
                    : null;

                if (activeDocument) {
                    activeDocument.editor.value =
                        activeDocument.savedValue;
                }

                closeConfirmation(false);

                if (action === 'close-editor') {
                    exitEditMode();
                } else {
                    closeDocumentModal();
                }

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
                return;
            }

            const modalContent = event.target.closest(
                '.job-modal__content'
            );

            if (
                activeDocument &&
                activeDocument.mode === 'edit' &&
                modalContent &&
                activeDocument.modal.contains(modalContent) &&
                !activeDocument.editor.contains(event.target)
            ) {
                requestEditorClose();
            }
        });
        document.addEventListener('keydown', function(event) {
            if (
                !activeDocument ||
                activeDocument.mode !== 'edit' ||
                activeDocument.saving ||
                confirmation.classList.contains('active')
            ) {
                return;
            }

            const modifier =
                event.ctrlKey || event.metaKey;

            if (!modifier || event.altKey) {
                return;
            }

            const key = event.key.toLowerCase();

            if (
                key === 'z' &&
                !event.shiftKey
            ) {
                event.preventDefault();
                undoDocumentEdit();
                return;
            }

            if (
                (
                    key === 'z' &&
                    event.shiftKey
                ) ||
                key === 'y'
            ) {
                event.preventDefault();
                redoDocumentEdit();
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