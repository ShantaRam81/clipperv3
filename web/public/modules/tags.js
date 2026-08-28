import { hashtagOptionsEl, addTagOptionBtn, tagChipsEl, tagInput, tagSuggestionsEl } from "./dom.js";
import { state } from "./state.js";
import { sanitizeTag } from "./api.js";

export function toggleTag(value) {
  const tag = sanitizeTag(value);
  if (!tag) return;
  if (state.selectedTags.includes(tag)) {
    removeTag(tag);
    return;
  }
  state.selectedTags.push(tag);
  renderTags();
}

export function addCustomTag() {
  const value = window.prompt?.("Tag name");
  if (!value) return;
  const tag = sanitizeTag(value);
  if (!tag) return;
  if (!state.configuredTags.includes(tag)) {
    state.configuredTags.push(tag);
    renderHashtagOptions();
  }
  addTag(tag);
}

export async function loadHashtags() {
  try {
    const response = await fetch("/hashtags.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Hashtags config not found.");
    const data = await response.json();
    const nextTags = Array.isArray(data.tags) ? data.tags.map(sanitizeTag).filter(Boolean) : [];
    const nextSelected = Array.isArray(data.selected) ? data.selected.map(sanitizeTag).filter(Boolean) : [];
    if (nextTags.length) state.configuredTags = [...new Set(nextTags)];
    if (nextSelected.length) state.selectedTags = [...new Set(nextSelected)];
  } catch {
    state.configuredTags = state.configuredTags.map(sanitizeTag).filter(Boolean);
  }
  renderHashtagOptions();
}

export function renderHashtagOptions() {
  if (!hashtagOptionsEl) return;
  const addButton = addTagOptionBtn;
  hashtagOptionsEl.innerHTML = "";
  for (const tag of state.configuredTags) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hashtag-option";
    button.dataset.tag = tag;
    button.textContent = tag;
    button.addEventListener("click", () => toggleTag(tag));
    hashtagOptionsEl.append(button);
  }
  if (addButton) hashtagOptionsEl.append(addButton);
}

export function handleTagKeydown(event) {
  if (event.key !== "Enter" && event.key !== ",") return;
  event.preventDefault();
  addTag(tagInput.value);
}

export function addTag(value) {
  const tag = sanitizeTag(value);
  if (!tag) return;
  if (!state.selectedTags.includes(tag)) state.selectedTags.push(tag);
  tagInput.value = "";
  renderTags();
}

export function removeTag(tag) {
  state.selectedTags = state.selectedTags.filter((item) => item !== tag);
  renderTags();
}

export function renderTags() {
  if (!tagChipsEl) return;
  tagChipsEl.innerHTML = "";
  for (const tag of state.selectedTags) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = tag;
    button.title = "Убрать тег";
    button.addEventListener("click", () => removeTag(tag));
    tagChipsEl.append(button);
  }
  hashtagOptionsEl?.querySelectorAll(".hashtag-option[data-tag]").forEach((button) => {
    button.classList.toggle("active", state.selectedTags.includes(sanitizeTag(button.dataset.tag)));
  });

  if (!tagSuggestionsEl) return;
  tagSuggestionsEl.innerHTML = "";
  for (const tag of state.savedTags) {
    const option = document.createElement("option");
    option.value = tag;
    tagSuggestionsEl.append(option);
  }
}

export function loadSavedTags() {
  try {
    state.savedTags = JSON.parse(localStorage.getItem("clipperV3Tags") || "[]")
      .map(sanitizeTag)
      .filter(Boolean);
  } catch {
    state.savedTags = [];
  }
}

export function rememberSelectedTags() {
  if (!state.selectedTags.length) return;
  state.savedTags = [...new Set([...state.selectedTags, ...state.savedTags])].slice(0, 40);
  localStorage.setItem("clipperV3Tags", JSON.stringify(state.savedTags));
  renderTags();
}
