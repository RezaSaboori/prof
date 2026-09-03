"use strict";

const debounce = (func, wait = 100) => {
  let timeout;

  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

const throttle = (func, limit = 100) => {
  let inThrottle = false;

  return (...args) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
};

const SmoothScroll = {
  init() {
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', (event) => {
        const href = anchor.getAttribute('href');

        if (!href || href === '#' || href.length < 2) return;

        const target = document.querySelector(href);
        if (!target) return;

        event.preventDefault();

        const offsetPosition = target.getBoundingClientRect().top + window.pageYOffset - 80;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });

        history.pushState(null, '', href);
      });
    });
  }
};

const ScrollReveal = {
  init() {
    const selectors = [
      '.section-tag',
      '.section-title',
      '.section-body',
      '.stat-card',
      '.step-card',
      '.feature-card',
      '.flow-step',
      '.tier-card',
      '.persona-card',
      '.trust-item',
      '.callout',
      '.pricing-callout',
      '.cta-title',
      '.cta-sub'
    ];

    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element, index) => {
        element.classList.add('reveal');
        element.style.transitionDelay = `${(index % 4) * 100}ms`;
      });
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      {
        rootMargin: '0px 0px -80px 0px',
        threshold: 0.1
      }
    );

    document.querySelectorAll('.reveal').forEach((element) => {
      observer.observe(element);
    });
  }
};

const Header = {
  init() {
    const header = document.querySelector('.site-header');
    if (!header) return;

    let ticking = false;

    const update = () => {
      const scrollY = window.pageYOffset;
      const sections = document.querySelectorAll('section[id]');
      const navLinks = document.querySelectorAll('.nav-link');

      let currentSection = '';

      sections.forEach((section) => {
        const sectionTop = section.offsetTop - 150;

        if (scrollY >= sectionTop && scrollY < sectionTop + section.offsetHeight) {
          currentSection = section.getAttribute('id');
        }
      });

      navLinks.forEach((link) => {
        link.classList.remove('active');

        if (link.getAttribute('href') === `#${currentSection}`) {
          link.classList.add('active');
        }
      });

      ticking = false;
    };

    window.addEventListener(
      'scroll',
      throttle(() => {
        if (!ticking) {
          window.requestAnimationFrame(update);
          ticking = true;
        }
      }, 16),
      { passive: true }
    );

    update();
  }
};

const HeroScrollIndicator = {
  init() {
    const update = () => {
      if (window.scrollY > 20) {
        document.body.classList.add('hero-scrolled');
      } else {
        document.body.classList.remove('hero-scrolled');
      }
    };

    window.addEventListener('scroll', update, { passive: true });
    update();
  }
};

const HeaderHeroState = {
  init() {
    const hero = document.getElementById('hero');
    if (!hero || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          document.body.classList.toggle('header-on-hero', entry.isIntersecting);
        });
      },
      { threshold: 0 }
    );

    observer.observe(hero);
  }
};


const CounterAnimation = {
  init() {
    const animate = (element, start, end, duration, suffix) => {
      const range = end - start;
      const increment = range / (duration / 16);
      let current = start;

      const update = () => {
        current += increment;

        if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
          element.textContent = `${end}${suffix}`;
          return;
        }

        element.textContent = `${Math.floor(current)}${suffix}`;
        requestAnimationFrame(update);
      };

      update();
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !entry.target.dataset.animated) {
            entry.target.dataset.animated = 'true';

            const text = entry.target.textContent;

            if (text.includes('%')) {
              animate(entry.target, 0, parseInt(text, 10), 1500, '%');
            } else if (text.includes('hrs')) {
              animate(entry.target, 0, parseInt(text, 10), 1500, 'hrs');
            } else if (text.includes('+')) {
              const match = text.match(/\d+/);

              if (match) {
                animate(entry.target, 0, parseInt(match[0], 10), 1500, '+ hours');
              }
            }
          }
        });
      },
      { threshold: 0.5 }
    );

    document.querySelectorAll('.stat-number').forEach((element) => {
      observer.observe(element);
    });
  }
};

const PricingModule = {
  init() {
    const tierCards = document.querySelectorAll('.tier-card');

    tierCards.forEach((card) => {
      card.addEventListener('click', () => {
        tierCards.forEach((otherCard) => {
          otherCard.classList.remove('selected');
        });

        card.classList.add('selected');
        card.style.transform = 'translateY(-4px) scale(1.02)';

        setTimeout(() => {
          card.style.transform = 'translateY(-4px)';
        }, 200);
      });
    });
  }
};

const CTAInteractions = {
  init() {
    const style = document.createElement('style');
    style.textContent = '@keyframes ripple { to { transform: scale(4); opacity: 0; } }';
    document.head.appendChild(style);

    document.querySelectorAll('.btn-primary').forEach((button) => {
      button.addEventListener('click', (event) => {
        const ripple = document.createElement('span');
        const rect = button.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);

        ripple.style.cssText = `
          position: absolute;
          width: ${size}px;
          height: ${size}px;
          left: ${event.clientX - rect.left - size / 2}px;
          top: ${event.clientY - rect.top - size / 2}px;
          background: rgba(255,255,255,0.3);
          border-radius: 50%;
          transform: scale(0);
          animation: ripple 0.6s linear;
          pointer-events: none;
        `;

        button.style.position = 'relative';
        button.style.overflow = 'hidden';
        button.appendChild(ripple);

        setTimeout(() => {
          ripple.remove();
        }, 600);
      });
    });
  }
};



const App = {
  modules: [
    SmoothScroll,
    ScrollReveal,
    Header,
    CounterAnimation,
    PricingModule,
    CTAInteractions,
    HeroScrollIndicator,
    HeaderHeroState,
  ],

  init() {
    console.log(
      '%cProf Landing Page Loaded',
      'background:#0088ff;color:white;font-weight:bold;padding:8px 16px;font-size:14px;'
    );

    this.modules.forEach((module) => {
      try {
        module.init();
      } catch (error) {
        console.error(error);
      }
    });

    document.body.classList.add('loaded');
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}