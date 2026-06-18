// Base JavaScript for Prof Landing Page
// Mobile navigation toggle
document.addEventListener('DOMContentLoaded', () => {
    initMobileNav();
    initScrollTop();
    initSmoothActionButtons();
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
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

function initSmoothActionButtons() {
    const uploadButtons = document.querySelectorAll('.upload-trigger');

    uploadButtons.forEach((button) => {
        button.addEventListener('click', (event) => {
            event.preventDefault();

            // TODO: Connect to your resume upload endpoint
            console.log('Upload trigger clicked - connect to upload flow');
        });
    });
}
