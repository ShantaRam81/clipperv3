import { fetchPage, decodeHtmlEntities, matchFirst } from "./shared.js";

export async function enrichAdobeCcvOption(option, index) {
  const response = await fetchPage(option.url);
  if (!response.ok) throw new Error(`Adobe CCV вернул статус ${response.status}`);
  const html = decodeHtmlEntities((await response.text()).replace(/\\\//g, "/"));
  const mp4Url = matchFirst(html, /"mp4URL"\s*:\s*"([^"]+)"/) || matchFirst(html, /<source[^>]+src="([^"]+\.mp4[^"]*)"/);
  const poster = matchFirst(html, /"posterframe"\s*:\s*"([^"]+)"/) || matchFirst(html, /data-poster="([^"]+)"/);
  const duration = Number(matchFirst(html, /"duration"\s*:\s*([\d.]+)/) || 30);
  if (!mp4Url) throw new Error("Не найден mp4URL в Adobe CCV embed.");
  return {
    id: `adobe-ccv-${index}`,
    url: mp4Url,
    previewUrl: mp4Url,
    provider: "Adobe CCV",
    title: `Adobe CCV video ${index + 1}`,
    duration,
    thumbnail: poster || "",
    canDownload: true
  };
}
