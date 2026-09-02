"use strict";
const canvas = document.getElementById('gl');
const fallback = document.getElementById('fallback');
const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false });
if (!gl) { fallback.style.display = 'grid'; throw new Error('WebGL unavailable'); }



/* ============================================================================
   GLASS TUNING PANEL — edit these values to change the refraction look of
   BOTH the circle and the pill, and the mouse-driven touch glow. Nothing
   else in the scene reads from this.
   ============================================================================ */
const GLASS_CONFIG = {
  ior:             1.3,   // Base refractive index of the "glass" (crown glass ≈ 1.5–1.6). Higher = stronger bending.
  dispersion:      0.15,  // Chromatic aberration strength: spread between R/G/B refractive indices. 0 = no color fringing.
  thickness:       0.85,  // Lens dome height as a fraction of each shape's own radius. Higher = more convex / stronger curvature.
  distortion:      1.00,  // Extra multiplier applied on top of the physical displacement. >1 exaggerates warping, <1 subdues it.
  absorb:          0.05,  // Beer-Lambert tint strength for light passing through the glass body (color/darkening of the interior).
  fresnelStrength: 0.05,  // How strongly grazing-angle reflectance mixes toward a darker/reflective tone near the rim transition.
  borderWidth:     0.01,  // Fraction of each shape's own radius reserved for the ORIGINAL rim (untouched, no refraction here).
  edgeSoftness:    1.5,   // Anti-aliasing softness (in pixels) at each shape's own outer boundary and border transition.


  // --- Mouse touch-glow (appears only ON the glass, never as a visible cursor) ---
  touchCoreRadius:  0.62, // Fraction of each shape's own radius for the tight inner "point" of the glow. Bigger = larger bright center.
  touchRadius:      0.95, // Fraction of each shape's own radius for the outer soft halo. Bigger = broader spread.
  touchContrast:    0.15, // 0 = core and halo blend almost evenly (flat, low-contrast glow). 1 = sharp, core-dominant glow.
                           // Energy-conserving: this redistributes weight between core/halo WITHOUT changing overall brightness.
  touchStrength:    0.45, // Overall brightness multiplier for the touch glow emission — lower = much dimmer glow overall.
  touchOverlapBoost:0.8,  // How much the glow intensifies where it lands on the EXISTING bright overlap/caustic light —
                           // keeps that "merging" look even when touchStrength/touchContrast are turned down elsewhere.
  touchColor:      [0.85, 0.92, 1.0], // RGB tint of the glow (cool-white, like light diffusing inside glass).
  touchSmoothing:  18.0    // How quickly the glow's position/fade catches up to the cursor. Lower = more "liquid" lag.
};
/* ============================================================================ */




/* ---------------------------------- Shaders -------------------------------- */
const VERT = `
attribute vec2 aPos;
varying vec2 vUV;
void main(){
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;



/* ---- Pass 1 · Physically Based Scene & Optical Radiance -------------------- */
const FRAG_SCENE = `
precision highp float;
uniform vec2  uRes;
uniform float uTime, uGlow;
uniform vec2  uPillC; uniform float uPillR, uPillH, uPillAngle;
uniform vec2  uBallC; uniform float uBallR;
varying vec2 vUV;



#define PI 3.14159265359



/* --- Optical & SDF Primitives --- */
vec2 rotateVec(vec2 v, float ang) {
  float c = cos(ang), s = sin(ang);
  return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}


vec3 capsule(vec2 q, vec2 C) {
  // Rotate the query point into the capsule's own local (un-rotated,
  // vertical) frame, run the ordinary capsule SDF there, then rotate the
  // resulting normal back out to world space — a proper rotated capsule.
  vec2 qLocal = C + rotateVec(q - C, -uPillAngle);
  vec2 a = C - vec2(0.0, uPillH), b = C + vec2(0.0, uPillH);
  vec2 pa = qLocal - a, ba = b - a;
  float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  vec2 v = qLocal - (a + ba * t);
  float l = max(length(v), 1e-5);
  vec2 dirWorld = rotateVec(v / l, uPillAngle);
  return vec3(l - uPillR, dirWorld);
}



vec3 disc(vec2 q, vec2 C) {
  vec2 v = q - C;
  float l = max(length(v), 1e-5);
  return vec3(l - uBallR, v / l);
}



/* --- Vesica Piscis Geometric Chord Calculation --- */
vec3 getVesica() {
  vec2 c1 = uPillC + rotateVec(vec2(0.0, uPillH), uPillAngle);
  vec2 c2 = uBallC;
  float r1 = uPillR, r2 = uBallR;
  vec2 dv = c2 - c1;
  float d = max(length(dv), 1e-5);
  vec2 u = dv / d;
  float a = (r1*r1 - r2*r2 + d*d) / (2.0 * d);
  float h = sqrt(max(0.0, r1*r1 - a*a));
  return vec3(c1 + u * a, max(h, 0.001));
}



/* --- Spectral Wavelength to RGB Weighting (CIE Standard Observer Fit) --- */
vec3 spectralWeight(float t) {
  // t: 0.0 (700nm Red) to 1.0 (400nm Violet)
  float r = smoothstep(0.40, 0.00, t) + 0.65 * smoothstep(0.70, 1.00, t);
  float g = smoothstep(0.05, 0.45, t) * smoothstep(0.85, 0.45, t) * 1.15;
  float b = smoothstep(0.35, 0.85, t) * 1.30;
  return vec3(r, g, b);
}



