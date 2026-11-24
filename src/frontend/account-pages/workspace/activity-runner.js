// Activity runner — renders the 25 AI activity components and collects answers.
// Correctness is judged by the backend AI feedback endpoint.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- small builders ----------
function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function shuffle(arr, seed = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(seed() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Each renderer returns { node, getAnswer() }
const RENDERERS = {
  ShortTextInput(a) {
    const node = el(`<div class="ar-input"><input type="text" placeholder="${esc(a.payload?.placeholder || "Votre réponse…")}"></div>`);
    return { node, getAnswer: () => ({ text: node.querySelector("input").value }) };
  },
  LongTextInput(a) {
    const node = el(`<div class="ar-input"><textarea rows="5" placeholder="${esc(a.payload?.placeholder || "Écrivez votre réponse…")}"></textarea></div>`);
    return { node, getAnswer: () => ({ text: node.querySelector("textarea").value }) };
  },
  NumberInput(a) {
    const node = el(`<div class="ar-input"><input type="number" step="any" placeholder="${esc(a.payload?.placeholder || "0")}"></div>`);
    return { node, getAnswer: () => ({ number: node.querySelector("input").value === "" ? null : Number(node.querySelector("input").value) }) };
  },
  MathInput(a) {
    const node = el(`<div class="ar-input ar-math"><span class="ar-math-tag">f(x)=</span><input type="text" placeholder="ex. x^2 + 2x + 1"></div>`);
    return { node, getAnswer: () => ({ expression: node.querySelector("input").value }) };
  },
  CodeInput(a) {
    const node = el(`<div class="ar-input"><textarea class="mono" rows="6" spellcheck="false" placeholder="${esc(a.payload?.placeholder || "// votre code…")}"></textarea></div>`);
    return { node, getAnswer: () => ({ code: node.querySelector("textarea").value }) };
  },
  SingleChoice(a) {
    const node = el(`<div class="ar-choices"></div>`);
    const opts = a.payload?.options || [];
    let sel = -1;
    opts.forEach((o, i) => {
      const b = el(`<button class="ar-choice" type="button">${esc(o)}</button>`);
      b.addEventListener("click", () => { sel = i; node.querySelectorAll(".ar-choice").forEach((x) => x.classList.remove("sel")); b.classList.add("sel"); });
      node.appendChild(b);
    });
    return { node, getAnswer: () => ({ index: sel }) };
  },
  MultipleChoice(a) {
    const node = el(`<div class="ar-choices"></div>`);
    const opts = a.payload?.options || [];
    const picked = new Set();
    opts.forEach((o, i) => {
      const b = el(`<button class="ar-choice" type="button">${esc(o)}</button>`);
      b.addEventListener("click", () => { picked.has(i) ? picked.delete(i) : picked.add(i); b.classList.toggle("sel"); });
      node.appendChild(b);
    });
    return { node, getAnswer: () => ({ indexes: [...picked].sort((x, y) => x - y) }) };
  },
  TrueFalse(a) {
    const node = el(`<div class="ar-choices ar-tf">
      <button class="ar-choice ar-tf-true" type="button">✓ Vrai</button>
      <button class="ar-choice ar-tf-false" type="button">✗ Faux</button>
    </div>`);
    let val = null;
    node.querySelector(".ar-tf-true").addEventListener("click", () => { val = true; node.querySelectorAll(".ar-choice").forEach((x) => x.classList.remove("sel")); node.querySelector(".ar-tf-true").classList.add("sel"); });
    node.querySelector(".ar-tf-false").addEventListener("click", () => { val = false; node.querySelectorAll(".ar-choice").forEach((x) => x.classList.remove("sel")); node.querySelector(".ar-tf-false").classList.add("sel"); });
    return { node, getAnswer: () => ({ value: val }) };
  },
  FillBlanks(a) {
    const parts = String(a.payload?.text || "").split("___");
    const node = el(`<div class="ar-blanks"></div>`);
    parts.forEach((p, i) => {
      node.appendChild(document.createTextNode(p));
      if (i < parts.length - 1) {
        const inp = el(`<input type="text" class="ar-blank" placeholder="…">`);
        node.appendChild(inp);
      }
    });
    return { node, getAnswer: () => ({ blanks: [...node.querySelectorAll(".ar-blank")].map((x) => x.value) }) };
  },
  MatchingPairs(a) {
    const left = a.payload?.left || [], right = a.payload?.right || [];
    const order = shuffle(right.map((_, i) => i));
    const node = el(`<div class="ar-match"><div class="ar-match-col" data-side="l"></div><div class="ar-match-col" data-side="r"></div></div>`);
    const lc = node.querySelector('[data-side="l"]'), rc = node.querySelector('[data-side="r"]');
    const pairs = new Map(); // leftIdx -> rightIdx
    let selL = -1;
    left.forEach((t, i) => {
      const b = el(`<button class="ar-match-item" type="button">${esc(t)}</button>`);
      b.addEventListener("click", () => {
        lc.querySelectorAll(".ar-match-item").forEach((x) => x.classList.remove("sel"));
        b.classList.add("sel"); selL = i;
      });
      lc.appendChild(b);
    });
    order.forEach((origIdx, pos) => {
      const b = el(`<button class="ar-match-item" type="button">${esc(right[origIdx])}</button>`);
      b.dataset.orig = origIdx;
      b.addEventListener("click", () => {
        if (selL < 0) return;
        pairs.set(selL, Number(b.dataset.orig));
        b.classList.add("paired");
        selL = -1; lc.querySelectorAll(".sel").forEach((x) => x.classList.remove("sel"));
      });
      rc.appendChild(b);
    });
    return { node, getAnswer: () => ({ pairs: [...pairs.entries()].map(([l, r]) => [l, r]) }) };
  },
  OrderingBase(a, label) {
    const items = [...(a.payload?.items || [])];
    const idx = items.map((_, i) => i);
    const node = el(`<div class="ar-order"><p class="ar-hint-sm">${esc(label || "Remettez les éléments dans le bon ordre.")}</p><div class="ar-order-list"></div></div>`);
    const list = node.querySelector(".ar-order-list");
    function render() {
      list.innerHTML = "";
      idx.forEach((origIdx, pos) => {
        const row = el(`<div class="ar-order-item"><span class="ar-order-pos">${pos + 1}</span><span class="ar-order-text">${esc(items[origIdx])}</span>
          <span class="ar-order-btns"><button type="button" data-mv="-1" ${pos === 0 ? "disabled" : ""}>↑</button><button type="button" data-mv="1" ${pos === idx.length - 1 ? "disabled" : ""}>↓</button></span></div>`);
        row.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
          const d = Number(b.dataset.mv);
          [idx[pos], idx[pos + d]] = [idx[pos + d], idx[pos]];
          render();
        }));
        list.appendChild(row);
      });
    }
    render();
    return { node, getAnswer: () => ({ order: [...idx] }) };
  },
  DragSort(a) { return RENDERERS.OrderingBase(a, "Glissez-déposez ou utilisez les flèches pour trier."); },
  OrderingExercise(a) { return RENDERERS.OrderingBase(a, "Remettez les éléments dans le bon ordre."); },
  TimelineBuilder(a) {
    const events = a.payload?.events || [];
    const node = el(`<div class="ar-timeline"></div>`);
    events.forEach((ev) => {
      node.appendChild(el(`<div class="ar-tl-item"><span class="ar-tl-date">${esc(ev.date || "…")}</span><span>${esc(ev.label || "")}</span></div>`));
    });
    const order = RENDERERS.OrderingBase({ payload: { items: events.map((e) => `${e.date || ""} — ${e.label || ""}`) } }, "Remettez les événements par ordre chronologique.");
    const wrap = el(`<div></div>`);
    wrap.appendChild(node);
    wrap.appendChild(order.node);
    return { node: wrap, getAnswer: order.getAnswer };
  },
  CategorySort(a) {
    const items = a.payload?.items || [], cats = a.payload?.categories || [];
    const node = el(`<div class="ar-cats"></div>`);
    const assigns = items.map(() => 0);
    items.forEach((t, i) => {
      const row = el(`<div class="ar-cat-row"><span class="ar-cat-item">${esc(t)}</span>
        <select>${cats.map((c, j) => `<option value="${j}">${esc(c)}</option>`).join("")}</select></div>`);
      row.querySelector("select").addEventListener("change", (e) => { assigns[i] = Number(e.target.value); });
      node.appendChild(row);
    });
    return { node, getAnswer: () => ({ assignment: assigns }) };
  },
  ImageLabeling(a) {
    const labels = a.payload?.labels || [];
    const img = a.payload?.image;
    const node = el(`<div class="ar-imglabel"><div class="ar-imglabel-img">${img ? `<img src="${esc(img)}" alt="">` : `<div class="ar-img-ph">🖼 image</div>`}</div>
      <div class="ar-imglabel-list"></div></div>`);
    const list = node.querySelector(".ar-imglabel-list");
    const regions = labels.map(() => "");
    labels.forEach((l, i) => {
      const row = el(`<div class="ar-cat-row"><span class="ar-cat-item">${esc(l)}</span><input type="text" placeholder="Décrivez la région…"></div>`);
      row.querySelector("input").addEventListener("input", (e) => { regions[i] = e.target.value; });
      list.appendChild(row);
    });
    return { node, getAnswer: () => ({ regions }) };
  },
  HotspotSelection(a) {
    const pts = a.payload?.points || [];
    const img = a.payload?.image;
    const node = el(`<div class="ar-hotspot"><div class="ar-hotspot-img">${img ? `<img src="${esc(img)}" alt="">` : `<div class="ar-img-ph">🖼 image</div>`}</div>
      <div class="ar-hotspot-pts"></div></div>`);
    const wrap = node.querySelector(".ar-hotspot-img");
    const picked = new Set();
    const list = node.querySelector(".ar-hotspot-pts");
    pts.forEach((p, i) => {
      const dot = el(`<button class="ar-dot" type="button" style="left:${p.x * 100}%;top:${p.y * 100}%" title="${esc(p.label || `Point ${i + 1}`)}"></button>`);
      dot.addEventListener("click", () => { picked.has(i) ? picked.delete(i) : picked.add(i); dot.classList.toggle("sel"); });
      wrap.appendChild(dot);
      list.appendChild(el(`<button class="ar-choice ar-dotlabel" type="button" data-i="${i}">${esc(p.label || `Point ${i + 1}`)}</button>`));
    });
    list.querySelectorAll(".ar-dotlabel").forEach((b) => b.addEventListener("click", () => {
      const i = Number(b.dataset.i);
      picked.has(i) ? picked.delete(i) : picked.add(i);
      b.classList.toggle("sel");
      wrap.querySelectorAll(".ar-dot")[i]?.classList.toggle("sel", picked.has(i));
    }));
    return { node, getAnswer: () => ({ selected: [...picked].sort((x, y) => x - y) }) };
  },
  GraphPlotter(a) {
    const node = el(`<div class="ar-graph"><canvas width="480" height="300"></canvas><p class="ar-hint-sm">Cliquez pour placer des points (coordonnées normalisées 0–1).</p></div>`);
    const cv = node.querySelector("canvas"), ctx = cv.getContext("2d");
    const pts = [];
    function draw() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.strokeStyle = "rgba(255,255,255,.15)"; ctx.strokeRect(1, 1, cv.width - 2, cv.height - 2);
      ctx.strokeStyle = "#8cecff"; ctx.lineWidth = 2; ctx.beginPath();
      pts.forEach((p, i) => { const x = p[0] * cv.width, y = (1 - p[1]) * cv.height; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
      pts.forEach((p) => { ctx.fillStyle = "#8cecff"; ctx.beginPath(); ctx.arc(p[0] * cv.width, (1 - p[1]) * cv.height, 4, 0, 7); ctx.fill(); });
    }
    cv.addEventListener("click", (e) => {
      const r = cv.getBoundingClientRect();
      pts.push([(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height]);
      draw();
    });
    return { node, getAnswer: () => ({ points: pts }) };
  },
  DiagramBuilder(a) {
    const nodes = a.payload?.nodes || [];
    const node = el(`<div class="ar-diagram"><div class="ar-diagram-nodes">${nodes.map((n) => `<span class="ar-chip">${esc(n)}</span>`).join("")}</div>
      <div class="ar-diagram-edges"></div>
      <button class="ws-btn ws-btn-ghost" type="button" data-add>+ Ajouter un lien</button></div>`);
    const list = node.querySelector(".ar-diagram-edges");
    const edges = [];
    function addRow(f = 0, t = 1) {
      const row = el(`<div class="ar-cat-row"><select class="ar-e-from">${nodes.map((n, i) => `<option value="${i}">${esc(n)}</option>`).join("")}</select>
        <span>→</span><select class="ar-e-to">${nodes.map((n, i) => `<option value="${i}">${esc(n)}</option>`).join("")}</select>
        <button class="ws-icon-btn" type="button" data-rm>✕</button></div>`);
      row.querySelector("[data-rm]").addEventListener("click", () => { edges.splice(edges.indexOf(rec), 1); row.remove(); });
      const rec = { row };
      edges.push(rec);
      list.appendChild(row);
    }
    node.querySelector("[data-add]").addEventListener("click", () => addRow());
    addRow();
    return { node, getAnswer: () => ({ edges: edges.map((r) => [Number(r.row.querySelector(".ar-e-from").value), Number(r.row.querySelector(".ar-e-to").value)]) }) };
  },
  TableCompletion(a) {
    const headers = a.payload?.headers || [], rowsData = a.payload?.rows || [];
    const node = el(`<div class="ar-table-wrap"><table class="ar-table"><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody></tbody></table></div>`);
    const tbody = node.querySelector("tbody");
    const cells = [];
    rowsData.forEach((row, ri) => {
      const tr = document.createElement("tr");
      row.forEach((cell, ci) => {
        const td = document.createElement("td");
        if (cell === null || cell === undefined) {
          const inp = el(`<input type="text" class="ar-cell">`);
          inp.addEventListener("input", () => { const rec = cells.find((c) => c.r === ri && c.c === ci); if (rec) rec.v = inp.value; else cells.push({ r: ri, c: ci, v: inp.value }); });
          cells.push({ r: ri, c: ci, v: "" });
          td.appendChild(inp);
        } else td.textContent = cell;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    return { node, getAnswer: () => ({ cells: cells.filter((c) => c.v !== "") }) };
  },
  ErrorCorrection(a) {
    const node = el(`<div class="ar-err"><p class="ar-err-text">${esc(a.payload?.text || "")}</p>
      <textarea rows="4" placeholder="Réécrivez le texte corrigé…"></textarea></div>`);
    return { node, getAnswer: () => ({ text: node.querySelector("textarea").value }) };
  },
  AudioRecorder(a) {
    const node = el(`<div class="ar-audio"><p class="ar-hint-sm">${esc(a.payload?.prompt || "Enregistrez votre réponse.")}</p>
      <div class="ar-audio-btns"><button class="ws-btn ws-btn-primary" type="button" data-rec>● Enregistrer</button><audio controls hidden></audio></div></div>`);
    const btn = node.querySelector("[data-rec]"), audio = node.querySelector("audio");
    let rec = null, chunks = [], url = null;
    btn.addEventListener("click", async () => {
      if (rec && rec.state === "recording") { rec.stop(); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        rec = new MediaRecorder(stream);
        chunks = [];
        rec.ondataavailable = (e) => chunks.push(e.data);
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          url = URL.createObjectURL(new Blob(chunks));
          audio.src = url; audio.hidden = false;
          btn.textContent = "● Enregistrer à nouveau";
        };
        rec.start();
        btn.textContent = "■ Arrêter";
      } catch (e) { alert("Microphone indisponible : " + e.message); }
    });
    return { node, getAnswer: () => ({ recorded: !!url, audio: url || null }) };
  },
  AudioPlayer(a) {
    const src = a.payload?.audio;
    const node = el(`<div class="ar-audio"><p class="ar-hint-sm">${esc(a.payload?.question || a.instruction || "Écoutez puis répondez.")}</p>
      ${src ? `<audio controls src="${esc(src)}"></audio>` : `<div class="ar-img-ph">🔊 audio</div>`}
      <input type="text" placeholder="Votre réponse…"></div>`);
    return { node, getAnswer: () => ({ text: node.querySelector("input").value }) };
  },
  DrawingBoard(a) {
    const node = el(`<div class="ar-draw"><p class="ar-hint-sm">${esc(a.payload?.prompt || a.instruction || "Dessinez votre réponse.")}</p>
      <canvas width="640" height="360" class="ar-draw-cv"></canvas>
      <div class="ar-audio-btns"><button class="ws-btn ws-btn-ghost" type="button" data-clear>Effacer</button></div></div>`);
    const cv = node.querySelector("canvas"), ctx = cv.getContext("2d");
    ctx.strokeStyle = "#e8e6f0"; ctx.lineWidth = 2; ctx.lineCap = "round";
    let drawing = false;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height)]; };
    cv.addEventListener("pointerdown", (e) => { drawing = true; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); });
    cv.addEventListener("pointermove", (e) => { if (!drawing) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); });
    window.addEventListener("pointerup", () => { drawing = false; });
    node.querySelector("[data-clear]").addEventListener("click", () => ctx.clearRect(0, 0, cv.width, cv.height));
    return { node, getAnswer: () => ({ drawing: cv.toDataURL("image/png") }) };
  },
  Flashcard(a) {
    const node = el(`<div class="ar-flash"><div class="ar-flash-card" data-card><div class="ar-flash-face ar-flash-front">${esc(a.payload?.front || "?")}</div><div class="ar-flash-face ar-flash-back" hidden>${esc(a.payload?.back || "")}</div></div>
      <div class="ar-audio-btns"><button class="ws-btn ws-btn-ghost" type="button" data-flip>Retourner</button>
      <button class="ar-choice ar-tf-true" type="button">✓ Je savais</button><button class="ar-choice ar-tf-false" type="button">✗ À revoir</button></div></div>`);
    let grade = null;
    node.querySelector("[data-flip]").addEventListener("click", () => {
      const f = node.querySelector(".ar-flash-front"), b = node.querySelector(".ar-flash-back");
      f.hidden = !f.hidden; b.hidden = !b.hidden;
    });
    node.querySelector(".ar-tf-true").addEventListener("click", () => { grade = "known"; node.querySelectorAll(".ar-choice").forEach((x) => x.classList.remove("sel")); node.querySelector(".ar-tf-true").classList.add("sel"); });
    node.querySelector(".ar-tf-false").addEventListener("click", () => { grade = "review"; node.querySelectorAll(".ar-choice").forEach((x) => x.classList.remove("sel")); node.querySelector(".ar-tf-false").classList.add("sel"); });
    return { node, getAnswer: () => ({ flipped: true, grade }) };
  },
};

