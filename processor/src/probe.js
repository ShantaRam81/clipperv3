import { statusError } from "./http.js";
import { detectProvider } from "./providers/shared.js";
import { discoverBehanceVideos } from "./providers/behance.js";
import { probeGeneric, enrichGenericOption } from "./providers/ytdlpGeneric.js";
import { enrichAdobeCcvOption } from "./providers/adobeCcv.js";
import { createGifProbeResult, discoverPageGifs } from "./providers/gif.js";
import { isGif } from "./providers/shared.js";
import { getYtdlpInfo } from "./command.js";
import { getPreviewSource } from "./media.js";

export async function refreshPreview(sourceUrlValue, validateUrl) {
  const parsedUrl = validateUrl(sourceUrlValue);
  if (/^https?:\/\/.+\.(mp4|webm|mov)(\?|$)/i.test(parsedUrl.href)) {
    return { previewUrl: parsedUrl.href, previewKind: "direct", provider: detectProvider(parsedUrl.href) };
  }
  const info = await getYtdlpInfo(parsedUrl.href);
  const preview = getPreviewSource(info);
  if (!preview.url) throw statusError("Не удалось получить временную ссылку для предпросмотра.", 502);
  return { previewUrl: preview.url, previewKind: preview.kind, provider: detectProvider(parsedUrl.href) };
}

export async function probeSource(sourceUrlValue, validateUrl, options = {}) {
  const parsedUrl = validateUrl(sourceUrlValue);
  const provider = detectProvider(parsedUrl.href);
  const includeEmbedded = options.includeEmbedded !== false;
  const includeGifs = options.includeGifs === true;

  if (isGif(parsedUrl.href)) {
    if (!includeGifs) throw statusError("Это GIF-файл. Включите GIF files перед вставкой ссылки.", 400);
    return createGifProbeResult(parsedUrl.href, 0);
  }

  if (provider === "Behance") {
    const candidates = await discoverBehanceVideos(parsedUrl.href, { includeEmbedded, includeGifs });
    if (!candidates.length) throw statusError("В этом Behance-кейсе не найдено поддерживаемое видео или GIF.", 404);
    const enriched = await enrichOptions(candidates);
    return {
      ...enriched[0],
      options: enriched,
      pageUrl: parsedUrl.href,
      message: `Найдено медиа в кейсе: ${enriched.length}. Выберите нужный файл.`
    };
  }

  try {
    return await probeGeneric(parsedUrl.href, provider);
  } catch (error) {
    const gifCandidates = includeGifs ? await discoverPageGifs(parsedUrl.href).catch(() => []) : [];
    if (gifCandidates.length) {
      const enriched = gifCandidates.map((candidate, index) => createGifProbeResult(candidate.url, index));
      return {
        ...enriched[0],
        options: enriched,
        pageUrl: parsedUrl.href,
        message: `Найдено GIF на странице: ${enriched.length}. Выберите нужный файл.`
      };
    }
    throw error;
  }
}

async function enrichOptions(options) {
  const enriched = [];
  const fallback = [];
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    try {
      if (option.mediaType === "gif" || isGif(option.url)) {
        enriched.push(createGifProbeResult(option.url, index));
        continue;
      }
      if (option.provider === "Adobe CCV") {
        enriched.push(await enrichAdobeCcvOption(option, index));
        continue;
      }
      enriched.push(await enrichGenericOption(option, index));
    } catch {
      fallback.push({
        id: `${option.provider.toLowerCase()}-${index}`,
        url: option.url,
        provider: option.provider,
        title: `${option.provider} video ${index + 1}`,
        duration: 30,
        thumbnail: "",
        canDownload: true
      });
    }
  }
  return enriched.length ? enriched : fallback;
}
