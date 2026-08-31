import { getYtdlpInfo, runCommand } from "./command.js";
import { statusError } from "./http.js";

export function isDirectVideoUrl(value) {
  return /^https?:\/\/.+\.(mp4|webm|mov)(\?|$)/i.test(value);
}

export function isStreamProtocol(value) {
  const protocol = String(value || "");
  return protocol.includes("m3u8") || protocol.includes("dash");
}

export function cleanMediaUrl(value) {
  return String(value || "").split(/\r?\n/).find((part) => /^https?:\/\//i.test(part.trim()))?.trim() || "";
}

export function normalizeQuality(value) {
  const allowed = new Set(["source", "1080", "720", "480"]);
  const quality = String(value || "720");
  return allowed.has(quality) ? quality : "720";
}

export function getYtdlpFormat(quality) {
  if (quality === "source") return "bv*+ba/b";
  return `bv*[height<=${quality}]+ba/b[height<=${quality}]/b`;
}

export function getMaxHeight(quality) {
  if (quality === "source") return 0;
  return Number(quality) || 720;
}

function withinStreamQuality(format, maxHeight) {
  const safeStreamHeight = maxHeight && maxHeight <= 720 ? maxHeight : 720;
  return !format.height || Number(format.height) <= safeStreamHeight;
}

export function getPreviewSource(info) {
  if (typeof info.url === "string" && /^https?:\/\//i.test(info.url)) {
    return { url: info.url, kind: isStreamProtocol(info.protocol) ? "hls" : "direct" };
  }

  const requested = [
    ...(Array.isArray(info.requested_downloads) ? info.requested_downloads : []),
    ...(Array.isArray(info.requested_formats) ? info.requested_formats : []),
    ...(Array.isArray(info.formats) ? info.formats : [])
  ];

  const directCandidates = requested.filter((format) => {
    if (!format?.url || !/^https?:\/\//i.test(format.url)) return false;
    if (format.vcodec === "none") return false;
    return !isStreamProtocol(format.protocol);
  });
  // Prefer non-avc1 here too — same PO-token gating as resolveMediaFiles.
  const directPlayable = directCandidates.find((format) => !/^avc1/i.test(format.vcodec || "")) || directCandidates[0];
  if (directPlayable?.url) return { url: directPlayable.url, kind: "direct" };

  const streamPlayable = requested.find((format) => {
    if (!format?.url || !/^https?:\/\//i.test(format.url)) return false;
    if (format.vcodec === "none") return false;
    return isStreamProtocol(format.protocol);
  });
  if (streamPlayable?.url) return { url: streamPlayable.url, kind: "hls" };

  return { url: "", kind: "" };
}

function headersFor(format) {
  const headers = format?.http_headers;
  return headers && typeof headers === "object" ? headers : null;
}

export async function resolveMediaFiles(sourceUrl, quality) {
  if (isDirectVideoUrl(sourceUrl)) return { videoPath: sourceUrl, audioPath: "", streamed: false };

  const info = await getYtdlpInfo(sourceUrl, getYtdlpFormat(quality));
  const requested = [
    ...(Array.isArray(info.requested_downloads) ? info.requested_downloads : []),
    ...(Array.isArray(info.requested_formats) ? info.requested_formats : []),
    ...(Array.isArray(info.formats) ? info.formats : [])
  ];
  const formats = requested
    .map((format) => ({ ...format, url: cleanMediaUrl(format.url) }))
    .filter((format) => format.url);

  const maxHeight = getMaxHeight(quality);
  const withinQuality = (format) => !maxHeight || !format.height || Number(format.height) <= maxHeight;
  const hasVideo = (format) => Boolean(format.vcodec && format.vcodec !== "none");
  const hasAudio = (format) => Boolean(format.acodec && format.acodec !== "none");
  const isPlainHttpMedia = (format) => !isStreamProtocol(String(format.protocol || ""));
  // YouTube's legacy H.264 ("avc1") muxed itags require a PO token we don't
  // have and 403 a direct fetch once yt-dlp is authenticated with cookies;
  // its AV1/VP9 formats don't have that requirement. Strongly prefer those,
  // keeping avc1 only as a last-resort fallback when nothing else qualifies.
  const potGatedPenalty = (format) => /^avc1/i.test(format.vcodec || "") ? 0 : 1e9;
  const qualityScore = (format) => potGatedPenalty(format) + Number(format.height || 0) * 100000 + Number(format.tbr || format.vbr || format.abr || 0);
  const byQuality = (a, b) => qualityScore(b) - qualityScore(a);

  const combined = formats
    .filter((format) => hasVideo(format) && hasAudio(format) && withinQuality(format) && isPlainHttpMedia(format))
    .sort(byQuality)[0];
  const video = formats
    .filter((format) => hasVideo(format) && !hasAudio(format) && withinQuality(format) && isPlainHttpMedia(format))
    .sort(byQuality)[0];
  const audio = formats
    .filter((format) => hasAudio(format) && !hasVideo(format) && isPlainHttpMedia(format))
    .sort((a, b) => Number(b.abr || b.tbr || 0) - Number(a.abr || a.tbr || 0))[0];

  if (video && audio && (!combined || qualityScore(video) > qualityScore(combined))) {
    return { videoPath: video.url, audioPath: audio.url, videoHeaders: headersFor(video), audioHeaders: headersFor(audio), streamed: false };
  }
  if (combined) return { videoPath: combined.url, audioPath: "", videoHeaders: headersFor(combined), streamed: false };

  const streamedCombined = formats
    .filter((format) => hasVideo(format) && hasAudio(format) && withinStreamQuality(format, maxHeight))
    .sort(byQuality)[0];
  const streamedVideo = formats
    .filter((format) => hasVideo(format) && !hasAudio(format) && withinStreamQuality(format, maxHeight))
    .sort(byQuality)[0];
  const streamedAudio = formats
    .filter((format) => hasAudio(format) && !hasVideo(format))
    .sort((a, b) => Number(b.abr || b.tbr || 0) - Number(a.abr || a.tbr || 0))[0];

  if (!video && streamedVideo && streamedAudio && (!streamedCombined || qualityScore(streamedVideo) > qualityScore(streamedCombined))) {
    return { videoPath: streamedVideo.url, audioPath: streamedAudio.url, videoHeaders: headersFor(streamedVideo), audioHeaders: headersFor(streamedAudio), streamed: true };
  }
  if (!video && streamedCombined) return { videoPath: streamedCombined.url, audioPath: "", videoHeaders: headersFor(streamedCombined), streamed: true };
  if (!video && streamedVideo) return { videoPath: streamedVideo.url, audioPath: streamedAudio?.url || "", videoHeaders: headersFor(streamedVideo), audioHeaders: headersFor(streamedAudio), streamed: true };

  if (!video) {
    const infoProtocol = String(info.protocol || "");
    const cleanInfoUrl = cleanMediaUrl(info.url);
    if (cleanInfoUrl && !isStreamProtocol(infoProtocol)) {
      return { videoPath: cleanInfoUrl, audioPath: "", videoHeaders: headersFor(info), streamed: false };
    }
    throw statusError("В источнике не найден видеопоток.", 500);
  }

  return { videoPath: video.url, audioPath: audio?.url || "", videoHeaders: headersFor(video), audioHeaders: headersFor(audio), streamed: false };
}

function formatSeconds(seconds) {
  return seconds.toFixed(3);
}

// YouTube's (and some other CDNs') signed media URLs 403 a bare ffmpeg
// request unless the User-Agent (and sometimes other headers) match what
// yt-dlp negotiated the URL with.
function ffmpegHeaderArgs(headers) {
  if (!headers) return [];
  const lines = Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join("\r\n");
  return lines ? ["-headers", `${lines}\r\n`] : [];
}

export async function cutMedia(mediaFiles, start, duration, outputPath, quality = "720", includeAudio = true) {
  const args = ["-y"];

  if (!mediaFiles.streamed) args.push("-ss", formatSeconds(start), "-t", formatSeconds(duration));
  args.push(...ffmpegHeaderArgs(mediaFiles.videoHeaders));
  args.push("-i", mediaFiles.videoPath);

  if (includeAudio && mediaFiles.audioPath && mediaFiles.audioPath !== mediaFiles.videoPath) {
    if (!mediaFiles.streamed) args.push("-ss", formatSeconds(start), "-t", formatSeconds(duration));
    args.push(...ffmpegHeaderArgs(mediaFiles.audioHeaders));
    args.push("-i", mediaFiles.audioPath);
    args.push("-map", "0:v:0", "-map", "1:a:0");
  } else if (includeAudio) {
    args.push("-map", "0:v:0", "-map", "0:a:0?");
  } else {
    args.push("-map", "0:v:0", "-an");
  }

  if (mediaFiles.streamed) args.push("-ss", formatSeconds(start), "-t", formatSeconds(duration));

  const maxHeight = getMaxHeight(quality);
  if (maxHeight) args.push("-vf", `scale=-2:min(${maxHeight}\\,ih)`);

  args.push(
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    ...(includeAudio ? ["-c:a", "aac", "-shortest"] : []),
    "-movflags", "+faststart",
    outputPath
  );

  await runCommand("ffmpeg", args, { timeout: 120000 });
}

export async function captureFrame(videoPath, time, outputPath, mediaFiles = {}) {
  const args = ["-y"];
  if (!mediaFiles.streamed) args.push("-ss", formatSeconds(time));
  args.push(...ffmpegHeaderArgs(mediaFiles.videoHeaders));
  args.push("-i", videoPath);
  if (mediaFiles.streamed) args.push("-ss", formatSeconds(time));
  args.push(
    "-frames:v", "1",
    "-vf", "scale=640:360:force_original_aspect_ratio=increase,crop=640:360",
    "-q:v", "2",
    "-f", "image2",
    "-update", "1",
    outputPath
  );

  const result = await runCommand("ffmpeg", args, { timeout: mediaFiles.streamed ? 90000 : 45000 });
  try {
    await assertNonEmptyFile(outputPath);
  } catch (error) {
    throw statusError(result.stderr || error.message, 500);
  }
}

export async function assertNonEmptyFile(filePath) {
  const { stat } = await import("node:fs/promises");
  const info = await stat(filePath);
  if (!info.size) throw statusError("Фрагмент создан пустым файлом.", 500);
}

export async function assertVideoFile(filePath) {
  await assertNonEmptyFile(filePath);
  const result = await runCommand("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=codec_type",
    "-of", "csv=p=0",
    filePath
  ], { timeout: 30000 });
  const streams = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!streams.includes("video")) {
    throw statusError("Фрагмент создан без видеопотока.", 500);
  }
}
