import { extname, join, resolve } from "node:path";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicDir = join(rootDir, "public");

const remoteProcessorUrl = process.env.CLIPPER_PROCESSOR_URL || "";
const remoteProcessorToken = process.env.CLIPPER_PROCESSOR_TOKEN || "";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".gif": "image/gif",
  ".svg": "image/svg+xml"
};

export async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, { ok: true, processing: { mode: remoteProcessorUrl ? "remote" : "unconfigured" } });
    }

    if (req.method === "POST" && url.pathname === "/api/probe") {
      const body = await readJson(req);
      return sendJson(res, await callProcessor({
        action: "probe",
        url: body.url,
        includeEmbedded: body.includeEmbedded !== false,
        includeGifs: body.includeGifs === true
      }));
    }

    if (req.method === "POST" && url.pathname === "/api/preview") {
      const body = await readJson(req);
      return sendJson(res, await callProcessor({ action: "preview", url: body.url }));
    }

    if (req.method === "POST" && url.pathname === "/api/frames") {
      const body = await readJson(req);
      return sendJson(res, await callProcessor({
        action: "frames",
        url: body.url,
        duration: body.duration,
        count: body.count
      }));
    }

    if (req.method === "POST" && url.pathname === "/api/clips") {
      const body = await readJson(req);
      const clip = await callProcessor({
        action: "clip",
        url: body.url,
        sourceUrl: body.sourceUrl || body.url,
        title: body.title,
        start: body.start,
        end: body.end,
        quality: body.quality,
        includeAudio: body.includeAudio !== false,
        mediaType: body.mediaType
      });
      return sendJson(res, {
        ...clip,
        downloadUrl: getRemoteClipDownloadUrl(clip.href || clip.publicUrl)
      }, 201);
    }

    if (req.method === "GET" && url.pathname.startsWith("/remote-clips/")) {
      return proxyRemoteClip(url.pathname, res);
    }

    if (req.method === "GET") {
      return serveStatic(url.pathname, res);
    }

    sendJson(res, { error: "Method not allowed" }, 405);
  } catch (error) {
    sendJson(res, { error: error.message || "Unexpected error" }, error.status || 500);
  }
}

async function callProcessor(payload) {
  if (!remoteProcessorUrl) throw statusError("Обработчик не настроен (CLIPPER_PROCESSOR_URL пуст).", 500);

  const response = await fetch(remoteProcessorUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(remoteProcessorToken ? { "Authorization": `Bearer ${remoteProcessorToken}` } : {})
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw statusError(data.error || `Обработчик вернул статус ${response.status}.`, response.status);
  }
  return data;
}

function getRemoteClipDownloadUrl(remoteUrl) {
  if (!remoteUrl || !remoteProcessorUrl) return remoteUrl;
  try {
    const target = new URL(remoteUrl);
    const processor = new URL(remoteProcessorUrl);
    if (target.host !== processor.host || !target.pathname.startsWith("/clips/")) return remoteUrl;
    return `/remote-clips/${target.pathname.replace(/^\/clips\/?/, "")}`;
  } catch {
    return remoteUrl;
  }
}

async function proxyRemoteClip(pathname, res) {
  if (!remoteProcessorUrl) return sendJson(res, { error: "Обработчик не настроен." }, 500);
  const processor = new URL(remoteProcessorUrl);
  const filePath = pathname.replace(/^\/remote-clips\/?/, "");
  if (!filePath || filePath.includes("..")) return sendJson(res, { error: "Not found" }, 404);

  const target = new URL(`/clips/${filePath}`, processor);
  const response = await fetch(target.href);
  if (!response.ok || !response.body) return sendJson(res, { error: "Clip not found" }, response.status || 404);

  const headers = {
    "Content-Type": response.headers.get("content-type") || "video/mp4",
    "Content-Disposition": response.headers.get("content-disposition") || "attachment",
    "Cache-Control": "no-store"
  };
  const contentLength = response.headers.get("content-length");
  if (contentLength) headers["Content-Length"] = contentLength;

  res.writeHead(200, headers);
  const { Readable } = await import("node:stream");
  Readable.fromWeb(response.body).pipe(res);
}

async function serveStatic(pathname, res) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(publicDir, `.${decodeURIComponent(requested)}`);
  if (!filePath.startsWith(resolve(publicDir))) return sendJson(res, { error: "Forbidden" }, 403);

  if (!existsSync(filePath)) return sendJson(res, { error: "Not found" }, 404);
  await stat(filePath);
  res.writeHead(200, { "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream" });
  createReadStream(filePath).pipe(res);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res, payload, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function statusError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}
