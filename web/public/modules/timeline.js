import {
  startRange, endRange, startInput, endInput, durationInput, rangeLabel, selectedRange,
  timeBubbleEl, previewSelectedRangeEl, rangeTimeLabelsEl, rangeStartLabelEl, rangeEndLabelEl,
  filmstripEl, previewVideoEl
} from "./dom.js";
import { state } from "./state.js";
import { formatTime, formatTimeShort, parseTime, clamp } from "./api.js";

export function syncRange(source) {
  if (source === "text") {
    startRange.value = clamp(parseTime(startInput.value), 0, state.sourceDuration);
    endRange.value = clamp(parseTime(endInput.value), 0, state.sourceDuration);
  }

  let start = Number(startRange.value);
  let end = Number(endRange.value);

  if (end <= start) {
    if (document.activeElement === startRange) {
      start = Math.max(0, end - 0.1);
      startRange.value = start;
    } else {
      end = Math.min(state.sourceDuration, start + 0.1);
      endRange.value = end;
    }
  }

  startInput.value = formatTime(start);
  endInput.value = formatTime(end);
  durationInput.value = `${(end - start).toFixed(1)} сек`;
  rangeLabel.textContent = `${formatTime(start)} - ${formatTime(end)}`;
  timeBubbleEl.textContent = formatTime(end);

  const left = (start / state.sourceDuration) * 100;
  const right = (end / state.sourceDuration) * 100;
  const width = ((end - start) / state.sourceDuration) * 100;
  selectedRange.style.left = `${left}%`;
  selectedRange.style.width = `${width}%`;
  previewSelectedRangeEl.style.left = `${left}%`;
  previewSelectedRangeEl.style.width = `${width}%`;
  rangeTimeLabelsEl.style.setProperty("--range-left", `${left}%`);
  rangeTimeLabelsEl.style.setProperty("--range-right", `${right}%`);
  rangeStartLabelEl.textContent = formatTimeShort(start);
  rangeEndLabelEl.textContent = formatTimeShort(end);
  if (!previewVideoEl.paused) stopPreviewAtEnd();
}

export function stopPreviewAtEnd() {
  if (previewVideoEl.currentTime >= Number(endRange.value)) previewVideoEl.pause();
}

export function handleTimeInputKeydown(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  syncRange("text");
  event.currentTarget.blur();
}

function positionToTime(clientX, rect) {
  const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
  return ratio * state.sourceDuration;
}

export function startTimelineDrag(event) {
  if (!state.selectedSourceUrl) return;
  const rect = filmstripEl.getBoundingClientRect();
  const selectedRect = previewSelectedRangeEl.getBoundingClientRect();
  const start = Number(startRange.value);
  const end = Number(endRange.value);
  const pointerTime = positionToTime(event.clientX, rect);
  const edge = event.target.dataset.edge;
  let mode = edge || "move";

  if (!edge && event.target === previewSelectedRangeEl) {
    if (Math.abs(event.clientX - selectedRect.left) < 18) mode = "start";
    if (Math.abs(event.clientX - selectedRect.right) < 18) mode = "end";
  }

  if (!edge && event.target !== previewSelectedRangeEl) {
    const distanceToStart = Math.abs(pointerTime - start);
    const distanceToEnd = Math.abs(pointerTime - end);
    mode = distanceToStart < distanceToEnd ? "start" : "end";
  }

  state.activeDrag = { mode, rect, pointerStart: pointerTime, start, end, duration: end - start };
  filmstripEl.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  moveTimelineDrag(event);
}

export function moveTimelineDrag(event) {
  if (!state.activeDrag) return;
  const time = positionToTime(event.clientX, state.activeDrag.rect);
  let start = state.activeDrag.start;
  let end = state.activeDrag.end;

  if (state.activeDrag.mode === "start") {
    start = clamp(time, 0, end - 0.1);
  } else if (state.activeDrag.mode === "end") {
    end = clamp(time, start + 0.1, state.sourceDuration);
  } else {
    const delta = time - state.activeDrag.pointerStart;
    start = clamp(state.activeDrag.start + delta, 0, state.sourceDuration - state.activeDrag.duration);
    end = start + state.activeDrag.duration;
  }

  startRange.value = start;
  endRange.value = end;
  syncRange("range");
}

export function stopTimelineDrag() {
  state.activeDrag = null;
}
