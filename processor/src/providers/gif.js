import { writeFile } from "node:fs/promises";
import { statusError } from "../http.js";
import { isGif } from "./shared.js";

export function createGifProbeResult(url, index = 0) {
  return {
    id: `gif-${index}`,
    url,
    previewUrl: url,
    previewKind: "image",
    provider: "GIF",
    title: gifTitleFromUrl(url, index),
    duration: 1,
    thumbnail: url,
    canDownload: true,
    mediaType: "gif"
  };
}

export function gifTitleFromUrl(url, index = 0) {
  try {
    const pathname = new URL(url).pathname;
    const name = decodeURIComponent(pathname.split("/").pop() || "");
    return name.replace(/\.gif$/i, "") || `GIF ${index + 1}`;
  } catch {
    return `GIF ${index + 1}`;
  }
}

export function addGifCandidate(candidates, url) {
  const cleanUrl = url.replace(/&amp;/g, "&");
  if (!isGif(cleanUrl)) return;
  candidates.set(`gif:${cleanUrl}`, { url: cleanUrl, provider: "GIF", mediaType: "gif" });
}

export async function discoverPageGifs(pageUrl) {
  const { fetchPage, decodeHtmlEntities } = await import("./shared.js");
  const response = await fetchPage(pageUrl);
  if (!response.ok) return [];
  const html = decodeHtmlEntities((await response.text()).replace(/\\\//g, "/").replace(/\\u002F/g, "/"));
  const candidates = new Map();
  for (const match of html.matchAll(/https?:\/\/[^"'<> ]+\.gif(?:\?[^"'<> ]*)?/gi)) {
    addGifCandidate(candidates, match[0]);
  }
  for (const match of html.matchAll(/"[^"]+"\s*:\s*"([^"]+\.gif(?:\?[^"]*)?)"/gi)) {
    addGifCandidate(candidates, match[1]);
  }
  return [...candidates.values()];
}

export async function downloadGifFile(sourceUrl, outputPath) {
  const response = await fetch(sourceUrl, {
    headers: { "User-Agent": "Mozilla/5.0 ClipperV3/1.0", "Accept": "image/gif,image/*,*/*" }
  });
  if (!response.ok) throw statusError(`Не удалось скачать GIF: статус ${response.status}.`, 502);
  const data = Buffer.from(await response.arrayBuffer());
  if (!data.length) throw statusError("GIF скачался пустым файлом.", 502);
  await writeFile(outputPath, data);
}
