/**
 * Dashboard Jobs Page
 * Handles job card interactions and layout
 */

(function() {
    'use strict';

    // Progressive logo loader: the page paints the letter fallback instantly,
    // then logos are resolved one by one (first card to last) via the API and
    // faded in. Server-side misses are resolved asynchronously and re-polled.
    function initCompanyLogos() {
        const grid = document.querySelector('.jobs-grid');
        const containers = Array.prototype.slice.call(
            document.querySelectorAll('[data-logo-link]')
        );
        if (!containers.length) {
            return;
        }

        const endpoint = (grid && grid.dataset.logoEndpoint) || '/dashboard/api/company-logo/';
        const pending = [];
        const POLL_INTERVAL_MS = 2500;
        const POLL_TIMEOUT_MS = 60000;
        const pollStartedAt = Date.now();

        function revealLogo(container, url) {
            if (container.querySelector('.job-card__logo-img')) {
                return;
            }
            const img = document.createElement('img');
            img.className = 'job-card__logo-img';
            img.alt = '';
            img.src = url;
            img.addEventListener('load', function() {
                img.classList.add('job-card__logo-img--loaded');
            });
            img.addEventListener('error', function() {
                img.classList.add('job-card__logo-img--error');
            });
            container.insertBefore(img, container.firstChild);
        }

        function requestLogo(container) {
            if (container.dataset.logoBusy === '1') {
                return Promise.resolve();
            }
            container.dataset.logoBusy = '1';
            const link = container.getAttribute('data-logo-link');
            return fetch(endpoint + '?link=' + encodeURIComponent(link), {
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            })
                .then(function(response) { return response.ok ? response.json() : null; })
                .then(function(data) {
                    if (!data) {
                        return;
                    }
                    if (data.status === 'resolved' && data.url) {
                        revealLogo(container, data.url);
                    } else if (data.status === 'pending') {
                        pending.push(container);
                    }
                })
                .catch(function() { /* network error: keep the letter fallback */ })
                .finally(function() { container.dataset.logoBusy = '0'; });
        }

        // Sequential queue: first card to last, one request at a time.
        (function processQueue(index) {
            if (index >= containers.length) {
                return;
            }
            requestLogo(containers[index]).finally(function() {
                processQueue(index + 1);
            });
        })(0);

        // Re-check logos still resolving server-side, until the cap is reached.
        const pendingTimer = setInterval(function() {
            if (!pending.length || Date.now() - pollStartedAt > POLL_TIMEOUT_MS) {
                clearInterval(pendingTimer);
                return;
            }
            requestLogo(pending.shift());
        }, POLL_INTERVAL_MS);
    }

    // Render markdown source into sanitized HTML (marked + DOMPurify).
    // Falls back to escaped plain text if the CDN scripts are unavailable.
    function renderMarkdown(source) {
        if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
            const span = document.createElement('span');
            span.textContent = source || '';
            return span.innerHTML;
        }
        return DOMPurify.sanitize(marked.parse(source || '', { breaks: true }));
    }

    // Render the qualifications markdown inside each job card.
    function initJobCardMarkdown() {
        document.querySelectorAll('.job-card__text').forEach(function(text) {
            text.innerHTML = renderMarkdown(text.textContent);
        });
    }

    // Row-major masonry: cards are absolutely positioned so each column
    // grows independently while the left-to-right row order is preserved
    // (card i always lands in column i mod n). Gaps read from base.css vars.
    function initJobsMasonry() {
        const grid = document.querySelector('.jobs-grid');
        if (!grid) {
            return;
        }

        const MIN_CARD_WIDTH = 380;
        const MOBILE_BREAKPOINT = 980;

        function currentGap() {
            const name = window.innerWidth <= MOBILE_BREAKPOINT ? '--spacing-lg' : '--spacing-xl';
            const value = getComputedStyle(document.documentElement).getPropertyValue(name);
            return parseFloat(value) || 32;
        }

        function layoutJobsGrid() {
            const cards = Array.prototype.slice.call(
                grid.querySelectorAll('.job-card')
            );
            const declinedToggle = grid.querySelector('[data-declined-toggle]');

            if (!cards.length) {
                if (declinedToggle) {
                    declinedToggle.hidden = true;
                }

                grid.style.height = '';
                return;
            }

            const gap = currentGap();
            const gridWidth = grid.clientWidth;
            const columns = window.innerWidth <= MOBILE_BREAKPOINT
                ? 1
                : Math.max(
                    1,
                    Math.floor(
                        (gridWidth + gap) /
                        (MIN_CARD_WIDTH + gap)
                    )
                );

            const cardWidth =
                (gridWidth - (columns - 1) * gap) /
                columns;

            const activeCards = cards.filter(function(card) {
                return card.dataset.jobPaid !== '2';
            });

            const declinedCards = cards.filter(function(card) {
                return card.dataset.jobPaid === '2';
            });

            function positionCards(cardGroup, startY) {
                const columnHeights = [];

                for (let i = 0; i < columns; i++) {
                    columnHeights.push(startY);
                }

                cardGroup.forEach(function(card, index) {
                    const col = index % columns;

                    card.style.width = cardWidth + 'px';
                    card.style.transform =
                        'translate(' +
                        (col * (cardWidth + gap)) +
                        'px, ' +
                        columnHeights[col] +
                        'px)';

                    columnHeights[col] +=
                        card.offsetHeight + gap;
                });

                return columnHeights;
            }

            const activeHeights = positionCards(
                activeCards,
                0
            );

            const activeBottom = activeCards.length
                ? Math.max.apply(null, activeHeights) - gap
                : 0;

            if (!declinedCards.length || !declinedToggle) {
                if (declinedToggle) {
                    declinedToggle.hidden = true;
                }

                grid.style.height = activeCards.length
                    ? activeBottom + 'px'
                    : '0px';

                return;
            }

            declinedToggle.hidden = false;
            declinedToggle.style.width = gridWidth + 'px';

            const toggleTop = activeCards.length
                ? activeBottom + gap
                : 0;

            declinedToggle.style.transform =
                'translate(0, ' + toggleTop + 'px)';

            const toggleBottom =
                toggleTop +
                declinedToggle.offsetHeight;

            const declinedStart =
                toggleBottom + gap;

            const declinedHeights = positionCards(
                declinedCards,
                declinedStart
            );

            const expanded =
                grid.dataset.declinedExpanded === '1';

            const label = declinedToggle.querySelector(
                '[data-declined-toggle-label]'
            );

            declinedToggle.setAttribute(
                'aria-expanded',
                expanded ? 'true' : 'false'
            );

            if (label) {
                label.textContent = expanded
                    ? 'Hide declined jobs (' + declinedCards.length + ')'
                    : 'Show declined jobs (' + declinedCards.length + ')';
            }

            declinedCards.forEach(function(card) {
                card.classList.toggle(
                    'job-card--declined-hidden',
                    !expanded
                );
            });

            if (expanded) {
                grid.style.height =
                    (
                        Math.max.apply(
                            null,
                            declinedHeights
                        ) - gap
                    ) +
                    'px';
            } else {
                grid.style.height =
                    toggleBottom + 'px';
            }
        }

        // Re-layout every frame while a card height transition is running,
        // so the card below follows the growing card smoothly.
        function animateJobsLayout(duration) {
            const start = performance.now();
            grid.classList.add('jobs-grid--animating');
            (function frame(now) {
                layoutJobsGrid();
                if (now - start < duration) {
                    requestAnimationFrame(frame);
                } else {
                    grid.classList.remove('jobs-grid--animating');
                }
            })(performance.now());
        }

        grid.classList.add('jobs-grid--masonry');
        grid.layoutJobsGrid = layoutJobsGrid;
        grid.animateJobsLayout = animateJobsLayout;

        layoutJobsGrid();
        window.addEventListener('resize', layoutJobsGrid);
        window.addEventListener('load', layoutJobsGrid);
    }

    function initDeclinedJobsToggle() {
        const grid = document.querySelector('.jobs-grid');
        if (!grid) {
            return;
        }

        const toggle = grid.querySelector(
            '[data-declined-toggle]'
        );

        if (!toggle) {
            return;
        }

        toggle.addEventListener('click', function() {
            const expanded =
                grid.dataset.declinedExpanded === '1';

            grid.dataset.declinedExpanded =
                expanded ? '0' : '1';

            if (
                typeof grid.layoutJobsGrid ===
                'function'
            ) {
                requestAnimationFrame(function() {
                    grid.layoutJobsGrid();
                });
            }
        });
    }

    // Sort jobs grid via the shared dropdown component (default: score)
    function initJobSort() {
        const dropdown = document.getElementById('jobs-sort-dropdown');
        const grid = document.querySelector('.jobs-grid');
        if (!dropdown || !grid) {
            return;
        }

        const trigger = dropdown.querySelector('.dropdown-menu__trigger');
        const triggerText = dropdown.querySelector('.dropdown-menu__text');
        const panel = dropdown.querySelector('.dropdown-menu__panel');
        const items = Array.prototype.slice.call(
            dropdown.querySelectorAll('.dropdown-menu__item')
        );

        function closeDropdown() {
            panel.classList.remove('is-open');
            trigger.setAttribute('aria-expanded', 'false');
        }

        function openDropdown() {
            panel.classList.add('is-open');
            trigger.setAttribute('aria-expanded', 'true');
        }

        trigger.addEventListener('click', function(e) {
            e.stopPropagation();
            if (panel.classList.contains('is-open')) {
                closeDropdown();
            } else {
                openDropdown();
            }
        });

        document.addEventListener('click', function(e) {
            if (!dropdown.contains(e.target)) {
                closeDropdown();
            }
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeDropdown();
            }
        });

        // Average of all numeric values in a salary string.
        // Handles "$120,000 - $150,000", "100k-150k", "Not specified".
        function averageSalary(text) {
            if (!text) {
                return 0;
            }
            const matches = text.replace(/,/g, '').match(/\d+(\.\d+)?\s*[kK]?/g);
            if (!matches || !matches.length) {
                return 0;
            }
            let total = 0;
            matches.forEach(function(token) {
                let value = parseFloat(token);
                if (/[kK]\s*$/.test(token)) {
                    value *= 1000;
                }
                total += value;
            });
            return total / matches.length;
        }

        function cardValue(card, key) {
            if (key === 'score') {
                return parseFloat(card.dataset.sortScore) || 0;
            }
            if (key === 'salary') {
                const el = card.querySelector('.job-card__salary');
                return averageSalary(el ? el.textContent : '');
            }
            if (key === 'date') {
                const time = Date.parse(card.dataset.sortDate || '');
                return isNaN(time) ? 0 : time;
            }
            return 0;
        }

        function sortGrid(key) {
            const cards = Array.prototype.slice.call(grid.querySelectorAll('.job-card'));
            cards.sort(function(a, b) {
                const aDeclined = a.dataset.jobPaid === '2';
                const bDeclined = b.dataset.jobPaid === '2';

                if (aDeclined !== bDeclined) {
                    return aDeclined ? 1 : -1;
                }

                return cardValue(b, key) - cardValue(a, key);
            });
            cards.forEach(function(card) {
                grid.appendChild(card);
            });
            if (typeof grid.layoutJobsGrid === 'function') {
                grid.layoutJobsGrid();
            }
        }

        items.forEach(function(item) {
            item.addEventListener('click', function() {
                items.forEach(function(i) { i.classList.remove('is-selected'); });
                item.classList.add('is-selected');
                triggerText.textContent = 'Sort by: ' + item.textContent;
                sortGrid(item.dataset.sort);
                closeDropdown();
            });
        });

        sortGrid('score');
    }

    // CSRF token (meta tag first, cookie fallback — same pattern as upload.js)
    function getCsrfToken() {
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) {
            return meta.getAttribute('content');
        }
        const match = document.cookie.match(/csrftoken=([^;]+)/);
        return match ? match[1] : '';
    }

    // Unlock flow: POST the job id to the unlock endpoint, which sets
    // paid = 1 in Supabase; on success reload so the card renders unlocked.
    function initJobUnlock() {
        const grid = document.querySelector('.jobs-grid');
        if (!grid) {
            return;
        }
        const endpoint = grid.dataset.unlockEndpoint || '/dashboard/api/jobs/unlock/';

        grid.addEventListener('click', function(e) {
            const btn = e.target.closest('[data-unlock-job]');
            if (!btn || btn.disabled) {
                return;
            }

            const label = btn.querySelector('span');
            btn.disabled = true;
            if (label) {
                label.textContent = 'Unlocking...';
            }

            fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken(),
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify({ id: btn.dataset.unlockJob }),
            })
                .then(function(response) {
                    if (!response.ok) {
                        throw new Error('HTTP ' + response.status);
                    }
                    return response.json();
                })
                .then(function(data) {
                    if (data && data.ok) {
                        window.location.reload();
                        return;
                    }
                    throw new Error((data && data.error) || 'unlock failed');
                })
                .catch(function() {
                    btn.disabled = false;
                    if (label) {
                        label.textContent = 'Unlock';
                    }
                    if (typeof window.notify === 'function') {
                        window.notify({
                            type: 'error',
                            category: 'Error',
                            body: 'Could not unlock this job right now. Please try again.',
                        });
                    }
                });
        });
    }

    function initJobDecline() {
        const grid = document.querySelector('.jobs-grid');
        if (!grid) {
            return;
        }

        const endpoint = grid.dataset.declineEndpoint || '/dashboard/api/jobs/decline/';

        grid.addEventListener('click', function(e) {
            const btn = e.target.closest('[data-decline-job]');
            if (!btn || btn.disabled) {
                return;
            }

            const label = btn.querySelector('span');
            const card = btn.closest('.job-card');

            btn.disabled = true;

            if (label) {
                label.textContent = 'Declining...';
            }

            fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken(),
                    'X-Requested-With': 'XMLHttpRequest',
                },
                credentials: 'same-origin',
                body: JSON.stringify({ id: btn.dataset.declineJob }),
            })
                .then(function(response) {
                    if (!response.ok) {
                        throw new Error('HTTP ' + response.status);
                    }

                    return response.json();
                })
                .then(function(data) {
                    if (!data || !data.ok) {
                        throw new Error((data && data.error) || 'decline failed');
                    }

                    if (card) {
                        card.dataset.jobPaid = '2';
                        card.classList.add('job-card--declined');

                        btn.disabled = true;
                        btn.removeAttribute('data-decline-job');

                        if (label) {
                            label.textContent = 'Declined';
                        }

                        grid.appendChild(card);

                        if (typeof grid.layoutJobsGrid === 'function') {
                            grid.layoutJobsGrid();
                        }
                    }
                })
                .catch(function() {
                    btn.disabled = false;

                    if (label) {
                        label.textContent = 'Decline';
                    }

                    if (typeof window.notify === 'function') {
                        window.notify({
                            type: 'error',
                            category: 'Error',
                            body: 'Could not decline this job right now. Please try again.',
                        });
                    }
                });
        });
    }


    // Expand/collapse job card qualifications with a smooth height transition.
    // The "More" button is only shown when the clamped text actually overflows.
    function initJobCardExpand() {
        const grid = document.querySelector('.jobs-grid');
        if (!grid) {
            return;
        }

        grid.querySelectorAll('.job-card__text').forEach(function(text) {
            const btn = text.parentElement.querySelector('[data-toggle-more]');
            if (!btn) {
                return;
            }
            btn.hidden = text.scrollHeight - text.clientHeight <= 1;
        });

        grid.addEventListener('click', function(e) {
            const btn = e.target.closest('[data-toggle-more]');
            if (!btn) {
                return;
            }
            const text = btn.parentElement.querySelector('.job-card__text');
            if (!text) {
                return;
            }

            if (text.classList.contains('job-card__text--expanded')) {
                // Collapse: keep the clamp off during the animation — re-applying
                // it now would snap the box to 3 lines instantly. Animate max-height
                // down to the exact clamped height, then restore the clamp.
                const collapsedHeight = parseFloat(getComputedStyle(text).fontSize) * 4.8;
                text.style.maxHeight = text.scrollHeight + 'px';
                void text.offsetHeight;
                text.style.maxHeight = collapsedHeight + 'px';
                btn.textContent = 'More';
                btn.setAttribute('aria-expanded', 'false');

                const onCollapseEnd = function(e) {
                    if (e.target !== text || e.propertyName !== 'max-height') {
                        return;
                    }
                    text.removeEventListener('transitionend', onCollapseEnd);
                    text.classList.remove('job-card__text--expanded');
                    text.style.maxHeight = '';
                };
                text.addEventListener('transitionend', onCollapseEnd);
            } else {
                // Expand: freeze clamped height, drop the clamp, grow to full height
                text.style.maxHeight = text.clientHeight + 'px';
                void text.offsetHeight;
                text.classList.add('job-card__text--expanded');
                text.style.maxHeight = text.scrollHeight + 'px';
                btn.textContent = 'Less';
                btn.setAttribute('aria-expanded', 'true');
            }

            if (typeof grid.animateJobsLayout === 'function') {
                grid.animateJobsLayout(350);
            }
        });
    }

    // Initialize on DOM ready
    function init() {
        initJobCardMarkdown();
        initJobsMasonry();
        initDeclinedJobsToggle();
        initCompanyLogos();
        initJobSort();
        initJobUnlock();
        initJobDecline();
        initJobCardExpand();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();