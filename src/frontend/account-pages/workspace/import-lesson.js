// Lesson import — PDF (pdf.js), local voice (Web Speech API),
// local files, camera capture with 4-corner perspective correction + local OCR (Tesseract.js).
// Everything runs in the browser — nothing is uploaded raw.

const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

let pdfjsLib = null;
let Tesseract = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function ensurePDF() {
  if (!pdfjsLib) {
    await loadScript(PDFJS_URL);
    pdfjsLib = window.pdfjsLib;
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
  return pdfjsLib;
}

async function ensureTesseract() {
  if (!Tesseract) {
    await loadScript(TESSERACT_URL);
    Tesseract = window.Tesseract;
  }
  return Tesseract;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ================= Perspective warp (mesh approximation) =================

// Bilinear interpolation inside the source quad defined by 4 corners [TL,TR,BR,BL]
function bilinear(pts, u, v) {
  const top = { x: pts[0].x + (pts[1].x - pts[0].x) * u, y: pts[0].y + (pts[1].y - pts[0].y) * u };
  const bot = { x: pts[3].x + (pts[2].x - pts[3].x) * u, y: pts[3].y + (pts[2].y - pts[3].y) * u };
  return { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v };
}

// Affine transform mapping p1,p2,p3 -> q1,q2,q3 (canvas convention)
function affineFrom3(p1, p2, p3, q1, q2, q3) {
  const d = (p2.x - p1.x) * (p3.y - p1.y) - (p3.x - p1.x) * (p2.y - p1.y);
  if (Math.abs(d) < 1e-9) return null;
  const a = ((q2.x - q1.x) * (p3.y - p1.y) - (q3.x - q1.x) * (p2.y - p1.y)) / d;
  const c = ((q3.x - q1.x) * (p2.x - p1.x) - (q2.x - q1.x) * (p3.x - p1.x)) / d;
  const b = ((q2.y - q1.y) * (p3.y - p1.y) - (q3.y - q1.y) * (p2.y - p1.y)) / d;
  const dd = ((q3.y - q1.y) * (p2.x - p1.x) - (q2.y - q1.y) * (p3.x - p1.x)) / d;
  const e = q1.x - a * p1.x - c * p1.y;
  const f = q1.y - b * p1.x - dd * p1.y;
  return [a, b, c, dd, e, f];
}

// srcQuad/dstQuad: arrays of 4 points {x,y} in pixel coords, order TL,TR,BR,BL
function warpQuad(img, srcQuad, dstQuad, outW, outH, grid = 28) {
  const canvas = document.createElement("canvas");
  canvas.width = outW; canvas.height = outH;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, outW, outH);

  const cw = outW / grid, ch = outH / grid;
  for (let j = 0; j < grid; j++) {
    for (let i = 0; i < grid; i++) {
      const u0 = i / grid, u1 = (i + 1) / grid, v0 = j / grid, v1 = (j + 1) / grid;
      const cell = [
        bilinear(dstQuad, u0, v0), bilinear(dstQuad, u1, v0),
        bilinear(dstQuad, u1, v1), bilinear(dstQuad, u0, v1),
      ];
      const srcCell = [
        bilinear(srcQuad, u0, v0), bilinear(srcQuad, u1, v0),
        bilinear(srcQuad, u1, v1), bilinear(srcQuad, u0, v1),
      ];
      const m = affineFrom3(srcCell[0], srcCell[1], srcCell[3], cell[0], cell[1], cell[3]);
      if (!m) continue;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cell[0].x, cell[0].y);
      ctx.lineTo(cell[1].x, cell[1].y);
      ctx.lineTo(cell[2].x, cell[2].y);
      ctx.lineTo(cell[3].x, cell[3].y);
      ctx.closePath();
      ctx.clip();
      ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    }
  }
  return canvas;
}

// dstQuad from normalized corner positions {x,y} in [0,1]
function quadFromNorm(corners, w, h) {
  return corners.map((c) => ({ x: c.x * w, y: c.y * h }));
}

// ================= Modal shell =================

