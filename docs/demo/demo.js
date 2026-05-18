// this_file: docs/demo/demo.js
// Live demo: drop an SVG/PNG → ipolypad-js polygon hull → pretext-flow text reflow.

import { ipolypad, ipolypadJsonString, toCss } from './ipolypad.bundle.js';
import { createAnimationController } from 'pretext-flow';

// ── DOM refs ────────────────────────────────────────────────────────────
const dz = document.getElementById('dz');
const fileInput = document.getElementById('file');
const dzHint = document.getElementById('dz-hint');
const overlay = document.getElementById('overlay');
const status = document.getElementById('status');
const srcMeta = document.getElementById('src-meta');
const jsonOut = document.getElementById('json-out');
const cssOut = document.getElementById('css-out');
const stage = document.getElementById('stage');
const textCanvas = document.getElementById('text-canvas');
const embedNode = document.getElementById('embed-figure');

const optSize = document.getElementById('opt-size');
const optPad = document.getElementById('opt-pad');
const optMp = document.getElementById('opt-mp');
const optHull = document.getElementById('opt-hull');

// ── State ───────────────────────────────────────────────────────────────
let currentSource = null;        // string (svg markup) or Uint8Array
let currentSourceKind = null;    // 'svg' | 'image'
let currentSourceDataUrl = null; // for preview
let polygonResult = null;
let controller = null;

