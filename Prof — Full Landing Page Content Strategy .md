Below is a complete, professional landing page implementation in pure **HTML5, CSS3, and vanilla ES6+ JavaScript**, structured so:

- **All CSS stays in CSS files**
- **All JS stays in JS files**
- Uses your **theme variables and section/container style**
- Follows your provided **content strategy exactly**
- Is modular and production-friendly

---



# 1) `index.html`

```html
<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Prof — Your Autonomous Career Agent</title>
    <meta name="description" content="Upload your resume. Prof handles the rest. AI-powered job sourcing, ATS-crushing documents, and precision outreach to decision-makers — all on autopilot.">

    <meta property="og:title" content="Stop Applying. Start Engineering Your Career.">
    <meta property="og:description" content="The autonomous career agent that finds hidden roles, builds LaTeX-perfect application assets, and maps your path to the hiring manager. Your first matched job is free.">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Prof">

    <link rel="stylesheet" href="css/variables.css">
    <link rel="stylesheet" href="css/style.css">
</head>
<body>
    <div class="page-shell">
        <header class="site-header">
            <div class="container header-inner">
                <a href="#hero" class="brand" aria-label="Prof home">
                    <span class="brand-mark">P</span>
                    <div class="brand-text">
                        <strong>Prof</strong>
                        <span>Career Intelligence</span>
                    </div>
                </a>

                <nav class="main-nav" aria-label="Main navigation">
                    <a href="#how-it-works">How It Works</a>
                    <a href="#features">Features</a>
                    <a href="#pricing">Pricing</a>
                    <a href="#footer">Contact</a>
                </nav>

                <a href="#hero-cta" class="header-cta">Get Started Free</a>

                <button class="nav-toggle" type="button" aria-label="Open menu" aria-expanded="false">
                    <span></span>
                    <span></span>
                    <span></span>
                </button>
            </div>

            <div class="mobile-nav" id="mobileNav">
                <a href="#how-it-works">How It Works</a>
                <a href="#features">Features</a>
                <a href="#pricing">Pricing</a>
                <a href="#footer">Contact</a>
                <a href="#hero-cta" class="mobile-nav-cta">Get Started Free</a>
            </div>
        </header>

        <main>
            <!-- HERO -->
            <section class="section hero-section" id="hero">
                <div class="container hero-grid">
                    <div class="hero-content">
                        <div class="section-tag">The Autonomous Career Intelligence Platform</div>

                        <h1 class="hero-title">
                            Stop Applying.
                            <span>Start Engineering Your Next Move.</span>
                        </h1>

                        <p class="hero-subtitle">
                            Prof analyzes your background, continuously hunts executive-grade roles, and delivers bespoke application packages — tailored resume, cover letter, and a direct path to the hiring manager — while you focus on your actual work.
                        </p>

                        <div class="trust-bar">
                            <div class="trust-item">✦ Zero setup forms — just upload your resume</div>
                            <div class="trust-item">✦ First matched role delivered free, no credit card required</div>
                            <div class="trust-item">✦ Documents typeset in LaTeX, not templates</div>
                        </div>

                        <div class="hero-actions">
                            <a href="#hero-cta" id="hero-cta" class="btn btn-primary">Upload Your Resume — Get Your First Match Free</a>
                            <a href="#how-it-works" class="btn btn-ghost">See how it works in 90 seconds ↓</a>
                        </div>
                    </div>

                    <div class="hero-visual">
                        <div class="dashboard-card">
                            <div class="dashboard-header">
                                <div class="window-dots">
                                    <span></span>
                                    <span></span>
                                    <span></span>
                                </div>
                                <span class="dashboard-label">Prof Matching Engine</span>
                            </div>

                            <div class="dashboard-body">
                                <div class="dashboard-panel">
                                    <h3>Candidate Profile</h3>
                                    <ul>
                                        <li><span>Name</span><strong>Alex Morgan</strong></li>
                                        <li><span>Role Target</span><strong>Director / VP</strong></li>
                                        <li><span>Experience</span><strong>11+ years</strong></li>
                                        <li><span>Industry Fit</span><strong>Fintech / SaaS</strong></li>
                                    </ul>
                                </div>

                                <div class="match-card">
                                    <div class="match-score">92% Match</div>
                                    <h4>VP, Product Strategy</h4>
                                    <p>Series C Fintech • Hybrid • New York</p>
                                    <div class="match-tags">
                                        <span>ATS Resume</span>
                                        <span>Cover Letter</span>
                                        <span>Hiring Manager Path</span>
                                    </div>
                                </div>

                                <div class="outreach-preview">
                                    <h4>Outreach Preview</h4>
                                    <p>
                                        Hi Sarah — noticed your team is scaling platform strategy after the recent expansion. My experience leading regulated product rollouts may be highly relevant...
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- PROBLEM -->
            <section class="section" id="problem">
                <div class="container">
                    <div class="section-head">
                        <span class="section-tag">Why the Traditional Job Search Fails Executives</span>
                        <h2>Every Day You Apply Manually, Someone Else Gets the Interview.</h2>
                    </div>

                    <div class="content-narrow">
                        <p>
                            Modern hiring is a volume war fought with algorithms. Companies use ATS filters to reject over 75% of applications before a human ever sees them. The roles that actually fit your caliber? They are never posted publicly, or they disappear within 48 hours. And writing a genuinely tailored cover letter for every position — then researching the hiring manager, crafting a cold outreach message, and following up — takes north of three hours per role.
                        </p>
                        <p>
                            That is three hours you do not have. And that is three hours your competition is spending with a tool like Prof.
                        </p>
                    </div>

                    <div class="stats-grid">
                        <article class="stat-card">
                            <strong>75%</strong>
                            <span>of resumes rejected by ATS before a human reads them</span>
                        </article>
                        <article class="stat-card">
                            <strong>48hrs</strong>
                            <span>average window before a competitive role is filled</span>
                        </article>
                        <article class="stat-card">
                            <strong>3+ hours</strong>
                            <span>wasted per manual application attempt</span>
                        </article>
                    </div>
                </div>
            </section>

            <!-- SOLUTION -->
            <section class="section" id="solution">
                <div class="container">
                    <div class="section-head">
                        <span class="section-tag">Introducing Prof</span>
                        <h2>Your Private Executive Recruitment Firm. On Demand. Fully Automated.</h2>
                    </div>

                    <div class="content-narrow">
                        <p>
                            Prof acts as your personal, AI-native career partner. You provide one thing: your master resume. Prof reads between the lines — extracting your name, location, years of experience, seniority level, and core competencies — then checks every inference with you before deploying a live sourcing agent on your behalf.
                        </p>
                        <p>
                            From that moment forward, Prof handles the entire pipeline: discovering roles you would never find manually, scoring each one against your unique profile, generating flawless application documents, and charting a direct networking path to the decision-maker inside every target company.
                        </p>
                    </div>

                    <div class="callout-box">
                        <p><em>One upload. One confirmation. Then Prof takes over.</em></p>
                    </div>
                </div>
            </section>

            <!-- HOW IT WORKS -->
            <section class="section" id="how-it-works">
                <div class="container">
                    <div class="section-head">
                        <span class="section-tag">Simple to Start. Autonomous from There.</span>
                        <h2>Three Steps Between You and Your Next Offer.</h2>
                    </div>

                    <div class="steps-grid">
                        <article class="step-card">
                            <div class="step-number">01</div>
                            <h3>Upload Your Blueprint</h3>
                            <p>
                                Drop your existing resume into Prof. That is the only thing we ask you to do manually. Our intelligence layer reads your document and automatically extracts everything we need: your name, professional title, location, skills, years of experience, education, and industry positioning.
                            </p>
                        </article>

                        <article class="step-card">
                            <div class="step-number">02</div>
                            <h3>Confirm Your Profile</h3>
                            <p>
                                Before anything is deployed, Prof surfaces a clean summary of what it learned about you and asks you to confirm or correct. Add strategic overrides — tell us to <em>emphasize your system architecture work</em> or <em>de-emphasize your early-career roles</em>. Then approve, and your agent goes live.
                            </p>
                        </article>

                        <article class="step-card">
                            <div class="step-number">03</div>
                            <h3>Receive Your First Match Free</h3>
                            <p>
                                Prof delivers your first high-fit job opportunity with a full application package: a tailored ATS-optimized resume, a persuasive cover letter, and a ready-to-send outreach message to the exact hiring manager. Review it. If it is exactly what executive-grade looks like, you purchase that package. Everything after that runs on your terms.
                            </p>
                        </article>
                    </div>
                </div>
            </section>

            <!-- FEATURES -->
            <section class="section" id="features">
                <div class="container">
                    <div class="section-head">
                        <span class="section-tag">The Prof Capability Stack</span>
                        <h2>Four Systems. One Outcome: The Interview.</h2>
                    </div>

                    <div class="features-grid">
                        <article class="feature-card">
                            <h3>Only Roles That Actually Fit You.</h3>
                            <p>
                                Prof's background agents continuously scan enterprise job boards and source directly from LinkedIn, parsing job descriptions in real-time. Every role is scored algorithmically against your career profile. Your dashboard only shows signal — never noise.
                            </p>
                            <span class="outcome-tag">No more irrelevant applications</span>
                        </article>

                        <article class="feature-card">
                            <h3>Application Documents That Look Like a Hired Designer Made Them.</h3>
                            <p>
                                Forget generic templates and exported Word documents. Prof's document engine rewrites your resume and cover letter with precision keyword anchoring calibrated to pass ATS systems for that specific role. The final output is compiled by a professional LaTeX typesetter, producing crisp, perfectly spaced PDF documents that look like they came from a top-tier executive search firm.
                            </p>
                            <span class="outcome-tag">Documents that pass machines and impress humans</span>
                        </article>

                        <article class="feature-card">
                            <h3>Skip the Application Portal. Go Straight to the Hiring Manager.</h3>
                            <p>
                                Prof analyzes the target company's org structure, identifies the department you would join, and constructs advanced Boolean search queries to locate the exact hiring manager and relevant team leads on LinkedIn. It validates their current employment and flags mutual connection points — shared universities, past employers, or geographic overlap — that dramatically increase response rates.
                            </p>
                            <span class="outcome-tag">Turn cold applications into warm conversations</span>
                        </article>

                        <article class="feature-card">
                            <h3>Messages That Get Replied To.</h3>
                            <p>
                                Every outreach message Prof writes is engineered, not templated. It opens with a specific mutual anchor point, frames your value in one sentence, and ends with the lowest-friction possible ask: a 10-minute call. No pitch decks. No resumes attached. Just a human-sounding message from someone who clearly did their homework.
                            </p>
                            <span class="outcome-tag">Ultra-personalized, zero-fluff cold outreach</span>
                        </article>

                        <article class="feature-card feature-card-wide">
                            <h3>You Stay in Command. Prof Handles the Execution.</h3>
                            <p>
                                Every automated system has a manual override — and Prof's is called <strong>Strategic Overrides</strong>. At any point, you can instruct Prof to shift its emphasis: <em>"Lead with my fintech regulatory experience," "Do not reference my freelance period," "Target Series B startups only."</em> Granular, plain-language instructions that reshape every output instantly.
                            </p>
                            <span class="outcome-tag">Your judgment, Prof's execution</span>
                        </article>
                    </div>
                </div>
            </section>

            <!-- PRICING -->
            <section class="section" id="pricing">
                <div class="container">
                    <div class="section-head">
                        <span class="section-tag">Pricing That Bets on Itself</span>
                        <h2>We Do All the Work First. You Pay Only When You See the Result.</h2>
                    </div>

                    <div class="content-narrow">
                        <p>
                            Most tools charge you upfront and hope for the best. Prof works the other way around.
                        </p>
                        <p>
                            We invest in you first. Prof reads your resume, extracts your full professional profile, confirms the details with you, sources real roles, scores them for compatibility, and builds your complete application package — tailored resume, cover letter, and hiring manager outreach script. All of it, before you spend a single dollar.
                        </p>
                        <p>
                            The moment your first match is ready and sitting in your dashboard, you will see the overview of what you are getting. Only then do you decide whether to unlock it.
                        </p>
                        <p class="pricing-emphasis">
                            <strong>You are not paying for a promise. You are paying for a finished product.</strong>
                        </p>
                    </div>

                    <div class="table-card">
                        <h3>The Prof Pricing Flow</h3>
                        <div class="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Step</th>
                                        <th>What Happens</th>
                                        <th>Cost</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td><strong>1. Upload Resume</strong></td>
                                        <td>Prof extracts your name, location, title, skills, experience, and career profile automatically</td>
                                        <td><strong>Free</strong></td>
                                    </tr>
                                    <tr>
                                        <td><strong>2. Profile Confirmation</strong></td>
                                        <td>Prof surfaces everything it learned and asks you to confirm or correct — no forms to fill</td>
                                        <td><strong>Free</strong></td>
                                    </tr>
                                    <tr>
                                        <td><strong>3. Agent Deployment</strong></td>
                                        <td>Prof sources live roles, scores each against your profile, and builds your first full application package</td>
                                        <td><strong>Free</strong></td>
                                    </tr>
                                    <tr>
                                        <td><strong>4. Unlock Your Package</strong></td>
                                        <td>Satisfied with what you see? Purchase to reveal the full resume PDF, cover letter, and outreach script</td>
                                        <td><strong>Paid</strong></td>
                                    </tr>
                                    <tr>
                                        <td><strong>5. Continue the Campaign</strong></td>
                                        <td>Load your wallet and deploy Prof for as many additional roles as you want, at a per-job rate</td>
                                        <td><strong>Per-job</strong></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div class="pricing-grid">
                        <article class="price-card featured">
                            <h3>First Match Unlock</h3>
                            <p>Full application package for your first sourced role — tailored resume PDF, cover letter, hiring manager outreach script</p>
                            <div class="price">$9</div>
                        </article>

                        <article class="price-card">
                            <h3>5-Role Pack</h3>
                            <p>5 matched roles, all documents, all outreach scripts</p>
                            <div class="price">$39</div>
                        </article>

                        <article class="price-card">
                            <h3>15-Role Campaign</h3>
                            <p>15 matched roles, faster sourcing cadence, priority queue</p>
                            <div class="price">$99</div>
                        </article>

                        <article class="price-card">
                            <h3>30-Role Executive Sprint</h3>
                            <p>30 matched roles, highest cadence, dedicated sourcing depth</p>
                            <div class="price">$179</div>
                        </article>
                    </div>

                    <p class="pricing-note">
                        The more roles you unlock, the lower your per-application cost — down to under $6 per complete, executive-grade application package.
                    </p>

                    <div class="pricing-callout">
                        <strong>Prof is the only career tool where you see the finished product before you pay for it.</strong>
                    </div>

                    <div class="pricing-cta-block">
                        <a href="#hero-cta" class="btn btn-primary">Start Free — Upload Resume</a>
                        <ul class="micro-list">
                            <li>No subscription. No monthly charge. You pay per result, not per promise.</li>
                            <li>Your resume data is processed in-memory and never stored or sold.</li>
                            <li>You will always see a match preview before spending anything.</li>
                        </ul>
                    </div>
                </div>
            </section>

            <!-- AUDIENCE -->
            <section class="section" id="audience">
                <div class="container">
                    <div class="section-head">
                        <span class="section-tag">Who Prof Is Built For</span>
                        <h2>Built for Professionals Who Are Too Valuable to Job-Search Manually.</h2>
                    </div>

                    <div class="persona-grid">
                        <article class="persona-card">
                            <h3>The Senior Technologist</h3>
                            <blockquote>
                                “I know my market value. I just do not have six hours a week to prove it to ATS systems.”
                            </blockquote>
                            <p>
                                Engineering leads, principal engineers, and CTOs targeting $180K+ roles at Series C companies or enterprise firms.
                            </p>
                        </article>

                        <article class="persona-card">
                            <h3>The MBA Candidate in Transition</h3>
                            <blockquote>
                                “I am transitioning industries and need every application to tell a precise, compelling story.”
                            </blockquote>
                            <p>
                                MBA graduates and career-switchers entering finance, consulting, or tech leadership for the first time.
                            </p>
                        </article>

                        <article class="persona-card">
                            <h3>The Mid-Level Executive</h3>
                            <blockquote>
                                “I am at a Director level but want VP-track roles. The gap is positioning, not experience.”
                            </blockquote>
                            <p>
                                Directors and VPs navigating upward transitions where framing and network access are the deciding factors.
                            </p>
                        </article>
                    </div>

                    <div class="callout-box">
                        <p>If your next career move matters — and your time does too — Prof was built for you.</p>
                    </div>
                </div>
            </section>

            <!-- TRUST SIGNALS -->
            <section class="section" id="trust">
                <div class="container">
                    <div class="trust-signals-grid">
                        <article class="trust-signal">🔒 <strong>Your resume is never stored beyond your session</strong> — processed in-memory, never sold or indexed</article>
                        <article class="trust-signal">📄 <strong>LaTeX-compiled PDFs</strong> — same typesetting standard used by academic journals and executive search firms</article>
                        <article class="trust-signal">🎯 <strong>85%+ match threshold</strong> — we would rather send you nothing than send you something irrelevant</article>
                        <article class="trust-signal">✉️ <strong>All outreach copy is ready to paste</strong> — no editing required, delivered in your dashboard instantly</article>
                        <article class="trust-signal">🔄 <strong>Profile updates in real-time</strong> — change your constraints at any point, all future outputs update accordingly</article>
                    </div>
                </div>
            </section>

            <!-- FINAL CTA -->
            <section class="section final-cta-section" id="final-cta">
                <div class="container final-cta-inner">
                    <h2>Your Next Role Is Already Posted Somewhere. The Question Is Whether Prof Finds It First.</h2>
                    <p>
                        Join the growing number of senior professionals using autonomous career intelligence to secure interviews faster, more precisely, and with significantly less effort than the manual approach.
                    </p>

                    <a href="#" class="btn btn-primary btn-large upload-trigger">Upload My Resume — It's Free to Start</a>

                    <p class="micro-copy">
                        No credit card. No subscription. Your first match, built to executive standards, delivered to your dashboard.
                    </p>

                    <p class="secondary-line">
                        <em>Already have a specific company in mind?</em> Tell Prof during setup and it will prioritize sourcing roles there first.
                    </p>
                </div>
            </section>
        </main>

        <footer class="site-footer section" id="footer">
            <div class="container footer-grid">
                <div class="footer-brand">
                    <div class="brand">
                        <span class="brand-mark">P</span>
                        <div class="brand-text">
                            <strong>Prof</strong>
                            <span>Career Intelligence</span>
                        </div>
                    </div>
                    <p>Career Intelligence. Delivered Autonomously.</p>
                </div>

                <div class="footer-links">
                    <a href="#how-it-works">How It Works</a>
                    <a href="#pricing">Pricing</a>
                    <a href="#">Privacy Policy</a>
                    <a href="#">Contact / Support</a>
                    <a href="#">Terms of Service</a>
                </div>

                <div class="footer-trust">
                    <p>Prof is not a job board. It is not a resume builder. It is an autonomous agent that works while you don't.</p>
                </div>
            </div>
        </footer>
    </div>

    <button class="scroll-top" aria-label="Scroll to top">↑</button>

    <script src="js/main.js"></script>
</body>
</html>
```

