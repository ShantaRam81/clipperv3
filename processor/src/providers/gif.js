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

// Behance (and similar CDNs) serve the same GIF at ~25 different sizes/formats
// under one path segment ahead of an otherwise identical filename — e.g.
// .../project_modules/source/abc123.gif and .../project_modules/max_158/abc123.gif
// are the same asset. Rank by that segment and keep only the best variant per
// underlying file, and drop "_still"/"_webp" variants outright since those are
// non-animated or non-GIF and can't be used as an export source.
const GIF_QUALITY_RANK = ["source", "1400_opt_1", "1400", "max_1200", "fs", "hd", "max_632", "disp", "max_316", "max_158"];

function gifVariantInfo(cleanUrl) {
  try {
    const { pathname } = new URL(cleanUrl);
    const segments = pathname.split("/").filter(Boolean);
    const fileName = segments[segments.length - 1] || cleanUrl;
    const variantSegment = segments[segments.length - 2] || "";
    if (/_still$|_webp$/i.test(variantSegment)) return null;
    const rank = GIF_QUALITY_RANK.indexOf(variantSegment);
    return { assetKey: fileName, rank: rank === -1 ? GIF_QUALITY_RANK.length : rank };
  } catch {
    return { assetKey: cleanUrl, rank: 0 };
  }
}

export function addGifCandidate(candidates, url) {
  const cleanUrl = url.replace(/&amp;/g, "&");
  if (!isGif(cleanUrl)) return;

  const variant = gifVariantInfo(cleanUrl);
  if (!variant) return;

  const key = `gif:${variant.assetKey}`;
  const existing = candidates.get(key);
  if (existing && existing.rank <= variant.rank) return;
  candidates.set(key, { url: cleanUrl, provider: "GIF", mediaType: "gif", rank: variant.rank });
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