export function openImportModal({ onImport, initialTab = "pdf" }) {
  const root = document.createElement("div");
  root.className = "ws-modal-root il-root";
  root.innerHTML = `
    <div class="ws-modal-backdrop"></div>
    <div class="ws-modal il-modal" role="dialog" aria-modal="true">
      <div class="ws-modal-head">
        <h2>Import lesson content</h2>
        <button class="ws-icon-btn" type="button" data-close>✕</button>
      </div>
      <div class="il-tabs">
        <button class="ws-seg" type="button" data-tab="pdf" data-active="true">📄 PDF</button>
        <button class="ws-seg" type="button" data-tab="voice">🎙 Voice</button>
        <button class="ws-seg" type="button" data-tab="text">✏️ Text</button>
        <button class="ws-seg" type="button" data-tab="link">🔗 Link</button>
        <button class="ws-seg" type="button" data-tab="files">📁 Files</button>
        <button class="ws-seg" type="button" data-tab="camera">📷 Camera</button>
      </div>
      <div class="ws-modal-body il-body" id="ilBody"></div>
      <div class="ws-modal-foot">
        <div class="il-target">
          <span>Save to:</span>
          <select id="ilTarget">
            <option value="raw_lessons">Raw lessons</option>
            <option value="raw_recorded_lessons">Recorded lessons</option>
          </select>
          <label class="il-session">Session date <input type="date" id="ilSession"></label>
        </div>
        <button class="ws-btn ws-btn-ghost" type="button" data-close>Cancel</button>
        <button class="ws-btn ws-btn-primary" type="button" id="ilImport" disabled>Import text</button>
      </div>
    </div>`;
  document.body.appendChild(root);

  const body = root.querySelector("#ilBody");
  const importBtn = root.querySelector("#ilImport");
  let currentText = "";
  let cleanup = null;

  const close = () => { cleanup?.(); cleanup = null; root.remove(); };
  root.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  root.querySelector(".ws-modal-backdrop").addEventListener("click", close);
  document.addEventListener("keydown", function escH(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", escH); } });

  function setText(t) {
    currentText = t;
    importBtn.disabled = !t.trim();
  }

  importBtn.addEventListener("click", async () => {
    if (!currentText.trim()) return;
    importBtn.disabled = true;
    importBtn.textContent = "Importing…";
    try {
      await onImport(root.querySelector("#ilTarget").value, currentText, {
        session_date: root.querySelector("#ilSession")?.value || "",
      });
      close();
    } catch (e) {
      importBtn.disabled = false;
      importBtn.textContent = "Import text";
      alert(e.message || "Import failed");
    }
  });

  const tabs = {
    pdf: renderPDF, voice: renderVoice, text: renderText, link: renderLink,
    files: renderFiles, camera: renderCamera,
  };
  function showTab(name) {
    cleanup?.(); cleanup = null;
    body.innerHTML = "";
    setText("");
    root.querySelectorAll(".il-tabs .ws-seg").forEach((b) => b.dataset.active = b.dataset.tab === name ? "true" : "false");
    cleanup = tabs[name](body, setText) || null;
  }
  root.querySelectorAll(".il-tabs .ws-seg").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  showTab(initialTab);
}

function previewArea(body) {
  body.innerHTML = `
    <div class="il-preview-wrap">
      <div class="il-status" data-status>Ready.</div>
      <textarea class="il-preview" data-preview rows="12" placeholder="Extracted text will appear here — you can edit it before importing."></textarea>
    </div>`;
  return { status: body.querySelector("[data-status]"), preview: body.querySelector("[data-preview]") };
}

// ---------- PDF ----------
async function renderPDF(body, setText) {
  const { status, preview } = previewArea(body);
  body.insertAdjacentHTML("afterbegin", `
    <div class="il-source">
      <input type="file" id="ilPdfFile" accept="application/pdf" hidden>
      <button class="ws-btn ws-btn-primary" type="button" id="ilPickPdf">Choose a PDF…</button>
      <span class="il-hint">Text is extracted locally in your browser — the file never leaves your device.</span>
    </div>`);
  const pick = body.querySelector("#ilPickPdf");
  const fileInput = body.querySelector("#ilPdfFile");
  pick.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      status.textContent = "Loading PDF…";
      const pdfjs = await ensurePDF();
      const buf = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: buf }).promise;
      let out = "";
      for (let p = 1; p <= pdf.numPages; p++) {
        status.textContent = `Extracting page ${p}/${pdf.numPages}…`;
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        const line = tc.items.map((it) => it.str).join(" ");
        out += `\n\n--- Page ${p} ---\n${line}`;
      }
      preview.value = out.trim();
      setText(out);
      preview.addEventListener("input", () => setText(preview.value));
      status.textContent = `Done — ${pdf.numPages} page(s). Edit the text if needed, then import.`;
    } catch (e) {
      status.textContent = `Error: ${e.message}`;
    }
  });
}

