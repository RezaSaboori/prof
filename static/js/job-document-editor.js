(function() {
    'use strict';

    function initJobDocumentEditor() {
        const grid = document.querySelector('.jobs-grid');
        const dataScript = document.getElementById('jobs-data');
        const confirmation = document.getElementById(
            'job-save-confirmation'
        );

        if (!grid || !dataScript || !confirmation) {
            return;
        }

        let jobsData = [];

        try {
            jobsData = JSON.parse(dataScript.textContent);
        } catch (error) {
            console.error(
                'Failed to parse jobs data:',
                error
            );
            return;
        }

        window.JOBS_DATA = jobsData;

        const stateEndpoint =
            grid.dataset.documentStateEndpoint ||
            '/dashboard/api/jobs/document/state/';

        const revisionEndpoint =
            grid.dataset.documentRevisionEndpoint ||
            '/dashboard/api/jobs/document/revision/';

        const saveEndpoint =
            grid.dataset.documentSaveEndpoint ||
            '/dashboard/api/jobs/document/save/';

        const REVISION_POLL_MS = 2000;

        const SAVE_BUTTON_EXPAND_MS = 400;
        const SAVE_CONTENT_SWAP_MS = 210;
        const SAVE_TEXT_ENTER_MS = 280;
        const SAVE_FEEDBACK_HOLD_MS = 1200;

        const EDIT_ICON_SVG =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';

        const SAVE_ICON_SVG =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>';

        const SEND_ICON_SVG =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';

        const REVISION_LOADING_ICON_SVG =
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><circle cx="16" cy="3" r="0"><animate attributeName="r" values="0;3;0;0" dur="1s" repeatCount="indefinite" begin="0s"/></circle><circle transform="rotate(45 16 16)" cx="16" cy="3" r="0"><animate attributeName="r" values="0;3;0;0" dur="1s" repeatCount="indefinite" begin="0.125s"/></circle><circle transform="rotate(90 16 16)" cx="16" cy="3" r="0"><animate attributeName="r" values="0;3;0;0" dur="1s" repeatCount="indefinite" begin="0.25s"/></circle><circle transform="rotate(135 16 16)" cx="16" cy="3" r="0"><animate attributeName="r" values="0;3;0;0" dur="1s" repeatCount="indefinite" begin="0.375s"/></circle><circle transform="rotate(180 16 16)" cx="16" cy="3" r="0"><animate attributeName="r" values="0;3;0;0" dur="1s" repeatCount="indefinite" begin="0.5s"/></circle><circle transform="rotate(225 16 16)" cx="16" cy="3" r="0"><animate attributeName="r" values="0;3;0;0" dur="1s" repeatCount="indefinite" begin="0.625s"/></circle><circle transform="rotate(270 16 16)" cx="16" cy="3" r="0"><animate attributeName="r" values="0;3;0;0" dur="1s" repeatCount="indefinite" begin="0.75s"/></circle><circle transform="rotate(315 16 16)" cx="16" cy="3" r="0"><animate attributeName="r" values="0;3;0;0" dur="1s" repeatCount="indefinite" begin="0.875s"/></circle></svg>';

        const SUBMIT_ICON_SWAP_MS = 180;

        let activeDocument = null;
        let lastTrigger = null;

        function getCsrfToken() {
            const meta = document.querySelector(
                'meta[name="csrf-token"]'
            );

            if (meta) {
                return meta.getAttribute('content');
            }

            const match = document.cookie.match(
                /csrftoken=([^;]+)/
            );

            return match ? match[1] : '';
        }

        function wait(duration) {
            return new Promise(function(resolve) {
                window.setTimeout(
                    resolve,
                    duration
                );
            });
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

        function syncBodyLock() {
            const documentModalOpen = Boolean(
                document.querySelector(
                    '.job-modal.active'
                )
            );

            const confirmationOpen =
                confirmation.classList.contains(
                    'active'
                );

            document.body.classList.toggle(
                'job-document-modal-open',
                documentModalOpen ||
                    confirmationOpen
            );
        }

        function renderDocument(source) {
            if (
                typeof marked === 'undefined' ||
                typeof DOMPurify === 'undefined'
            ) {
                const span =
                    document.createElement('span');

                span.textContent = source || '';

                return span.innerHTML.replace(
                    /\n/g,
                    '<br>'
                );
            }

            return DOMPurify.sanitize(
                marked.parse(
                    source || '',
                    {
                        breaks: true,
                    }
                )
            );
        }

        function resizeBottomInput(input) {
            if (!input) {
                return;
            }

            input.style.height = 'auto';

            const styles =
                window.getComputedStyle(input);

            const minHeight =
                parseFloat(
                    styles.minHeight
                ) || 0;

            const maxHeight =
                parseFloat(
                    styles.maxHeight
                ) ||
                input.scrollHeight;

            const contentHeight =
                input.scrollHeight;

            const nextHeight = Math.max(
                minHeight,
                Math.min(
                    contentHeight,
                    maxHeight
                )
            );

            input.style.height =
                Math.ceil(
                    nextHeight
                ) + 'px';

            input.style.overflowY =
                contentHeight > maxHeight
                    ? 'auto'
                    : 'hidden';
        }

        function updateBottomSubmitState(input) {
            if (!input) {
                return;
            }

            const inputArea = input.closest(
                '[data-document-input-area]'
            );

            const submitButton = inputArea
                ? inputArea.querySelector(
                    '[data-document-bottom-submit]'
                )
                : null;

            if (
                !submitButton ||
                submitButton.classList.contains(
                    'is-processing'
                )
            ) {
                return;
            }

            const hasValue =
                input.value.trim().length > 0;

            const canSubmit =
                hasValue &&
                !submitButton.disabled;

            submitButton.classList.toggle(
                'blue-glass',
                canSubmit
            );

            submitButton.classList.toggle(
                'glass',
                !canSubmit
            );
        }

        function transitionSubmitIcon(
            button,
            iconHtml,
            iconState
        ) {
            if (
                !button ||
                button.dataset.iconState ===
                    iconState
            ) {
                return;
            }

            button.dataset.iconState =
                iconState;

            const currentIcon =
                button.querySelector('svg');

            if (!currentIcon) {
                button.innerHTML =
                    iconHtml;

                return;
            }

            currentIcon.classList.remove(
                'job-modal__input-submit-icon--enter'
            );

            currentIcon.classList.add(
                'job-modal__input-submit-icon--exit'
            );

            window.setTimeout(
                function() {
                    if (!button.isConnected) {
                        return;
                    }

                    button.innerHTML =
                        iconHtml;

                    const nextIcon =
                        button.querySelector(
                            'svg'
                        );

                    if (nextIcon) {
                        nextIcon.classList.add(
                            'job-modal__input-submit-icon--enter'
                        );
                    }
                },
                SUBMIT_ICON_SWAP_MS
            );
        }

        function buildPreviewSkeleton(
            preview
        ) {
            if (!preview) {
                return;
            }

            const existing =
                preview.querySelector(
                    '.job-modal__preview-skeleton'
                );

            if (existing) {
                return;
            }

            const skeleton =
                document.createElement(
                    'div'
                );

            skeleton.className =
                'job-modal__preview-skeleton';

            skeleton.setAttribute(
                'aria-hidden',
                'true'
            );

            const variants = [
                'title',
                'medium',
                'short',
                'full',
                'long',
                'full',
                'medium',
                'long',
                'short',
                'full',
                'long',
                'medium',
                'full',
                'title',
                'medium',
                'short',
            ];

            variants.forEach(
                function(variant) {
                    const line =
                        document.createElement(
                            'span'
                        );

                    line.className =
                        'job-modal__preview-skeleton-line ' +
                        'job-modal__preview-skeleton-line--' +
                        variant;

                    skeleton.appendChild(
                        line
                    );
                }
            );

            preview.appendChild(
                skeleton
            );
        }

        function setPreviewProcessing(
            documentState,
            processing
        ) {
            if (
                !documentState ||
                !documentState.preview
            ) {
                return;
            }

            const preview =
                documentState.preview;

            preview.classList.toggle(
                'is-ai-processing',
                Boolean(processing)
            );

            preview.setAttribute(
                'aria-busy',
                processing
                    ? 'true'
                    : 'false'
            );

            if (processing) {
                preview.scrollTop = 0;

                buildPreviewSkeleton(
                    preview
                );

                return;
            }

            const skeleton =
                preview.querySelector(
                    '.job-modal__preview-skeleton'
                );

            if (skeleton) {
                skeleton.remove();
            }
        }

        function setSubmitProcessing(
            documentState,
            processing
        ) {
            if (
                !documentState ||
                !documentState.submitButton
            ) {
                return;
            }

            const button =
                documentState.submitButton;

            button.disabled =
                Boolean(processing);

            button.classList.toggle(
                'is-processing',
                Boolean(processing)
            );

            button.classList.remove(
                'glass',
                'blue-glass',
                'indigo-glass'
            );

            if (processing) {
                button.classList.add(
                    'indigo-glass'
                );

                button.setAttribute(
                    'aria-label',
                    'Generating document'
                );

                transitionSubmitIcon(
                    button,
                    REVISION_LOADING_ICON_SVG,
                    'loading'
                );

                return;
            }

            button.classList.add(
                'glass'
            );

            button.setAttribute(
                'aria-label',
                documentState.field ===
                    'resume'
                    ? 'Submit resume instruction'
                    : 'Submit cover letter instruction'
            );

            transitionSubmitIcon(
                button,
                SEND_ICON_SVG,
                'send'
            );

            updateBottomSubmitState(
                documentState.bottomInput
            );
        }

        function clearSavedFeedbackTimer(
            documentState
        ) {
            if (
                !documentState ||
                !documentState.savedFeedbackTimer
            ) {
                return;
            }

            window.clearTimeout(
                documentState.savedFeedbackTimer
            );

            documentState.savedFeedbackTimer =
                null;
        }

        function clearRevisionPoll(
            documentState
        ) {
            if (
                !documentState ||
                !documentState.revisionPollTimer
            ) {
                return;
            }

            window.clearTimeout(
                documentState.revisionPollTimer
            );

            documentState.revisionPollTimer =
                null;
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

        function enterSaveText(
            button,
            text
        ) {
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

        function transitionSaveText(
            button,
            text
        ) {
            const label = button.querySelector(
                '[data-document-save-label]'
            );

            if (!label) {
                return Promise.resolve();
            }

            if (!label.textContent) {
                if (text) {
                    enterSaveText(
                        button,
                        text
                    );

                    return wait(
                        SAVE_TEXT_ENTER_MS
                    );
                }

                return Promise.resolve();
            }

            label.classList.remove(
                'job-modal__save-label--enter'
            );

            label.classList.add(
                'job-modal__save-label--exit'
            );

            return wait(
                SAVE_CONTENT_SWAP_MS
            ).then(function() {
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

                return wait(
                    SAVE_TEXT_ENTER_MS
                );
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

            if (
                !icon ||
                icon.dataset.icon === iconName
            ) {
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

            window.setTimeout(
                function() {
                    icon.innerHTML =
                        iconHtml;

                    icon.dataset.icon =
                        iconName;

                    icon.classList.remove(
                        'job-modal__action-icon--exit'
                    );

                    icon.classList.add(
                        'job-modal__action-icon--enter'
                    );
                },
                SAVE_CONTENT_SWAP_MS
            );
        }

        function setSaveState(
            state,
            animateIcon
        ) {
            if (!activeDocument) {
                return;
            }

            clearSavedFeedbackTimer(
                activeDocument
            );

            const button =
                activeDocument.modal.querySelector(
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

            button.dataset.saveState =
                state;

            button.disabled = false;

            clearSaveText(button);

            if (state === 'edit') {
                button.classList.add(
                    'glass'
                );

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
                button.classList.add(
                    'green-glass'
                );

                button.setAttribute(
                    'aria-label',
                    'Saved'
                );

                button.title = 'Saved';

                return;
            }

            button.classList.add(
                'blue-glass'
            );

            button.setAttribute(
                'aria-label',
                'Save document'
            );

            button.title = 'Save';
        }

        function isSameRevision(
            first,
            second
        ) {
            if (
                first === null ||
                first === undefined ||
                second === null ||
                second === undefined
            ) {
                return false;
            }

            return String(first) ===
                String(second);
        }

        function isDirty() {
            if (!activeDocument) {
                return false;
            }

            if (
                activeDocument.currentRevisionId !==
                    null &&
                activeDocument.savedRevisionId !==
                    null &&
                !isSameRevision(
                    activeDocument
                        .currentRevisionId,
                    activeDocument
                        .savedRevisionId
                )
            ) {
                return true;
            }

            return (
                activeDocument.editor.value !==
                activeDocument.savedValue
            );
        }

        function isEditorDirty() {
            return Boolean(
                activeDocument &&
                activeDocument.editor.value !==
                    activeDocument.editBaseValue
            );
        }

        function syncDocumentActionState(
            animate
        ) {
            if (!activeDocument) {
                return;
            }

            if (
                activeDocument.mode === 'edit'
            ) {
                setSaveState(
                    isDirty()
                        ? 'save'
                        : 'saved',
                    Boolean(animate)
                );
            } else {
                setSaveState(
                    isDirty()
                        ? 'save'
                        : 'edit',
                    Boolean(animate)
                );
            }

            if (
                activeDocument.processing
            ) {
                const button =
                    activeDocument.modal
                        .querySelector(
                            '[data-document-save]'
                        );

                if (button) {
                    button.disabled = true;
                }
            }
        }

        async function beginSavingAnimation(
            documentState
        ) {
            if (
                !activeDocument ||
                activeDocument !==
                    documentState
            ) {
                return;
            }

            const button =
                documentState.modal
                    .querySelector(
                        '[data-document-save]'
                    );

            if (!button) {
                return;
            }

            clearSavedFeedbackTimer(
                documentState
            );

            button.classList.remove(
                'blue-glass',
                'glass',
                'green-glass'
            );

            button.classList.add(
                'glass'
            );

            button.dataset.saveState =
                'saving-expand';

            button.disabled = true;

            button.setAttribute(
                'aria-label',
                'Saving'
            );

            button.title = 'Saving';

            clearSaveText(button);

            transitionActionIcon(
                button,
                SAVE_ICON_SVG,
                'save',
                false
            );

            await wait(
                SAVE_BUTTON_EXPAND_MS
            );

            if (
                activeDocument !==
                    documentState ||
                !documentState.saving
            ) {
                return;
            }

            button.dataset.saveState =
                'saving';

            enterSaveText(
                button,
                'Saving...'
            );

            await wait(
                SAVE_TEXT_ENTER_MS
            );
        }

        async function collapseToSaveState(
            state
        ) {
            if (!activeDocument) {
                return;
            }

            const documentState =
                activeDocument;

            const button =
                documentState.modal
                    .querySelector(
                        '[data-document-save]'
                    );

            if (!button) {
                return;
            }

            await transitionSaveText(
                button,
                ''
            );

            if (
                activeDocument !==
                documentState
            ) {
                return;
            }

            setSaveState(
                state,
                false
            );
        }

        async function showSavedFeedback(
            alreadyExpanded
        ) {
            if (!activeDocument) {
                return;
            }

            const documentState =
                activeDocument;

            const button =
                documentState.modal
                    .querySelector(
                        '[data-document-save]'
                    );

            if (!button) {
                return;
            }

            clearSavedFeedbackTimer(
                documentState
            );

            button.classList.remove(
                'blue-glass',
                'glass',
                'green-glass'
            );

            button.classList.add(
                'green-glass'
            );

            button.disabled = true;

            button.setAttribute(
                'aria-label',
                'Saved'
            );

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

                await wait(
                    SAVE_BUTTON_EXPAND_MS
                );

                if (
                    activeDocument !==
                    documentState
                ) {
                    return;
                }

                button.dataset.saveState =
                    'saved-feedback';

                enterSaveText(
                    button,
                    'Saved'
                );

                await wait(
                    SAVE_TEXT_ENTER_MS
                );
            }

            if (
                activeDocument !==
                documentState
            ) {
                return;
            }

            documentState.savedFeedbackTimer =
                window.setTimeout(
                    function() {
                        documentState
                            .savedFeedbackTimer =
                            null;

                        if (
                            activeDocument !==
                                documentState ||
                            isDirty()
                        ) {
                            return;
                        }

                        transitionSaveText(
                            button,
                            ''
                        ).then(function() {
                            if (
                                activeDocument !==
                                    documentState ||
                                isDirty()
                            ) {
                                return;
                            }

                            setSaveState(
                                documentState.mode ===
                                    'view'
                                    ? 'edit'
                                    : 'saved',
                                false
                            );
                        });
                    },
                    SAVE_FEEDBACK_HOLD_MS
                );
        }

        function getRevisionStatus(
            revision
        ) {
            if (
                !revision ||
                !revision.metadata ||
                typeof revision.metadata !==
                    'object'
            ) {
                return 'ready';
            }

            return (
                revision.metadata.status ||
                'ready'
            );
        }

        function setDocumentProcessing(
            documentState,
            processing
        ) {
            if (!documentState) {
                return;
            }

            documentState.processing =
                Boolean(processing);

            if (
                documentState.inputWrapper
            ) {
                documentState.inputWrapper
                    .classList.toggle(
                        'is-processing',
                        documentState.processing
                    );

                documentState.inputWrapper
                    .setAttribute(
                        'aria-busy',
                        documentState.processing
                            ? 'true'
                            : 'false'
                    );
            }

            if (
                documentState.bottomInput
            ) {
                documentState.bottomInput
                    .disabled =
                    documentState.processing;
            }

            setPreviewProcessing(
                documentState,
                documentState.processing
            );

            setSubmitProcessing(
                documentState,
                documentState.processing
            );

            if (
                activeDocument ===
                documentState
            ) {
                syncDocumentActionState(
                    false
                );

                syncHistoryButtons();
            }
        }

        function teardownProcessingUi(
            documentState
        ) {
            if (!documentState) {
                return;
            }

            if (
                documentState.inputWrapper
            ) {
                documentState.inputWrapper
                    .classList.remove(
                        'is-processing'
                    );

                documentState.inputWrapper
                    .setAttribute(
                        'aria-busy',
                        'false'
                    );
            }

            if (
                documentState.bottomInput
            ) {
                documentState.bottomInput
                    .disabled = false;
            }

            setPreviewProcessing(
                documentState,
                false
            );

            setSubmitProcessing(
                documentState,
                false
            );
        }

        function scheduleRevisionPoll(
            documentState
        ) {
            clearRevisionPoll(
                documentState
            );

            if (
                !documentState ||
                !documentState.processing ||
                activeDocument !==
                    documentState
            ) {
                return;
            }

            documentState.revisionPollTimer =
                window.setTimeout(
                    function() {
                        if (
                            activeDocument !==
                            documentState
                        ) {
                            return;
                        }

                        refreshDocumentState(
                            documentState,
                            true
                        );
                    },
                    REVISION_POLL_MS
                );
        }

        function setHistoryActionsVisible(
            visible
        ) {
            if (!activeDocument) {
                return;
            }

            const buttons =
                activeDocument.modal
                    .querySelectorAll(
                        '[data-document-undo], [data-document-redo]'
                    );

            buttons.forEach(
                function(button) {
                    button.classList.toggle(
                        'is-visible',
                        visible
                    );

                    button.setAttribute(
                        'aria-hidden',
                        visible
                            ? 'false'
                            : 'true'
                    );

                    button.tabIndex =
                        visible ? 0 : -1;
                }
            );
        }

        function syncHistoryButtons() {
            if (!activeDocument) {
                return;
            }

            const undoButton =
                activeDocument.modal
                    .querySelector(
                        '[data-document-undo]'
                    );

            const redoButton =
                activeDocument.modal
                    .querySelector(
                        '[data-document-redo]'
                    );

            if (
                !undoButton ||
                !redoButton
            ) {
                return;
            }

            const editing =
                activeDocument.mode ===
                'edit';

            const hasPersistedHistory =
                activeDocument.revisions
                    .length > 1;

            const showHistory =
                editing ||
                hasPersistedHistory;

            setHistoryActionsVisible(
                showHistory
            );

            const blocked =
                activeDocument.saving ||
                activeDocument.processing;

            if (editing) {
                undoButton.disabled =
                    blocked ||
                    activeDocument
                        .historyIndex <= 0;

                redoButton.disabled =
                    blocked ||
                    activeDocument
                        .historyIndex >=
                        activeDocument
                            .history.length - 1;

                return;
            }

            undoButton.disabled =
                blocked ||
                activeDocument
                    .revisionIndex <= 0;

            redoButton.disabled =
                blocked ||
                activeDocument
                    .revisionIndex < 0 ||
                activeDocument
                    .revisionIndex >=
                    activeDocument
                        .revisions.length - 1;
        }

        function getHistorySnapshot() {
            if (!activeDocument) {
                return null;
            }

            return {
                value:
                    activeDocument
                        .editor.value,
                selectionStart:
                    activeDocument.editor
                        .selectionStart || 0,
                selectionEnd:
                    activeDocument.editor
                        .selectionEnd || 0,
            };
        }

        function resetEditorHistory() {
            if (!activeDocument) {
                return;
            }

            const snapshot =
                getHistorySnapshot();

            activeDocument.history =
                snapshot
                    ? [snapshot]
                    : [];

            activeDocument.historyIndex =
                snapshot
                    ? 0
                    : -1;

            activeDocument.historyApplying =
                false;

            syncHistoryButtons();
        }

        function pushEditorHistory() {
            if (
                !activeDocument ||
                activeDocument
                    .historyApplying
            ) {
                return;
            }

            const snapshot =
                getHistorySnapshot();

            if (!snapshot) {
                return;
            }

            const current =
                activeDocument.history[
                    activeDocument
                        .historyIndex
                ];

            if (
                current &&
                current.value ===
                    snapshot.value
            ) {
                current.selectionStart =
                    snapshot.selectionStart;

                current.selectionEnd =
                    snapshot.selectionEnd;

                syncHistoryButtons();

                return;
            }

            if (
                activeDocument
                    .historyIndex <
                activeDocument
                    .history.length - 1
            ) {
                activeDocument.history =
                    activeDocument.history
                        .slice(
                            0,
                            activeDocument
                                .historyIndex + 1
                        );
            }

            activeDocument.history.push(
                snapshot
            );

            if (
                activeDocument.history
                    .length > 100
            ) {
                activeDocument.history.shift();
            } else {
                activeDocument
                    .historyIndex += 1;
            }

            syncHistoryButtons();
        }

        function applyHistorySnapshot(
            index
        ) {
            if (
                !activeDocument ||
                index < 0 ||
                index >=
                    activeDocument
                        .history.length
            ) {
                return;
            }

            const snapshot =
                activeDocument.history[
                    index
                ];

            activeDocument.historyApplying =
                true;

            activeDocument.historyIndex =
                index;

            activeDocument.editor.value =
                snapshot.value;

            activeDocument.historyApplying =
                false;

            setSaveState(
                isDirty()
                    ? 'save'
                    : 'saved'
            );

            syncHistoryButtons();

            window.requestAnimationFrame(
                function() {
                    if (
                        !activeDocument ||
                        activeDocument.mode !==
                            'edit'
                    ) {
                        return;
                    }

                    activeDocument.editor.focus();

                    activeDocument.editor
                        .setSelectionRange(
                            snapshot
                                .selectionStart,
                            snapshot
                                .selectionEnd
                        );
                }
            );
        }

        function applyRevision(
            index,
            focusAction
        ) {
            if (
                !activeDocument ||
                index < 0 ||
                index >=
                    activeDocument
                        .revisions.length
            ) {
                return;
            }

            const revision =
                activeDocument.revisions[
                    index
                ];

            if (
                getRevisionStatus(
                    revision
                ) === 'processing'
            ) {
                return;
            }

            activeDocument.revisionIndex =
                index;

            activeDocument.currentRevisionId =
                revision.id;

            const value =
                typeof revision.content ===
                    'string'
                    ? revision.content
                    : '';

            activeDocument.editor.value =
                value;

            activeDocument.editBaseValue =
                value;

            activeDocument.preview.innerHTML =
                renderDocument(value);

            activeDocument.preview.hidden =
                false;

            activeDocument.editor.hidden =
                true;

            activeDocument.editor.readOnly =
                false;

            activeDocument.editor.style.height =
                '';

            activeDocument.editor.style
                .minHeight = '';

            activeDocument.editor.style
                .maxHeight = '';

            activeDocument.mode = 'view';

            activeDocument.history = [];
            activeDocument.historyIndex = -1;
            activeDocument.historyApplying =
                false;

            syncDocumentActionState(
                true
            );

            syncHistoryButtons();

            if (focusAction) {
                window.requestAnimationFrame(
                    function() {
                        if (!activeDocument) {
                            return;
                        }

                        const actionButton =
                            activeDocument.modal
                                .querySelector(
                                    '[data-document-save]'
                                );

                        if (actionButton) {
                            actionButton.focus();
                        }
                    }
                );
            }
        }

        function undoDocumentEdit() {
            if (
                !activeDocument ||
                activeDocument.saving ||
                activeDocument.processing
            ) {
                return;
            }

            if (
                activeDocument.mode ===
                'edit'
            ) {
                if (
                    activeDocument
                        .historyIndex <= 0
                ) {
                    return;
                }

                applyHistorySnapshot(
                    activeDocument
                        .historyIndex - 1
                );

                return;
            }

            if (
                activeDocument
                    .revisionIndex <= 0
            ) {
                return;
            }

            applyRevision(
                activeDocument
                    .revisionIndex - 1,
                true
            );
        }

        function redoDocumentEdit() {
            if (
                !activeDocument ||
                activeDocument.saving ||
                activeDocument.processing
            ) {
                return;
            }

            if (
                activeDocument.mode ===
                'edit'
            ) {
                if (
                    activeDocument
                        .historyIndex >=
                    activeDocument
                        .history.length - 1
                ) {
                    return;
                }

                applyHistorySnapshot(
                    activeDocument
                        .historyIndex + 1
                );

                return;
            }

            if (
                activeDocument
                    .revisionIndex < 0 ||
                activeDocument
                    .revisionIndex >=
                    activeDocument
                        .revisions.length - 1
            ) {
                return;
            }

            applyRevision(
                activeDocument
                    .revisionIndex + 1,
                true
            );
        }

        function applyServerState(
            documentState,
            data,
            preferLatest
        ) {
            if (
                activeDocument !==
                    documentState ||
                !data
            ) {
                return;
            }

            documentState.savedValue =
                typeof data.saved_value ===
                    'string'
                    ? data.saved_value
                    : '';

            documentState.savedRevisionId =
                data.saved_revision_id ??
                null;

            documentState.revisions =
                Array.isArray(
                    data.revisions
                )
                    ? data.revisions
                    : [];

            if (
                jobsData[
                    documentState.jobIndex
                ]
            ) {
                jobsData[
                    documentState.jobIndex
                ][documentState.field] =
                    documentState.savedValue;
            }

            let targetIndex = -1;

            if (
                documentState.revisions
                    .length
            ) {
                if (
                    !preferLatest &&
                    documentState
                        .currentRevisionId !==
                        null
                ) {
                    targetIndex =
                        documentState.revisions
                            .findIndex(
                                function(
                                    revision
                                ) {
                                    return (
                                        String(
                                            revision.id
                                        ) ===
                                        String(
                                            documentState
                                                .currentRevisionId
                                        )
                                    );
                                }
                            );
                }

                if (targetIndex < 0) {
                    targetIndex =
                        documentState
                            .revisions.length -
                        1;
                }

                const revision =
                    documentState.revisions[
                        targetIndex
                    ];

                documentState
                    .revisionIndex =
                    targetIndex;

                documentState
                    .currentRevisionId =
                    revision.id;

                documentState.editor.value =
                    typeof revision.content ===
                        'string'
                        ? revision.content
                        : '';

                documentState.editBaseValue =
                    documentState
                        .editor.value;

                documentState.preview
                    .innerHTML =
                    renderDocument(
                        documentState
                            .editor.value
                    );
            } else {
                documentState
                    .revisionIndex = -1;

                documentState
                    .currentRevisionId =
                    null;

                documentState.editor.value =
                    documentState.savedValue;

                documentState.editBaseValue =
                    documentState.savedValue;

                documentState.preview
                    .innerHTML =
                    renderDocument(
                        documentState
                            .savedValue
                    );
            }

            documentState.mode = 'view';

            documentState.editor.hidden =
                true;

            documentState.editor.readOnly =
                false;

            documentState.editor.style.height =
                '';

            documentState.editor.style
                .minHeight = '';

            documentState.editor.style
                .maxHeight = '';

            documentState.preview.hidden =
                false;

            documentState.history = [];
            documentState.historyIndex = -1;
            documentState.historyApplying =
                false;

            setDocumentProcessing(
                documentState,
                Boolean(data.processing)
            );

            syncDocumentActionState(
                true
            );

            syncHistoryButtons();

            if (
                documentState.processing
            ) {
                scheduleRevisionPoll(
                    documentState
                );
            } else {
                clearRevisionPoll(
                    documentState
                );
            }
        }

        async function refreshDocumentState(
            documentState,
            preferLatest
        ) {
            if (!documentState) {
                return;
            }

            const url = new URL(
                stateEndpoint,
                window.location.origin
            );

            url.searchParams.set(
                'id',
                documentState.jobId
            );

            url.searchParams.set(
                'field',
                documentState.field
            );

            try {
                const response =
                    await fetch(
                        url.toString(),
                        {
                            method: 'GET',
                            headers: {
                                'X-Requested-With':
                                    'XMLHttpRequest',
                            },
                            credentials:
                                'same-origin',
                        }
                    );

                let data = {};

                try {
                    data =
                        await response.json();
                } catch (error) {
                    data = {};
                }

                if (
                    !response.ok ||
                    !data.ok
                ) {
                    throw new Error(
                        data.error ||
                        'Could not load document revisions'
                    );
                }

                if (
                    activeDocument !==
                    documentState
                ) {
                    return;
                }

                applyServerState(
                    documentState,
                    data,
                    Boolean(
                        preferLatest
                    )
                );
            } catch (error) {
                if (
                    activeDocument !==
                    documentState
                ) {
                    return;
                }

                if (
                    documentState.processing
                ) {
                    scheduleRevisionPoll(
                        documentState
                    );

                    return;
                }

                notifyError(
                    'Could not load the document revision history.'
                );
            }
        }

        async function submitDocumentRevision(
            documentState
        ) {
            if (
                !documentState ||
                documentState.processing ||
                documentState.saving ||
                !documentState.bottomInput
            ) {
                return;
            }

            const instruction =
                documentState.bottomInput
                    .value
                    .trim();

            if (!instruction) {
                return;
            }

            const currentValue =
                documentState.editor.value;

            const previousInputValue =
                documentState.bottomInput
                    .value;

            documentState.bottomInput.value =
                '';

            resizeBottomInput(
                documentState.bottomInput
            );

            updateBottomSubmitState(
                documentState.bottomInput
            );

            if (
                documentState.mode ===
                'edit'
            ) {
                documentState.mode =
                    'view';

                documentState.editor.hidden =
                    true;

                documentState.editor.readOnly =
                    false;

                documentState.editor.style
                    .height = '';

                documentState.editor.style
                    .minHeight = '';

                documentState.editor.style
                    .maxHeight = '';

                documentState.preview.innerHTML =
                    renderDocument(
                        currentValue
                    );

                documentState.preview.hidden =
                    false;

                documentState.history = [];
                documentState.historyIndex =
                    -1;

                documentState
                    .historyApplying =
                    false;
            }

            setDocumentProcessing(
                documentState,
                true
            );

            try {
                const response =
                    await fetch(
                        revisionEndpoint,
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type':
                                    'application/json',
                                'X-CSRFToken':
                                    getCsrfToken(),
                                'X-Requested-With':
                                    'XMLHttpRequest',
                            },
                            credentials:
                                'same-origin',
                            body: JSON.stringify({
                                id:
                                    documentState
                                        .jobId,
                                field:
                                    documentState
                                        .field,
                                instruction:
                                    instruction,
                                current_revision_id:
                                    documentState
                                        .currentRevisionId,
                                current_value:
                                    currentValue,
                            }),
                        }
                    );

                let data = {};

                try {
                    data =
                        await response.json();
                } catch (error) {
                    data = {};
                }

                if (
                    !response.ok ||
                    !data.ok
                ) {
                    throw new Error(
                        data.error ||
                        'Document revision failed'
                    );
                }

                if (
                    activeDocument !==
                    documentState
                ) {
                    return;
                }

                applyServerState(
                    documentState,
                    data,
                    true
                );
            } catch (error) {
                if (
                    activeDocument !==
                    documentState
                ) {
                    return;
                }

                documentState.bottomInput.value =
                    previousInputValue;

                resizeBottomInput(
                    documentState.bottomInput
                );

                setDocumentProcessing(
                    documentState,
                    false
                );

                updateBottomSubmitState(
                    documentState.bottomInput
                );

                notifyError(
                    error.message ||
                    'Could not create the document revision.'
                );
            }
        }

        function enterEditMode() {
            if (
                !activeDocument ||
                activeDocument.processing ||
                activeDocument.saving
            ) {
                return;
            }

            const previewHeight =
                activeDocument.preview
                    .getBoundingClientRect()
                    .height;

            if (previewHeight > 0) {
                activeDocument.editor
                    .style.height =
                    Math.ceil(
                        previewHeight
                    ) + 'px';
            }

            activeDocument.editBaseValue =
                activeDocument.editor.value;

            activeDocument.mode = 'edit';

            activeDocument.preview.hidden =
                true;

            activeDocument.editor.hidden =
                false;

            activeDocument.editor.readOnly =
                false;

            resetEditorHistory();

            setHistoryActionsVisible(
                true
            );

            setSaveState(
                'save',
                true
            );

            window.requestAnimationFrame(
                function() {
                    if (
                        !activeDocument ||
                        activeDocument.mode !==
                            'edit'
                    ) {
                        return;
                    }

                    activeDocument.editor
                        .focus();
                }
            );
        }

        function openDocument(trigger) {
            const modalType =
                trigger.dataset.modal;

            let modalId = '';
            let field = '';

            if (
                modalType ===
                'cover-letter'
            ) {
                modalId =
                    'cover-letter-modal';

                field =
                    'cover_letter';
            } else if (
                modalType ===
                'resume'
            ) {
                modalId =
                    'resume-modal';

                field = 'resume';
            } else {
                return;
            }

            const jobIndex =
                parseInt(
                    trigger.dataset.jobId,
                    10
                ) - 1;

            const job =
                jobsData[jobIndex];

            if (
                !job ||
                job.id === undefined ||
                job.id === null
            ) {
                return;
            }

            const modal =
                document.getElementById(
                    modalId
                );

            const editor = modal
                ? modal.querySelector(
                    '[data-document-editor]'
                )
                : null;

            const preview = modal
                ? modal.querySelector(
                    '[data-document-preview]'
                )
                : null;

            const bottomInput = modal
                ? modal.querySelector(
                    '[data-document-bottom-input]'
                )
                : null;

            const inputWrapper = modal
                ? modal.querySelector(
                    '.job-modal__input-wrapper'
                )
                : null;

            const submitButton = modal
                ? modal.querySelector(
                    '[data-document-bottom-submit]'
                )
                : null;

            if (
                !modal ||
                !editor ||
                !preview
            ) {
                return;
            }

            const storedValue =
                typeof job[field] ===
                    'string'
                    ? job[field]
                    : job[field] == null
                        ? ''
                        : String(
                            job[field]
                        );

            lastTrigger =
                trigger;

            activeDocument = {
                modal: modal,
                editor: editor,
                preview: preview,
                bottomInput: bottomInput,
                inputWrapper: inputWrapper,
                submitButton: submitButton,

                jobIndex: jobIndex,
                jobId: job.id,
                field: field,

                savedValue:
                    storedValue,

                savedRevisionId:
                    null,

                currentRevisionId:
                    null,

                revisions: [],
                revisionIndex: -1,

                revisionPollTimer:
                    null,

                processing: false,
                saving: false,

                editBaseValue:
                    storedValue,

                closeAfterSave:
                    false,

                exitEditAfterSave:
                    false,

                confirmationAction:
                    null,

                savedFeedbackTimer:
                    null,

                mode: 'view',

                history: [],
                historyIndex: -1,
                historyApplying: false,
            };

            editor.value =
                storedValue;

            editor.readOnly =
                false;

            editor.hidden =
                true;

            editor.style.height =
                '';

            editor.style.minHeight =
                '';

            editor.style.maxHeight =
                '';

            preview.innerHTML =
                renderDocument(
                    storedValue
                );

            preview.hidden =
                false;

            if (bottomInput) {
                bottomInput.value =
                    '';

                bottomInput.disabled =
                    false;

                resizeBottomInput(
                    bottomInput
                );
            }

            if (submitButton) {
                submitButton.disabled =
                    false;
            }

            if (inputWrapper) {
                inputWrapper.classList.remove(
                    'is-processing'
                );

                inputWrapper.setAttribute(
                    'aria-busy',
                    'false'
                );
            }

            updateBottomSubmitState(
                bottomInput
            );

            setHistoryActionsVisible(
                false
            );

            modal.classList.add(
                'active'
            );

            modal.setAttribute(
                'aria-hidden',
                'false'
            );

            setSaveState(
                'edit'
            );

            syncBodyLock();

            refreshDocumentState(
                activeDocument,
                true
            );

            const actionButton =
                modal.querySelector(
                    '[data-document-save]'
                );

            if (actionButton) {
                window.requestAnimationFrame(
                    function() {
                        if (
                            activeDocument &&
                            activeDocument.modal ===
                                modal
                        ) {
                            actionButton.focus();
                        }
                    }
                );
            }
        }

        function closeDocumentModal() {
            if (!activeDocument) {
                return;
            }

            const documentState =
                activeDocument;

            const modal =
                documentState.modal;

            clearRevisionPoll(
                documentState
            );

            clearSavedFeedbackTimer(
                documentState
            );

            teardownProcessingUi(
                documentState
            );

            confirmation.classList.remove(
                'active'
            );

            confirmation.setAttribute(
                'aria-hidden',
                'true'
            );

            modal.classList.remove(
                'active'
            );

            modal.setAttribute(
                'aria-hidden',
                'true'
            );

            activeDocument = null;

            syncBodyLock();

            if (
                lastTrigger &&
                document.documentElement
                    .contains(
                        lastTrigger
                    )
            ) {
                lastTrigger.focus();
            }
        }

        function exitEditMode() {
            if (!activeDocument) {
                return;
            }

            activeDocument.mode =
                'view';

            activeDocument
                .confirmationAction =
                null;

            activeDocument
                .exitEditAfterSave =
                false;

            activeDocument.editor.hidden =
                true;

            activeDocument.editor.readOnly =
                false;

            activeDocument.editor.style
                .height = '';

            activeDocument.editor.style
                .minHeight = '';

            activeDocument.editor.style
                .maxHeight = '';

            activeDocument.preview.innerHTML =
                renderDocument(
                    activeDocument
                        .editor.value
                );

            activeDocument.preview.hidden =
                false;

            activeDocument.editBaseValue =
                activeDocument.editor.value;

            activeDocument.history = [];
            activeDocument.historyIndex = -1;
            activeDocument.historyApplying =
                false;

            syncDocumentActionState(
                true
            );

            syncHistoryButtons();
        }

        function openConfirmation(
            action
        ) {
            if (!activeDocument) {
                return;
            }

            activeDocument
                .confirmationAction =
                action ||
                'close-modal';

            confirmation.classList.add(
                'active'
            );

            confirmation.setAttribute(
                'aria-hidden',
                'false'
            );

            syncBodyLock();

            const saveButton =
                confirmation.querySelector(
                    '[data-confirm-save]'
                );

            if (saveButton) {
                window.requestAnimationFrame(
                    function() {
                        saveButton.focus();
                    }
                );
            }
        }

        function closeConfirmation(
            restoreEditorFocus
        ) {
            confirmation.classList.remove(
                'active'
            );

            confirmation.setAttribute(
                'aria-hidden',
                'true'
            );

            if (activeDocument) {
                activeDocument
                    .confirmationAction =
                    null;
            }

            syncBodyLock();

            if (
                restoreEditorFocus &&
                activeDocument &&
                activeDocument.mode ===
                    'edit'
            ) {
                window.requestAnimationFrame(
                    function() {
                        if (
                            activeDocument &&
                            activeDocument.mode ===
                                'edit'
                        ) {
                            activeDocument.editor
                                .focus();
                        }
                    }
                );
            }
        }

        function requestDocumentClose() {
            if (!activeDocument) {
                return;
            }

            if (
                activeDocument.processing
            ) {
                closeDocumentModal();
                return;
            }

            if (
                activeDocument.saving
            ) {
                activeDocument
                    .closeAfterSave =
                    true;

                return;
            }

            if (isDirty()) {
                openConfirmation(
                    'close-modal'
                );

                return;
            }

            closeDocumentModal();
        }

        function requestEditorClose() {
            if (
                !activeDocument ||
                activeDocument.mode !==
                    'edit'
            ) {
                return;
            }

            if (
                activeDocument.saving
            ) {
                activeDocument
                    .exitEditAfterSave =
                    true;

                return;
            }

            if (isEditorDirty()) {
                openConfirmation(
                    'close-editor'
                );

                return;
            }

            exitEditMode();
        }

        function syncSaveResponseState(
            documentState,
            data,
            fallbackValue
        ) {
            documentState.savedValue =
                typeof data.saved_value ===
                    'string'
                    ? data.saved_value
                    : fallbackValue;

            documentState.savedRevisionId =
                data.saved_revision_id ??
                documentState
                    .savedRevisionId;

            if (
                Array.isArray(
                    data.revisions
                )
            ) {
                documentState.revisions =
                    data.revisions;
            }

            if (
                documentState
                    .savedRevisionId !==
                    null &&
                documentState.revisions
                    .length
            ) {
                const savedIndex =
                    documentState.revisions
                        .findIndex(
                            function(
                                revision
                            ) {
                                return (
                                    String(
                                        revision.id
                                    ) ===
                                    String(
                                        documentState
                                            .savedRevisionId
                                    )
                                );
                            }
                        );

                if (
                    savedIndex >= 0
                ) {
                    documentState
                        .revisionIndex =
                        savedIndex;

                    documentState
                        .currentRevisionId =
                        documentState
                            .revisions[
                                savedIndex
                            ].id;
                }
            }

            documentState.editor.value =
                documentState.savedValue;

            documentState.editBaseValue =
                documentState.savedValue;

            documentState.preview.innerHTML =
                renderDocument(
                    documentState.savedValue
                );

            if (
                jobsData[
                    documentState.jobIndex
                ]
            ) {
                jobsData[
                    documentState.jobIndex
                ][documentState.field] =
                    documentState.savedValue;
            }
        }

        async function saveDocument(
            closeAfterSave,
            exitEditAfterSave
        ) {
            if (!activeDocument) {
                return false;
            }

            if (
                activeDocument.processing
            ) {
                return false;
            }

            if (
                activeDocument.saving
            ) {
                if (closeAfterSave) {
                    activeDocument
                        .closeAfterSave =
                        true;
                }

                if (exitEditAfterSave) {
                    activeDocument
                        .exitEditAfterSave =
                        true;
                }

                return false;
            }

            if (!isDirty()) {
                if (closeAfterSave) {
                    closeDocumentModal();
                } else if (
                    exitEditAfterSave
                ) {
                    exitEditMode();
                } else {
                    showSavedFeedback(
                        false
                    );
                }

                return true;
            }

            const state =
                activeDocument;

            const valueToSave =
                state.editor.value;

            state.saving = true;

            state.closeAfterSave =
                Boolean(
                    closeAfterSave
                );

            state.exitEditAfterSave =
                Boolean(
                    exitEditAfterSave
                );

            state.editor.readOnly =
                true;

            syncHistoryButtons();

            const savingAnimation =
                beginSavingAnimation(
                    state
                );

            try {
                const response =
                    await fetch(
                        saveEndpoint,
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type':
                                    'application/json',
                                'X-CSRFToken':
                                    getCsrfToken(),
                                'X-Requested-With':
                                    'XMLHttpRequest',
                            },
                            credentials:
                                'same-origin',
                            body: JSON.stringify({
                                id:
                                    state.jobId,
                                field:
                                    state.field,
                                value:
                                    valueToSave,
                                current_revision_id:
                                    state
                                        .currentRevisionId,
                            }),
                        }
                    );

                let data = {};

                try {
                    data =
                        await response.json();
                } catch (error) {
                    data = {};
                }

                await savingAnimation;

                if (
                    !response.ok ||
                    !data.ok
                ) {
                    throw new Error(
                        data.error ||
                        'Document save failed'
                    );
                }

                if (
                    activeDocument !==
                    state
                ) {
                    return true;
                }

                syncSaveResponseState(
                    state,
                    data,
                    valueToSave
                );

                state.saving =
                    false;

                state.editor.readOnly =
                    false;

                syncHistoryButtons();

                const shouldClose =
                    state.closeAfterSave;

                const shouldExitEdit =
                    state.exitEditAfterSave;

                state.closeAfterSave =
                    false;

                state.exitEditAfterSave =
                    false;

                if (shouldClose) {
                    closeDocumentModal();
                } else if (
                    shouldExitEdit
                ) {
                    exitEditMode();
                } else {
                    showSavedFeedback(
                        true
                    );
                }

                return true;
            } catch (error) {
                await savingAnimation;

                if (
                    activeDocument ===
                    state
                ) {
                    state.saving =
                        false;

                    state.closeAfterSave =
                        false;

                    state.exitEditAfterSave =
                        false;

                    state.editor.readOnly =
                        false;

                    syncHistoryButtons();

                    collapseToSaveState(
                        isDirty()
                            ? 'save'
                            : (
                                state.mode ===
                                    'view'
                                    ? 'edit'
                                    : 'saved'
                            )
                    );

                    notifyError(
                        'Could not save your changes. Your edited text has been kept so you can try again.'
                    );

                    if (
                        state.mode ===
                        'edit'
                    ) {
                        window
                            .requestAnimationFrame(
                                function() {
                                    if (
                                        activeDocument ===
                                        state
                                    ) {
                                        state.editor
                                            .focus();
                                    }
                                }
                            );
                    }
                }

                return false;
            }
        }

        async function copyText(
            text
        ) {
            if (
                navigator.clipboard &&
                typeof navigator.clipboard
                    .writeText ===
                    'function' &&
                window.isSecureContext
            ) {
                try {
                    await navigator.clipboard
                        .writeText(
                            text
                        );

                    return;
                } catch (error) {
                }
            }

            const helper =
                document.createElement(
                    'textarea'
                );

            const previousFocus =
                document.activeElement;

            helper.className =
                'job-modal__clipboard-helper';

            helper.value =
                text;

            helper.setAttribute(
                'readonly',
                ''
            );

            document.body.appendChild(
                helper
            );

            let copied = false;

            try {
                helper.focus();
                helper.select();

                copied =
                    document.execCommand(
                        'copy'
                    );
            } finally {
                helper.remove();

                if (
                    previousFocus &&
                    typeof previousFocus
                        .focus ===
                        'function'
                ) {
                    previousFocus.focus();
                }
            }

            if (!copied) {
                throw new Error(
                    'Clipboard copy failed'
                );
            }
        }

        function showCopyFeedback(
            button,
            state
        ) {
            button.dataset.copyState =
                state;

            window.setTimeout(
                function() {
                    if (
                        button.dataset
                            .copyState ===
                        state
                    ) {
                        delete button
                            .dataset
                            .copyState;
                    }
                },
                1200
            );
        }

        async function copyDocument(
            button
        ) {
            if (!activeDocument) {
                return;
            }

            try {
                await copyText(
                    activeDocument
                        .editor.value
                );

                showCopyFeedback(
                    button,
                    'copied'
                );
            } catch (error) {
                showCopyFeedback(
                    button,
                    'error'
                );

                notifyError(
                    'Could not copy the text to your clipboard.'
                );
            }
        }

        document.addEventListener(
            'input',
            function(event) {
                if (
                    event.target.matches(
                        '[data-document-bottom-input]'
                    )
                ) {
                    resizeBottomInput(
                        event.target
                    );

                    updateBottomSubmitState(
                        event.target
                    );

                    return;
                }

                if (
                    !activeDocument ||
                    event.target !==
                        activeDocument
                            .editor ||
                    activeDocument.saving ||
                    activeDocument
                        .processing ||
                    activeDocument
                        .historyApplying
                ) {
                    return;
                }

                pushEditorHistory();

                setSaveState(
                    isDirty()
                        ? 'save'
                        : 'saved'
                );
            }
        );

        document.addEventListener(
            'click',
            function(event) {
                const trigger =
                    event.target.closest(
                        '[data-modal]'
                    );

                if (trigger) {
                    event.preventDefault();

                    openDocument(
                        trigger
                    );

                    return;
                }

                const revisionSubmit =
                    event.target.closest(
                        '[data-document-bottom-submit]'
                    );

                if (
                    revisionSubmit &&
                    activeDocument &&
                    activeDocument.modal
                        .contains(
                            revisionSubmit
                        )
                ) {
                    event.preventDefault();

                    submitDocumentRevision(
                        activeDocument
                    );

                    return;
                }

                const saveButton =
                    event.target.closest(
                        '[data-document-save]'
                    );

                if (
                    saveButton &&
                    activeDocument &&
                    activeDocument.modal
                        .contains(
                            saveButton
                        )
                ) {
                    event.preventDefault();

                    if (
                        activeDocument
                            .processing
                    ) {
                        return;
                    }

                    const state =
                        saveButton.dataset
                            .saveState;

                    if (
                        state === 'edit'
                    ) {
                        enterEditMode();
                        return;
                    }

                    if (
                        state === 'saved' ||
                        state ===
                            'saved-feedback'
                    ) {
                        showSavedFeedback();
                        return;
                    }

                    saveDocument(
                        false,
                        false
                    );

                    return;
                }

                const undoButton =
                    event.target.closest(
                        '[data-document-undo]'
                    );

                if (
                    undoButton &&
                    activeDocument &&
                    activeDocument.modal
                        .contains(
                            undoButton
                        )
                ) {
                    event.preventDefault();

                    undoDocumentEdit();

                    return;
                }

                const redoButton =
                    event.target.closest(
                        '[data-document-redo]'
                    );

                if (
                    redoButton &&
                    activeDocument &&
                    activeDocument.modal
                        .contains(
                            redoButton
                        )
                ) {
                    event.preventDefault();

                    redoDocumentEdit();

                    return;
                }

                const copyButton =
                    event.target.closest(
                        '[data-document-copy]'
                    );

                if (
                    copyButton &&
                    activeDocument &&
                    activeDocument.modal
                        .contains(
                            copyButton
                        )
                ) {
                    event.preventDefault();

                    copyDocument(
                        copyButton
                    );

                    return;
                }

                const confirmationSave =
                    event.target.closest(
                        '[data-confirm-save]'
                    );

                if (
                    confirmationSave
                ) {
                    event.preventDefault();

                    const action =
                        activeDocument
                            ? activeDocument
                                .confirmationAction
                            : null;

                    closeConfirmation(
                        false
                    );

                    saveDocument(
                        action ===
                            'close-modal',
                        action ===
                            'close-editor'
                    );

                    return;
                }

                const confirmationDiscard =
                    event.target.closest(
                        '[data-confirm-discard]'
                    );

                if (
                    confirmationDiscard
                ) {
                    event.preventDefault();

                    const action =
                        activeDocument
                            ? activeDocument
                                .confirmationAction
                            : null;

                    if (
                        activeDocument &&
                        action ===
                            'close-editor'
                    ) {
                        activeDocument
                            .editor.value =
                            activeDocument
                                .editBaseValue;
                    }

                    closeConfirmation(
                        false
                    );

                    if (
                        action ===
                        'close-editor'
                    ) {
                        exitEditMode();
                    } else {
                        closeDocumentModal();
                    }

                    return;
                }

                const confirmationCancel =
                    event.target.closest(
                        '[data-confirm-cancel]'
                    );

                if (
                    confirmationCancel
                ) {
                    event.preventDefault();

                    closeConfirmation(
                        true
                    );

                    return;
                }

                if (
                    event.target.classList
                        .contains(
                            'job-save-confirmation__overlay'
                        )
                ) {
                    closeConfirmation(
                        true
                    );

                    return;
                }

                const closeButton =
                    event.target.closest(
                        '[data-close-modal]'
                    );

                if (
                    closeButton &&
                    activeDocument &&
                    activeDocument.modal
                        .contains(
                            closeButton
                        )
                ) {
                    event.preventDefault();

                    requestDocumentClose();

                    return;
                }

                if (
                    event.target.classList
                        .contains(
                            'job-modal__overlay'
                        ) &&
                    activeDocument &&
                    activeDocument.modal
                        .contains(
                            event.target
                        )
                ) {
                    requestDocumentClose();

                    return;
                }

                const modalContent =
                    event.target.closest(
                        '.job-modal__content'
                    );

                const documentInputArea =
                    event.target.closest(
                        '[data-document-input-area]'
                    );

                if (
                    activeDocument &&
                    activeDocument.mode ===
                        'edit' &&
                    modalContent &&
                    activeDocument.modal
                        .contains(
                            modalContent
                        ) &&
                    !activeDocument.editor
                        .contains(
                            event.target
                        ) &&
                    !documentInputArea
                ) {
                    requestEditorClose();
                }
            }
        );

        document.addEventListener(
            'keydown',
            function(event) {
                if (
                    !activeDocument ||
                    activeDocument.saving ||
                    activeDocument
                        .processing ||
                    confirmation.classList
                        .contains(
                            'active'
                        )
                ) {
                    return;
                }

                const modifier =
                    event.ctrlKey ||
                    event.metaKey;

                if (
                    !modifier ||
                    event.altKey
                ) {
                    return;
                }

                if (
                    event.target.matches(
                        '[data-document-bottom-input]'
                    )
                ) {
                    return;
                }

                const key =
                    event.key
                        .toLowerCase();

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
            }
        );

        document.addEventListener(
            'keydown',
            function(event) {
                if (
                    event.key !==
                    'Escape'
                ) {
                    return;
                }

                const notifyOverlay =
                    document.getElementById(
                        'notifyModalOverlay'
                    );

                if (
                    notifyOverlay &&
                    !notifyOverlay.hidden
                ) {
                    return;
                }

                if (
                    confirmation.classList
                        .contains(
                            'active'
                        )
                ) {
                    event.preventDefault();

                    closeConfirmation(
                        true
                    );

                    return;
                }

                if (
                    activeDocument &&
                    activeDocument.modal
                        .classList
                        .contains(
                            'active'
                        )
                ) {
                    event.preventDefault();

                    requestDocumentClose();
                }
            }
        );
    }

    if (
        document.readyState ===
        'loading'
    ) {
        document.addEventListener(
            'DOMContentLoaded',
            initJobDocumentEditor
        );
    } else {
        initJobDocumentEditor();
    }
})();