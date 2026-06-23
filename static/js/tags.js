/* ============================================
   TAGS — Generic reusable tag-input component
   Usage:
     initTagInput(wrapperElement, textInputElement, hiddenInputElement)
   Modifier classes on the root .tag-wrapper element:
     .row    — tags stacked vertically (one per line)
     .grid   — tags displayed inline as chips
   Public API (set on wrapper element):
     wrapper._setTags(array)
     wrapper._getTags()
   ============================================ */

(function () {
    'use strict';

    /**
     * Initialises one tag-input component.
     * @param {HTMLElement} wrapper    – the .tag-wrapper element
     * @param {HTMLInputElement} textInput – the visible text input
     * @param {HTMLInputElement} hidden    – the hidden input for form value
     */
    function initTagInput(wrapper, textInput, hidden) {
        if (!wrapper || !textInput || !hidden) return;
        if (wrapper._tagInit) return;
        wrapper._tagInit = true;

        const tagList = wrapper.querySelector('.tag-list');
        let tags = [];

        // ── Render ───────────────────────────────────────

        function renderTags() {
            tagList.querySelectorAll('.tag-item').forEach(function (el) { el.remove(); });

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
                removeBtn.innerHTML =
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
                    'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                    '<line x1="18" y1="6" x2="6" y2="18"/>' +
                    '<line x1="6" y1="6" x2="18" y2="18"/>' +
                    '</svg>';

                removeBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    tags.splice(idx, 1);
                    renderTags();
                    syncHidden();
                });

                item.appendChild(text);
                item.appendChild(removeBtn);
                tagList.appendChild(item);
            });
        }

        // ── Sync hidden input ────────────────────────────

        function syncHidden() {
            hidden.value = JSON.stringify(tags);
        }

        // ── Add tag ──────────────────────────────────────

        function addTag(value) {
            const trimmed = value.trim().replace(/,+$/, '');
            if (!trimmed || tags.includes(trimmed)) return;
            tags.push(trimmed);
            renderTags();
            syncHidden();
        }

        // ── Public API ───────────────────────────────────

        function setTags(arr) {
            tags = Array.isArray(arr) ? arr.slice() : [];
            renderTags();
            syncHidden();
        }

        // ── Event wiring ─────────────────────────────────

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

    // Expose globally
    window.initTagInput = initTagInput;

})();