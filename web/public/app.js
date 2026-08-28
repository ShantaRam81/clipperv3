import * as dom from "./modules/dom.js";
import { state, prefersNativePaste } from "./modules/state.js";
import { fetchJson } from "./modules/api.js";
import { setUiState, setMessage } from "./modules/ui.js";
import { pasteFromClipboard, handlePasteRowClick } from "./modules/paste.js";
import { probeSource } from "./modules/source.js";
import { syncRange, handleTimeInputKeydown, startTimelineDrag, moveTimelineDrag, stopTimelineDrag, stopPreviewAtEnd } from "./modules/timeline.js";
import { playSelectedPreview } from "./modules/preview.js";
import { loadHashtags, renderTags, loadSavedTags, handleTagKeydown, addTag, addCustomTag } from "./modules/tags.js";
import { saveClip } from "./modules/export.js";

const toggles = { includeEmbeddedInput: dom.includeEmbeddedInput, includeGifsInput: dom.includeGifsInput };

init();

async function init() {
  dom.appShellEl.dataset.nativePaste = prefersNativePaste ? "true" : "false";
  setUiState("idle");
  loadPreferences();
  bindEvents();
  loadSavedTags();
  await loadHashtags();
  renderTags();
  await loadHealth();
  syncRange("range");
}

function bindEvents() {
  dom.startRange.addEventListener("input", () => syncRange("range"));
  dom.endRange.addEventListener("input", () => syncRange("range"));
  dom.startInput.addEventListener("change", () => syncRange("text"));
  dom.endInput.addEventListener("change", () => syncRange("text"));
  dom.startInput.addEventListener("keydown", handleTimeInputKeydown);
  dom.endInput.addEventListener("keydown", handleTimeInputKeydown);
  dom.filmstripEl.addEventListener("pointerdown", startTimelineDrag);
  window.addEventListener("pointermove", moveTimelineDrag);
  window.addEventListener("pointerup", stopTimelineDrag);
  dom.previewVideoEl.addEventListener("timeupdate", stopPreviewAtEnd);
  dom.previewVideoEl.addEventListener("error", () => {
    setMessage("Не удалось открыть предпросмотр. Для некоторых Vimeo/YouTube ссылок временный поток может быть заблокирован браузером.");
  });

  dom.urlInput.addEventListener("input", () => {
    dom.appShellEl.dataset.manualPaste = dom.urlInput.value.trim() ? "false" : dom.appShellEl.dataset.manualPaste;
    state.probeToken += 1;
    state.selectedSourceUrl = "";
    state.selectedPreviewUrl = "";
    state.selectedPreviewKind = "";
    state.selectedMediaType = "video";
    state.showingAllOptions = false;
    state.currentOptions = [];
    dom.videoOptionsEl.hidden = true;
    dom.previewEl.hidden = true;
    if (!dom.urlInput.value.trim()) setUiState("idle");
    scheduleProbe();
  });

  dom.pasteFromClipboardBtn?.addEventListener("click", (event) => pasteFromClipboard(event, { probeSource: () => probeSource(toggles) }));
  dom.pasteRowEl?.addEventListener("click", (event) => handlePasteRowClick(event, { probeSource: () => probeSource(toggles) }));
  if (!prefersNativePaste) {
    dom.pasteRowEl?.addEventListener("contextmenu", (event) => event.preventDefault());
  }
  dom.urlInput.addEventListener("focus", () => {
    if (!prefersNativePaste && state.uiState === "idle" && !dom.commandPanelEl?.classList.contains("manual")) {
      dom.urlInput.blur();
    }
  });

  dom.includeEmbeddedInput?.addEventListener("change", () => {
    localStorage.setItem("clipperV3IncludeEmbedded", dom.includeEmbeddedInput.checked ? "1" : "0");
    if (dom.urlInput.value.trim()) scheduleProbe();
  });
  dom.includeGifsInput?.addEventListener("change", () => {
    localStorage.setItem("clipperV3IncludeGifs", dom.includeGifsInput.checked ? "1" : "0");
    if (dom.urlInput.value.trim()) scheduleProbe();
  });

  dom.tagInput?.addEventListener("keydown", handleTagKeydown);
  dom.tagInput?.addEventListener("change", () => addTag(dom.tagInput.value));
  dom.qualityOptionEls.forEach((button) => {
    button.addEventListener("click", () => setQuality(button.dataset.quality));
  });
  dom.addTagOptionBtn?.addEventListener("click", addCustomTag);
  dom.playPreviewBtn.addEventListener("click", playSelectedPreview);
  dom.heroImageEl?.addEventListener("click", playSelectedPreview);
  dom.heroImageEl?.addEventListener("error", async () => {
    const { inlinePlaceholder } = await import("./modules/api.js");
    dom.heroImageEl.src = inlinePlaceholder();
  });

  dom.form.addEventListener("submit", saveClip);
}

function loadPreferences() {
  if (dom.includeEmbeddedInput) {
    dom.includeEmbeddedInput.checked = localStorage.getItem("clipperV3IncludeEmbedded") !== "0";
  }
  if (dom.includeGifsInput) {
    dom.includeGifsInput.checked = localStorage.getItem("clipperV3IncludeGifs") === "1";
  }
}

function scheduleProbe() {
  clearTimeout(state.probeTimer);
  const value = dom.urlInput.value.trim();
  if (!value) {
    setUiState("idle");
    setMessage("");
    return;
  }
  try {
    new URL(value);
  } catch {
    setUiState("idle");
    setMessage("Вставьте полную ссылку.");
    return;
  }
  state.probeTimer = setTimeout(() => probeSource(toggles), 650);
}

function setQuality(value) {
  if (!value) return;
  dom.qualityInput.value = value;
  dom.qualityOptionEls.forEach((button) => {
    button.classList.toggle("active", button.dataset.quality === value);
  });
}

async function loadHealth() {
  const health = await fetchJson("/api/health");
  const missing = health.processing?.mode === "remote" ? [] : ["processor"];
  if (missing.length) {
    dom.statusEl.textContent = "Обработчик недоступен";
    dom.statusEl.className = "status warning";
  } else {
    dom.statusEl.textContent = "";
    dom.statusEl.className = "status ready";
  }
}
