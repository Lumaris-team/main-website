// Chapter tools — creation type chooser, review methods, spaced repetition,
// flashcard reviewer, AI Q&A and evaluation flag.
// Wired from script.js via setChapterApi().

let api = null;
export function setChapterApi(apis) { api = apis; }

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- modal helper ----------
function openModal({ title, body, foot = "", wide = false, onMount } = {}) {
  const root = document.getElementById("modalRoot");
  root.hidden = false;
  root.innerHTML = `
    <div class="ws-modal-backdrop">
      <div class="ws-modal ${wide ? "ws-modal-form" : "ws-gen-modal"}" role="dialog" aria-modal="true">
        <div class="ws-modal-head"><h2>${esc(title)}</h2><button class="ws-icon-btn" type="button" data-close>✕</button></div>
        <div class="ws-modal-body">${body}</div>
        ${foot ? `<div class="ws-modal-foot">${foot}</div>` : ""}
      </div>
    </div>`;
  const close = () => { root.hidden = true; root.innerHTML = ""; };
  root.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  root.querySelector(".ws-modal-backdrop").addEventListener("click", (e) => { if (e.target.classList.contains("ws-modal-backdrop")) close(); });
  const modal = { close, el: root.querySelector(".ws-modal") };
  onMount?.(modal);
  return modal;
}

// ---------- duration estimate ----------
function chapterSourceLen(ch) {
  return String(ch?.body || "").length + String(ch?.raw_lessons || "").length + String(ch?.raw_recorded_lessons || "").length;
}
// Rough indicative durations (minutes) — OSS 120B is slow, flashcards/tests faster.
export function estimateMinutes(ch, kind = "course") {
  const chars = chapterSourceLen(ch);
  const base = { course: 15000, flashcards: 22000, activities: 18000, ask: 0 }[kind] || 15000;
  if (!base) return 0;
  return Math.max(1, Math.min(15, Math.round(chars / base) + (kind === "course" ? 2 : 1)));
}

export function confirmGenerate({ title, minutes, detail = "", confirmLabel = "Generate", onGo }) {
  openModal({
    title,
    body: `
      <div class="ct-estimate">
        <div class="ct-estimate-icon">⏱</div>
        <div>
          <p class="ct-estimate-line"><strong>~${minutes} min</strong> indicative duration</p>
          <p class="ct-estimate-sub">GPT OSS 120B generates section by section — you can leave and come back, progress is saved.${detail ? ` ${esc(detail)}` : ""}</p>
        </div>
      </div>`,
    foot: `
      <button class="ws-btn ws-btn-ghost" type="button" data-close>Cancel</button>
      <button class="ws-btn ws-btn-primary" type="button" data-go>${esc(confirmLabel)}</button>`,
    onMount(m) {
      m.el.querySelector("[data-go]").addEventListener("click", () => { m.close(); onGo?.(); });
    },
  });
}

// ---------- creation type chooser ----------
export function openCreateChooser({ onPick }) {
  const choices = [
    { key: "task", icon: "✅", label: "Task", desc: "A thing to do, with scheduling and metadata" },
    { key: "event", icon: "📅", label: "Event", desc: "A one-off or dated happening" },
    { key: "chapter", icon: "📖", label: "Chapter", desc: "A course chapter with AI tools" },
    { key: "evaluation", icon: "📝", label: "Evaluation", desc: "A test or exam — special workflow (soon)" },
  ];
  openModal({
    title: "Create something",
    wide: true,
    body: `<div class="ct-choice-grid">${choices.map((c) => `
      <button class="ct-choice" type="button" data-pick="${c.key}">
        <span class="ct-choice-icon">${c.icon}</span>
        <span class="ct-choice-label">${c.label}</span>
        <span class="ct-choice-desc">${c.desc}</span>
      </button>`).join("")}</div>`,
    onMount(m) {
      m.el.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => {
        const key = b.dataset.pick;
        m.close();
        if (key === "evaluation") {
          openModal({
            title: "Evaluation",
            body: `<p class="ct-note">The evaluation workflow is being built — dedicated form, grading and AI correction are coming soon.</p>`,
            foot: `<button class="ws-btn ws-btn-primary" type="button" data-close>Got it</button>`,
          });
          return;
        }
        onPick?.(key);
      }));
    },
  });
}