RENDERERS.ProofBuilder = (a) => RENDERERS.OrderingBase({ payload: { items: a.payload?.steps || a.payload?.items || [] } }, "Remettez les étapes de la démonstration dans l'ordre.");

function fallbackRenderer(a) {
  const node = el(`<div class="ar-input"><textarea rows="4" placeholder="${esc(a.instruction || "Votre réponse…")}"></textarea></div>`);
  return { node, getAnswer: () => ({ text: node.querySelector("textarea").value }) };
}

// ---------- Runner ----------
// test: { lessonId, notation, maxMinutes, chapterName, onDone(res) } — simulation mode
export function openActivityRunner(activities, { onClose, test } = {}) {
  const root = document.createElement("div");
  root.className = "ws-modal-root ar-root";
  root.innerHTML = `
    <div class="ws-modal-backdrop"></div>
    <div class="ws-modal ar-modal" role="dialog" aria-modal="true">
      <div class="ar-head">
        <div class="ar-progress"><div class="ar-progress-bar" data-bar></div></div>
        <span class="ar-timer" data-timer hidden>--:--</span>
        <span class="ar-count" data-count></span>
        <button class="ws-icon-btn" type="button" data-close>✕</button>
      </div>
      <div class="ar-body">
        <div class="ar-meta"><span class="ws-badge" data-comp></span><span class="ar-title" data-title></span></div>
        <p class="ar-instruction" data-instr></p>
        <div class="ar-stage" data-stage></div>
        <div class="ar-feedback" data-feedback hidden></div>
      </div>
      <div class="ws-modal-foot">
        <button class="ws-btn ws-btn-ghost" type="button" data-prev>← Préc.</button>
        <button class="ws-btn ws-btn-primary" type="button" data-next>Valider et continuer →</button>
      </div>
    </div>`;
  document.body.appendChild(root);

  let idx = 0, current = null, answered = new Set();
  const stage = root.querySelector("[data-stage]");
  const feedbackEl = root.querySelector("[data-feedback]");
  const timerEl = root.querySelector("[data-timer]");
  const results = new Array(activities.length).fill(null);
  const startedAt = Date.now();
  let finished = false;
  let timerInt = null;

  const close = () => {
    if (timerInt) clearInterval(timerInt);
    root.remove(); onClose?.();
  };
  root.querySelector("[data-close]").addEventListener("click", close);
  root.querySelector(".ws-modal-backdrop").addEventListener("click", close);

  // ---------- test mode: countdown ----------
  if (test?.maxMinutes > 0) {
    const deadline = startedAt + test.maxMinutes * 60000;
    timerEl.hidden = false;
    const tick = () => {
      const left = Math.max(0, deadline - Date.now());
      const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
      timerEl.textContent = `${m}:${String(s).padStart(2, "0")}`;
      timerEl.classList.toggle("is-low", left < 60000);
      if (left <= 0 && !finished) { finished = true; showResults(true); }
    };
    tick();
    timerInt = setInterval(tick, 1000);
  }

  function render() {
    const a = activities[idx];
    stage.innerHTML = "";
    feedbackEl.hidden = true; feedbackEl.innerHTML = "";
    root.querySelector("[data-comp]").textContent = a.component || "Exercice";
    root.querySelector("[data-title]").textContent = a.title || "";
    root.querySelector("[data-instr]").textContent = a.instruction || "";
    root.querySelector("[data-count]").textContent = `${idx + 1} / ${activities.length}`;
    root.querySelector("[data-bar]").style.width = `${((idx) / activities.length) * 100}%`;
    root.querySelector("[data-prev]").disabled = idx === 0;
    const r = (RENDERERS[a.component] || fallbackRenderer)(a);
    current = r;
    stage.appendChild(r.node);
    root.querySelector("[data-next]").textContent = idx === activities.length - 1 ? "Terminer ✓" : "Valider et continuer →";
  }

  root.querySelector("[data-prev]").addEventListener("click", () => { if (idx > 0) { idx--; render(); } });
  root.querySelector("[data-next]").addEventListener("click", async () => {
    const a = activities[idx];
    const answer = current?.getAnswer ? current.getAnswer() : {};
    const btn = root.querySelector("[data-next]");
    btn.disabled = true; btn.textContent = "Vérification…";
    try {
      const fb = await apiLearning("feedback", {
        component: a.component, instruction: a.instruction,
        expected: a.answer, answer, context: a.explanation || "",
      });
      answered.add(idx);
      results[idx] = { score: fb.score ?? (fb.correct ? 100 : 0), correct: !!fb.correct };
      feedbackEl.hidden = false;
      if (test) {
        // Simulation: never reveal correctness mid-test.
        feedbackEl.className = "ar-feedback";
        feedbackEl.innerHTML = `<div class="ar-fb-head">Réponse enregistrée ✓</div><div class="ar-fb-comment">Les résultats sont révélés à la fin du test.</div>`;
      } else {
        feedbackEl.className = `ar-feedback ${fb.correct ? "ok" : "ko"}`;
        feedbackEl.innerHTML = `
          <div class="ar-fb-head">${fb.correct ? "✓ Correct" : "✗ Pas tout à fait"} ${fb.score != null ? `· ${fb.score}/100` : ""}</div>
          <div class="ar-fb-comment">${esc(fb.comment || "")}</div>
          ${fb.hint ? `<div class="ar-fb-hint">💡 ${esc(fb.hint)}</div>` : ""}
          ${a.explanation ? `<div class="ar-fb-expl">${esc(a.explanation)}</div>` : ""}`;
      }
      if (idx === activities.length - 1) {
        btn.textContent = "Terminer ✓";
        btn.disabled = false;
        btn.onclick = () => (test ? finishTest() : close());
      } else {
        btn.textContent = "Continuer →";
        btn.disabled = false;
        btn.onclick = () => { idx++; render(); };
      }
    } catch (e) {
      btn.disabled = false;
      btn.textContent = "Réessayer";
      feedbackEl.hidden = false;
      feedbackEl.className = "ar-feedback ko";
      feedbackEl.textContent = `Erreur de feedback : ${e.message}`;
    }
  });

  // ---------- test mode: results + progression remark ----------
  function computeResults() {
    const answeredList = results.filter(Boolean);
    const totalScore = answeredList.reduce((s, r) => s + (Number(r.score) || 0), 0);
    // Unanswered exercises count as 0 for the grade.
    const maxScore = activities.length * 100;
    const pct = maxScore ? (totalScore / maxScore) * 100 : 0;
    const notation = Number(test?.notation) || 20;
    const grade = Math.round((pct / 100) * notation * 10) / 10;
    const correctCount = answeredList.filter((r) => r.correct).length;
    const elapsedMin = (Date.now() - startedAt) / 60000;
    return { pct, grade, notation, correctCount, total: activities.length, answeredCount: answeredList.length, elapsedMin, results: answeredList };
  }

  async function finishTest() {
    if (finished) return;
    finished = true;
    if (timerInt) clearInterval(timerInt);
    const res = computeResults();
    stage.innerHTML = "";
    feedbackEl.hidden = true;
    root.querySelector("[data-comp]").textContent = "Résultats";
    root.querySelector("[data-title]").textContent = test?.chapterName || "Test";
    root.querySelector("[data-instr]").textContent = "";
    root.querySelector("[data-count]").textContent = "";
    root.querySelector("[data-prev]").disabled = true;
    root.querySelector("[data-next]").disabled = true;
    root.querySelector("[data-next]").textContent = "…";
    stage.innerHTML = `
      <div class="ar-results">
        <div class="ar-grade">${res.grade}<span>/${res.notation}</span></div>
        <div class="ar-grade-sub">${res.pct.toFixed(1)}% — ${res.correctCount}/${res.total} correctes, ${res.answeredCount}/${res.total} répondues${test?.maxMinutes ? ` — ${res.elapsedMin.toFixed(1)}/${test.maxMinutes} min` : ""}</div>
        <div class="ar-remark" data-remark><em>Rédaction de la remarque de progression…</em></div>
      </div>`;
    try {
      const report = await apiLearning("test-report", {
        lesson_id: test.lessonId, pct: res.pct, grade: res.grade, notation: res.notation,
        max_minutes: test.maxMinutes || null, elapsed_minutes: res.elapsedMin,
        correct_count: res.correctCount, total_count: res.total, answered_count: res.answeredCount,
      });
      res.remark = report.remark || "";
      stage.querySelector("[data-remark]").innerHTML = `<strong>Progression</strong><p>${esc(report.remark || "")}</p>`;
    } catch (e) {
      stage.querySelector("[data-remark]").innerHTML = `<strong>Progression</strong><p class="ar-remark-err">Remarque indisponible : ${esc(e.message)}</p>`;
    }
    const foot = root.querySelector(".ws-modal-foot");
    foot.innerHTML = `
      <button class="ws-btn ws-btn-ghost" type="button" data-close>Fermer</button>
      <button class="ws-btn ws-btn-primary" type="button" data-save>Enregistrer les résultats</button>`;
    foot.querySelector("[data-close]").addEventListener("click", close);
    foot.querySelector("[data-save]").addEventListener("click", async () => {
      foot.querySelector("[data-save]").disabled = true;
      try { await test.onDone?.(res); } catch {}
      close();
    });
  }

  function showResults() { finishTest(); }

  render();
}

// apiLearning injected to avoid circular import — set by script.js
let apiLearning = async () => { throw new Error("apiLearning not initialized"); };
export function setLearningApi(fn) { apiLearning = fn; }
