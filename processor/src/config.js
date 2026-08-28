import { join } from "node:path";

export const port = Number(process.env.PORT || 8081);
export const publicBaseUrl = (process.env.PUBLIC_BASE_URL || `http://localhost:${port}`).replace(/\/$/, "");
export const authToken = process.env.PROCESSOR_TOKEN || "";
export const storageDir = process.env.STORAGE_DIR || "/opt/clipper-v3-processor/storage";
export const clipsDir = join(storageDir, "clips");
export const tempDir = join(storageDir, "tmp");
export const clipTtlMs = Number(process.env.CLIP_TTL_MINUTES || 60) * 60 * 1000;
export const maxClipSeconds = Number(process.env.MAX_CLIP_SECONDS || 60);

export const mimeTypes = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".gif": "image/gif",
  ".json": "application/json; charset=utf-8"
};