// ---------- chapter helpers ----------
function parseJSONField(v, fallback = null) {
  if (!v) return fallback;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

async function updateChapter(lessonId, fields) {
  await api.apiSubjects("update-chapter", { lesson_id: lessonId, fields });
  await api.reload?.();
}

// ---------- evaluation flag ----------
export async function toggleEvaluation(chapter) {
  const next = chapter.awaiting_evaluation ? 0 : 1;
  await updateChapter(chapter.lesson_id, { awaiting_evaluation: next });
  api.toast?.(next ? "Marked as awaiting evaluation" : "Evaluation flag removed");
}

// ---------- review menu (ALL methods) ----------
export function openReviewMenu(chapter) {
  const hasFlash = !!parseJSONField(chapter.flashcards)?.cards?.length;
  const hasActs = !!parseJSONField(chapter.tests)?.activities?.length;
  const plan = parseJSONField(chapter.review_plan);
  const methods = [
    { key: "flashcards", icon: "🃏", label: "Flashcards", desc: hasFlash ? "Flip through generated cards" : "No flashcards yet — generate them first", disabled: !hasFlash, run: () => openFlashcardReview(chapter) },
    { key: "activities", icon: "🏃", label: "Test simulation", desc: hasActs ? "Timed test with grade /x and progression remark" : "No activities yet — generate them first", disabled: !hasActs, run: () => openTestSimulation(chapter) },
    { key: "spaced", icon: "🗓", label: "Spaced sessions", desc: plan ? `${(plan.sessions || []).length} sessions planned` : "Plan reviews by week / interval", run: () => openSpacedReview(chapter) },
  ];
  openModal({
    title: `Review — ${chapter.lesson_name || "chapter"}`,
    wide: true,
    body: `<div class="ct-choice-grid ct-choice-grid-3">${methods.map((m) => `
      <button class="ct-choice ${m.disabled ? "is-disabled" : ""}" type="button" data-pick="${m.key}" ${m.disabled ? "disabled" : ""}>
        <span class="ct-choice-icon">${m.icon}</span>
        <span class="ct-choice-label">${m.label}</span>
        <span class="ct-choice-desc">${m.desc}</span>
      </button>`).join("")}</div>`,
    onMount(m) {
      m.el.querySelectorAll("[data-pick]:not(:disabled)").forEach((b) => b.addEventListener("click", () => {
        m.close();
        methods.find((x) => x.key === b.dataset.pick)?.run?.();
      }));
    },
  });
}

// ---------- flashcard reviewer ----------
export function openFlashcardReview(chapter) {
  const parsed = parseJSONField(chapter.flashcards);
  let cards = Array.isArray(parsed?.cards) ? parsed.cards.filter((c) => c?.front) : [];
  if (!cards.length) { api.toast?.("No flashcards on this chapter"); return; }
  // shuffle
  cards = cards.map((c) => ({ c, r: Math.random() })).sort((a, b) => a.r - b.r).map((x) => x.c);

  let i = 0, flipped = false, known = 0, again = [];
  const modal = openModal({
    title: `Flashcards — ${i + 1}/${cards.length}`,
    body: `
      <div class="ct-flash">
        <div class="ct-flash-card" data-card tabindex="0">
          <div class="ct-flash-inner" data-inner>
            <div class="ct-flash-face ct-flash-front" data-front></div>
            <div class="ct-flash-face ct-flash-back" data-back></div>
          </div>
        </div>
        <div class="ct-flash-actions">
          <button class="ws-btn ws-btn-ghost" type="button" data-again>↺ Again</button>
          <button class="ws-btn ws-btn-primary" type="button" data-know>I know ✓</button>
        </div>
        <div class="ct-flash-progress"><div class="ct-flash-bar" data-bar></div></div>
      </div>`,
    foot: `<button class="ws-btn ws-btn-ghost" type="button" data-close>Close</button>`,
    wide: true,
    onMount(m) {
      const card = m.el.querySelector("[data-card]");
      const inner = m.el.querySelector("[data-inner]");
      const front = m.el.querySelector("[data-front]");
      const back = m.el.querySelector("[data-back]");
      const bar = m.el.querySelector("[data-bar]");
      const title = m.el.querySelector(".ws-modal-head h2");

      const show = () => {
        flipped = false;
        inner.classList.remove("is-flipped");
        front.textContent = cards[i].front || "";
        back.textContent = cards[i].back || "";
        title.textContent = `Flashcards — ${i + 1}/${cards.length}`;
        bar.style.width = `${(i / cards.length) * 100}%`;
      };
      const flip = () => { flipped = !flipped; inner.classList.toggle("is-flipped", flipped); };
      card.addEventListener("click", flip);
      card.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); } });

      const next = (knew) => {
        if (knew) known++; else again.push(cards[i]);
        i++;
        if (i >= cards.length) {
          // re-queue missed cards once
          if (again.length && again.length < cards.length) {
            cards = again.splice(0); i = 0;
            api.toast?.(`${again.length || ""} cards to review again`);
          } else {
            m.el.querySelector(".ws-modal-body").innerHTML = `
              <div class="ct-done">
                <div class="ct-done-icon">🎉</div>
                <p><strong>${known}/${cards.length}</strong> cards mastered</p>
                ${again.length ? `<p class="ct-done-sub">${again.length} card(s) flagged for review.</p>` : ""}
              </div>`;
            title.textContent = "Review complete";
            return;
          }
        }
        show();
      };
      m.el.querySelector("[data-know]").addEventListener("click", () => next(true));
      m.el.querySelector("[data-again]").addEventListener("click", () => next(false));
      show();
    },
  });
  return modal;
}

