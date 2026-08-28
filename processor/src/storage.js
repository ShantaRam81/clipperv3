import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { clipsDir, tempDir, clipTtlMs } from "./config.js";

export async function ensureStorage() {
  await mkdir(clipsDir, { recursive: true });
  await mkdir(tempDir, { recursive: true });
}

export async function cleanupOldClips() {
  if (clipTtlMs <= 0) return;
  const now = Date.now();
  const entries = await readdir(clipsDir, { withFileTypes: true });
  await Promise.all(entries
    .filter((entry) => entry.isFile())
    .map(async (entry) => {
      const filePath = join(clipsDir, entry.name);
      const info = await stat(filePath);
      if (now - info.mtimeMs > clipTtlMs) await unlink(filePath).catch(() => {});
    }));
}

export async function cleanupTempFiles(id) {
  const entries = await readdir(tempDir, { withFileTypes: true }).catch(() => []);
  await Promise.all(entries
    .filter((entry) => entry.isFile() && (entry.name.startsWith(`${id}-`) || entry.name.startsWith(`${id}.`)))
    .map((entry) => unlink(join(tempDir, entry.name)).catch(() => {})));
}
