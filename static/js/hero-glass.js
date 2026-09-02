"use strict";

(function () {
  const canvas = document.getElementById('heroGlassCanvas');
  const fallback = document.getElementById('heroGlassFallback');
  if (!canvas) return;

  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false });
  if (!gl) {
    if (fallback) fallback.style.display = 'grid';
    return;
  }

  /* ============================================================================
     GLASS TUNING PANEL — edit these values to change the refraction look of
     BOTH the circle and the pill, and the mouse-driven touch glow. Nothing
     else in the scene reads from this.
     ============================================================================ */
  const GLASS_CONFIG = {
    ior:             1.3,
    dispersion:      0.15,
    thickness:       0.85,
    distortion:      1.00,
    absorb:          0.05,
    fresnelStrength: 0.05,
    borderWidth:     0.01,
    edgeSoftness:    1.5,

    touchCoreRadius:  0.62,
    touchRadius:      0.95,
    touchContrast:    0.15,
    touchStrength:    0.45,
    touchOverlapBoost:0.8,
    touchColor:      [0.85, 0.92, 1.0],
    touchSmoothing:  18.0
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

vec2 rotateVec(vec2 v, float ang) {
  float c = cos(ang), s = sin(ang);
  return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}

vec3 capsule(vec2 q, vec2 C) {
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

vec3 spectralWeight(float t) {
  float r = smoothstep(0.40, 0.00, t) + 0.65 * smoothstep(0.70, 1.00, t);
  float g = smoothstep(0.05, 0.45, t) * smoothstep(0.85, 0.45, t) * 1.15;
  float b = smoothstep(0.35, 0.85, t) * 1.30;
  return vec3(r, g, b);
}

float refractedDist(vec2 p, float lambdaDisp) {
  float dA = capsule(p, uPillC).x;
  float dB = disc(p, uBallC).x;
  float dLens = max(dA, dB);

  float nFactor = 1.0 + (lambdaDisp - 0.5) * 0.14;

  float pushA = exp(-abs(dA) / (uPillR * 0.48)) * (uPillR * 0.82);
  float pushB = exp(-abs(dB) / (uBallR * 0.52)) * (uBallR * 0.95);

  float cuspPinch = exp(-abs(dA)/(uPillR*0.35)) * exp(-abs(dB)/(uBallR*0.35))
                    * ((uPillR + uBallR) * 0.45);

  float fade = smoothstep(-0.02, 0.08, dLens);
  float convergence = 0.35 + 0.65 * uGlow;

  return dLens + (pushA + pushB + cuspPinch) * nFactor * fade * convergence;
}

float opticalRadiance(vec2 p, float lambdaDisp) {
  float d = refractedDist(p, lambdaDisp);
  float dPos = max(d, 0.0);

  float core = 1.0 / (1.0 + pow(max(d + 0.004, 0.0) / 0.012, 2.8));
  float lorentz = 1.0 / (1.0 + pow(dPos / 0.045, 1.4));

  float mieNear = exp(-dPos * 18.0) * 0.85;
  float mieMid  = exp(-dPos * 6.5)  * 0.28;
  float mieFar  = exp(-dPos * 1.8)  * 0.065;

  return core * 1.85 + lorentz * 0.45 + mieNear + mieMid + mieFar;
}

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

  vec3 spectralLight = vec3(0.0);
  for (int i = 0; i < 7; i++) {
    float tSpec = float(i) / 6.0;
    float rad = opticalRadiance(p, tSpec);
    vec3 w = spectralWeight(tSpec);
    spectralLight += rad * w;
  }
  spectralLight /= 4.2;

  vec3 V = getVesica();
  float distVesica = length(p - V.xy) / max(V.z, 0.015);
  float vesicaField = 0.65 * exp(-distVesica * distVesica * 0.75) + 0.35 * exp(-distVesica * 1.25);

  float cuspAlignment = max(0.0, dot(normP, -normC));
  float cuspField = exp(-abs(dP) / 0.008) * exp(-abs(dC) / 0.008) * (0.6 + 0.4 * cuspAlignment);
  float rimArcP   = exp(-pow(abs(dP + 0.002) / 0.0035, 2.0));
  float rimArcC   = exp(-pow(abs(dC + 0.002) / 0.0035, 2.0));
  float causticFocus = (rimArcP * 0.45 + rimArcC * 0.55 + cuspField * 1.8) * exp(-max(dLens, 0.0) * 5.0);

  float f0 = 0.04;
  float fresnelP = f0 + (1.0 - f0) * pow(1.0 - abs(dot(normP, vec2(0.0, 1.0))), 5.0);
  float f0Ball = 0.22;
  float fresnelC = f0Ball + (1.0 - f0Ball) * pow(1.0 - abs(dot(normC, vec2(0.0, 1.0))), 5.0);

  vec3 color = vec3(0.0025, 0.0030, 0.0042);
  color += vec3(0.004, 0.005, 0.007) * exp(-dot(p - vec2(-0.4, 0.35), p - vec2(-0.4, 0.35)) * 0.7);

  vec3 glassAbsorption = vec3(0.98, 0.96, 0.93);
  vec3 bodyPill = vec3(0.012, 0.014, 0.018) * glassAbsorption;
  vec3 bodyBall = vec3(0.014, 0.016, 0.021) * glassAbsorption;
  color = mix(color, bodyPill, insideP * 0.92);
  color = mix(color, bodyBall, insideC * 0.92);

  vec3 totalLight = vec3(0.0);

  totalLight += spectralLight * (0.35 + 1.25 * inGlass);

  float coreIncandescence = (1.0 - smoothstep(-0.008, 0.012, dLens)) * inLens;
  totalLight += vec3(2.8, 2.7, 2.6) * coreIncandescence * uGlow * 3.5;

  float volP = exp(-max(refractedDist(p, 0.5), 0.0) * 3.8) * (0.2 + 0.8 * vesicaField);
  float volC = exp(-max(refractedDist(p, 0.5), 0.0) * 1.8) * (0.25 + 0.75 * vesicaField);
  totalLight += vec3(0.065, 0.062, 0.058) * volP * insideP * uGlow;
  totalLight += vec3(0.120, 0.115, 0.108) * volC * insideC * uGlow;

  totalLight += vec3(1.15, 1.08, 0.95) * causticFocus * uGlow * 1.9;

  totalLight += vec3(0.75, 0.82, 0.95) * (fresnelP * rimArcP + fresnelC * rimArcC) * (0.25 + 0.75 * uGlow);

  float lum = dot(totalLight, vec3(0.2126, 0.7152, 0.0722));
  vec3 warmPlanckian = vec3(1.08, 0.88, 0.68);
  vec3 hotIncandescent = vec3(1.0, 0.99, 0.98);
  totalLight *= mix(warmPlanckian, hotIncandescent, smoothstep(0.15, 1.2, lum));

  color += totalLight;

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

float dither(vec2 uv) {
  return fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
}

void main(){
  vec3 scene = texture2D(uScene, vUV).rgb;
  vec3 bloom = texture2D(uBloom, vUV).rgb;

  vec3 color = scene + bloom * 0.72;

  vec2 q = (vUV - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float vig = 1.0 - dot(q, q) * 0.32;
  color *= max(vig, 0.0);

  float noise = (dither(vUV + fract(uTime * 0.01)) - 0.5) / 255.0 * 2.2;
  color += noise;

  gl_FragColor = vec4(clamp(color * uFade, 0.0, 1.0), 1.0);
}`;

  /* ---- Pass 6 · Physically Based Refractive Glass Overlay (circle + pill) --- */
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

  float iorR = uIOR - uDispersion;
  float iorG = uIOR;
  float iorB = uIOR + uDispersion;

  vec3 refR = refract(incident, normal, 1.0 / iorR);
  vec3 refG = refract(incident, normal, 1.0 / iorG);
  vec3 refB = refract(incident, normal, 1.0 / iorB);

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

  vec3 absorbColor = vec3(0.90, 0.94, 0.99);
  float pathNorm = hLocal / max(T, 1e-4);
  vec3 tinted = mix(refracted, refracted * absorbColor, pathNorm * uAbsorb);

  float f0 = 0.04;
  float ndotv = clamp(normal.z, 0.0, 1.0);
  float fresnel = f0 + (1.0 - f0) * pow(1.0 - ndotv, 5.0);
  return mix(tinted, base * 0.55 + vec3(0.02), fresnel * uFresnelStrength);
}

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

  if (dBall > soft && dPill > soft) {
    gl_FragColor = vec4(base, 1.0);
    return;
  }

  float ballOuterAA = 1.0 - smoothstep(-soft, soft, dBall);
  float pillOuterAA = 1.0 - smoothstep(-soft, soft, dPill);

  vec3 result = base;

  if (dBall <= soft) {
    vec3 ballGlass = lensRefract(fragPx, base, dBall, dirBall, uGlassR);
    float borderPxBall = max(uBorderWidth * uGlassR, 0.001);
    float borderPreserveBall = smoothstep(-borderPxBall - soft, -borderPxBall, dBall);
    float ballWeight = ballOuterAA * (1.0 - borderPreserveBall);
    result = mix(result, ballGlass, ballWeight);
  }

  if (dPill <= soft) {
    vec3 pillGlass = lensRefract(fragPx, base, dPill, dirPill, uPillR);
    float borderPxPill = max(uBorderWidth * uPillR, 0.001);
    float borderPreservePill = smoothstep(-borderPxPill - soft, -borderPxPill, dPill);
    float pillWeight = pillOuterAA * (1.0 - borderPreservePill) * (1.0 - ballOuterAA);
    result = mix(result, pillGlass, pillWeight);
  }

  if (uMousePresence > 0.001) {
    float pillGlowMask = pillOuterAA * (1.0 - ballOuterAA);
    result += touchGlow(fragPx, uGlassR, base) * ballOuterAA;
    result += touchGlow(fragPx, uPillR, base) * pillGlowMask;
  }

  gl_FragColor = vec4(result, 1.0);
}`;

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

  const heroCopyEl = document.querySelector('.hero-copy');
  const arcTopSvg = document.querySelector('.hero-arc-text--top');
  const arcBottomSvg = document.querySelector('.hero-arc-text--bottom');
  const arcTopPath = document.getElementById('heroArcTop');
  const arcBottomPath = document.getElementById('heroArcBottom');

  /* Tunable overlay anchoring — all distances are proportional to the
     ball/pill's OWN radius (computed from the exact same computeLayout()
     data the shader uses), so the arcs and copy block stay correctly
     placed "around the objects" at any screen size. */
  const ARC_TOP_GAP_PX       = 22;
  const ARC_TOP_START_DEG    = 200;
  const ARC_TOP_END_DEG      = 340;
  const ARC_BOTTOM_GAP_PX    = 22;
  const ARC_BOTTOM_START_DEG = 205;
  const ARC_BOTTOM_END_DEG   = 100;
  const HERO_COPY_OFFSET_X   = 0.55;
  const HERO_COPY_OFFSET_Y   = 0.65;

  function polarPoint(cx, cy, r, deg) {
    const rad = deg * Math.PI / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  }

  function layoutOverlay(rect) {
    const aspect = rect.width / rect.height;
    const layout = computeLayout(aspect);
    const halfH = rect.height * 0.5;

    const ballCx = layout.b1[0] * halfH + rect.width * 0.5;
    const ballCy = layout.b1[1] * halfH + rect.height * 0.5;
    const ballR  = layout.rB * halfH;

    const pillCx = layout.p1[0] * halfH + rect.width * 0.5;
    const pillCy = layout.p1[1] * halfH + rect.height * 0.5;
    const pillR  = layout.rP * halfH;
    const pillH  = layout.hP * halfH;
    const pillBottomCy = pillCy + pillH;

    if (arcTopSvg && arcTopPath) {
      const size = Math.max(ballR * 2 + ARC_TOP_GAP_PX * 2, 10);
      arcTopSvg.setAttribute('viewBox', `0 0 ${size} ${size}`);
      arcTopSvg.style.width = size + 'px';
      arcTopSvg.style.height = size + 'px';
      arcTopSvg.style.left = (ballCx - size / 2) + 'px';
      arcTopSvg.style.top = (ballCy - size / 2) + 'px';
      const r = ballR + ARC_TOP_GAP_PX;
      const [x1, y1] = polarPoint(size / 2, size / 2, r, ARC_TOP_START_DEG);
      const [x2, y2] = polarPoint(size / 2, size / 2, r, ARC_TOP_END_DEG);
      arcTopPath.setAttribute('d', `M ${x1},${y1} A ${r},${r} 0 0 1 ${x2},${y2}`);
    }

    if (arcBottomSvg && arcBottomPath) {
      const size = Math.max(pillR * 2 + ARC_BOTTOM_GAP_PX * 2, 10);
      arcBottomSvg.setAttribute('viewBox', `0 0 ${size} ${size}`);
      arcBottomSvg.style.width = size + 'px';
      arcBottomSvg.style.height = size + 'px';
      arcBottomSvg.style.left = (pillCx - size / 2) + 'px';
      arcBottomSvg.style.top = (pillBottomCy - size / 2) + 'px';
      const r = pillR + ARC_BOTTOM_GAP_PX;
      const [x1, y1] = polarPoint(size / 2, size / 2, r, ARC_BOTTOM_START_DEG);
      const [x2, y2] = polarPoint(size / 2, size / 2, r, ARC_BOTTOM_END_DEG);
      arcBottomPath.setAttribute('d', `M ${x1},${y1} A ${r},${r} 0 0 0 ${x2},${y2}`);
    }

    if (heroCopyEl) {
      heroCopyEl.style.left = (pillCx + pillR * HERO_COPY_OFFSET_X) + 'px';
      heroCopyEl.style.top = (pillCy + pillH * HERO_COPY_OFFSET_Y) + 'px';
    }
  }

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(2, Math.round(rect.width * DPR));
    H = Math.max(2, Math.round(rect.height * DPR));
    canvas.width = W; canvas.height = H;
    rtScene = makeTarget(W, H);
    rtComposite = makeTarget(W, H);
    rtA = makeTarget(W >> 1, H >> 1);
    rtB = makeTarget(W >> 1, H >> 1);
    layoutOverlay(rect);
  }

  /* --------------------------- Layout & Natural Motion ------------------------ */
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const DEG2RAD = Math.PI / 180;

  function easeOutExpo(t) {
    t = clamp01(t);
    return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  function easeOutBack(t, overshoot) {
    t = clamp01(t);
    const c1 = overshoot;
    const c3 = c1 + 1.0;
    const tm1 = t - 1.0;
    return 1.0 + c3 * tm1 * tm1 * tm1 + c1 * tm1 * tm1;
  }

  const PILL_DELAY = 0.05, PILL_DUR = 1.10;
  const BALL_DELAY = 0.18, BALL_DUR = 1.30;
  const SCALE_START = 1.55;
  const PILL_ANGLE_START = -15 * DEG2RAD;
  const PILL_ANGLE_OVERSHOOT = 1.4;

  function computeLayout(aspect) {
    const S = 0.466 / 70;
    const rP = 50 * S, hP = 50 * S, rB = 70 * S;
    const xOff = Math.max(0, (aspect - 1.2)) * 0.08;
    const cx = -0.18 + xOff, cy = 0.06;
    const p1 = [cx - 0.37, cy - 0.11];
    const dxRel = 56 * S;
    const dyRel = 48 * S;
    const b1 = [p1[0] + dxRel, p1[1] + dyRel];

    const cornerX = aspect * 1.15 + 0.6;
    const cornerY = 1.35;
    const p0 = [-cornerX, -cornerY];
    const b0 = [cornerX, cornerY];

    return { rP, hP, rB, p0, p1, b0, b1 };
  }

  function perp(dx, dy) {
    const len = Math.hypot(dx, dy) || 1;
    return [-dy / len, dx / len];
  }

  function calculatePose(layout, t) {
    const tp = clamp01((t - PILL_DELAY) / PILL_DUR);
    const tb = clamp01((t - BALL_DELAY) / BALL_DUR);

    const epPos = easeOutExpo(tp);
    const ebPos = easeOutExpo(tb);

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

  function drawFrame(now) {
    const t = (now - tStart) / 1000;
    const aspect = W / H;
    const layout = computeLayout(aspect);
    const { pill, ball } = calculatePose(layout, t);
    const depth = overlapDepth(pill, ball);

    const glow = clamp01(smoothstep(0.012, 0.16, depth)) * smoothstep(0.0, 0.5, t);
    const fade = smoothstep(0.1, 0.85, t);

    const dt = Math.min(Math.max((now - lastFrameTime) / 1000, 0), 0.1);
    lastFrameTime = now;
    const ease = 1 - Math.exp(-GLASS_CONFIG.touchSmoothing * dt);
    mouseSmooth.x += (mouseRaw.x - mouseSmooth.x) * ease;
    mouseSmooth.y += (mouseRaw.y - mouseSmooth.y) * ease;
    mousePresence += (mouseTargetPresence - mousePresence) * ease;

    const glassCxPx = ball.c[0] * (H * 0.5) + W * 0.5;
    const glassCyPx = ball.c[1] * (H * 0.5) + H * 0.5;
    const glassRPx  = ball.r * (H * 0.5);
    const pillCxPx  = pill.c[0] * (H * 0.5) + W * 0.5;
    const pillCyPx  = pill.c[1] * (H * 0.5) + H * 0.5;
    const pillRPx   = pill.r * (H * 0.5);
    const pillHPx   = pill.h * (H * 0.5);

    renderPass(rtScene);
    gl.useProgram(progScene.p); bindQuad();
    gl.uniform2f(progScene.u.uRes, W, H);
    gl.uniform1f(progScene.u.uTime, t);
    gl.uniform1f(progScene.u.uGlow, glow);
    gl.uniform2f(progScene.u.uPillC, pill.c[0], pill.c[1]);
    gl.uniform1f(progScene.u.uPillR, pill.r);
    gl.uniform1f(progScene.u.uPillH, pill.h);
    gl.uniform1f(progScene.u.uPillAngle, pill.angle);
    gl.uniform2f(progScene.u.uBallC, ball.c[0], ball.c[1]);
    gl.uniform1f(progScene.u.uBallR, ball.r);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    renderPass(rtA);
    gl.useProgram(progBright.p); bindQuad();
    setTexture(progBright, 'uTex', rtScene.tex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.useProgram(progBlur.p); bindQuad();
    renderPass(rtB); setTexture(progBlur, 'uTex', rtA.tex, 0);
    gl.uniform2f(progBlur.u.uDir, 1.2 / rtA.w, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
    renderPass(rtA); setTexture(progBlur, 'uTex', rtB.tex, 0);
    gl.uniform2f(progBlur.u.uDir, 0, 1.2 / rtA.h); gl.drawArrays(gl.TRIANGLES, 0, 3);

    renderPass(rtB); setTexture(progBlur, 'uTex', rtA.tex, 0);
    gl.uniform2f(progBlur.u.uDir, 2.8 / rtA.w, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
    renderPass(rtA); setTexture(progBlur, 'uTex', rtB.tex, 0);
    gl.uniform2f(progBlur.u.uDir, 0, 2.8 / rtA.h); gl.drawArrays(gl.TRIANGLES, 0, 3);

    renderPass(rtComposite);
    gl.useProgram(progComp.p); bindQuad();
    setTexture(progComp, 'uScene', rtScene.tex, 0);
    setTexture(progComp, 'uBloom', rtA.tex, 1);
    gl.uniform2f(progComp.u.uRes, W, H);
    gl.uniform1f(progComp.u.uTime, t);
    gl.uniform1f(progComp.u.uFade, fade);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    renderPass(null);
    gl.useProgram(progGlass.p); bindQuad();
    setTexture(progGlass, 'uComposite', rtComposite.tex, 0);
    gl.uniform2f(progGlass.u.uRes, W, H);
    gl.uniform2f(progGlass.u.uGlassC, glassCxPx, glassCyPx);
    gl.uniform1f(progGlass.u.uGlassR, glassRPx);
    gl.uniform2f(progGlass.u.uPillC, pillCxPx, pillCyPx);
    gl.uniform1f(progGlass.u.uPillR, pillRPx);
    gl.uniform1f(progGlass.u.uPillH, pillHPx);
    gl.uniform1f(progGlass.u.uPillAngle, pill.angle);
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
    return [clientX, H - clientY];
  }

  canvas.addEventListener('pointerdown', (e) => {
    const [px, py] = pxFromEvent(e);
    mouseRaw.x = px; mouseRaw.y = py;
    mouseTargetPresence = 1;
    const now = performance.now();
    if (now - tStart < 800) return;
    tStart = now;
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
})();