---

# 2) `variables.css`

Use your provided theme here.

```css
:root {
    --color-red: rgb(173, 29, 30);
    --color-orange: rgb(255, 141, 40);
    --color-yellow: rgb(255, 204, 0);
    --color-green: rgb(52, 199, 89);
    --color-mint: rgb(0, 200, 179);
    --color-teal: rgb(0, 195, 208);
    --color-cyan: rgb(0, 192, 232);
    --color-blue: rgb(0, 136, 255);
    --color-indigo: rgb(97, 85, 245);
    --color-purple: rgb(203, 48, 224);
    --color-pink: rgb(255, 45, 85);
    --color-brown: rgb(172, 127, 94);

    --color-gray1: rgb(248, 248, 248);
    --color-gray2: rgb(228, 228, 228);
    --color-gray3: rgb(210, 210, 210);
    --color-gray4: rgb(190, 190, 190);
    --color-gray5: rgb(170, 170, 170);
    --color-gray6: rgb(142, 142, 142);
    --color-gray7: rgb(107, 107, 107);
    --color-gray8: rgb(87, 87, 87);
    --color-gray9: rgb(67, 67, 67);
    --color-gray10: rgb(47, 47, 47);
    --color-gray11: rgb(27, 27, 27);
    --color-gray12: rgb(7, 7, 7);
    --surface-header: var(--color-gray3);

    --rgb-black: 0, 0, 0;
    --rgb-white: 255, 255, 255;
    --rgb-primary-blue: 0, 136, 232;
    --rgb-primary-blue-dark: 0, 85, 245;
    --rgb-primary-blue-light: 0, 192, 208;
    --rgb-danger-dark: 255, 56, 60;
    --rgb-toggle-end: 142, 142, 142;
    --rgb-toggle-shadow-dark: 27, 27, 27;

    --spacing-xs: 4px;
    --spacing-sm: 8px;
    --spacing-md: 16px;
    --spacing-lg: 24px;
    --spacing-xl: 32px;
    --spacing-2xl: 40px;
    --spacing-3xl: 48px;
    --spacing-4xl: 56px;
    --spacing-5xl: 64px;

    --border-radius-none: 0px;
    --border-radius-item-xs: 4px;
    --border-radius-item-sm: 8px;
    --border-radius-item-md: 12px;
    --border-radius-item-lg: 16px;
    --border-radius-item-xl: 20px;
    --border-radius-container-xs: 24px;
    --border-radius-container-sm: 32px;
    --border-radius-container-md: 40px;
    --border-radius-container-lg: 48px;
    --border-radius-container-xl: 56px;
    --border-radius-pill: 9999px;

    --radius-lg: var(--border-radius-container-xs);
    --radius-md: var(--border-radius-item-md);

    --border-width-none: 0px;
    --border-width-hairline: 0.5px;
    --border-width-thin: 1px;
    --border-width-normal: 2px;
    --border-width-thick: 4px;

    --elevation-0: 0 0 0 0 rgba(var(--rgb-black), 0);
    --elevation-1: 0 1px 3px 0 rgba(var(--rgb-black), 0.08);
    --elevation-2: 0 3px 6px 0 rgba(var(--rgb-black), 0.12);
    --elevation-3: 0 6px 12px 0 rgba(var(--rgb-black), 0.16);
    --elevation-4: 0 10px 20px 0 rgba(var(--rgb-black), 0.2);

    --font-family-base: 'IRANSansX', 'Segoe UI', Tahoma, sans-serif;
    --font-family-variable: 'IRANSansXV', 'Segoe UI', Tahoma, sans-serif;
}

@font-face {
    font-family: 'IRANSansX';
    src: url('../fonts/IRANSansX-Regular.woff') format('woff'),
         url('../fonts/IRANSansX-Regular.ttf') format('truetype');
    font-weight: 400;
    font-style: normal;
    font-display: swap;
}

@font-face {
    font-family: 'IRANSansX';
    src: url('../fonts/IRANSansX-Bold.woff') format('woff');
    font-weight: 700;
    font-style: normal;
    font-display: swap;
}

@font-face {
    font-family: 'IRANSansXV';
    src: url('../fonts/IRANSansXV.woff') format('woff');
    font-weight: 100 900;
    font-style: normal;
    font-display: swap;
}

.ui-toggle {
    --toggle-width: 140px;
    --toggle-height: 34px;
    --toggle-padding: 2px;
    --toggle-bg: var(--color-gray2);
    --toggle-text: var(--color-gray11);
    --toggle-active-text: var(--color-gray1);
    --toggle-on: #ef4444;
    --toggle-off: var(--color-gray6);
    --toggle-font-size: 12px;
    --toggle-font-weight: 500;
    --toggle-radius: 999px;
    --toggle-transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1);

    position: relative;
    display: inline-grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
    width: var(--toggle-width);
    height: var(--toggle-height);
    padding: var(--toggle-padding);
    background: var(--toggle-bg);
    border-radius: var(--toggle-radius);
    cursor: pointer;
    user-select: none;
    overflow: hidden;
}
```