/* --- Biconvex Snellian Refraction Distance Field with Cauchy Dispersion --- */
float refractedDist(vec2 p, float lambdaDisp) {
  float dA = capsule(p, uPillC).x;
  float dB = disc(p, uBallC).x;
  float dLens = max(dA, dB);



  // Cauchy dispersion n(λ) = n0 + B/λ^2
  float nFactor = 1.0 + (lambdaDisp - 0.5) * 0.14;



  // Snellian deflection compression
  float pushA = exp(-abs(dA) / (uPillR * 0.48)) * (uPillR * 0.82);
  float pushB = exp(-abs(dB) / (uBallR * 0.52)) * (uBallR * 0.95);



  // Geometric pinch at intersection cusp
  float cuspPinch = exp(-abs(dA)/(uPillR*0.35)) * exp(-abs(dB)/(uBallR*0.35))
                    * ((uPillR + uBallR) * 0.45);



  float fade = smoothstep(-0.02, 0.08, dLens);
  float convergence = 0.35 + 0.65 * uGlow;



  return dLens + (pushA + pushB + cuspPinch) * nFactor * fade * convergence;
}



/* --- Point Spread Function (Airy Disk Core + Lorentzian + Mie Halo) --- */
float opticalRadiance(vec2 p, float lambdaDisp) {
  float d = refractedDist(p, lambdaDisp);
  float dPos = max(d, 0.0);



  // 1. Core Airy distribution (high intensity focus)
  float core = 1.0 / (1.0 + pow(max(d + 0.004, 0.0) / 0.012, 2.8));



  // 2. Near-field Lorentzian diffraction wing
  float lorentz = 1.0 / (1.0 + pow(dPos / 0.045, 1.4));



  // 3. Medium & Far Mie scatter forward exponential falloffs
  float mieNear = exp(-dPos * 18.0) * 0.85;
  float mieMid  = exp(-dPos * 6.5)  * 0.28;
  float mieFar  = exp(-dPos * 1.8)  * 0.065;



  return core * 1.85 + lorentz * 0.45 + mieNear + mieMid + mieFar;
}



/* --- ACES Filmic Tone Reproduction with Chromatic Desaturation --- */
vec3 tonemapACES(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}



