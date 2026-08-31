import { exportProgressEl, exportProgressBarEl, exportProgressLabelEl } from "./dom.js";

// There's no real percent-complete signal from the server (ffmpeg runs
// behind one blocking HTTP request), so this simulates progress with an
// easing curve: fast at first, slows down, and caps well short of 100%
// until the request actually resolves — a well-known pattern for hiding
// indeterminate wait times without lying about being "done".
const CAP_PERCENT = 92;
const EASE_SECONDS = 18;

let timer = null;
let startedAt = 0;

function render(percent, label) {
  if (!exportProgressBarEl || !exportProgressLabelEl) return;
  exportProgressBarEl.style.width = `${percent}%`;
  exportProgressLabelEl.textContent = label;
}

export function startExportProgress(label = "Готовлю фрагмент...") {
  if (!exportProgressEl) return;
  stopExportProgress();
  startedAt = Date.now();
  exportProgressEl.hidden = false;
  render(4, label);

  timer = setInterval(() => {
    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    const percent = CAP_PERCENT * (1 - Math.exp(-elapsedSeconds / EASE_SECONDS));
    render(percent, `${label} ${Math.round(elapsedSeconds)} сек`);
  }, 300);
}

export function finishExportProgress() {
  if (!exportProgressEl) return;
  clearInterval(timer);
  timer = null;
  render(100, "Готово");
  setTimeout(() => {
    exportProgressEl.hidden = true;
    render(0, "");
  }, 600);
}

export function stopExportProgress() {
  if (!exportProgressEl) return;
  clearInterval(timer);
  timer = null;
  exportProgressEl.hidden = true;
  render(0, "");
}
