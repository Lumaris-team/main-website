// Lumaris color picker — replaces the native <input type="color"> UI.
// The real input stays in the DOM (hidden) as the value holder; the picker
// writes hex into it and dispatches `input`/`change` so existing handlers
// (swatch preview, theme apply, remote save) keep working untouched.

const state = { pop: null, input: null, h: 0, s: 0, v: 0, dragging: null };

const hexToHsv = (hex) => {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
};

const hsvToHex = (h, s, v) => {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (n) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
};

const hueColor = (h) => `hsl(${Math.round(h)}, 100%, 50%)`;

function ensurePop() {
  if (state.pop) return state.pop;
  const pop = document.createElement("div");
  pop.className = "lum-color-pop";
  pop.innerHTML = `
    <div class="lum-color-sv" data-sv>
      <div class="lum-color-sv-thumb" data-sv-thumb></div>
    </div>
    <div class="lum-color-hue" data-hue>
      <div class="lum-color-hue-thumb" data-hue-thumb></div>
    </div>
    <div class="lum-color-foot">
      <span class="lum-color-preview" data-preview></span>
      <input type="text" class="lum-color-hex" data-hex spellcheck="false" maxlength="7">
    </div>`;
  document.body.appendChild(pop);
  state.pop = pop;

  const sv = pop.querySelector("[data-sv]");
  const hue = pop.querySelector("[data-hue]");
  const svThumb = pop.querySelector("[data-sv-thumb]");
  const hueThumb = pop.querySelector("[data-hue-thumb]");
  const preview = pop.querySelector("[data-preview]");
  const hexInput = pop.querySelector("[data-hex]");

  const paint = () => {
    const hex = hsvToHex(state.h, state.s, state.v);
    sv.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor(state.h)})`;
    svThumb.style.left = `${state.s * 100}%`;
    svThumb.style.top = `${(1 - state.v) * 100}%`;
    hueThumb.style.left = `${(state.h / 360) * 100}%`;
    preview.style.background = hex;
    hexInput.value = hex;
  };

  const commit = () => {
    if (!state.input) return;
    const hex = hsvToHex(state.h, state.s, state.v);
    state.input.value = hex;
    state.input.dispatchEvent(new Event("input", { bubbles: true }));
    state.input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const setFromEvent = (el, e, mode) => {
    const rect = el.getBoundingClientRect();
    const x = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const y = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1);
    if (mode === "sv") {
      state.s = x;
      state.v = 1 - y;
    } else {
      state.h = x * 360;
    }
    paint();
    commit();
  };

  const bindDrag = (el, mode) => {
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      state.dragging = mode;
      el.setPointerCapture(e.pointerId);
      setFromEvent(el, e, mode);
    });
    el.addEventListener("pointermove", (e) => {
      if (state.dragging === mode) setFromEvent(el, e, mode);
    });
    el.addEventListener("pointerup", () => { state.dragging = null; });
    el.addEventListener("pointercancel", () => { state.dragging = null; });
  };
  bindDrag(sv, "sv");
  bindDrag(hue, "hue");

  hexInput.addEventListener("input", () => {
    const v = hexInput.value.trim();
    const m = /^#?[0-9a-fA-F]{6}$/.test(v) ? (v.startsWith("#") ? v : `#${v}`) : null;
    if (!m) return;
    const hsv = hexToHsv(m);
    state.h = hsv.h; state.s = hsv.s; state.v = hsv.v;
    paint();
    commit();
  });
  hexInput.addEventListener("change", () => {
    const m = /^#?[0-9a-fA-F]{6}$/;
    if (!m.test(hexInput.value.trim())) hexInput.value = hsvToHex(state.h, state.s, state.v);
  });

  // Click outside closes
  document.addEventListener("pointerdown", (e) => {
    if (state.pop && !state.pop.contains(e.target) && !e.target.closest?.("[data-color-trigger]")) closeColorPicker();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeColorPicker(); });

  return pop;
}

export function closeColorPicker() {
  state.pop?.classList.remove("is-open");
  state.input = null;
}

// Attach a Lumaris picker to a native <input type="color">.
// `trigger` (optional) is the element that opens the popover — defaults to
// the input's previous sibling .color-swatch or the input itself.
export function attachColorPicker(input, trigger) {
  if (!input || input.dataset.lumPicker) return;
  input.dataset.lumPicker = "1";
  input.classList.add("lum-color-native");

  const openFor = (anchor) => {
    const pop = ensurePop();
    const hex = input.value || "#8cecff";
    const hsv = hexToHsv(hex);
    state.h = hsv.h; state.s = hsv.s; state.v = hsv.v;
    state.input = input;

    const rect = (anchor || input).getBoundingClientRect();
    const popW = 216;
    let left = rect.left + rect.width / 2 - popW / 2;
    left = Math.min(Math.max(left, 8), window.innerWidth - popW - 8);
    let top = rect.bottom + 8;
    const popH = 190;
    if (top + popH > window.innerHeight - 8) top = rect.top - popH - 8;
    pop.style.left = `${left}px`;
    pop.style.top = `${Math.max(top, 8)}px`;

    pop.querySelector("[data-hex]").value = hex;
    pop.classList.add("is-open");
    const sv = pop.querySelector("[data-sv]");
    sv.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor(state.h)})`;
    const svThumb = pop.querySelector("[data-sv-thumb]");
    svThumb.style.left = `${state.s * 100}%`;
    svThumb.style.top = `${(1 - state.v) * 100}%`;
    const hueThumb = pop.querySelector("[data-hue-thumb]");
    hueThumb.style.left = `${(state.h / 360) * 100}%`;
    pop.querySelector("[data-preview]").style.background = hex;
    state.dragging = null;
  };

  const opener = trigger || input.previousElementSibling?.classList.contains("color-swatch")
    ? (trigger || input.previousElementSibling)
    : input;
  opener.setAttribute("data-color-trigger", "1");
  opener.style.cursor = "pointer";
  opener.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (state.pop?.classList.contains("is-open") && state.input === input) closeColorPicker();
    else openFor(opener);
  });
}

// Wire every <input type="color"> inside a root element.
export function initColorPickers(root = document) {
  root.querySelectorAll?.('input[type="color"]:not([data-lum-picker])').forEach((input) => {
    attachColorPicker(input);
  });
}
