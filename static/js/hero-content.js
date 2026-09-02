/* ---------------------------------------------------------------------------
   Stage plumbing (runs before / independent of the WebGL boot so the content
   still appears even if WebGL is unavailable):
   1. FIT    — scale the fixed design canvas to the viewport (contain), which
               keeps every relative size/position intact across window sizes
               and zoom levels.
   2. REVEAL — a three-movement choreography that starts only after the glass
               shapes have flown in and landed (t = 1.48 s):
                 A · 1.55 s  the curved micro-labels materialize — blur + fade
                              while sweeping the label runway forward along
                              their own orbits (concentric with the circle,
                              hugging the pill), so every glyph visibly rotates
                              along the shape's own curve, in the reading
                              direction.
                 B · 2.62 s  "We Will Find" and "Where You are Needed" rise
                              word by word out of a blur (Apple-style).
                 C · 3.55 s  the paragraph lines settle in, then the CTA
                              button springs up.
               Re-arms whenever the WebGL intro is replayed (canvas click).
   The runway length (84 px desktop / 112 px mobile) comes from
   window.PROF_DESIGN so each composition sweeps proportionally.
   The desktop/mobile curved-label ids are suffixed (-d / -m) since both
   markup variants live in the DOM at once; window.PROF_DESIGN.variant picks
   the active suffix.
   --------------------------------------------------------------------------- */
(function () {
  "use strict";
  const stage = document.getElementById('stage');
  const D = window.PROF_DESIGN;
  const DESIGN_W = D.W, DESIGN_H = D.H;
  const suffix = D.variant === 'mobile' ? '-m' : '-d';

  function fitStage() {
    const s = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
    stage.style.setProperty('--fit', s);
  }
  fitStage();
  window.addEventListener('resize', fitStage);

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- movement A · orbital reveal of the two curved labels ----------------
     Each textPath owns 84 px of invisible runway before the label's final
     resting offset (the paths were extended backwards along the exact same
     curves). The tween sweeps the label that distance forward — in the
     reading direction — while it un-blurs and fades in, so the glyphs trace
     the shape's own curvature as they arrive. */
  const ORBIT = D.runway;           // px of runway (matches the path extensions)
  const LABEL_START = 4;            // startOffset at the runway's beginning
  const LABEL_DUR = 1050;           // ms per label
  const T_A = 1550, T_A_GAP = 120;  // labels start (just after the shapes land)
  const T_B = 2620;                 // headline movement
  const T_C = 3550;                 // paragraph + button movement

  const labels = [
    { text: document.getElementById('textWho' + suffix),  tp: document.getElementById('tpWho' + suffix),  at: T_A },
    { text: document.getElementById('textWhat' + suffix), tp: document.getElementById('tpWhat' + suffix), at: T_A + T_A_GAP }
  ];

  let rafId = 0, timers = [], t0 = 0;
  const clamp01 = x => Math.max(0, Math.min(1, x));

  function setLabel(el, offset, opacity, blurPx) {
    el.tp.setAttribute('startOffset', String(Math.round(offset * 100) / 100));
    el.text.style.opacity = String(opacity);
    el.text.style.filter = blurPx > 0.05 ? 'blur(' + (Math.round(blurPx * 100) / 100) + 'px)' : 'none';
  }

  function tick() {
    const t = performance.now() - t0;
    let alive = false;
    for (const el of labels) {
      const p = clamp01((t - el.at) / LABEL_DUR);
      if (p < 1) alive = true;
      const ePos = 1 - Math.pow(1 - p, 4);       // strong deceleration into place
      const eOp  = 1 - Math.pow(1 - p, 2.4);     // fades up early
      const blur = 13 * Math.pow(1 - p, 1.6);    // sharpens as it slows
      setLabel(el, LABEL_START + ORBIT * ePos, eOp, blur);
    }
    rafId = alive ? requestAnimationFrame(tick) : 0;
  }

  function scheduleReveal() {
    cancelAnimationFrame(rafId); rafId = 0;
    timers.forEach(clearTimeout); timers = [];
    // Hard reset back to the hidden states, with transitions switched off for
    // one frame so the reset is instantaneous (replay re-arms everything).
    stage.classList.add('resetting');
    stage.classList.remove('p2', 'p3');
    for (const el of labels) setLabel(el, LABEL_START, 0, 13);
    void stage.offsetWidth;                      // flush styles
    stage.classList.remove('resetting');

    if (prefersReduced) {
      for (const el of labels) setLabel(el, LABEL_START + ORBIT, 1, 0);
      stage.classList.add('p2', 'p3');
      return;
    }
    t0 = performance.now();
    rafId = requestAnimationFrame(tick);
    timers.push(setTimeout(function () { stage.classList.add('p2'); }, T_B));
    timers.push(setTimeout(function () { stage.classList.add('p3'); }, T_C));
  }

  scheduleReveal();
  // The WebGL engine calls this whenever the intro animation is replayed.
  window.__scheduleReveal = scheduleReveal;
})();