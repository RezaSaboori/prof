/* ---------------------------------------------------------------------------
   DESIGN CONFIG — the single source of truth shared by the DOM stage
   (hero-content.js) and the WebGL engine (hero-scene.js). Picks the desktop
   or mobile design-canvas numbers based on the same breakpoint the rest of
   the app uses (max-width: 980px, see static/css/dashboard-base.css).
   Must load BEFORE hero-content.js and hero-scene.js.
   --------------------------------------------------------------------------- */
"use strict";
(function () {
  var mq = window.matchMedia('(max-width: 980px)');

  function buildDesign(isMobile) {
    return isMobile
      ? { variant: 'mobile', W: 1060, H: 1980, scalePx: 4.55, pillCx: 356.5, pillCy: 812.9, runway: 112 }
      : { variant: 'desktop', W: 1980, H: 1060, scalePx: 3.444, pillCx: 544, pillCy: 519, runway: 84 };
  }

  window.PROF_DESIGN = buildDesign(mq.matches);

  // The desktop and mobile variants are two different DOM/canvas layouts, so
  // crossing the breakpoint after load needs a fresh render — same as the
  // manuscript's own desktop/mobile page switch, just without a page change.
  mq.addEventListener('change', function () {
    window.location.reload();
  });
})();