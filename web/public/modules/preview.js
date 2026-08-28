import { previewVideoEl, heroImageEl, startRange, endInput, startInput } from "./dom.js";
import { state } from "./state.js";
import { fetchJson, inferPreviewKind } from "./api.js";
import { setMessage } from "./ui.js";

function waitForVideoEvent(video, eventName, timeout) {
  return new Promise((resolveEvent, rejectEvent) => {
    const timer = setTimeout(() => cleanup(rejectEvent), timeout);
    const onEvent = () => cleanup(resolveEvent);
    const onError = () => cleanup(rejectEvent);
    const cleanup = (finish) => {
      clearTimeout(timer);
      video.removeEventListener(eventName, onEvent);
      video.removeEventListener("error", onError);
      finish();
    };
    video.addEventListener(eventName, onEvent, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

export function teardownPreviewPlayer() {
  if (state.hlsPlayer) {
    state.hlsPlayer.destroy();
    state.hlsPlayer = null;
  }
}

export function resetPreviewVideo() {
  teardownPreviewPlayer();
  previewVideoEl.pause();
  previewVideoEl.removeAttribute("src");
  previewVideoEl.load();
  previewVideoEl.hidden = true;
}

async function waitForPreviewReady() {
  if (previewVideoEl.readyState >= 1) return;
  await waitForVideoEvent(previewVideoEl, "loadedmetadata", 10000);
}

async function loadPreviewMedia(previewUrl) {
  if (!previewUrl) return;
  const nextKind = state.selectedPreviewKind || inferPreviewKind(previewUrl);
  teardownPreviewPlayer();

  if (nextKind === "hls") {
    const canPlayNativeHls = previewVideoEl.canPlayType("application/vnd.apple.mpegurl");
    if (canPlayNativeHls) {
      if (previewVideoEl.src !== previewUrl) {
        previewVideoEl.src = previewUrl;
        await waitForPreviewReady();
      }
      return;
    }

    if (window.Hls?.isSupported?.()) {
      state.hlsPlayer = new window.Hls({ enableWorker: true, lowLatencyMode: false });
      state.hlsPlayer.attachMedia(previewVideoEl);
      await new Promise((resolveLoad, rejectLoad) => {
        const onAttached = () => {
          state.hlsPlayer.off(window.Hls.Events.MEDIA_ATTACHED, onAttached);
          state.hlsPlayer.loadSource(previewUrl);
        };
        const onManifest = () => {
          state.hlsPlayer.off(window.Hls.Events.MANIFEST_PARSED, onManifest);
          state.hlsPlayer.off(window.Hls.Events.ERROR, onError);
          resolveLoad();
        };
        const onError = (_event, data) => {
          if (data?.fatal) {
            state.hlsPlayer.off(window.Hls.Events.MEDIA_ATTACHED, onAttached);
            state.hlsPlayer.off(window.Hls.Events.MANIFEST_PARSED, onManifest);
            state.hlsPlayer.off(window.Hls.Events.ERROR, onError);
            rejectLoad(new Error("Не удалось открыть HLS-предпросмотр."));
          }
        };
        state.hlsPlayer.on(window.Hls.Events.MEDIA_ATTACHED, onAttached);
        state.hlsPlayer.on(window.Hls.Events.MANIFEST_PARSED, onManifest);
        state.hlsPlayer.on(window.Hls.Events.ERROR, onError);
      });
      return;
    }

    throw new Error("Этот браузер не поддерживает HLS-предпросмотр.");
  }

  if (previewVideoEl.src !== previewUrl) {
    previewVideoEl.src = previewUrl;
    await waitForPreviewReady();
  }
}

async function getPreviewSource() {
  if (state.selectedPreviewUrl) return state.selectedPreviewUrl;
  setMessage("Получаю временный поток для предпросмотра...");
  try {
    const data = await fetchJson("/api/preview", {
      method: "POST",
      body: JSON.stringify({ url: state.selectedSourceUrl })
    });
    state.selectedPreviewUrl = data.previewUrl || "";
    state.selectedPreviewKind = data.previewKind || inferPreviewKind(state.selectedPreviewUrl);
    return state.selectedPreviewUrl;
  } catch (error) {
    setMessage(error.message);
    return "";
  }
}

export async function playSelectedPreview() {
  if (!state.selectedSourceUrl) {
    setMessage("Сначала вставьте ссылку и выберите видео.");
    return;
  }
  if (state.selectedMediaType === "gif") {
    heroImageEl.src = state.selectedPreviewUrl || state.selectedSourceUrl;
    previewVideoEl.hidden = true;
    setMessage("GIF уже отображается в предпросмотре.");
    return;
  }

  const previewUrl = await getPreviewSource();
  if (!previewUrl) return;

  const start = Number(startRange.value);
  await loadPreviewMedia(previewUrl);
  previewVideoEl.hidden = false;
  previewVideoEl.currentTime = start;

  try {
    await previewVideoEl.play();
    setMessage(`Предпросмотр: ${startInput.value} - ${endInput.value}`);
  } catch {
    setMessage("Не удалось запустить предпросмотр. Попробуйте сохранить фрагмент или обновить временную ссылку.");
  }
}
