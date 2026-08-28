import { statusError } from "../http.js";
import { fetchPage, decodeHtmlEntities, isGif } from "./shared.js";
import { addGifCandidate } from "./gif.js";

function normalizeVimeoUrl(url) {
  const cleanUrl = url.replace(/&amp;/g, "&");
  try {
    const parsed = new URL(cleanUrl);
    const playerId = parsed.hostname.includes("player.vimeo.com")
      ? parsed.pathname.match(/\/video\/(\d+)/)?.[1]
      : "";
    if (playerId) {
      const hash = parsed.searchParams.get("h");
      return hash ? cleanUrl : `https://vimeo.com/${playerId}`;
    }
  } catch {
    return cleanUrl;
  }
  return cleanUrl;
}

function isVimeoPlayerUrl(value) {
  try {
    return new URL(value).hostname.includes("player.vimeo.com");
  } catch {
    return false;
  }
}

function getVideoCandidateKey(url, provider) {
  if (provider !== "Vimeo") return url;
  try {
    const parsed = new URL(url);
    const playerId = parsed.hostname.includes("player.vimeo.com")
      ? parsed.pathname.match(/\/video\/(\d+)/)?.[1]
      : "";
    const pageMatch = parsed.hostname.includes("vimeo.com")
      ? parsed.pathname.match(/^\/(\d+)(?:\/([^/?#]+))?/)
      : null;
    const id = playerId || pageMatch?.[1] || url;
    const hash = parsed.searchParams.get("h") || pageMatch?.[2] || "";
    return `vimeo:${id}:${hash}`;
  } catch {
    return url;
  }
}

function addVideoCandidate(candidates, url, provider) {
  const cleanUrl = provider === "Vimeo" ? normalizeVimeoUrl(url) : url.replace(/&amp;/g, "&");
  if (isGif(cleanUrl)) return;
  const key = getVideoCandidateKey(cleanUrl, provider);
  const current = candidates.get(key);
  if (provider === "Vimeo" && current && isVimeoPlayerUrl(current.url) && !isVimeoPlayerUrl(cleanUrl)) return;
  candidates.set(key, { url: cleanUrl, provider });
}

function readBehancePlayerConfigs(html) {
  const configs = [];
  let offset = 0;
  while (offset < html.length) {
    const marker = html.indexOf("window.playerConfig", offset);
    if (marker === -1) break;
    const jsonStart = html.indexOf("{", marker);
    const scriptEnd = html.indexOf("</script>", jsonStart);
    if (jsonStart === -1 || scriptEnd === -1) break;
    const raw = html.slice(jsonStart, scriptEnd).trim().replace(/;$/, "").trim();
    try {
      configs.push(JSON.parse(raw));
    } catch {
      // ignore malformed player config blocks
    }
    offset = scriptEnd + 9;
  }
  return configs;
}

function addEmbeddedConfigCandidate(candidates, config) {
  const video = config?.video || {};
  if (typeof video.share_url === "string" && video.share_url) {
    addVideoCandidate(candidates, video.share_url, "Vimeo");
  }
  if (typeof video.embed_code === "string" && video.embed_code) {
    for (const match of video.embed_code.matchAll(/https?:\/\/player\.vimeo\.com\/video\/\d+[^"'<>\\\s]*/gi)) {
      addVideoCandidate(candidates, match[0], "Vimeo");
    }
  }
  if (video.id) {
    const id = String(video.id);
    const hash = typeof video.unlisted_hash === "string" ? video.unlisted_hash : "";
    addVideoCandidate(candidates, hash ? `https://player.vimeo.com/video/${id}?h=${hash}` : `https://vimeo.com/${id}`, "Vimeo");
  }
}

function addEmbeddedCandidates(html, candidates, options = {}) {
  const includeGifs = options.includeGifs === true;
  for (const match of html.matchAll(/https?:\/\/player\.vimeo\.com\/video\/\d+[^"'<>\\\s]*/gi)) {
    addVideoCandidate(candidates, match[0], "Vimeo");
  }
  for (const match of html.matchAll(/https?:\/\/(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]+)/gi)) {
    addVideoCandidate(candidates, `https://www.youtube.com/watch?v=${match[1]}`, "YouTube");
  }
  for (const match of html.matchAll(/https?:\/\/www-ccv\.adobe\.io\/v1\/player\/ccv\/([a-zA-Z0-9_-]+)\/embed[^"'<> ]*/gi)) {
    addVideoCandidate(candidates, `https://www-ccv.adobe.io/v1/player/ccv/${match[1]}/embed?api_key=behance1`, "Adobe CCV");
  }
  for (const config of readBehancePlayerConfigs(html)) {
    addEmbeddedConfigCandidate(candidates, config);
  }
  for (const match of html.matchAll(/"embedUrl"\s*:\s*"([^"]*player\.vimeo\.com\/video\/[^"]+)"/gi)) {
    addVideoCandidate(candidates, match[1], "Vimeo");
  }
  if (includeGifs) {
    for (const match of html.matchAll(/"[^"]+"\s*:\s*"([^"]+\.gif(?:\?[^"]*)?)"/gi)) {
      addGifCandidate(candidates, match[1]);
    }
  }
}

export async function discoverBehanceVideos(pageUrl, options = {}) {
  const includeEmbedded = options.includeEmbedded !== false;
  const includeGifs = options.includeGifs === true;
  const response = await fetchPage(pageUrl);
  if (!response.ok) throw statusError(`Behance вернул статус ${response.status}.`, 502);

  const html = decodeHtmlEntities((await response.text()).replace(/\\\//g, "/").replace(/\\u002F/g, "/"));
  const candidates = new Map();

  for (const match of html.matchAll(/https?:\/\/(?:www\.)?vimeo\.com\/(?:video\/)?(\d+)(?:[/?#][^"'<>\\\s]*)?/gi)) {
    addVideoCandidate(candidates, `https://vimeo.com/${match[1]}`, "Vimeo");
  }
  for (const match of html.matchAll(/https?:\/\/(?:www\.)?youtube\.com\/watch\?[^"'<> ]*v=([a-zA-Z0-9_-]+)/gi)) {
    addVideoCandidate(candidates, `https://www.youtube.com/watch?v=${match[1]}`, "YouTube");
  }
  for (const match of html.matchAll(/https?:\/\/youtu\.be\/([a-zA-Z0-9_-]+)/gi)) {
    addVideoCandidate(candidates, `https://www.youtube.com/watch?v=${match[1]}`, "YouTube");
  }
  for (const match of html.matchAll(/https?:\/\/[^"'<> ]+\.(?:mp4|webm|mov)(?:\?[^"'<> ]*)?/gi)) {
    addVideoCandidate(candidates, match[0], "Direct video");
  }
  if (includeGifs) {
    for (const match of html.matchAll(/https?:\/\/[^"'<> ]+\.gif(?:\?[^"'<> ]*)?/gi)) {
      addGifCandidate(candidates, match[0]);
    }
  }
  if (includeEmbedded) {
    addEmbeddedCandidates(html, candidates, { includeGifs });
  }

  return [...candidates.values()];
}