// ---------- Voice ----------
function renderVoice(body, setText) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    body.innerHTML = `<div class="il-status">Speech recognition is not supported by this browser. Use Chrome or Edge.</div>`;
    return;
  }
  body.innerHTML = `
    <div class="il-source">
      <button class="ws-btn ws-btn-primary" type="button" id="ilRec">● Start recording</button>
      <span class="il-hint">Recognition runs locally on your device — no audio is sent anywhere.</span>
    </div>
    <div class="il-preview-wrap">
      <div class="il-status" data-status>Idle.</div>
      <textarea class="il-preview" data-preview rows="12" placeholder="Your transcription will appear here…"></textarea>
    </div>`;
  const btn = body.querySelector("#ilRec");
  const status = body.querySelector("[data-status]");
  const preview = body.querySelector("[data-preview]");
  let rec = null, listening = false, finalText = "";

  btn.addEventListener("click", () => {
    if (listening) { rec?.stop(); return; }
    rec = new SR();
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t + " ";
        else interim += t;
      }
      preview.value = (finalText + interim).trim();
      setText(preview.value);
    };
    rec.onend = () => { listening = false; btn.innerHTML = "● Start recording"; status.textContent = "Stopped."; };
    rec.onerror = (e) => { status.textContent = `Error: ${e.error}`; };
    rec.start();
    listening = true;
    btn.innerHTML = "■ Stop";
    status.textContent = "Listening… speak now.";
    preview.addEventListener("input", () => { finalText = preview.value; setText(preview.value); });
  });

  return () => { listening = false; try { rec?.stop(); } catch {} };
}

// ---------- Plain text ----------
function renderText(body, setText) {
  const { status, preview } = previewArea(body);
  body.insertAdjacentHTML("afterbegin", `
    <div class="il-source">
      <span class="il-hint">Type or paste the lesson content directly — it stays on your device until you import it.</span>
    </div>`);
  preview.placeholder = "Write or paste the lesson text here…";
  preview.addEventListener("input", () => setText(preview.value));
  status.textContent = "Ready.";
}

// ---------- Link + explanation ----------
function renderLink(body, setText) {
  body.innerHTML = `
    <div class="il-source il-link">
      <input type="url" id="ilUrl" class="il-link-url" placeholder="https://…" autocomplete="off">
      <textarea id="ilExplain" class="il-link-explain" rows="5" placeholder="Explain what this link is about / what to extract from it…"></textarea>
      <button class="ws-btn ws-btn-primary" type="button" id="ilLinkGo">Use link + explanation</button>
      <span class="il-hint">The URL is stored as reference — only your explanation is imported as lesson text.</span>
    </div>
    <div class="il-preview-wrap">
      <div class="il-status" data-status>Ready.</div>
      <textarea class="il-preview" data-preview rows="8" placeholder="Combined text preview…"></textarea>
    </div>`;
  const url = body.querySelector("#ilUrl");
  const explain = body.querySelector("#ilExplain");
  const status = body.querySelector("[data-status]");
  const preview = body.querySelector("[data-preview]");
  const go = body.querySelector("#ilLinkGo");

  const combine = () => {
    const u = url.value.trim();
    const e = explain.value.trim();
    const text = [u && `Source: ${u}`, e].filter(Boolean).join("\n\n");
    preview.value = text;
    setText(text);
    go.disabled = !text;
    status.textContent = text ? "Ready to import." : "Enter a URL and/or an explanation.";
  };
  url.addEventListener("input", combine);
  explain.addEventListener("input", combine);
  preview.addEventListener("input", () => setText(preview.value));
  combine();
}

