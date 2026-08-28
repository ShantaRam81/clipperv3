import { urlInput, appShellEl, commandPanelEl } from "./dom.js";
import { state, prefersNativePaste } from "./state.js";
import { setUiState, setMessage, setManualPasteMode } from "./ui.js";

function readClipboardText() {
  const timeout = new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error("Clipboard timeout")), 1500);
  });
  return Promise.race([navigator.clipboard.readText(), timeout]);
}

export async function pasteFromClipboard(event, { probeSource }) {
  event?.preventDefault();
  event?.stopPropagation();

  if (!navigator.clipboard?.readText) {
    setMessage("Браузер не дал доступ к буферу. Скопируйте ссылку и попробуйте еще раз.");
    return;
  }

  setMessage("Читаю буфер обмена...");
  try {
    const value = (await readClipboardText()).trim();
    if (!value) {
      setUiState("idle");
      setMessage("Буфер обмена пуст. Скопируйте ссылку и нажмите Paste from clipboard еще раз.");
      setManualPasteMode(false);
      return;
    }
    setManualPasteMode(false);
    appShellEl.dataset.manualPaste = "false";
    urlInput.value = value;
    await probeSource();
  } catch {
    setUiState("idle");
    setMessage("Не удалось прочитать буфер. Проверьте разрешение вставки и нажмите еще раз.");
  }
}

export function handlePasteRowClick(event, deps) {
  if (state.uiState === "loading") return;
  if (event.target === urlInput && (prefersNativePaste || commandPanelEl?.classList.contains("manual"))) return;
  pasteFromClipboard(event, deps);
}
