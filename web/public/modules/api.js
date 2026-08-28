export async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Ошибка запроса");
  return data;
}

export function inlinePlaceholder() {
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 90'%3E%3Crect width='160' height='90' fill='%2318191c'/%3E%3Cpath d='M68 30l30 15-30 15z' fill='%238b8d96'/%3E%3C/svg%3E";
}

export function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${rest.toFixed(1).padStart(4, "0")}`;
}

export function formatTimeShort(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds - minutes * 60);
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function parseTime(value) {
  const clean = String(value).replace(",", ".").trim();
  if (!clean.includes(":")) return Number(clean) || 0;
  return clean.split(":").map(Number).reduce((total, part) => total * 60 + part, 0);
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function directVideoUrl(url) {
  return /^https?:\/\/.+\.(mp4|webm|mov)(\?|$)/i.test(url) ? url : "";
}

export function isGifUrl(url) {
  return /^https?:\/\/.+\.gif(\?|$)/i.test(url);
}

export function inferPreviewKind(url) {
  const value = String(url || "");
  if (!value) return "";
  if (/\.m3u8(\?|$)/i.test(value) || /\/playlist\//i.test(value)) return "hls";
  return "direct";
}

export function slugFilePart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/giu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

export function suggestedFileName(title, tags = [], extension = "mp4") {
  const tagPrefix = tags.map(slugFilePart).filter(Boolean).join("_");
  const clean = slugFilePart(title || "reference-clip");
  return `${tagPrefix ? `${tagPrefix}__` : ""}${clean || "reference-clip"}.${extension}`;
}

export function sanitizeTag(value) {
  return String(value || "")
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9а-яё_-]+/giu, "")
    .slice(0, 28);
}