// ---------- Files ----------
function renderFiles(body, setText) {
  const { status, preview } = previewArea(body);
  body.insertAdjacentHTML("afterbegin", `
    <div class="il-source">
      <input type="file" id="ilTextFile" accept=".txt,.md,.text,.csv,.json,.png,.jpg,.jpeg,.webp,.gif,.bmp" hidden>
      <button class="ws-btn ws-btn-primary" type="button" id="ilPickFile">Choose a file…</button>
      <span class="il-hint">Text files are read directly; images go through local OCR (Tesseract).</span>
    </div>`);
  const pick = body.querySelector("#ilPickFile");
  const fileInput = body.querySelector("#ilTextFile");
  pick.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)) {
        status.textContent = "Loading OCR engine (first run downloads ~10 MB, then cached)…";
        const T = await ensureTesseract();
        status.textContent = `Recognizing ${file.name}… this can take ~30 s…`;
        const { data } = await T.recognize(file);
        const text = (data.text || "").trim();
        preview.value = text;
        setText(text);
        preview.addEventListener("input", () => setText(preview.value));
        status.textContent = `OCR done — confidence ${Math.round(data.confidence || 0)}%. Edit then import.`;
        return;
      }
      const text = await file.text();
      preview.value = text;
      setText(text);
      preview.addEventListener("input", () => setText(preview.value));
      status.textContent = `Loaded ${file.name} (${(file.size / 1024).toFixed(1)} KB).`;
    } catch (e) {
      status.textContent = `Error: ${e.message}`;
    }
  });
}

