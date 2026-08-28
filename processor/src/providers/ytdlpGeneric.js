import { getYtdlpInfo } from "../command.js";
import { getPreviewSource } from "../media.js";

// Handles any source yt-dlp natively supports: YouTube, Vimeo, direct video pages, etc.
export async function probeGeneric(url, provider) {
  const info = await getYtdlpInfo(url);
  const preview = getPreviewSource(info);
  return {
    url,
    previewUrl: preview.url,
    previewKind: preview.kind,
    provider,
    title: info.title || "",
    duration: Number(info.duration || 30),
    thumbnail: info.thumbnail || "",
    canDownload: true
  };
}

export async function enrichGenericOption(option, index) {
  const info = await getYtdlpInfo(option.url);
  const preview = getPreviewSource(info);
  return {
    id: `${option.provider.toLowerCase()}-${index}`,
    url: option.url,
    previewUrl: preview.url,
    previewKind: preview.kind,
    provider: option.provider,
    title: info.title || `${option.provider} video ${index + 1}`,
    duration: Number(info.duration || 30),
    thumbnail: info.thumbnail || "",
    canDownload: true
  };
}