// ── Sample SVGs ─────────────────────────────────────────────────────────
const SAMPLES = {
  dragon:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
       <path d="M40 110 Q 35 70 60 60 Q 85 50 100 70 Q 115 50 140 60 Q 165 70 160 110 Q 175 130 160 150 Q 130 165 100 150 Q 70 165 40 150 Q 25 130 40 110 Z M 70 95 a 4 4 0 1 0 8 0 a 4 4 0 1 0 -8 0 M 122 95 a 4 4 0 1 0 8 0 a 4 4 0 1 0 -8 0" fill="#1a4a8a"/>
     </svg>`,
  star:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
       <polygon points="100,10 122,76 192,76 136,116 158,182 100,142 42,182 64,116 8,76 78,76" fill="#e83e2e"/>
     </svg>`,
  cloud:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
       <ellipse cx="70" cy="120" rx="40" ry="28" fill="#5b6b8a"/>
       <ellipse cx="110" cy="100" rx="50" ry="36" fill="#5b6b8a"/>
       <ellipse cx="150" cy="125" rx="35" ry="26" fill="#5b6b8a"/>
       <ellipse cx="100" cy="135" rx="60" ry="22" fill="#5b6b8a"/>
     </svg>`,
};

// ── Sample passage for text reflow ──────────────────────────────────────
const SAMPLE_TEXT =
  'A photograph is not what it appears to be. Strip away the sentiment, the memory, the human gaze — and what remains is a grid. Rows and columns of luminance values. A cartography of photons that struck a sensor at a precise moment in time. Each pixel is a coordinate, a census of light. Consider: a single 4000×3000 image contains twelve million discrete measurements. Each one records a colour — a precise ratio of red to green to blue, a frequency spectrum collapsed into three numbers. This is the signal. The philosopher Walter Benjamin wrote about the aura of original artworks — their presence in time and space. A digital photograph has no aura in his sense. It is infinitely reproducible, perfectly identical. And yet — the signal it carries is unique. No two exposures capture the same field of light.';

// ── Helpers ─────────────────────────────────────────────────────────────
function setStatus(msg, kind = '') {
  status.textContent = msg;
  status.className = 'status ' + kind;
}

function drawOverlay(points) {
  if (!points || points.length < 3) {
    overlay.innerHTML = '';
    return;
  }
  const pts = points.map(([x, y]) => `${(x * 200).toFixed(2)},${(y * 200).toFixed(2)}`).join(' ');
  overlay.innerHTML =
    `<polygon points="${pts}" fill="rgba(255,120,73,0.30)" stroke="rgba(255,120,73,0.95)" stroke-width="1.2" stroke-linejoin="round"/>` +
    `<g fill="rgba(255,120,73,0.95)">${points.map(([x, y]) => `<circle cx="${(x * 200).toFixed(2)}" cy="${(y * 200).toFixed(2)}" r="1.4"/>`).join('')}</g>`;
}

function showSourcePreview(srcUrl) {
  dzHint.style.display = 'none';
  let img = dz.querySelector('img.bg');
  if (!img) {
    img = document.createElement('img');
    img.className = 'bg';
    dz.insertBefore(img, overlay);
  }
  img.src = srcUrl;
}

function makeSvgDataUrl(markup) {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(markup);
}

async function recomputePolygon() {
  if (!currentSource) return;
  setStatus('tracing…');
  try {
    const opts = {
      size: 200,
      pad: parseInt(optPad.value, 10) || 6,
      maxPoints: parseInt(optMp.value, 10) || 32,
      hull: optHull.checked,
    };
    const result = await ipolypad(currentSource, opts);
    polygonResult = result;
    drawOverlay(result.points);
    jsonOut.textContent = await ipolypadJsonString(currentSource, opts);
    cssOut.textContent = toCss(result.points, '.figure');
    srcMeta.textContent = `${result.n_points} pts · ${result.raster.width}×${result.raster.height}`;
    setStatus('traced ✓', 'ok');
    renderFlow();
  } catch (e) {
    console.error(e);
    setStatus('error: ' + (e?.message ?? e), 'error');
  }
}

// ── Flow rendering ──────────────────────────────────────────────────────
function setEmbedVisual(srcUrl) {
  embedNode.innerHTML = `<img src="${srcUrl}" alt="" />`;
}

function renderFlow() {
  if (!polygonResult) return;
  if (controller) {
    try { controller.destroy?.(); } catch {}
    controller = null;
  }

  // Compute embed footprint from the polygon's bbox (in normalized units).
  const pts = polygonResult.points;
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const stageRect = stage.getBoundingClientRect();
  const cssW = Math.max(420, Math.min(720, Math.floor(stageRect.width - 48)));
  textCanvas.width = cssW * (window.devicePixelRatio || 1);
  textCanvas.height = 480 * (window.devicePixelRatio || 1);
  textCanvas.style.width = cssW + 'px';
  textCanvas.style.height = '480px';

  // Embed size: roughly 40% of column width
  const eW = Math.round(cssW * 0.42);
  const eH = Math.round(eW);
  // Place embed slightly left of centre
  const eX = Math.round(cssW * 0.18);
  const eY = 80;

  embedNode.style.width = eW + 'px';
  embedNode.style.height = eH + 'px';
  embedNode.style.left = eX + 'px';
  embedNode.style.top = eY + 'px';

  // Convert normalized polygon to embed-local coords (in px).
  const localPolygon = pts.map(([x, y]) => [
    (x - minX) / Math.max(0.001, maxX - minX) * eW,
    (y - minY) / Math.max(0.001, maxY - minY) * eH,
  ]);

  // Build pretext-flow controller. Embed shape is a polygon hull.
  try {
    controller = createAnimationController({
      canvas: textCanvas,
      text: SAMPLE_TEXT,
      font: '17px "Iowan Old Style", Georgia, serif',
      width: cssW,
      lineHeight: 26,
      paragraphGap: 10,
      color: '#1c1e24',
      embeds: [
        {
          id: 'figure',
          shape: { type: 'polygon', points: localPolygon },
          margin: 12,
          position: { type: 'absolute', x: eX, y: eY },
        },
      ],
    });
    controller.start?.();
  } catch (e) {
    // Fallback: just draw the text without flow if pretext-flow API drifts.
    console.warn('pretext-flow init failed, falling back to plain text', e);
    drawPlainFallback(cssW);
  }
}

function drawPlainFallback(cssW) {
  const ctx = textCanvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cssW, 480);
  ctx.fillStyle = '#1c1e24';
  ctx.font = '17px "Iowan Old Style", Georgia, serif';
  ctx.textBaseline = 'top';
  // naive wrap
  const words = SAMPLE_TEXT.split(/\s+/);
  let line = '';
  let y = 16;
  const max = cssW - 32;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > max) {
      ctx.fillText(line, 16, y);
      y += 26;
      line = w;
      if (y > 480 - 26) break;
    } else {
      line = test;
    }
  }
  if (line && y < 480 - 26) ctx.fillText(line, 16, y);
}

// ── Input handlers ──────────────────────────────────────────────────────
async function loadSvgMarkup(markup, label = '<inline svg>') {
  currentSource = markup;
  currentSourceKind = 'svg';
  currentSourceDataUrl = makeSvgDataUrl(markup);
  showSourcePreview(currentSourceDataUrl);
  setEmbedVisual(currentSourceDataUrl);
  await recomputePolygon();
}

async function loadFile(file) {
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
    const text = await file.text();
    return loadSvgMarkup(text, file.name);
  }
  // raster
  const buf = new Uint8Array(await file.arrayBuffer());
  currentSource = buf;
  currentSourceKind = 'image';
  const blob = new Blob([buf], { type: file.type || 'image/png' });
  currentSourceDataUrl = URL.createObjectURL(blob);
  showSourcePreview(currentSourceDataUrl);
  setEmbedVisual(currentSourceDataUrl);
  await recomputePolygon();
}

dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('is-drag'); });
dz.addEventListener('dragleave', () => dz.classList.remove('is-drag'));
dz.addEventListener('drop', (e) => {
  e.preventDefault();
  dz.classList.remove('is-drag');
  const f = e.dataTransfer?.files?.[0];
  if (f) loadFile(f);
});
fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (f) loadFile(f);
});

document.querySelectorAll('.sample-row button[data-sample]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const key = btn.getAttribute('data-sample');
    const markup = SAMPLES[key];
    if (markup) loadSvgMarkup(markup, key);
  });
});

[optSize, optPad, optMp, optHull].forEach((el) => el.addEventListener('change', recomputePolygon));

document.getElementById('copy-json').addEventListener('click', async () => {
  await navigator.clipboard.writeText(jsonOut.textContent ?? '');
  setStatus('JSON copied', 'ok');
});
document.getElementById('copy-css').addEventListener('click', async () => {
  await navigator.clipboard.writeText(cssOut.textContent ?? '');
  setStatus('CSS copied', 'ok');
});

// Boot with the dragon sample.
loadSvgMarkup(SAMPLES.dragon, 'dragon').catch(console.error);