// ---------- spaced repetition planner ----------
function addDays(dateStr, days) {
  const d = dateStr ? new Date(`${dateStr}T12:00:00`) : new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function openSpacedReview(chapter) {
  let plan = parseJSONField(chapter.review_plan) || { interval_days: 3, sessions: [] };
  const startDate = chapter.session_date || new Date().toISOString().slice(0, 10);

  const modal = openModal({
    title: `Spaced review — ${chapter.lesson_name || "chapter"}`,
    wide: true,
    body: `
      <div class="ct-spaced">
        <div class="ct-spaced-form">
          <label class="ws-field"><span class="ws-field-label">Start date (session date)</span>
            <input type="date" data-start value="${esc(startDate)}"></label>
          <label class="ws-field"><span class="ws-field-label">Interval between sessions (days)</span>
            <input type="number" data-interval min="1" max="30" value="${plan.interval_days || 3}"></label>
          <label class="ws-field"><span class="ws-field-label">Number of sessions</span>
            <input type="number" data-count min="1" max="52" value="${(plan.sessions || []).length || 8}"></label>
          <button class="ws-btn ws-btn-primary" type="button" data-gen>Generate plan</button>
        </div>
        <div class="ct-spaced-list" data-list>${renderSessionList(plan.sessions || [])}</div>
      </div>`,
    foot: `<button class="ws-btn ws-btn-ghost" type="button" data-close>Close</button>`,
    onMount(m) {
      const list = m.el.querySelector("[data-list]");
      m.el.querySelector("[data-gen]").addEventListener("click", async () => {
        const start = m.el.querySelector("[data-start]").value || startDate;
        const interval = Math.max(1, Number(m.el.querySelector("[data-interval]").value) || 3);
        const count = Math.min(52, Math.max(1, Number(m.el.querySelector("[data-count]").value) || 8));
        const sessions = Array.from({ length: count }, (_, i) => ({
          n: i + 1, date: addDays(start, i * interval), done: false,
        }));
        plan = { interval_days: interval, sessions };
        list.innerHTML = renderSessionList(sessions);
        try {
          await updateChapter(chapter.lesson_id, { review_plan: JSON.stringify(plan), session_date: start });
          api.toast?.(`Review plan saved — ${count} sessions every ${interval}d`);
        } catch (e) { api.toast?.(e.message); }
      });
      list.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-toggle]");
        if (!btn) return;
        const idx = Number(btn.dataset.toggle);
        const sessions = plan.sessions || [];
        if (!sessions[idx]) return;
        sessions[idx].done = !sessions[idx].done;
        btn.closest("[data-sess]").classList.toggle("is-done", !!sessions[idx].done);
        btn.textContent = sessions[idx].done ? "✓" : "○";
        try { await updateChapter(chapter.lesson_id, { review_plan: JSON.stringify(plan) }); } catch {}
      });
    },
  });
  return modal;
}

