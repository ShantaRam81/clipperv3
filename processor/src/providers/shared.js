export function detectProvider(value) {
  const host = new URL(value).hostname.replace(/^www\./, "");
  if (host.includes("youtube.com") || host.includes("youtu.be")) return "YouTube";
  if (host.includes("vimeo.com")) return "Vimeo";
  if (host.includes("behance.net")) return "Behance";
  return host;
}

export function isGif(value) {
  return /\.gif(?:\?|$)/i.test(value) || /giphy\.com/i.test(value);
}

export function decodeHtmlEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, "/")
    .replace(/&#47;/g, "/")
    .replace(/&amp;/g, "&");
}

export function matchFirst(value, pattern) {
  const match = value.match(pattern);
  return match ? match[1].replace(/&amp;/g, "&") : "";
}

export function sanitizeTitle(value) {
  return String(value).trim().replace(/\s+/g, " ").slice(0, 90) || "Untitled reference";
}

export function safeFileName(value) {
  return sanitizeTitle(value)
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/giu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "reference";
}

export function parseTime(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  const parts = value.split(":").map(Number);
  if (parts.some((part) => Number.isNaN(part))) return Number(value) || 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

export async function fetchPage(pageUrl) {
  const response = await fetch(pageUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ClipperV3/1.0",
      "Accept": "text/html,application/xhtml+xml"
    }
  });
  return response;
}
