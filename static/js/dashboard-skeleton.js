/**
 * dashboard-skeleton.js
 * Universal skeleton loader for all dashboard pages.
 *
 * Usage in templates:
 *   - Add data-skeleton-container to any section that loads async data
 *   - Add data-skeleton-template="<type>" to define what skeleton to render
 *     Supported types: card, stat, table, list, chart, profile, form, tags
 *   - Call window.DashboardSkeleton.show(el) / .hide(el) manually if needed
 */

(function () {
    'use strict';

    // ── Skeleton HTML templates ────────────────────────────────────────────
    const TEMPLATES = {

        card: `
            <div class="skeleton-card" aria-hidden="true">
                <div style="padding: var(--spacing-md);">
                    <div class="skeleton skeleton-heading" style="margin-bottom:var(--spacing-sm);"></div>
                    <div class="skeleton skeleton-line skeleton-line--long"></div>
                    <div class="skeleton skeleton-line skeleton-line--medium"></div>
                    <div class="skeleton skeleton-line skeleton-line--short" style="margin-top:var(--spacing-sm);"></div>
                </div>
            </div>`,

        stat: `
            <div class="skeleton skeleton-stat" aria-hidden="true">
                <div style="padding:var(--spacing-md);display:flex;flex-direction:column;gap:var(--spacing-xs);">
                    <div class="skeleton skeleton-line skeleton-line--medium"></div>
                    <div class="skeleton skeleton-heading skeleton-heading--lg"></div>
                    <div class="skeleton skeleton-line skeleton-line--short"></div>
                </div>
            </div>`,

        table: `
            <div aria-hidden="true" style="display:flex;flex-direction:column;gap:var(--spacing-xs);">
                <div class="skeleton skeleton-table-row" style="opacity:0.5;"></div>
                ${Array.from({length: 5}, () =>
                    `<div class="skeleton skeleton-table-row"></div>`
                ).join('')}
            </div>`,

        list: `
            <div aria-hidden="true">
                ${Array.from({length: 4}, () => `
                    <div class="skeleton-list-item">
                        <div class="skeleton skeleton-avatar skeleton-avatar--md"></div>
                        <div class="skeleton-list-item__content">
                            <div class="skeleton skeleton-line skeleton-line--long"></div>
                            <div class="skeleton skeleton-line skeleton-line--medium"></div>
                        </div>
                        <div class="skeleton skeleton-badge"></div>
                    </div>`
                ).join('')}
            </div>`,

        chart: `
            <div aria-hidden="true" style="display:flex;flex-direction:column;gap:var(--spacing-sm);">
                <div class="skeleton skeleton-heading" style="width:35%;"></div>
                <div class="skeleton skeleton-chart"></div>
                <div class="skeleton-row" style="gap:var(--spacing-md);">
                    <div class="skeleton skeleton-badge"></div>
                    <div class="skeleton skeleton-badge"></div>
                    <div class="skeleton skeleton-badge"></div>
                </div>
            </div>`,

        profile: `
            <div aria-hidden="true" style="display:flex;flex-direction:column;gap:var(--spacing-md);align-items:center;">
                <div class="skeleton skeleton-avatar skeleton-avatar--xl"></div>
                <div style="width:100%;display:flex;flex-direction:column;gap:var(--spacing-xs);align-items:center;">
                    <div class="skeleton skeleton-heading" style="width:50%;"></div>
                    <div class="skeleton skeleton-line skeleton-line--medium"></div>
                    <div class="skeleton skeleton-line skeleton-line--short"></div>
                </div>
                <div class="skeleton-row">
                    <div class="skeleton skeleton-btn"></div>
                    <div class="skeleton skeleton-btn skeleton-btn--wide"></div>
                </div>
            </div>`,

        form: `
            <div aria-hidden="true" style="display:flex;flex-direction:column;gap:var(--spacing-md);">
                ${Array.from({length: 3}, () => `
                    <div style="display:flex;flex-direction:column;gap:var(--spacing-xs);">
                        <div class="skeleton skeleton-line skeleton-line--short" style="height:0.85em;width:120px;"></div>
                        <div class="skeleton skeleton-input"></div>
                    </div>`
                ).join('')}
                <div class="skeleton-row" style="justify-content:flex-end;margin-top:var(--spacing-sm);">
                    <div class="skeleton skeleton-btn"></div>
                    <div class="skeleton skeleton-btn skeleton-btn--wide"></div>
                </div>
            </div>`,

        tags: `
            <div aria-hidden="true" style="display:flex;flex-wrap:wrap;gap:var(--spacing-xs);">
                ${Array.from({length: 8}, (_, i) => `
                    <div class="skeleton skeleton-tag" style="width:${55 + (i % 3) * 20}px;"></div>`
                ).join('')}
            </div>`,

        image: `
            <div class="skeleton skeleton-image" aria-hidden="true"></div>`,

        banner: `
            <div class="skeleton skeleton-image skeleton-image--banner" aria-hidden="true"></div>`,
    };

    // ── Core API ────────────────────────────────────────────────────────────

    /**
     * Inject skeleton into a container.
     * @param {HTMLElement} el  - The container element
     * @param {string} [type]   - Template key (defaults to data-skeleton-template attr)
     * @param {number} [count]  - How many copies to render (for grids)
     */
    function show(el, type, count) {
        if (!el) return;
        const tmpl = type || el.dataset.skeletonTemplate || 'card';
        const n    = count || parseInt(el.dataset.skeletonCount, 10) || 1;
        const html = TEMPLATES[tmpl] || TEMPLATES.card;

        el.dataset.skeletonOriginal = el.innerHTML;
        el.innerHTML = Array.from({length: n}, () => html).join('');
        el.setAttribute('aria-busy', 'true');
        el.classList.add('skeleton-active');
    }

    /**
     * Remove skeleton and restore original content (or replace with new HTML).
     * @param {HTMLElement} el       - The container element
     * @param {string} [newContent]  - Optional new HTML to render instead of restoring
     */
    function hide(el, newContent) {
        if (!el) return;
        const inner = el.querySelector('.skeleton-page-overlay, [aria-hidden="true"]');
        if (inner) {
            inner.classList.add('skeleton-fade-out');
            setTimeout(function () {
                el.innerHTML = newContent !== undefined
                    ? newContent
                    : (el.dataset.skeletonOriginal || '');
                el.removeAttribute('aria-busy');
                el.classList.remove('skeleton-active');
                delete el.dataset.skeletonOriginal;
            }, 380);
        } else {
            el.innerHTML = newContent !== undefined
                ? newContent
                : (el.dataset.skeletonOriginal || '');
            el.removeAttribute('aria-busy');
            el.classList.remove('skeleton-active');
            delete el.dataset.skeletonOriginal;
        }
    }

    /**
     * Auto-init: scan for [data-skeleton-auto] containers and show skeleton
     * immediately. They must call DashboardSkeleton.hide(el) once data arrives.
     */
    function autoInit() {
        document.querySelectorAll('[data-skeleton-auto]').forEach(function (el) {
            show(el);
        });
    }

    /**
     * Page-transition skeleton: covers the entire dashboard-main while
     * navigating between sections. Call showPage() on link click, hidePage()
     * when the new content is ready.
     */
    function showPage() {
        const main = document.querySelector('.dashboard-main');
        if (!main) return;
        const overlay = document.createElement('div');
        overlay.className = 'skeleton-page-overlay';
        overlay.id = '__skeleton-page-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML = `
            <div class="skeleton-grid skeleton-grid--3" style="margin-bottom:var(--spacing-md);">
                ${Array.from({length: 3}, () => TEMPLATES.stat).join('')}
            </div>
            <div class="skeleton-grid skeleton-grid--2" style="margin-bottom:var(--spacing-md);">
                ${TEMPLATES.chart}
                ${TEMPLATES.list}
            </div>
            <div class="skeleton-grid skeleton-grid--2">
                ${TEMPLATES.card}
                ${TEMPLATES.card}
            </div>`;
        main.style.position = 'relative';
        main.appendChild(overlay);
    }

    function hidePage() {
        const overlay = document.getElementById('__skeleton-page-overlay');
        if (!overlay) return;
        overlay.classList.add('skeleton-fade-out');
        setTimeout(function () { overlay.remove(); }, 380);
    }

    // ── Expose global API ───────────────────────────────────────────────────
    window.DashboardSkeleton = { show: show, hide: hide, showPage: showPage, hidePage: hidePage, templates: TEMPLATES };

    // ── Auto-init on DOM ready ──────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoInit);
    } else {
        autoInit();
    }

})();