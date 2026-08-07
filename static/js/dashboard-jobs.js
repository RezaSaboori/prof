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
        const scripts = document.querySelectorAll('script[type="application/json"]');
        scripts.forEach(script => {
            if (script.id === 'jobs-data') {
                try {
                    window.JOBS_DATA = JSON.parse(script.textContent);
                } catch (e) {
                    console.error('Failed to parse jobs data:', e);
                }
            }
        });
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
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initJobsData);
    } else {
        initJobsData();
    }
})();