---

# 3) `style.css`

```css
*,
*::before,
*::after {
    box-sizing: border-box;
}

html {
    scroll-behavior: smooth;
}

body {
    margin: 0;
    font-family: var(--font-family-base);
    color: var(--color-gray11);
    background:
        radial-gradient(circle at top left, rgba(var(--rgb-primary-blue-light), 0.08), transparent 30%),
        radial-gradient(circle at top right, rgba(203, 48, 224, 0.08), transparent 30%),
        linear-gradient(180deg, var(--color-gray1), #f1f3f6);
    line-height: 1.65;
}

img {
    max-width: 100%;
    display: block;
}

a {
    color: inherit;
    text-decoration: none;
}

button,
input,
textarea,
select {
    font: inherit;
}

.page-shell {
    width: 100%;
    min-height: 100vh;
    padding: 20px;
}

.container {
    width: min(1200px, 100%);
    margin-inline: auto;
}

.section {
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    padding: 35px;
    margin-bottom: 35px;
    border: none;
    border-radius: 30px;
    background-image: linear-gradient(135deg, var(--color-gray1), var(--color-gray2) 40%);
    box-shadow:
        inset 0 0 0 1px color-mix(in srgb, var(--color-gray1) 10%, transparent),
        inset 1.8px 3px 0px -2px color-mix(in srgb, var(--color-gray1) 90%, transparent),
        inset -2px -2px 0px -2px color-mix(in srgb, var(--color-gray1) 30%, transparent),
        inset -3px -12px 1px -8px color-mix(in srgb, var(--color-gray1) 10%, transparent),
        inset -0.3px -1px 4px 0px color-mix(in srgb, #000 calc(1 * 12%), transparent),
        inset -1.5px 2.5px 0px -2px color-mix(in srgb, #000 calc(1 * 20%), transparent),
        inset 0px 3px 4px -2px color-mix(in srgb, #000 calc(1 * 20%), transparent),
        inset 2px -6.5px 1px -4px color-mix(in srgb, #000 calc(1 * 10%), transparent),
        0px 1px 5px 0px color-mix(in srgb, #000 calc(1 * 10%), transparent),
        0px 6px 16px 0px color-mix(in srgb, #000 calc(1 * 8%), transparent);
    transition: all 400ms cubic-bezier(1, 0, 0.4, 1);
}

.section:hover {
    transform: translateY(-2px);
}

.site-header {
    position: sticky;
    top: 0;
    z-index: 100;
    margin-bottom: 24px;
    backdrop-filter: blur(14px);
}

.header-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 16px 22px;
    border-radius: 24px;
    background: rgba(var(--rgb-white), 0.65);
    box-shadow: var(--elevation-2);
    border: 1px solid rgba(var(--rgb-white), 0.45);
}

.brand {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
}

.brand-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 14px;
    background: linear-gradient(135deg, var(--color-blue), var(--color-indigo));
    color: var(--color-gray1);
    font-weight: 700;
    box-shadow: var(--elevation-2);
}

.brand-text {
    display: flex;
    flex-direction: column;
    line-height: 1.1;
}

.brand-text strong {
    font-size: 1rem;
}

.brand-text span {
    color: var(--color-gray7);
    font-size: 0.82rem;
}

.main-nav {
    display: flex;
    align-items: center;
    gap: 24px;
}

.main-nav a {
    color: var(--color-gray9);
    transition: color 0.25s ease;
}

.main-nav a:hover {
    color: var(--color-blue);
}

.header-cta,
.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: none;
    border-radius: var(--border-radius-pill);
    padding: 14px 22px;
    font-weight: 700;
    transition: 0.3s ease;
    cursor: pointer;
}

.header-cta,
.btn-primary {
    background: linear-gradient(135deg, var(--color-blue), var(--color-indigo));
    color: var(--color-gray1);
    box-shadow: 0 12px 24px rgba(var(--rgb-primary-blue-dark), 0.22);
}

.header-cta:hover,
.btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 16px 30px rgba(var(--rgb-primary-blue-dark), 0.28);
}

.btn-ghost {
    background: rgba(var(--rgb-white), 0.55);
    color: var(--color-gray11);
    border: 1px solid rgba(var(--rgb-black), 0.08);
}

.btn-ghost:hover {
    background: rgba(var(--rgb-white), 0.85);
}

.btn-large {
    padding: 18px 28px;
    font-size: 1.05rem;
}

.nav-toggle {
    display: none;
    width: 46px;
    height: 46px;
    border: none;
    border-radius: 14px;
    background: rgba(var(--rgb-white), 0.85);
    cursor: pointer;
    padding: 10px;
}

.nav-toggle span {
    display: block;
    width: 100%;
    height: 3px;
    margin: 4px 0;
    border-radius: 999px;
    background: var(--color-gray11);
}

.mobile-nav {
    display: none;
    flex-direction: column;
    gap: 14px;
    margin-top: 12px;
    padding: 20px;
    border-radius: 24px;
    background: rgba(var(--rgb-white), 0.86);
    box-shadow: var(--elevation-2);
}

.mobile-nav.active {
    display: flex;
}

.mobile-nav-cta {
    display: inline-flex;
    justify-content: center;
    padding: 12px 18px;
    border-radius: 999px;
    background: linear-gradient(135deg, var(--color-blue), var(--color-indigo));
    color: var(--color-gray1);
    font-weight: 700;
}

.hero-grid {
    display: grid;
    grid-template-columns: 1.15fr 0.85fr;
    gap: 32px;
    align-items: center;
}

.section-tag {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 18px;
    padding: 8px 14px;
    border-radius: 999px;
    background: rgba(var(--rgb-white), 0.7);
    color: var(--color-blue);
    font-size: 0.88rem;
    font-weight: 700;
    border: 1px solid rgba(var(--rgb-primary-blue), 0.12);
}

.hero-title,
.section h2 {
    margin: 0 0 18px;
    line-height: 1.05;
    letter-spacing: -0.03em;
}

.hero-title {
    font-size: clamp(2.5rem, 5vw, 4.8rem);
    max-width: 12ch;
}

.hero-title span {
    display: block;
    color: var(--color-gray9);
}

.hero-subtitle {
    max-width: 760px;
    font-size: 1.08rem;
    color: var(--color-gray8);
    margin-bottom: 24px;
}

.trust-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 28px;
}

.trust-item {
    padding: 10px 14px;
    border-radius: 999px;
    background: rgba(var(--rgb-white), 0.66);
    color: var(--color-gray9);
    font-size: 0.92rem;
    border: 1px solid rgba(var(--rgb-black), 0.06);
}

.hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
}

.dashboard-card,
.stat-card,
.step-card,
.feature-card,
.price-card,
.persona-card,
.table-card,
.callout-box,
.trust-signal {
    background: rgba(var(--rgb-white), 0.52);
    border: 1px solid rgba(var(--rgb-white), 0.5);
    border-radius: 24px;
    box-shadow: var(--elevation-1);
}

.dashboard-card {
    padding: 22px;
}

.dashboard-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 18px;
}

.window-dots {
    display: flex;
    gap: 8px;
}

.window-dots span {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--color-gray5);
}

.window-dots span:nth-child(1) { background: var(--color-pink); }
.window-dots span:nth-child(2) { background: var(--color-yellow); }
.window-dots span:nth-child(3) { background: var(--color-green); }

.dashboard-label {
    color: var(--color-gray7);
    font-size: 0.9rem;
}

.dashboard-body {
    display: grid;
    gap: 16px;
}

.dashboard-panel,
.match-card,
.outreach-preview {
    padding: 18px;
    border-radius: 20px;
    background: linear-gradient(180deg, rgba(var(--rgb-white), 0.9), rgba(var(--rgb-white), 0.55));
    border: 1px solid rgba(var(--rgb-black), 0.06);
}

.dashboard-panel h3,
.match-card h4,
.outreach-preview h4 {
    margin: 0 0 12px;
}

.dashboard-panel ul {
    list-style: none;
    margin: 0;
    padding: 0;
}

.dashboard-panel li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid rgba(var(--rgb-black), 0.06);
}

.dashboard-panel li:last-child {
    border-bottom: none;
}

.dashboard-panel span {
    color: var(--color-gray7);
}

.match-score {
    display: inline-flex;
    margin-bottom: 10px;
    padding: 6px 12px;
    border-radius: 999px;
    background: rgba(52, 199, 89, 0.14);
    color: var(--color-green);
    font-weight: 700;
}

.match-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
}

.match-tags span,
.outcome-tag {
    display: inline-flex;
    padding: 8px 12px;
    border-radius: 999px;
    background: rgba(var(--rgb-primary-blue), 0.1);
    color: var(--color-blue);
    font-size: 0.86rem;
    font-weight: 700;
}

.section-head {
    max-width: 860px;
    margin-bottom: 28px;
}

.section h2 {
    font-size: clamp(2rem, 4vw, 3.4rem);
}

.content-narrow {
    max-width: 900px;
}

.stats-grid,
.steps-grid,
.features-grid,
.pricing-grid,
.persona-grid,
.trust-signals-grid {
    display: grid;
    gap: 20px;
}

.stats-grid,
.persona-grid {
    grid-template-columns: repeat(3, 1fr);
    margin-top: 28px;
}

.stat-card,
.step-card,
.feature-card,
.price-card,
.persona-card {
    padding: 24px;
}

.stat-card strong {
    display: block;
    margin-bottom: 8px;
    font-size: 2rem;
    color: var(--color-blue);
    line-height: 1;
}

.callout-box {
    margin-top: 28px;
    padding: 22px 24px;
    border-left: 5px solid var(--color-indigo);
}

.steps-grid {
    grid-template-columns: repeat(3, 1fr);
}

.step-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 52px;
    margin-bottom: 18px;
    border-radius: 16px;
    background: linear-gradient(135deg, var(--color-orange), var(--color-pink));
    color: var(--color-gray1);
    font-weight: 700;
    box-shadow: var(--elevation-2);
}

.features-grid {
    grid-template-columns: repeat(2, 1fr);
}

.feature-card-wide {
    grid-column: span 2;
}

.feature-card h3,
.step-card h3,
.persona-card h3,
.price-card h3 {
    margin-top: 0;
}

.table-card {
    margin-top: 30px;
    padding: 24px;
}

.table-wrap {
    overflow-x: auto;
}

table {
    width: 100%;
    border-collapse: collapse;
    min-width: 760px;
}

th,
td {
    text-align: left;
    padding: 16px;
    border-bottom: 1px solid rgba(var(--rgb-black), 0.08);
}

th {
    color: var(--color-gray7);
    font-size: 0.92rem;
}

.pricing-grid {
    grid-template-columns: repeat(4, 1fr);
    margin-top: 28px;
}

.price-card {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: 250px;
}

.price-card.featured {
    border: 2px solid rgba(var(--rgb-primary-blue), 0.22);
    transform: translateY(-6px);
}

.price {
    margin-top: 20px;
    font-size: 2.4rem;
    font-weight: 700;
    color: var(--color-indigo);
}

.pricing-note {
    margin-top: 20px;
    color: var(--color-gray8);
}

.pricing-callout {
    margin-top: 24px;
    padding: 22px;
    border-radius: 24px;
    background: linear-gradient(135deg, rgba(var(--rgb-primary-blue), 0.12), rgba(97, 85, 245, 0.12));
    font-size: 1.08rem;
}

.pricing-cta-block {
    margin-top: 26px;
}

.micro-list {
    margin: 16px 0 0;
    padding-left: 20px;
    color: var(--color-gray8);
}

.persona-card blockquote {
    margin: 0 0 16px;
    font-size: 1.05rem;
    color: var(--color-gray9);
}

.trust-signals-grid {
    grid-template-columns: repeat(5, 1fr);
}

.trust-signal {
    padding: 20px;
    font-size: 0.95rem;
}

.final-cta-section {
    text-align: center;
}

.final-cta-inner {
    max-width: 920px;
}

.final-cta-inner p {
    max-width: 760px;
    margin-inline: auto;
}

.micro-copy {
    margin-top: 16px;
    color: var(--color-gray8);
}

.secondary-line {
    margin-top: 14px;
    color: var(--color-gray9);
}

.site-footer {
    margin-bottom: 0;
}

.footer-grid {
    display: grid;
    grid-template-columns: 1.2fr 1fr 1fr;
    gap: 24px;
    align-items: start;
}

.footer-links {
    display: grid;
    gap: 12px;
}

.footer-links a {
    color: var(--color-gray8);
}

.footer-links a:hover {
    color: var(--color-blue);
}

.footer-trust p,
.footer-brand p {
    color: var(--color-gray8);
}

.scroll-top {
    position: fixed;
    right: 24px;
    bottom: 24px;
    width: 52px;
    height: 52px;
    border: none;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--color-blue), var(--color-indigo));
    color: var(--color-gray1);
    font-size: 1.2rem;
    cursor: pointer;
    box-shadow: var(--elevation-3);
    opacity: 0;
    visibility: hidden;
    transform: translateY(10px);
    transition: 0.3s ease;
    z-index: 120;
}

.scroll-top.visible {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
}

@media (max-width: 1100px) {
    .hero-grid,
    .footer-grid,
    .pricing-grid,
    .trust-signals-grid {
        grid-template-columns: 1fr 1fr;
    }

    .pricing-grid .price-card:last-child,
    .trust-signals-grid .trust-signal:last-child {
        grid-column: span 2;
    }
}

@media (max-width: 900px) {
    .main-nav,
    .header-cta {
        display: none;
    }

    .nav-toggle {
        display: inline-block;
    }

    .hero-grid,
    .stats-grid,
    .steps-grid,
    .features-grid,
    .persona-grid,
    .pricing-grid,
    .trust-signals-grid,
    .footer-grid {
        grid-template-columns: 1fr;
    }

    .feature-card-wide,
    .pricing-grid .price-card:last-child,
    .trust-signals-grid .trust-signal:last-child {
        grid-column: span 1;
    }

    .hero-title {
        max-width: 100%;
    }
}

@media (max-width: 640px) {
    .page-shell {
        padding: 12px;
    }

    .section {
        padding: 22px;
        margin-bottom: 20px;
        border-radius: 24px;
    }

    .header-inner {
        padding: 14px 16px;
    }

    .hero-actions {
        flex-direction: column;
    }

    .btn,
    .header-cta {
        width: 100%;
    }

    .trust-item {
        width: 100%;
    }

    .price {
        font-size: 2rem;
    }

    th,
    td {
        padding: 12px;
    }
}
```

---

# 4) `main.js`

```javascript
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

            alert('Upload flow can be connected here to your resume intake module.');
        });
    });
}
```

---

# Notes about the implementation



- Professional **visual hierarchy**
- Strong **above-the-fold conversion layout**
- Clean **modular separation**
- Fully **responsive**
- Uses your **design token system**
- No inline CSS
- No inline JS
- Clean ES6+ structure