void main(){
  vec2 frag = gl_FragCoord.xy;
  vec2 p = (frag - 0.5 * uRes) / uRes.y * 2.0;



  vec3 capInfo = capsule(p, uPillC);
  vec3 discInfo = disc(p, uBallC);
  float dP = capInfo.x;
  float dC = discInfo.x;
  vec2 normP = capInfo.yz;
  vec2 normC = discInfo.yz;



  float dLens = max(dP, dC);
  float insideP = 1.0 - smoothstep(-0.0015, 0.0015, dP);
  float insideC = 1.0 - smoothstep(-0.0015, 0.0015, dC);
  float inLens  = insideP * insideC;
  float inGlass = clamp(insideP + insideC, 0.0, 1.0);



  // 7-Band Continuous Spectral Dispersion Integration
  vec3 spectralLight = vec3(0.0);
  for (int i = 0; i < 7; i++) {
    float tSpec = float(i) / 6.0;
    float rad = opticalRadiance(p, tSpec);
    vec3 w = spectralWeight(tSpec);
    spectralLight += rad * w;
  }
  spectralLight /= 4.2;



  // Vesica origin radiance alignment
  vec3 V = getVesica();
  float distVesica = length(p - V.xy) / max(V.z, 0.015);
  float vesicaField = 0.65 * exp(-distVesica * distVesica * 0.75) + 0.35 * exp(-distVesica * 1.25);



  // Internal Caustic Singularity along lens cusps
  float cuspAlignment = max(0.0, dot(normP, -normC));
  float cuspField = exp(-abs(dP) / 0.008) * exp(-abs(dC) / 0.008) * (0.6 + 0.4 * cuspAlignment);
  float rimArcP   = exp(-pow(abs(dP + 0.002) / 0.0035, 2.0));
  float rimArcC   = exp(-pow(abs(dC + 0.002) / 0.0035, 2.0));
  float causticFocus = (rimArcP * 0.45 + rimArcC * 0.55 + cuspField * 1.8) * exp(-max(dLens, 0.0) * 5.0);



  // Fresnel Reflectance & Dielectric Glass Substrate
  float f0 = 0.04; // Crown Glass n=1.52
  float fresnelP = f0 + (1.0 - f0) * pow(1.0 - abs(dot(normP, vec2(0.0, 1.0))), 5.0);
  // Ball rim uses a raised Fresnel floor so the outline never fully vanishes at the
  // top/bottom of the circle (where the surface normal aligns with the reference "up"
  // direction and the standard Schlick term collapses toward zero, producing a visible
  // gap in the border). This only affects the circle's rim, not the pill's.
  float f0Ball = 0.22;
  float fresnelC = f0Ball + (1.0 - f0Ball) * pow(1.0 - abs(dot(normC, vec2(0.0, 1.0))), 5.0);



  // Dark optical environment with subtle ambient depth
  vec3 color = vec3(0.0025, 0.0030, 0.0042);
  color += vec3(0.004, 0.005, 0.007) * exp(-dot(p - vec2(-0.4, 0.35), p - vec2(-0.4, 0.35)) * 0.7);



  // Dielectric substrate internal body transmission (Beer-Lambert Law)
  vec3 glassAbsorption = vec3(0.98, 0.96, 0.93);
  vec3 bodyPill = vec3(0.012, 0.014, 0.018) * glassAbsorption;
  vec3 bodyBall = vec3(0.014, 0.016, 0.021) * glassAbsorption;
  color = mix(color, bodyPill, insideP * 0.92);
  color = mix(color, bodyBall, insideC * 0.92);



  // Gather total physical light energy
  vec3 totalLight = vec3(0.0);



  // 1. Multi-Spectral Refracted Lens Emission
  totalLight += spectralLight * (0.35 + 1.25 * inGlass);



  // 2. Focused Core Radiance (Super-incandescent focus inside lens)
  float coreIncandescence = (1.0 - smoothstep(-0.008, 0.012, dLens)) * inLens;
  totalLight += vec3(2.8, 2.7, 2.6) * coreIncandescence * uGlow * 3.5;



  // 3. Volumetric forward scattering inside glass bodies
  float volP = exp(-max(refractedDist(p, 0.5), 0.0) * 3.8) * (0.2 + 0.8 * vesicaField);
  float volC = exp(-max(refractedDist(p, 0.5), 0.0) * 1.8) * (0.25 + 0.75 * vesicaField);
  totalLight += vec3(0.065, 0.062, 0.058) * volP * insideP * uGlow;
  totalLight += vec3(0.120, 0.115, 0.108) * volC * insideC * uGlow;



  // 4. Caustic lines and cusp singularity
  totalLight += vec3(1.15, 1.08, 0.95) * causticFocus * uGlow * 1.9;



  // 5. Fresnel border highlights
  totalLight += vec3(0.75, 0.82, 0.95) * (fresnelP * rimArcP + fresnelC * rimArcC) * (0.25 + 0.75 * uGlow);



  // Planckian thermal color shift (High intensity → White, Mid intensity → Golden Amber)
  float lum = dot(totalLight, vec3(0.2126, 0.7152, 0.0722));
  vec3 warmPlanckian = vec3(1.08, 0.88, 0.68);
  vec3 hotIncandescent = vec3(1.0, 0.99, 0.98);
  totalLight *= mix(warmPlanckian, hotIncandescent, smoothstep(0.15, 1.2, lum));



  color += totalLight;



  // High-precision filmic exposure
  color = tonemapACES(color * 1.35);

  gl_FragColor = vec4(color, 1.0);
}`;



/* ---- Pass 2 · Energy-Conserving HDR Bright Extraction ---------------------- */
const FRAG_BRIGHT = `
precision mediump float;
uniform sampler2D uTex;
varying vec2 vUV;
void main(){
  vec3 c = texture2D(uTex, vUV).rgb;
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // Soft knee curve: avoids hard clipping and preserves energy
  float knee = 0.25;
  float threshold = 0.62;
  float soft = lum - threshold + knee;
  soft = clamp(soft, 0.0, 2.0 * knee);
  soft = (soft * soft) / (4.0 * knee + 1e-4);
  float weight = max(soft, lum - threshold) / max(lum, 1e-4);
  gl_FragColor = vec4(c * clamp(weight, 0.0, 1.0), 1.0);
}`;



/* ---- Passes 3-4 · Multi-Tap Anamorphic Gaussian Blur ----------------------- */
const FRAG_BLUR = `
precision mediump float;
uniform sampler2D uTex;
uniform vec2 uDir;
varying vec2 vUV;
void main(){
  vec3 c = vec3(0.0);
  c += texture2D(uTex, vUV - uDir * 3.230769).rgb * 0.070270;
  c += texture2D(uTex, vUV - uDir * 1.384615).rgb * 0.316216;
  c += texture2D(uTex, vUV).rgb                  * 0.227027;
  c += texture2D(uTex, vUV + uDir * 1.384615).rgb * 0.316216;
  c += texture2D(uTex, vUV + uDir * 3.230769).rgb * 0.070270;
  gl_FragColor = vec4(c, 1.0);
}`;



/* ---- Pass 5 · Physically Based Composite & Glare Integration -------------- */
const FRAG_COMP = `
precision highp float;
uniform sampler2D uScene, uBloom;
uniform vec2  uRes;
uniform float uTime, uFade;
varying vec2 vUV;



// Non-repetitive triangular noise dithering (eliminates banding)
float dither(vec2 uv) {
  return fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
}



