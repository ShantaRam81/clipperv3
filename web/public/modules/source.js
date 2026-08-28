import {
  urlInput, titleInput, sourceTitleEl, sourceMetaEl, thumbnailEl, heroImageEl,
  previewEl, videoOptionsEl, startRange, endRange, filmFramesEl
} from "./dom.js";
import { state } from "./state.js";
import { fetchJson, inlinePlaceholder, formatTime, isGifUrl, directVideoUrl, inferPreviewKind } from "./api.js";
import { setUiState, setMessage } from "./ui.js";
import { syncRange } from "./timeline.js";
import { resetPreviewVideo } from "./preview.js";
import { showToast } from "./toast.js";

function filterMediaOptions(options, includeGifsInput) {
  const includeGifs = includeGifsInput?.checked === true;
  return options.filter((option) => includeGifs || !(option.mediaType === "gif" || isGifUrl(option.url)));
}

export async function probeSource({ includeEmbeddedInput, includeGifsInput }) {
  const token = ++state.probeToken;
  setUiState("loading", "Загрузка", "Собираю предпросмотр и таймлайн.");
  setMessage("Получаю метаданные...");
  try {
    const data = await fetchJson("/api/probe", {
      method: "POST",
      body: JSON.stringify({
        url: urlInput.value,
        includeEmbedded: includeEmbeddedInput?.checked !== false,
        includeGifs: includeGifsInput?.checked === true
      })
    });
    if (token !== state.probeToken) return;

    const options = filterMediaOptions(data.options?.length ? data.options : [data], includeGifsInput);
    if (!options.length) {
      throw new Error("GIF files выключен. Включите его перед вставкой, если нужны GIF.");
    }
    state.showingAllOptions = false;
    renderVideoOptions(options, includeGifsInput);
    await applySource(options[0]);
    setMessage(data.message || "Источник распознан.");
    setUiState("ready");
  } catch (error) {
    setUiState(state.selectedSourceUrl ? "ready" : "idle");
    setMessage(error.message);
    showToast(error.message || "Не удалось распознать источник", { type: "error" });
  }
}

export function renderVideoOptions(options, includeGifsInput) {
  state.currentOptions = filterMediaOptions(options, includeGifsInput);
  videoOptionsEl.innerHTML = "";
  videoOptionsEl.hidden = !state.currentOptions.length;
  if (!state.currentOptions.length) return;

  const visibleOptions = state.showingAllOptions ? state.currentOptions : state.currentOptions.slice(0, 5);
  for (const [index, option] of visibleOptions.entries()) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `video-option${index === 0 ? " active" : ""}`;
    item.innerHTML = `
      <input type="radio" name="videoOption" ${index === 0 ? "checked" : ""}>
      <img alt="">
      <div>
        <strong></strong>
        <span></span>
      </div>
    `;
    item.querySelector("img").src = option.thumbnail || inlinePlaceholder();
    item.querySelector("strong").textContent = option.title || `${option.mediaType === "gif" ? "GIF" : "Видео"} ${index + 1}`;
    item.querySelector("span").textContent = option.mediaType === "gif"
      ? "GIF"
      : `${option.provider} · ${formatTime(option.duration || 30)}`;
    item.addEventListener("click", () => {
      for (const sibling of videoOptionsEl.querySelectorAll(".video-option")) {
        sibling.classList.remove("active");
        sibling.querySelector("input").checked = false;
      }
      item.classList.add("active");
      item.querySelector("input").checked = true;
      setUiState("loading", "Переключение", "Обновляю таймлайн.");
      applySource(option)
        .then(() => {
          setUiState("ready");
          setMessage(`Выбрано: ${option.title || option.provider}`);
        })
        .catch((error) => {
          setUiState("ready");
          setMessage(error?.message || "Не удалось переключить источник.");
        });
    });
    videoOptionsEl.append(item);
  }

  if (state.currentOptions.length > visibleOptions.length) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "video-option more-option";
    more.textContent = `Показать все медиа (${state.currentOptions.length})`;
    more.addEventListener("click", () => {
      state.showingAllOptions = true;
      renderVideoOptions(state.currentOptions, includeGifsInput);
    });
    videoOptionsEl.append(more);
  } else if (state.currentOptions.length > 5) {
    const less = document.createElement("button");
    less.type = "button";
    less.className = "video-option more-option";
    less.textContent = "Свернуть список";
    less.addEventListener("click", () => {
      state.showingAllOptions = false;
      renderVideoOptions(state.currentOptions, includeGifsInput);
    });
    videoOptionsEl.append(less);
  }
}