// ---------- Camera + corner adjust + OCR ----------
function renderCamera(body, setText) {
  body.innerHTML = `
    <div class="il-source">
      <button class="ws-btn ws-btn-primary" type="button" id="ilCam">📷 Open camera</button>
      <span class="il-hint">Capture → drag the 4 corners to straighten → OCR runs locally (Tesseract.js).</span>
    </div>
    <div class="il-cam-stage" data-stage hidden>
      <video data-video autoplay playsinline muted></video>
      <div class="il-cam-overlay" data-overlay hidden>
        <img data-shot alt="capture">
        <div class="il-corner" data-c="0" style="left:2%;top:2%"></div>
        <div class="il-corner" data-c="1" style="right:2%;top:2%"></div>
        <div class="il-corner" data-c="2" style="right:2%;bottom:2%"></div>
        <div class="il-corner" data-c="3" style="left:2%;bottom:2%"></div>
        <svg class="il-corner-lines" data-lines><polygon data-poly fill="rgba(140,236,255,.08)" stroke="#8cecff" stroke-width="1.5"/></svg>
      </div>
      <div class="il-cam-controls">
        <button class="ws-btn ws-btn-primary" type="button" data-act="capture" hidden>📸 Capture</button>
        <button class="ws-btn ws-btn-ghost" type="button" data-act="apply" hidden>✓ Apply crop</button>
        <button class="ws-btn ws-btn-ghost" type="button" data-act="retake" hidden>↺ Retake</button>
        <button class="ws-btn ws-btn-primary" type="button" data-act="ocr" hidden>🔍 OCR</button>
        <button class="ws-btn ws-btn-ghost" type="button" data-act="stop" hidden>Stop</button>
      </div>
    </div>
    <div class="il-preview-wrap" data-result hidden>
      <div class="il-status" data-status>Ready.</div>
      <textarea class="il-preview" data-preview rows="10" placeholder="OCR result…"></textarea>
    </div>`;

  const stage = body.querySelector("[data-stage]");
  const video = body.querySelector("[data-video]");
  const overlay = body.querySelector("[data-overlay]");
  const shot = body.querySelector("[data-shot]");
  const result = body.querySelector("[data-result]");
  const status = body.querySelector("[data-status]");
  const preview = body.querySelector("[data-preview]");
  const acts = body.querySelectorAll("[data-act]");
  const show = (name) => acts.forEach((b) => b.hidden = b.dataset.act !== name);

  let stream = null, capturedImg = null, corners = null, applying = false;

  async function startCam() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      video.srcObject = stream;
      stage.hidden = false;
      overlay.hidden = true;
      result.hidden = true;
      show("capture");
      body.querySelector("#ilCam").style.display = "none";
    } catch (e) {
      status.textContent = `Camera error: ${e.message}`;
      result.hidden = false;
    }
  }

  function stopCam() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    stage.hidden = true;
    body.querySelector("#ilCam").style.display = "";
  }

  function capture() {
    const c = document.createElement("canvas");
    c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext("2d").drawImage(video, 0, 0);
    capturedImg = c;
    shot.src = c.toDataURL("image/jpeg", 0.92);
    corners = [
      { x: 0.08, y: 0.08 }, { x: 0.92, y: 0.08 },
      { x: 0.92, y: 0.92 }, { x: 0.08, y: 0.92 },
    ];
    video.hidden = true;
    overlay.hidden = false;
    result.hidden = true;
    show("apply");
    updateHandles();
  }

  function updateHandles() {
    overlay.querySelectorAll(".il-corner").forEach((h) => {
      const c = corners[Number(h.dataset.c)];
      h.style.left = `${c.x * 100}%`;
      h.style.top = `${c.y * 100}%`;
      h.style.right = "auto"; h.style.bottom = "auto";
      h.style.transform = "translate(-50%,-50%)";
    });
    const p = corners.map((c) => `${c.x * 100},${c.y * 100}`).join(" ");
    overlay.querySelector("[data-poly]").setAttribute("points", p);
  }

  // drag handles
  overlay.querySelectorAll(".il-corner").forEach((h) => {
    h.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const idx = Number(h.dataset.c);
      const move = (ev) => {
        const r = shot.getBoundingClientRect();
        corners[idx] = {
          x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)),
          y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)),
        };
        updateHandles();
      };
      const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
  });

  async function applyCrop() {
    if (!capturedImg || applying) return;
    applying = true;
    status.textContent = "Straightening…";
    result.hidden = false;
    const w = capturedImg.width, h = capturedImg.height;
    // Output size ≈ average quad edge lengths
    const srcQ = quadFromNorm(corners, w, h);
    const dw = Math.max(200, Math.round(Math.hypot(srcQ[1].x - srcQ[0].x, srcQ[1].y - srcQ[0].y) + Math.hypot(srcQ[2].x - srcQ[3].x, srcQ[2].y - srcQ[3].y)) / 2 * 2);
    const dh = Math.max(200, Math.round(Math.hypot(srcQ[3].x - srcQ[0].x, srcQ[3].y - srcQ[0].y) + Math.hypot(srcQ[2].x - srcQ[1].x, srcQ[2].y - srcQ[1].y)) / 2 * 2);
    const dstQ = [{ x: 0, y: 0 }, { x: dw, y: 0 }, { x: dw, y: dh }, { x: 0, y: dh }];
    const out = warpQuad(capturedImg, srcQ, dstQ, dw, dh, 30);
    shot.src = out.toDataURL("image/jpeg", 0.95);
    // swap: now corners describe full rect
    corners = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    updateHandles();
    status.textContent = "Crop applied. Run OCR or retake.";
    show("ocr");
    acts.forEach((b) => { if (b.dataset.act === "retake") b.hidden = false; if (b.dataset.act === "stop") b.hidden = false; });
    applying = false;
  }

  async function runOCR() {
    status.textContent = "Loading OCR engine (first run downloads ~10 MB, then cached)…";
    try {
      const T = await ensureTesseract();
      status.textContent = "Recognizing text… this can take ~30 s…";
      const { data } = await T.recognize(shot);
      preview.value = data.text.trim();
      setText(preview.value);
      preview.addEventListener("input", () => setText(preview.value));
      status.textContent = `OCR done — confidence ${Math.round((data.confidence || 0))}%. Edit then import.`;
    } catch (e) {
      status.textContent = `OCR error: ${e.message}`;
    }
  }

  body.querySelector("#ilCam").addEventListener("click", startCam);
  acts.forEach((b) => b.addEventListener("click", () => {
    const a = b.dataset.act;
    if (a === "capture") capture();
    else if (a === "apply") applyCrop();
    else if (a === "retake") { video.hidden = false; overlay.hidden = true; capturedImg = null; show("capture"); }
    else if (a === "ocr") runOCR();
    else if (a === "stop") { stopCam(); result.hidden = true; };
  }));

  return () => stopCam();
}
