/**
 * Dashboard Jobs Page
 * Handles modal interactions for cover letter and resume display
 */

(function() {
    'use strict';

    // Store jobs data passed from Django template
    const jobsData = window.JOBS_DATA || [];

    // Modal elements
    const coverLetterModal = document.getElementById('cover-letter-modal');
    const resumeModal = document.getElementById('resume-modal');
    const coverLetterContent = document.getElementById('cover-letter-content');
    const resumeContent = document.getElementById('resume-content');

    // Initialize jobs data from template
    function initJobsData() {
        const dataScript = document.getElementById('jobs-data');
        if (dataScript) {
            try {
                window.JOBS_DATA = JSON.parse(dataScript.textContent);
            } catch (e) {
                console.error('Failed to parse jobs data:', e);
            }
        }
    }

    // Open modal
    function openModal(modal) {
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    // Close modal
    function closeModal(modal) {
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    // Close all modals
    function closeAllModals() {
        closeModal(coverLetterModal);
        closeModal(resumeModal);
    }

    // Show cover letter in modal
    function showCoverLetter(jobIndex) {
        const data = window.JOBS_DATA || [];
        if (data[jobIndex] && data[jobIndex].cover_letter) {
            coverLetterContent.textContent = data[jobIndex].cover_letter;
            openModal(coverLetterModal);
        } else {
            coverLetterContent.textContent = 'No cover letter available for this job.';
            openModal(coverLetterModal);
        }
    }

    // Show resume in modal
    function showResume(jobIndex) {
        const data = window.JOBS_DATA || [];
        if (data[jobIndex] && data[jobIndex].resume) {
            resumeContent.textContent = data[jobIndex].resume;
            openModal(resumeModal);
        } else {
            resumeContent.textContent = 'No resume available for this job.';
            openModal(resumeModal);
        }
    }

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

    // Event delegation for modal triggers
    document.addEventListener('click', function(e) {
        const trigger = e.target.closest('[data-modal]');
        if (trigger) {
            e.preventDefault();
            const modalType = trigger.dataset.modal;
            const jobIndex = parseInt(trigger.dataset.jobId, 10) - 1;

            if (modalType === 'cover-letter') {
                showCoverLetter(jobIndex);
            } else if (modalType === 'resume') {
                showResume(jobIndex);
            }
        }

        // Close modal buttons
        const closeBtn = e.target.closest('[data-close-modal]');
        if (closeBtn) {
            e.preventDefault();
            closeAllModals();
        }
    });

    // Close modal on overlay click
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('job-modal__overlay')) {
            closeAllModals();
        }
    });

    // Close modal on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeAllModals();
        }
    });

    // Initialize on DOM ready
    function init() {
        initJobsData();
        initCompanyLogos();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();