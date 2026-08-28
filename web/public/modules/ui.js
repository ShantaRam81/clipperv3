import {
  appShellEl, loadingStateEl, loadingTitleEl, loadingDetailEl,
  pasteFromClipboardBtn, urlInput, commandPanelEl, messageEl, commandMessageEl, saveBtn
} from "./dom.js";
import { state, prefersNativePaste } from "./state.js";

export function setMessage(message) {
  messageEl.textContent = message || "";
  commandMessageEl.textContent = message || "";
}

export function setSaveBusy(busy) {
  if (!saveBtn) return;
  saveBtn.disabled = busy;
  saveBtn.innerHTML = busy ? "Preparing..." : '<span aria-hidden="true">↓</span>Export';
}

export function setUiState(nextState, title = "", detail = "") {
  const previousState = state.uiState;
  const applyState = () => {
    state.uiState = nextState;
    appShellEl.dataset.uiState = nextState;
    if (nextState !== "idle") appShellEl.dataset.manualPaste = "false";
    loadingStateEl.hidden = nextState !== "loading";
    pasteFromClipboardBtn.disabled = nextState === "loading";
    pasteFromClipboardBtn.textContent = "Paste from clipboard";
    urlInput.readOnly = !prefersNativePaste && nextState === "idle" && !commandPanelEl?.classList.contains("manual");

    if (title) loadingTitleEl.textContent = title;
    if (detail) loadingDetailEl.textContent = detail;
  };

  // Overlapping startViewTransition calls throw InvalidStateError in Chromium if a
  // prior transition hasn't settled yet; the DOM update still applies, so just
  // swallow the rejection instead of leaving it unhandled.
  if (document.startViewTransition && previousState !== nextState) {
    const transition = document.startViewTransition(applyState);
    transition.finished.catch(() => {});
    transition.ready.catch(() => {});
    return;
  }
  applyState();
}

export function setManualPasteMode(enabled) {
  commandPanelEl?.classList.toggle("manual", enabled);
  urlInput.readOnly = !prefersNativePaste && state.uiState === "idle" && !enabled;
}