void main(){
  vec3 scene = texture2D(uScene, vUV).rgb;
  vec3 bloom = texture2D(uBloom, vUV).rgb;



  // Energy-conserving bloom blend
  vec3 color = scene + bloom * 0.72;



  // Subtle optical lens vignette
  vec2 q = (vUV - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float vig = 1.0 - dot(q, q) * 0.32;
  color *= max(vig, 0.0);



  // Microscopic filmic dither
  float noise = (dither(vUV + fract(uTime * 0.01)) - 0.5) / 255.0 * 2.2;
  color += noise;



  gl_FragColor = vec4(clamp(color * uFade, 0.0, 1.0), 1.0);
}`;



/* ---- Pass 6 · Physically Based Refractive Glass Overlay (circle + pill) ---
   Plano-convex spherical-cap / cylindrical-cap lens: analytic surface normal
   from the height field h(r) = T*sqrt(1-(r/R)^2), Snell refraction via
   refract(), per-channel Cauchy dispersion for chromatic aberration,
   Beer-Lambert absorption tint. Each shape is refracted with ONLY its own
   signed distance & direction field (no cross-shape blending — this is what
   removes the notch artifacts that appeared at the two true intersection
   points of the outlines). The circle is layered on top of the pill: wherever
   the circle's own anti-aliased edge has any coverage, it wins outright;
   the pill only contributes outside that. A thin outer band per shape
   (uBorderWidth) is excluded from refraction so each keeps its original rim.
   A mouse-driven "touch glow" is added on top: a soft double-gaussian emissive
   patch, masked so it can ONLY appear within each shape's own silhouette —
   never visible over the background, never a sharp point, and it intensifies
   (uTouchOverlapBoost) where it lands on the existing bright overlap/caustic
   light so that "merging" look survives independent of how dim/flat the glow
   itself is tuned. */
const FRAG_GLASS = `
precision highp float;
uniform sampler2D uComposite;
uniform vec2  uRes;
uniform vec2  uGlassC;
uniform float uGlassR;
uniform vec2  uPillC;
uniform float uPillR;
uniform float uPillH;
uniform float uPillAngle;
uniform float uIOR;
uniform float uDispersion;
uniform float uThicknessFactor;
uniform float uDistortion;
uniform float uAbsorb;
uniform float uFresnelStrength;
uniform float uBorderWidth;
uniform float uEdgeSoftness;
uniform vec2  uMouse;
uniform float uMousePresence;
uniform float uTouchCoreRadius;
uniform float uTouchRadius;
uniform float uTouchContrast;
uniform float uTouchStrength;
uniform float uTouchOverlapBoost;
uniform vec3  uTouchColor;
varying vec2 vUV;


vec3 sampleComposite(vec2 pix){
  vec2 uv = clamp(pix / uRes, vec2(0.0), vec2(1.0));
  return texture2D(uComposite, uv).rgb;
}


vec2 rotateVec(vec2 v, float ang) {
  float c = cos(ang), s = sin(ang);
  return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}


float discSDF(vec2 q, vec2 C, float Rr, out vec2 dir) {
  vec2 v = q - C;
  float l = max(length(v), 1e-5);
  dir = v / l;
  return l - Rr;
}


float capsuleSDF(vec2 q, vec2 C, float Rr, float Hh, float angle, out vec2 dir) {
  vec2 qLocal = C + rotateVec(q - C, -angle);
  vec2 a = C - vec2(0.0, Hh);
  vec2 b = C + vec2(0.0, Hh);
  vec2 pa = qLocal - a, ba = b - a;
  float tt = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  vec2 v = qLocal - (a + ba * tt);
  float l = max(length(v), 1e-5);
  dir = rotateVec(v / l, angle);
  return l - Rr;
}


vec3 lensRefract(vec2 fragPx, vec3 base, float d, vec2 dir, float R){
  float rn = clamp((d + R) / max(R, 1e-3), 0.0, 0.995);
  float T = R * uThicknessFactor;
  float root = sqrt(max(1.0 - rn * rn, 1e-4));
  float hLocal = T * root;
  float dhdr = -T * rn / (R * root);
  vec2 grad = dir * dhdr;
  vec3 normal = normalize(vec3(-grad, 1.0));


  vec3 incident = vec3(0.0, 0.0, -1.0);


  // Cauchy-style dispersion: n(λ) varies per channel
  float iorR = uIOR - uDispersion;
  float iorG = uIOR;
  float iorB = uIOR + uDispersion;


  vec3 refR = refract(incident, normal, 1.0 / iorR);
  vec3 refG = refract(incident, normal, 1.0 / iorG);
  vec3 refB = refract(incident, normal, 1.0 / iorB);


  // Distance to the flat back plane of the plano-convex lens
  float tR = hLocal / max(-refR.z, 1e-3);
  float tG = hLocal / max(-refG.z, 1e-3);
  float tB = hLocal / max(-refB.z, 1e-3);


  vec2 offR = refR.xy * tR * uDistortion;
  vec2 offG = refG.xy * tG * uDistortion;
  vec2 offB = refB.xy * tB * uDistortion;


  float cR = sampleComposite(fragPx + offR).r;
  float cG = sampleComposite(fragPx + offG).g;
  float cB = sampleComposite(fragPx + offB).b;
  vec3 refracted = vec3(cR, cG, cB);


  // Beer-Lambert absorption tint scaled by traversed glass depth
  vec3 absorbColor = vec3(0.90, 0.94, 0.99);
  float pathNorm = hLocal / max(T, 1e-4);
  vec3 tinted = mix(refracted, refracted * absorbColor, pathNorm * uAbsorb);


  // Schlick-Fresnel blend (physical dielectric response, not a glare)
  float f0 = 0.04; // crown glass n≈1.52
  float ndotv = clamp(normal.z, 0.0, 1.0);
  float fresnel = f0 + (1.0 - f0) * pow(1.0 - ndotv, 5.0);
  return mix(tinted, base * 0.55 + vec3(0.02), fresnel * uFresnelStrength);
}


// Soft, broad, non-pointy touch glow. The core/halo BALANCE (not a brightness
// power-curve) is what controls contrast: coreWeight+haloWeight always sum to
// ~1.0 regardless of uTouchContrast, so lowering contrast flattens the shape
// of the glow (less peak-vs-surroundings difference) WITHOUT raising overall
// brightness. uTouchOverlapBoost then separately intensifies the result
// wherever the underlying scene is already bright (the caustic/overlap
// light), preserving that merging look independent of the above.
vec3 touchGlow(vec2 fragPx, float R, vec3 baseColor) {
  float d = length(fragPx - uMouse);
  float r1 = max(R * uTouchCoreRadius, 1.0);
  float r2 = max(R * uTouchRadius, 1.0);
  float core = exp(-(d * d) / (2.0 * r1 * r1));
  float halo = exp(-(d * d) / (2.0 * r2 * r2));


  float contrast = clamp(uTouchContrast, 0.0, 1.0);
  float coreWeight = mix(0.35, 0.75, contrast);
  float haloWeight = mix(0.65, 0.25, contrast);
  float glowRaw = clamp(core * coreWeight + halo * haloWeight, 0.0, 1.0);


  float baseLum = dot(baseColor, vec3(0.2126, 0.7152, 0.0722));
  float overlapBoost = 1.0 + uTouchOverlapBoost * baseLum;


  float glow = glowRaw * uMousePresence * overlapBoost;
  return uTouchColor * glow * uTouchStrength;
}


void main(){
  vec2 fragPx = vUV * uRes;
  vec3 base = texture2D(uComposite, vUV).rgb;


  vec2 dirBall, dirPill;
  float dBall = discSDF(fragPx, uGlassC, uGlassR, dirBall);
  float dPill = capsuleSDF(fragPx, uPillC, uPillR, uPillH, uPillAngle, dirPill);


  float soft = max(uEdgeSoftness, 1e-3);


  // Fully outside both shapes: pass through untouched, no work needed
  // (the touch glow is masked by the same shape silhouettes, so it is
  // guaranteed to be zero here too — nothing to compute).
  if (dBall > soft && dPill > soft) {
    gl_FragColor = vec4(base, 1.0);
    return;
  }


  float ballOuterAA = 1.0 - smoothstep(-soft, soft, dBall);
  float pillOuterAA = 1.0 - smoothstep(-soft, soft, dPill);


  vec3 result = base;


  // Circle refracts using ONLY its own field — independent of the pill entirely.
  if (dBall <= soft) {
    vec3 ballGlass = lensRefract(fragPx, base, dBall, dirBall, uGlassR);
    float borderPxBall = max(uBorderWidth * uGlassR, 0.001);
    float borderPreserveBall = smoothstep(-borderPxBall - soft, -borderPxBall, dBall);
    float ballWeight = ballOuterAA * (1.0 - borderPreserveBall);
    result = mix(result, ballGlass, ballWeight);
  }


  // Pill refracts using ONLY its own field, but is suppressed wherever the
  // circle's own edge coverage is nonzero — this keeps the circle strictly
  // on top without ever mixing the two shapes' normals together.
  if (dPill <= soft) {
    vec3 pillGlass = lensRefract(fragPx, base, dPill, dirPill, uPillR);
    float borderPxPill = max(uBorderWidth * uPillR, 0.001);
    float borderPreservePill = smoothstep(-borderPxPill - soft, -borderPxPill, dPill);
    float pillWeight = pillOuterAA * (1.0 - borderPreservePill) * (1.0 - ballOuterAA);
    result = mix(result, pillGlass, pillWeight);
  }


  // Mouse touch glow — additive emission, masked to each shape's own
  // silhouette (including its rim), respecting the circle's on-top priority.
  // Never rendered outside the glass shapes, so the cursor itself stays invisible.
  if (uMousePresence > 0.001) {
    float pillGlowMask = pillOuterAA * (1.0 - ballOuterAA);
    result += touchGlow(fragPx, uGlassR, base) * ballOuterAA;
    result += touchGlow(fragPx, uPillR, base) * pillGlowMask;
  }


  gl_FragColor = vec4(result, 1.0);
}`;



/* --------------------------- Design-space constants ------------------------- */
// The fixed coordinate system shared by the WebGL scene and the DOM overlay.
const DSGN = window.PROF_DESIGN;
const DESIGN_W = DSGN.W, DESIGN_H = DSGN.H;
const DESIGN_ASPECT = DESIGN_W / DESIGN_H;
// Uniform contain-fit factor from design space to the live viewport shader
// space: 1 when the viewport is at least as wide (proportionally) as the
// design, otherwise the whole composition scales down to fit. This is the
// same scale the CSS #stage overlay uses, so texts and shapes stay locked.
function fitScale() {
  const aspect = W / H;
  return Math.min(1, aspect / DESIGN_ASPECT);
}


/* --------------------------------- Engine Setup ----------------------------- */
function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(s) || 'Shader compilation error');
  return s;
}



function createProgram(fsSrc) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p) || 'Program linking error');
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}



const progScene  = createProgram(FRAG_SCENE);
const progBright = createProgram(FRAG_BRIGHT);
const progBlur   = createProgram(FRAG_BLUR);
const progComp   = createProgram(FRAG_COMP);
const progGlass  = createProgram(FRAG_GLASS);



const quadBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);



function bindQuad() {
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
}



gl.disable(gl.DEPTH_TEST);
gl.disable(gl.BLEND);



/* -------------------------------- Render Targets ---------------------------- */
function makeTarget(w, h) {
  w = Math.max(1, w | 0); h = Math.max(1, h | 0);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb, w, h };
}



let W = 0, H = 0, DPR = 1;
let rtScene = null, rtA = null, rtB = null, rtComposite = null;



/* -------------------------- Mouse Touch-Glow State -------------------------- */
const mouseRaw = { x: 0, y: 0 };
const mouseSmooth = { x: 0, y: 0 };
let mouseTargetPresence = 0;
let mousePresence = 0;



function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = Math.max(2, Math.round(innerWidth * DPR));
  H = Math.max(2, Math.round(innerHeight * DPR));
  canvas.width = W; canvas.height = H;
  rtScene = makeTarget(W, H);
  rtComposite = makeTarget(W, H);
  rtA = makeTarget(W >> 1, H >> 1);
  rtB = makeTarget(W >> 1, H >> 1);
}



/* --------------------------- Layout & Natural Motion ------------------------ */
const clamp01 = x => Math.max(0, Math.min(1, x));
const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const DEG2RAD = Math.PI / 180;


// Strong deceleration, strictly monotonic (never overshoots past 1) — used
// for POSITION and SCALE, so the overlap between the shapes can only grow
// toward its final value and never exceeds it during the flight.
function easeOutExpo(t) {
  t = clamp01(t);
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}


// Apple-style spring ease that overshoots slightly then settles — safe to use
// ONLY for things that don't affect the overlap amount (rotation, the
// perpendicular arc bulge), giving liveliness without risking extra
// interpenetration between the two shapes.
function easeOutBack(t, overshoot) {
  t = clamp01(t);
  const c1 = overshoot;
  const c3 = c1 + 1.0;
  const tm1 = t - 1.0;
  return 1.0 + c3 * tm1 * tm1 * tm1 + c1 * tm1 * tm1;
}


// Independent per-shape entrance timing so the pill and ball don't arrive in
// lockstep — a staggered, choreographed reveal reads far more natural.
const PILL_DELAY = 0.05, PILL_DUR = 1.10;
const BALL_DELAY = 0.18, BALL_DUR = 1.30;
const SCALE_START = 1.55;              // shapes "grow into place" from oversized, monotonically down to 1.0
const PILL_ANGLE_START = -15 * DEG2RAD; // pill starts tilted -15°, springs back to level
const PILL_ANGLE_OVERSHOOT = 1.4;



function computeLayout() {
  /* ---------------------------------------------------------------------------
     Fixed DESIGN-SPACE layout, extracted 1:1 from the reference design
     (a 1980x1060 viewport). The whole composition — glass shapes and every
     text on the #stage overlay — lives in this one coordinate system, so
     their relative sizes and positions can never drift apart. drawFrame()
     maps this design space onto the live viewport with a single uniform
     "contain" factor K = min(1, aspect / DESIGN_ASPECT), the exact same
     transform the CSS stage uses. Result: identical proportions at every
     window size, aspect ratio, zoom level and DPR.
     --------------------------------------------------------------------------- */
  // Design px per unit of the reference SVG (pill r=50, circle r=70, circle
  // offset from pill center +56,+48). Calibrated so the circle's geometric
  // radius measures exactly 241.1px on the 1980x1060 reference.
  const SCALE_PX = DSGN.scalePx;
  const S = SCALE_PX / (DESIGN_H * 0.5);        // design-shader units per SVG unit
  const rP = 50 * S, hP = 50 * S, rB = 70 * S;

  // Pill center at design px (desktop 544,519 / mobile 356.5,812.9)
  // -> design shader (x right, y up).
  const p1 = [
    (DSGN.pillCx - DESIGN_W * 0.5) / (DESIGN_H * 0.5),
    (DESIGN_H * 0.5 - DSGN.pillCy) / (DESIGN_H * 0.5)
  ];
  // Ball center relative to the pill's own center, straight from the SVG
  // geometry (+56,+48 in SVG units, y flipped for the y-up shader space).
  const b1 = [p1[0] + 56 * S, p1[1] + 48 * S];

  // Opposite-corner entrance points in DESIGN space, comfortably off-canvas.
  // The fit factor K never exceeds 1, so these stay off-screen at every aspect.
  const cornerX = DESIGN_ASPECT * 1.15 + 0.6;
  const cornerY = 1.35;
  const p0 = [-cornerX, -cornerY]; // pill flies in from the BOTTOM-LEFT corner
  const b0 = [cornerX, cornerY];   // ball flies in from the TOP-RIGHT corner

  return { rP, hP, rB, p0, p1, b0, b1 };
}


function perp(dx, dy) {
  const len = Math.hypot(dx, dy) || 1;
  return [-dy / len, dx / len];
}



function calculatePose(layout, t) {
  const tp = clamp01((t - PILL_DELAY) / PILL_DUR);
  const tb = clamp01((t - BALL_DELAY) / BALL_DUR);


  // Position & scale: monotonic, no overshoot — the maximum overlap the two
  // shapes ever have during the whole animation is exactly their final
  // resting overlap, never more.
  const epPos = easeOutExpo(tp);
  const ebPos = easeOutExpo(tb);


  // A gentle curved bulge, expressed as a function of the MONOTONIC eased
  // progress (so it is guaranteed to vanish by the time each shape nears its
  // final position) — reads like a natural "swing into place" instead of a
  // perfectly straight line, without risking extra overlap near the end.
  const humpP = 4 * epPos * (1 - epPos);
  const humpB = 4 * ebPos * (1 - ebPos);


  const pDir = perp(layout.p1[0] - layout.p0[0], layout.p1[1] - layout.p0[1]);
  const bDir = perp(layout.b1[0] - layout.b0[0], layout.b1[1] - layout.b0[1]);
  const ARC_P = 0.14, ARC_B = 0.18;


  const pillC = [
    lerp(layout.p0[0], layout.p1[0], epPos) + pDir[0] * ARC_P * humpP,
    lerp(layout.p0[1], layout.p1[1], epPos) + pDir[1] * ARC_P * humpP
  ];
  const ballC = [
    lerp(layout.b0[0], layout.b1[0], ebPos) + bDir[0] * ARC_B * humpB,
    lerp(layout.b0[1], layout.b1[1], ebPos) + bDir[1] * ARC_B * humpB
  ];


  const pillScale = lerp(SCALE_START, 1.0, epPos);
  const ballScale = lerp(SCALE_START, 1.0, ebPos);


  // Rotation is purely cosmetic (it doesn't feed into the overlap
  // calculation at all), so it's free to use the springy overshoot ease.
  const pillAngle = lerp(PILL_ANGLE_START, 0.0, easeOutBack(tp, PILL_ANGLE_OVERSHOOT));


  return {
    pill: { c: pillC, r: layout.rP * pillScale, h: layout.hP * pillScale, angle: pillAngle },
    ball: { c: ballC, r: layout.rB * ballScale }
  };
}



function overlapDepth(P, B) {
  const cx = P.c[0], cy = P.c[1] + P.h;
  return (P.r + B.r) - Math.hypot(B.c[0] - cx, B.c[1] - cy);
}



/* -------------------------------- Render Loop ------------------------------- */
function renderPass(rt) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, rt ? rt.fb : null);
  gl.viewport(0, 0, rt ? rt.w : W, rt ? rt.h : H);
}



function setTexture(prog, name, tex, unit) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(prog.u[name], unit);
}



let tStart = performance.now();
let lastFrameTime = performance.now();
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;



const DESIGN_LAYOUT = computeLayout();

function drawFrame(now) {
  const t = (now - tStart) / 1000;
  const aspect = W / H;
  const layout = DESIGN_LAYOUT;
  const { pill, ball } = calculatePose(layout, t);
  // Overlap depth (and therefore the glow) is measured in DESIGN space so the
  // optical look is identical at every viewport size, never at every K.
  const depth = overlapDepth(pill, ball);

  // ---- design space -> screen space (the same "contain" fit the DOM uses) --
  const K = fitScale();
  const pillC = [pill.c[0] * K, pill.c[1] * K];
  const ballC = [ball.c[0] * K, ball.c[1] * K];
  const pillR = pill.r * K, pillH = pill.h * K, pillAngle = pill.angle;
  const ballR = ball.r * K;



  // Smooth physical activation curve tied purely to overlap geometry (no artificial pulsing)
  const glow = clamp01(smoothstep(0.012, 0.16, depth)) * smoothstep(0.0, 0.5, t);
  const fade = smoothstep(0.1, 0.85, t);



  // Frame-rate independent smoothing for the "liquid" lag of the touch glow.
  const dt = Math.min(Math.max((now - lastFrameTime) / 1000, 0), 0.1);
  lastFrameTime = now;
  const ease = 1 - Math.exp(-GLASS_CONFIG.touchSmoothing * dt);
  mouseSmooth.x += (mouseRaw.x - mouseSmooth.x) * ease;
  mouseSmooth.y += (mouseRaw.y - mouseSmooth.y) * ease;
  mousePresence += (mouseTargetPresence - mousePresence) * ease;



  // Pixel-space conversions of pill/ball pose, shared by the glass pass.
  const glassCxPx = ballC[0] * (H * 0.5) + W * 0.5;
  const glassCyPx = ballC[1] * (H * 0.5) + H * 0.5;
  const glassRPx  = ballR * (H * 0.5);
  const pillCxPx  = pillC[0] * (H * 0.5) + W * 0.5;
  const pillCyPx  = pillC[1] * (H * 0.5) + H * 0.5;
  const pillRPx   = pillR * (H * 0.5);
  const pillHPx   = pillH * (H * 0.5);



  /* 1 · Physically-based scene pass */
  renderPass(rtScene);
  gl.useProgram(progScene.p); bindQuad();
  gl.uniform2f(progScene.u.uRes, W, H);
  gl.uniform1f(progScene.u.uTime, t);
  gl.uniform1f(progScene.u.uGlow, glow);
  gl.uniform2f(progScene.u.uPillC, pillC[0], pillC[1]);
  gl.uniform1f(progScene.u.uPillR, pillR);
  gl.uniform1f(progScene.u.uPillH, pillH);
  gl.uniform1f(progScene.u.uPillAngle, pillAngle);
  gl.uniform2f(progScene.u.uBallC, ballC[0], ballC[1]);
  gl.uniform1f(progScene.u.uBallR, ballR);
  gl.drawArrays(gl.TRIANGLES, 0, 3);



  /* 2 · Energy-conserving bright extraction */
  renderPass(rtA);
  gl.useProgram(progBright.p); bindQuad();
  setTexture(progBright, 'uTex', rtScene.tex, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);



  /* 3 · Anamorphic bloom horizontal & vertical passes */
  gl.useProgram(progBlur.p); bindQuad();
  renderPass(rtB); setTexture(progBlur, 'uTex', rtA.tex, 0);
  gl.uniform2f(progBlur.u.uDir, 1.2 / rtA.w, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
  renderPass(rtA); setTexture(progBlur, 'uTex', rtB.tex, 0);
  gl.uniform2f(progBlur.u.uDir, 0, 1.2 / rtA.h); gl.drawArrays(gl.TRIANGLES, 0, 3);



  /* 4 · Ethereal wide scatter tail */
  renderPass(rtB); setTexture(progBlur, 'uTex', rtA.tex, 0);
  gl.uniform2f(progBlur.u.uDir, 2.8 / rtA.w, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
  renderPass(rtA); setTexture(progBlur, 'uTex', rtB.tex, 0);
  gl.uniform2f(progBlur.u.uDir, 0, 2.8 / rtA.h); gl.drawArrays(gl.TRIANGLES, 0, 3);



  /* 5 · Composite with filmic tonemapping (renders to an offscreen buffer, not directly to canvas) */
  renderPass(rtComposite);
  gl.useProgram(progComp.p); bindQuad();
  setTexture(progComp, 'uScene', rtScene.tex, 0);
  setTexture(progComp, 'uBloom', rtA.tex, 1);
  gl.uniform2f(progComp.u.uRes, W, H);
  gl.uniform1f(progComp.u.uTime, t);
  gl.uniform1f(progComp.u.uFade, fade);
  gl.drawArrays(gl.TRIANGLES, 0, 3);



  /* 6 · Physically based refractive glass overlay — circle on top, pill beneath,
         each computed independently (no cross-shape blending, no notch artifacts),
         plus the mouse touch glow masked to each shape's own silhouette. */
  renderPass(null);
  gl.useProgram(progGlass.p); bindQuad();
  setTexture(progGlass, 'uComposite', rtComposite.tex, 0);
  gl.uniform2f(progGlass.u.uRes, W, H);
  gl.uniform2f(progGlass.u.uGlassC, glassCxPx, glassCyPx);
  gl.uniform1f(progGlass.u.uGlassR, glassRPx);
  gl.uniform2f(progGlass.u.uPillC, pillCxPx, pillCyPx);
  gl.uniform1f(progGlass.u.uPillR, pillRPx);
  gl.uniform1f(progGlass.u.uPillH, pillHPx);
  gl.uniform1f(progGlass.u.uPillAngle, pillAngle);
  gl.uniform1f(progGlass.u.uIOR, GLASS_CONFIG.ior);
  gl.uniform1f(progGlass.u.uDispersion, GLASS_CONFIG.dispersion);
  gl.uniform1f(progGlass.u.uThicknessFactor, GLASS_CONFIG.thickness);
  gl.uniform1f(progGlass.u.uDistortion, GLASS_CONFIG.distortion);
  gl.uniform1f(progGlass.u.uAbsorb, GLASS_CONFIG.absorb);
  gl.uniform1f(progGlass.u.uFresnelStrength, GLASS_CONFIG.fresnelStrength);
  gl.uniform1f(progGlass.u.uBorderWidth, GLASS_CONFIG.borderWidth);
  gl.uniform1f(progGlass.u.uEdgeSoftness, GLASS_CONFIG.edgeSoftness);
  gl.uniform2f(progGlass.u.uMouse, mouseSmooth.x, mouseSmooth.y);
  gl.uniform1f(progGlass.u.uMousePresence, mousePresence);
  gl.uniform1f(progGlass.u.uTouchCoreRadius, GLASS_CONFIG.touchCoreRadius);
  gl.uniform1f(progGlass.u.uTouchRadius, GLASS_CONFIG.touchRadius);
  gl.uniform1f(progGlass.u.uTouchContrast, GLASS_CONFIG.touchContrast);
  gl.uniform1f(progGlass.u.uTouchStrength, GLASS_CONFIG.touchStrength);
  gl.uniform1f(progGlass.u.uTouchOverlapBoost, GLASS_CONFIG.touchOverlapBoost);
  gl.uniform3f(progGlass.u.uTouchColor, GLASS_CONFIG.touchColor[0], GLASS_CONFIG.touchColor[1], GLASS_CONFIG.touchColor[2]);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}



function loop(now) {
  drawFrame(now);
  requestAnimationFrame(loop);
}



/* -------------------------------- User Events ------------------------------- */
function pxFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const sx = W / rect.width, sy = H / rect.height;
  const clientX = (e.clientX - rect.left) * sx;
  const clientY = (e.clientY - rect.top) * sy;
  // Flip Y: DOM client space is top-down, gl_FragCoord space is bottom-up
  return [clientX, H - clientY];
}



canvas.addEventListener('pointerdown', (e) => {
  const [px, py] = pxFromEvent(e);
  mouseRaw.x = px; mouseRaw.y = py;
  mouseTargetPresence = 1;
  const now = performance.now();
  if (now - tStart < 800) return;
  tStart = now;
  // Intro replayed: hide the content again, re-reveal once the shapes land.
  if (typeof window.__scheduleReveal === 'function') window.__scheduleReveal();
});



canvas.addEventListener('pointermove', (e) => {
  const [px, py] = pxFromEvent(e);
  mouseRaw.x = px; mouseRaw.y = py;
  mouseTargetPresence = 1;
});



canvas.addEventListener('pointerenter', () => { mouseTargetPresence = 1; });
canvas.addEventListener('pointerleave', () => { mouseTargetPresence = 0; });



let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resize, 100);
});



/* -------------------------------- Bootstrapping ----------------------------- */
resize();
if (prefersReduced) {
  tStart = performance.now() - 30000;
  drawFrame(30);
} else {
  requestAnimationFrame(loop);
}
