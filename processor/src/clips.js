import { createReadStream } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { clipsDir, tempDir, mimeTypes, publicBaseUrl, maxClipSeconds } from "./config.js";
import { statusError, sendJson } from "./http.js";
import { isGif, parseTime, sanitizeTitle, safeFileName } from "./providers/shared.js";
import { downloadGifFile } from "./providers/gif.js";
import { normalizeQuality, resolveMediaFiles, cutMedia, assertVideoFile, captureFrame } from "./media.js";
import { cleanupTempFiles } from "./storage.js";
import { clamp } from "./util.js";

export async function createClip(input) {
  const sourceUrl = requireUrl(input.sourceUrl || input.url);
  const title = sanitizeTitle(input.title || "Untitled reference");
  const isGifSource = isGif(sourceUrl.href) || input.mediaType === "gif";
  const start = parseTime(input.start);
  const end = parseTime(input.end);
  const duration = isGifSource ? 0 : Math.max(0, end - start);
  const quality = normalizeQuality(input.quality);
  const includeAudio = input.includeAudio !== false;

  if (!isGifSource && duration <= 0) throw statusError("Конец фрагмента должен быть позже начала.", 400);
  if (!isGifSource && duration > maxClipSeconds) throw statusError(`Фрагмент должен быть до ${maxClipSeconds} секунд.`, 400);

  const id = randomUUID();
  const outputName = `${safeFileName(title)}-${id.slice(0, 8)}.${isGifSource ? "gif" : "mp4"}`;
  const outputPath = join(clipsDir, outputName);

  try {
    if (isGifSource) {
      await downloadGifFile(sourceUrl.href, outputPath);
    } else {
      const mediaFiles = await resolveMediaFiles(sourceUrl.href, quality);
      await cutMedia(mediaFiles, start, duration, outputPath, quality, includeAudio);
      await assertVideoFile(outputPath);
    }
  } catch (error) {
    await unlink(outputPath).catch(() => {});
    throw error;
  }

  return {
    id,
    title,
    outputName,
    includeAudio,
    mediaType: isGifSource ? "gif" : "video",
    href: `${publicBaseUrl}/clips/${encodeURIComponent(outputName)}`,
    publicUrl: `${publicBaseUrl}/clips/${encodeURIComponent(outputName)}`,
    createdAt: new Date().toISOString()
  };
}

export async function createFrames(input) {
  const sourceUrl = requireUrl(input.url || input.sourceUrl);
  const duration = Math.max(1, Number(input.duration || 30));
  const count = Math.min(12, Math.max(3, Number(input.count || 9)));
  const id = randomUUID();
  const mediaFiles = await resolveMediaFiles(sourceUrl.href, "720");
  const frames = [];

  try {
    for (let index = 0; index < count; index += 1) {
      const time = clamp((duration * (index + 0.5)) / count, 0, Math.max(0, duration - 0.05));
      const framePath = join(tempDir, `${id}-${index}.jpg`);
      await captureFrame(mediaFiles.videoPath, time, framePath, mediaFiles);
      const data = await readFile(framePath);
      frames.push(`data:image/jpeg;base64,${data.toString("base64")}`);
      await unlink(framePath).catch(() => {});
    }
  } finally {
    await cleanupTempFiles(id);
  }

  if (!frames.length) throw statusError("Не удалось построить кадры таймлайна.", 502);
  return { frames };
}

export function serveClip(pathname, res) {
  const fileName = decodeURIComponent(pathname.replace("/clips/", ""));
  const filePath = resolve(clipsDir, `./${fileName}`);
  if (!filePath.startsWith(resolve(clipsDir))) return sendJson(res, { error: "Forbidden" }, 403);
  createReadStream(filePath)
    .on("error", () => sendJson(res, { error: "Clip not found" }, 404))
    .once("open", () => res.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName || "clip.mp4")}"`,
      "Cache-Control": "no-store"
    }))
    .pipe(res);
}

export async function deleteClip(pathname) {
  const fileName = decodeURIComponent(pathname.replace("/clips/", ""));
  const filePath = resolve(clipsDir, `./${fileName}`);
  if (!filePath.startsWith(resolve(clipsDir))) throw statusError("Forbidden", 403);
  await unlink(filePath).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
  return { deleted: true };
}

function requireUrl(value) {
  if (!value) throw statusError("Укажите ссылку на источник.", 400);
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported protocol");
    return url;
  } catch {
    throw statusError("Ссылка должна быть валидным http/https URL.", 400);
  }
}