function renderSessionList(sessions) {
  if (!sessions.length) return `<p class="ct-note">No plan yet — pick an interval and generate one.</p>`;
  return sessions.map((s, i) => `
    <div class="ct-sess ${s.done ? "is-done" : ""}" data-sess>
      <span class="ct-sess-n">#${s.n}</span>
      <span class="ct-sess-date">${esc(s.date)}</span>
      <button class="ws-icon-btn" type="button" data-toggle="${i}" title="Toggle done">${s.done ? "✓" : "○"}</button>
    </div>`).join("");
}

// ---------- Test simulation (notation /x + max duration + progression remark) ----------
export function openTestSimulation(chapter) {
  const parsed = parseJSONField(chapter.tests);
  const list = Array.isArray(parsed?.activities) ? parsed.activities : [];
  if (!list.length) { api.toast?.("No activities yet — generate them first"); return; }
  openModal({
    title: `Test simulation — ${chapter.lesson_name || "chapter"}`,
    body: `
      <div class="ct-testcfg">
        <p class="ct-note">${list.length} exercise(s) will be served like a real test. Set the grading scale and the time limit — a countdown starts when you begin, and a progression remark based on the teacher's expectations is generated at the end.</p>
        <div class="ct-testcfg-grid">
          <label class="ws-field"><span class="ws-field-label">Notation (/x)</span>
            <input type="number" data-notation min="1" max="100" step="0.5" value="20"></label>
          <label class="ws-field"><span class="ws-field-label">Max duration (minutes, empty = none)</span>
            <input type="number" data-duration min="1" max="600" placeholder="e.g. 60"></label>
        </div>
      </div>`,
    foot: `
      <button class="ws-btn ws-btn-ghost" type="button" data-close>Cancel</button>
      <button class="ws-btn ws-btn-primary" type="button" data-start>Start test ▶</button>`,
    onMount(m) {
      m.el.querySelector("[data-start]").addEventListener("click", () => {
        const notation = Math.max(1, Number(m.el.querySelector("[data-notation]").value) || 20);
        const durRaw = m.el.querySelector("[data-duration]").value;
        const maxMinutes = durRaw ? Math.max(1, Number(durRaw)) : null;
        m.close();
        api.onRunTest?.(list, chapter, { notation, maxMinutes });
      });
    },
  });
}

// ---------- Ask AI about the course ----------
export function openAskAI(chapter) {
  const log = [];
  const modal = openModal({
    title: `Ask AI — ${chapter.lesson_name || "chapter"}`,
    wide: true,
    body: `
      <div class="ct-ask">
        <div class="ct-ask-log" data-log>
          <p class="ct-note">Ask anything about this chapter's course. Answers use a fast model grounded in the course content.</p>
        </div>
        <div class="ct-ask-input">
          <input type="text" data-q placeholder="e.g. Explain the difference between mitosis and meiosis…" autocomplete="off">
          <button class="ws-btn ws-btn-primary" type="button" data-send>Ask</button>
        </div>
      </div>`,
    foot: `<button class="ws-btn ws-btn-ghost" type="button" data-close>Close</button>`,
    onMount(m) {
      const logEl = m.el.querySelector("[data-log]");
      const input = m.el.querySelector("[data-q]");
      const send = m.el.querySelector("[data-send]");
      const ask = async () => {
        const q = input.value.trim();
        if (!q) return;
        input.value = "";
        send.disabled = true;
        logEl.insertAdjacentHTML("beforeend", `<div class="ct-msg ct-msg-user">${esc(q)}</div>`);
        const pending = document.createElement("div");
        pending.className = "ct-msg ct-msg-ai ct-msg-loading";
        pending.textContent = "Thinking…";
        logEl.appendChild(pending);
        logEl.scrollTop = logEl.scrollHeight;
        try {
          const r = await api.apiLearning("ask", { lesson_id: chapter.lesson_id, question: q });
          pending.classList.remove("ct-msg-loading");
          pending.textContent = r.answer || "No answer.";
        } catch (e) {
          pending.textContent = `Error: ${e.message}`;
        }
        send.disabled = false;
        logEl.scrollTop = logEl.scrollHeight;
        input.focus();
      };
      send.addEventListener("click", ask);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") ask(); });
    },
  });
  return modal;
}
