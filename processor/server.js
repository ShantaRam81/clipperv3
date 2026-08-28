import { createServer } from "node:http";
import { port, authToken } from "./src/config.js";
import { sendJson, readJson, statusError, validateUrl } from "./src/http.js";
import { hasCommand } from "./src/command.js";
import { ensureStorage, cleanupOldClips } from "./src/storage.js";
import { probeSource, refreshPreview } from "./src/probe.js";
import { createClip, createFrames, serveClip, deleteClip } from "./src/clips.js";

await ensureStorage();
cleanupOldClips().catch((error) => console.warn(`Could not clean old clips: ${error.message}`));
setInterval(() => cleanupOldClips().catch((error) => console.warn(`Could not clean old clips: ${error.message}`)), 15 * 60 * 1000).unref();

function authorize(req) {
  if (!authToken) return;
  const header = req.headers.authorization || "";
  if (header !== `Bearer ${authToken}`) throw statusError("Unauthorized", 401);
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, {
        ok: true,
        dependencies: {
          ffmpeg: await hasCommand("ffmpeg"),
          "yt-dlp": await hasCommand("yt-dlp"),
          deno: await hasCommand("deno")
        }
      });
    }

    if (req.method === "GET" && url.pathname.startsWith("/clips/")) {
      return serveClip(url.pathname, res);
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/clips/")) {
      authorize(req);
      return sendJson(res, await deleteClip(url.pathname));
    }

    if (req.method === "POST" && url.pathname === "/api/process") {
      authorize(req);
      const body = await readJson(req);
      if (body.action === "probe") {
        return sendJson(res, await probeSource(body.url, validateUrl, {
          includeEmbedded: body.includeEmbedded !== false,
          includeGifs: body.includeGifs === true
        }));
      }
      if (body.action === "frames") {
        return sendJson(res, await createFrames(body));
      }
      if (body.action === "preview") {
        return sendJson(res, await refreshPreview(body.url, validateUrl));
      }
      return sendJson(res, await createClip(body), 201);
    }

    sendJson(res, { error: "Not found" }, 404);
  } catch (error) {
    sendJson(res, { error: error.message || "Unexpected error" }, error.status || 500);
  }
}).listen(port, () => {
  console.log(`Clipper v3 processor listening on ${port}`);
});