export async function applySource(data) {
  state.selectedSourceUrl = data.url || urlInput.value;
  state.selectedMediaType = data.mediaType === "gif" || isGifUrl(state.selectedSourceUrl) ? "gif" : "video";
  state.selectedPreviewUrl = data.previewUrl || directVideoUrl(state.selectedSourceUrl);
  state.selectedPreviewKind = data.previewKind || inferPreviewKind(state.selectedPreviewUrl);
  state.sourceDuration = Math.max(1, Number(data.duration || 30));
  startRange.max = state.sourceDuration;
  endRange.max = state.sourceDuration;
  startRange.value = 0;
  endRange.value = Math.min(5, state.sourceDuration);
  titleInput.value = titleInput.value || data.title || "";
  sourceTitleEl.textContent = data.title || data.provider || "Источник";
  sourceMetaEl.textContent = state.selectedMediaType === "gif" ? "GIF" : `${data.provider} · ${formatTime(state.sourceDuration)}`;
  thumbnailEl.src = data.thumbnail || inlinePlaceholder();
  const imagePreview = state.selectedMediaType === "gif"
    ? state.selectedPreviewUrl || state.selectedSourceUrl || data.thumbnail || inlinePlaceholder()
    : data.thumbnail || inlinePlaceholder();
  heroImageEl.src = imagePreview;
  renderFilmFrames(imagePreview);
  state.currentFilmstripUrl = state.selectedSourceUrl;
  if (state.selectedMediaType === "gif") {
    resetPreviewVideo();
  } else {
    await buildInitialFilmstrip(state.selectedSourceUrl, state.sourceDuration, state.selectedPreviewUrl);
    resetPreviewVideo();
  }
  previewEl.hidden = false;
  syncRange("range");
}

function renderFilmFrames(thumbnail) {
  filmFramesEl.innerHTML = "";
  const count = 9;
  for (let index = 0; index < count; index += 1) {
    const frame = document.createElement("span");
    frame.className = "film-frame";
    frame.style.setProperty("--thumb", `url("${thumbnail}")`);
    frame.style.backgroundPosition = `${Math.round((index / Math.max(1, count - 1)) * 100)}% center`;
    filmFramesEl.append(frame);
  }
}

function updateGeneratedThumbnail(src) {
  if (!src) return;
  thumbnailEl.src = src;
  heroImageEl.src = src;
  const activeOptionImage = videoOptionsEl.querySelector(".video-option.active img");
  if (activeOptionImage) activeOptionImage.src = src;
}

function renderGeneratedFilmFrames(frames) {
  updateGeneratedThumbnail(frames[0]);
  filmFramesEl.innerHTML = "";
  for (const src of frames) {
    const frame = document.createElement("span");
    frame.className = "film-frame";
    frame.style.setProperty("--thumb", `url("${src}")`);
    filmFramesEl.append(frame);
  }
}

async function buildServerFilmstrip(url, duration) {
  const filmstripKey = url;
  const data = await fetchJson("/api/frames", {
    method: "POST",
    body: JSON.stringify({ url, duration, count: 9 })
  });
  const frames = Array.isArray(data.frames) ? data.frames.filter(Boolean) : [];
  if (!frames.length || state.currentFilmstripUrl !== filmstripKey) return;
  renderGeneratedFilmFrames(frames);
}

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

async function buildVideoFilmstrip(url) {
  if (!directVideoUrl(url)) return;

  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = url;

  await waitForVideoEvent(video, "loadedmetadata", 5000);
  const duration = Math.min(video.duration || state.sourceDuration, state.sourceDuration);
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext("2d");
  const frames = [];

  for (let index = 0; index < 9; index += 1) {
    video.currentTime = Math.min(duration - 0.05, (duration * (index + 0.5)) / 9);
    await waitForVideoEvent(video, "seeked", 4000);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push(canvas.toDataURL("image/jpeg", 0.88));
  }

  if (state.currentFilmstripUrl !== url) return;
  updateGeneratedThumbnail(frames[0]);
  filmFramesEl.innerHTML = "";
  for (const src of frames) {
    const frame = document.createElement("span");
    frame.className = "film-frame";
    frame.style.setProperty("--thumb", `url("${src}")`);
    filmFramesEl.append(frame);
  }
}

async function buildInitialFilmstrip(sourceUrl, duration, previewUrl) {
  try {
    await buildServerFilmstrip(sourceUrl, duration);
  } catch {
    state.currentFilmstripUrl = previewUrl;
    if (previewUrl) await buildVideoFilmstrip(previewUrl).catch(() => {});
  }
}
