// Base JavaScript for Prof Landing Page
document.addEventListener('DOMContentLoaded', () => {
    initMobileNav();
    initScrollTop();
    initSmoothActionButtons();
    initMessages();
    initAuthModal();
});

function initMobileNav() {
    const toggleButton = document.querySelector('.nav-toggle');
    const mobileNav = document.querySelector('.mobile-nav');

    if (!toggleButton || !mobileNav) return;

    toggleButton.addEventListener('click', () => {
        const isActive = mobileNav.classList.toggle('active');
        toggleButton.setAttribute('aria-expanded', String(isActive));
    });

    mobileNav.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => {
            mobileNav.classList.remove('active');
            toggleButton.setAttribute('aria-expanded', 'false');
        });
    });
}

function initScrollTop() {
    const scrollTopButton = document.querySelector('.scroll-top');

    if (!scrollTopButton) return;

    const handleScroll = () => {
        if (window.scrollY > 500) {
            scrollTopButton.classList.add('visible');
        } else {
            scrollTopButton.classList.remove('visible');
        }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();

    scrollTopButton.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

function initMessages() {
    const messages = document.querySelectorAll('.messages-container .message');
    const AUTO_DISMISS_MS = 5000;
    const EXIT_DURATION_MS = 450;

    messages.forEach((msg) => {
        const timer = setTimeout(() => dismissMessage(msg), AUTO_DISMISS_MS);
        msg.addEventListener('click', () => {
            clearTimeout(timer);
            dismissMessage(msg);
        });
    });

    function dismissMessage(msg) {
        if (msg.classList.contains('msg-hiding')) return;
        msg.classList.add('msg-hiding');
        setTimeout(() => msg.remove(), EXIT_DURATION_MS);
    }
}

function initSmoothActionButtons() {
    const uploadButtons = document.querySelectorAll('.upload-trigger');

    uploadButtons.forEach((button) => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            console.log('Upload trigger clicked - connect to upload flow');
        });
    });
}

function initAuthModal() {
    const trigger  = document.getElementById('signInTrigger');
    const overlay  = document.getElementById('authModalOverlay');
    const closeBtn = document.getElementById('authModalClose');
    const googleBtn = document.getElementById('authModalGoogleBtn');
    const stayCheckbox = document.getElementById('authModalStaySignedIn');

    if (!trigger || !overlay) return;

    function openModal() {
        overlay.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        closeBtn.focus();
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        overlay.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        trigger.focus();
        document.body.style.overflow = '';
    }

    trigger.addEventListener('click', openModal);

    closeBtn.addEventListener('click', closeModal);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.hidden) closeModal();
    });

    if (googleBtn && stayCheckbox) {
        googleBtn.addEventListener('click', () => {
            sessionStorage.setItem('staySignedIn', stayCheckbox.checked ? '1' : '0');
        });
    }
}
// ── Notify Modal ─────────────────────────────────────────────────────────────
// Usage: window.notify({ type, category, title, body, okLabel })
//   type      : 'error' | 'warning' | 'success' | 'info'  (default: 'info')
//   category  : string shown in the header (e.g. 'Error', 'Warning')
//   title     : optional string — shown as a sub-heading if provided
//   body      : required string — the message text
//   okLabel   : optional button label (default: 'OK')
(function () {
    'use strict';

    const overlay     = document.getElementById('notifyModalOverlay');
    const panel       = overlay ? overlay.querySelector('.notify-modal-panel') : null;
    const categoryEl  = document.getElementById('notifyModalCategory');
    const titleEl     = document.getElementById('notifyModalTitle');
    const bodyEl      = document.getElementById('notifyModalBody');
    const okBtn       = document.getElementById('notifyModalOkBtn');
    const closeBtn    = overlay ? overlay.querySelector('.notify-modal-close') : null;

    if (!overlay || !panel || !categoryEl || !titleEl || !bodyEl || !okBtn || !closeBtn) return;

    function openNotify(options) {
        const type      = options.type     || 'info';
        const category  = options.category || (type.charAt(0).toUpperCase() + type.slice(1));
        const title     = options.title    || '';
        const body      = options.body     || '';
        const okLabel   = options.okLabel  || 'OK';

        panel.dataset.type      = type;
        categoryEl.textContent  = category;
        bodyEl.textContent      = body;
        okBtn.textContent       = okLabel;

        if (title) {
            titleEl.textContent = title;
            titleEl.hidden      = false;
        } else {
            titleEl.textContent = '';
            titleEl.hidden      = true;
        }

        overlay.hidden = false;
        okBtn.focus();
    }

    function closeNotify() {
        overlay.hidden = true;
        panel.removeAttribute('data-type');
    }

    okBtn.addEventListener('click', closeNotify);
    closeBtn.addEventListener('click', closeNotify);

    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeNotify();
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !overlay.hidden) closeNotify();
    });

    window.notify = openNotify;
})();