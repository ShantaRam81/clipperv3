import { urlInput, titleInput, startInput, endInput, qualityInput, soundEnabledInput } from "./dom.js";
import { state } from "./state.js";
import { fetchJson, suggestedFileName } from "./api.js";
import { setMessage, setSaveBusy } from "./ui.js";
import { rememberSelectedTags } from "./tags.js";
import { showToast } from "./toast.js";

async function chooseSaveFileHandle(fileName) {
  if (!("showSaveFilePicker" in window)) return undefined;
  setMessage("Выберите папку и имя файла...");
  const isGif = /\.gif$/i.test(fileName || "");
  try {
    return await window.showSaveFilePicker({
      suggestedName: fileName || "clip.mp4",
      types: [{
        description: isGif ? "GIF image" : "MP4 video",
        accept: isGif ? { "image/gif": [".gif"] } : { "video/mp4": [".mp4"] }
      }]
    });
  } catch (error) {
    if (error.name === "AbortError") {
      setMessage("Сохранение отменено.");
      return null;
    }
    return undefined;
  }
}

function triggerDownload(url, fileName) {
  if (!url) return;
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName || "clip.mp4";
  link.rel = "noreferrer";
  document.body.append(link);
  link.click();
  link.remove();
}

async function saveFileToDevice(url, fileName, fileHandle) {
  if (!url) throw new Error("Сервер не вернул ссылку на готовый фрагмент.");

  if (fileHandle) {
    try {
      setMessage("Скачиваю фрагмент...");
      const response = await fetch(url);
      if (!response.ok) throw new Error("Не удалось скачать готовый фрагмент.");
      const blob = await response.blob();
      const writable = await fileHandle.createWritable();
      try {
        await writable.write(blob);
      } finally {
        await writable.close();
      }
      setMessage("Фрагмент сохранен на устройство.");
      showToast("Фрагмент успешно сохранён", { type: "success" });
      return;
    } catch {
      setMessage("Браузер запретил запись в выбранную папку, запускаю обычное скачивание...");
    }
  }

  triggerDownload(url, fileName);
  setMessage("Фрагмент скачивается на это устройство.");
  showToast("Скачивание началось", { type: "success" });
}

export async function saveClip(event) {
  event.preventDefault();
  if (state.isSaving) return;
  state.isSaving = true;
  setSaveBusy(true);

  try {
    const fileName = suggestedFileName(titleInput.value, state.selectedTags, state.selectedMediaType === "gif" ? "gif" : "mp4");
    rememberSelectedTags();
    const fileHandle = await chooseSaveFileHandle(fileName);
    if (fileHandle === null) return;

    setMessage("Готовлю фрагмент...");
    const clip = await fetchJson("/api/clips", {
      method: "POST",
      body: JSON.stringify({
        url: urlInput.value,
        sourceUrl: state.selectedSourceUrl || urlInput.value,
        title: fileName.replace(/\.(?:mp4|gif)$/i, ""),
        start: startInput.value,
        end: endInput.value,
        quality: qualityInput.value,
        includeAudio: soundEnabledInput?.checked !== false,
        mediaType: state.selectedMediaType
      })
    });
    await saveFileToDevice(clip.downloadUrl || clip.href, fileName, fileHandle);
  } catch (error) {
    setMessage(error.message);
    showToast(error.message || "Не удалось сохранить фрагмент", { type: "error" });
  } finally {
    state.isSaving = false;
    setSaveBusy(false);
  }
}
