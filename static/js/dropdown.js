/* ============================================
   DROPDOWN — Generic reusable dropdown component
   Usage:
     initDropdown(rootElement)
   Modifier classes on the root .dropdown-menu element:
     .allow-search   — activates the search input
     .allow-custom   — activates the "add custom value" button
   Public API (set on root element):
     root._dropdownSetValue(value)
     root._dropdownGetValue()
   ============================================ */

(function () {
    'use strict';

    /**
     * Initialises one dropdown component.
     * @param {HTMLElement} root  – the .dropdown-menu element
     */
    function initDropdown(root) {
        if (!root || root._dropdownInit) return;
        root._dropdownInit = true;

        var allowSearch = root.classList.contains('allow-search');
        var allowCustom = root.classList.contains('allow-custom');

        var trigger   = root.querySelector('.dropdown-menu__trigger');
        var panel     = root.querySelector('.dropdown-menu__panel');
        var search    = root.querySelector('.dropdown-menu__search');
        var list      = root.querySelector('.dropdown-menu__list');
        var empty     = root.querySelector('.dropdown-menu__empty');
        var customBtn = root.querySelector('.dropdown-menu__custom-btn');
        var customLbl = root.querySelector('.dropdown-menu__custom-label');
        var hidden    = root.querySelector('.dropdown-menu__hidden');
        var textSpan  = root.querySelector('.dropdown-menu__text');

        // ── Open / close ─────────────────────────────────

        function openPanel() {
            document.querySelectorAll('.dropdown-menu__panel.is-open').forEach(function (p) {
                if (p !== panel) closePanel(p.closest('.dropdown-menu'));
            });
            panel.classList.add('is-open');
            trigger.setAttribute('aria-expanded', 'true');
            if (allowSearch && search) {
                search.value = '';
                filterItems('');
                setTimeout(function () { search.focus(); }, 60);
            }
        }

        function closePanel(r) {
            var target = r || root;
            var p = target.querySelector('.dropdown-menu__panel');
            var t = target.querySelector('.dropdown-menu__trigger');
            if (p) p.classList.remove('is-open');
            if (t) t.setAttribute('aria-expanded', 'false');
        }

        function isOpen() {
            return panel.classList.contains('is-open');
        }

        // ── Select ───────────────────────────────────────

        function selectItem(value) {
            hidden.value = value;
            textSpan.textContent = value;
            textSpan.classList.remove('dropdown-menu__text--placeholder');
            list.querySelectorAll('.dropdown-menu__item').forEach(function (it) {
                it.classList.toggle('is-selected', it.getAttribute('data-value') === value);
            });
            closePanel();
        }

        // ── Filter (only active when allow-search) ───────

        function filterItems(q) {
            if (!allowSearch) return;
            var query = q.toLowerCase().trim();
            var visibleCount = 0;

            list.querySelectorAll('.dropdown-menu__item').forEach(function (it) {
                var text = (it.getAttribute('data-value') + ' ' + it.textContent).toLowerCase();
                var show = !query || text.includes(query);
                it.classList.toggle('is-hidden', !show);
                if (show) visibleCount++;
            });

            list.querySelectorAll('.dropdown-menu__group-label').forEach(function (gl) {
                var next = gl.nextElementSibling;
                var anyVisible = false;
                while (next && !next.classList.contains('dropdown-menu__group-label')) {
                    if (!next.classList.contains('is-hidden')) anyVisible = true;
                    next = next.nextElementSibling;
                }
                gl.style.display = anyVisible ? '' : 'none';
            });

            if (empty) empty.classList.toggle('is-visible', visibleCount === 0);

            if (allowCustom && customBtn) {
                if (q.trim()) {
                    var exactMatch = Array.from(list.querySelectorAll('.dropdown-menu__item')).some(function (it) {
                        return it.getAttribute('data-value').toLowerCase() === q.toLowerCase().trim();
                    });
                    customBtn.classList.toggle('is-visible', !exactMatch);
                    if (customLbl) customLbl.textContent = 'Add "' + q.trim() + '"';
                } else {
                    customBtn.classList.remove('is-visible');
                }
            }
        }

        // ── Programmatic value setter ────────────────────

        function setValue(rawValue) {
            if (rawValue == null || rawValue === '') return;
            var match = Array.from(list.querySelectorAll('.dropdown-menu__item')).find(function (it) {
                return it.getAttribute('data-value').toLowerCase() === rawValue.toLowerCase();
            });
            if (match) {
                selectItem(match.getAttribute('data-value'));
            } else {
                var newItem = document.createElement('div');
                newItem.className = 'dropdown-menu__item';
                newItem.setAttribute('data-value', rawValue);
                newItem.setAttribute('role', 'option');
                newItem.textContent = rawValue;
                list.appendChild(newItem);
                newItem.addEventListener('click', function () { selectItem(rawValue); });
                selectItem(rawValue);
            }
        }

        // ── Event wiring ─────────────────────────────────

        trigger.addEventListener('click', function (e) {
            e.stopPropagation();
            isOpen() ? closePanel() : openPanel();
        });

        if (allowSearch && search) {
            search.addEventListener('click', function (e) { e.stopPropagation(); });

            search.addEventListener('input', function () { filterItems(search.value); });

            search.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    var q = search.value.trim();
                    if (!q) return;
                    var visible = Array.from(list.querySelectorAll('.dropdown-menu__item:not(.is-hidden)'));
                    if (visible.length === 1) {
                        selectItem(visible[0].getAttribute('data-value'));
                    } else if (allowCustom) {
                        setValue(q);
                    }
                } else if (e.key === 'Escape') {
                    closePanel();
                }
            });
        }

        list.addEventListener('click', function (e) {
            var item = e.target.closest('.dropdown-menu__item');
            if (!item) return;
            selectItem(item.getAttribute('data-value'));
        });

        if (allowCustom && customBtn) {
            customBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                var q = allowSearch && search ? search.value.trim() : '';
                if (q) setValue(q);
            });
        }

        document.addEventListener('click', function (e) {
            if (!root.contains(e.target)) closePanel();
        });

        // ── Public API ───────────────────────────────────
        root._dropdownSetValue = setValue;
        root._dropdownGetValue = function () { return hidden.value; };
    }

    // Expose globally
    window.initDropdown = initDropdown;

})();