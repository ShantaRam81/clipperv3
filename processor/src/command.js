import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { statusError } from "./http.js";
import { youtubeCookiesPath } from "./config.js";

const YOUTUBE_BLOCK_PATTERNS = [
  /429/,
  /too many requests/i,
  /sign in to confirm/i,
  /confirm you.?re not a bot/i
];

function isYoutubeBlockError(stderr) {
  return YOUTUBE_BLOCK_PATTERNS.some((pattern) => pattern.test(stderr || ""));
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

// ffmpeg/yt-dlp stderr always leads with a long version/config/stream banner.
// Strip that noise and keep only lines that look like the actual failure, so
// a raw multi-KB build banner never ends up rendered as the user-facing
// error message.
const NOISE_LINE_PATTERNS = [
  /^ffmpeg version/i,
  /^\s*(configuration|built with|lib[a-z]+ +\d)/i,
  /^(Input|Output) #/,
  /^\s*(Stream|Metadata|Duration|Chapter)/i,
  /^Stream mapping:/,
  /^Press \[q\]/,
  /^\[[a-z0-9]+ @ 0x[0-9a-f]+\]/i,
  /^frame=/
];

function summarizeStderr(stderr) {
  const lines = String(stderr || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const meaningful = lines.filter((line) => !NOISE_LINE_PATTERNS.some((pattern) => pattern.test(line)));
  const tail = (meaningful.length ? meaningful : lines).slice(-4).join(" | ");
  return tail.slice(0, 400);
}

function runOnce(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { shell: false });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      rejectRun(statusError(`${command} не ответил вовремя.`, 504));
    }, options.timeout || 60000);

    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectRun(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolveRun({ stdout, stderr });
      console.error(`[${command}] exited ${code}\nargs: ${args.join(" ")}\nstderr:\n${stderr}`);
      rejectRun(statusError(summarizeStderr(stderr) || `${command} завершился с кодом ${code}`, 500));
    });
  });
}

// YouTube's anti-bot rate limiting is transient in practice — a request that
// gets a 429 often succeeds a couple seconds later. Retry a few times before
// surfacing a clear, user-facing message instead of a bare 500.
export async function runCommand(command, args, options = {}) {
  const maxAttempts = command === "yt-dlp" ? 3 : 1;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await runOnce(command, args, options);
    } catch (error) {
      lastError = error;
      if (command !== "yt-dlp" || !isYoutubeBlockError(error.message) || attempt === maxAttempts) {
        break;
      }
      await sleep(1500 * attempt);
    }
  }

  if (command === "yt-dlp" && isYoutubeBlockError(lastError?.message)) {
    throw statusError("YouTube временно ограничивает запросы с этого сервера. Подождите немного и попробуйте ещё раз.", 503);
  }
  throw lastError;
}

export function hasCommand(command) {
  return new Promise((resolveCheck) => {
    const child = spawn(command, command === "yt-dlp" ? ["--version"] : ["-version"], { shell: false });
    child.on("error", () => resolveCheck(false));
    child.on("close", (code) => resolveCheck(code === 0));
  });
}

// Cookies were tried to reduce YouTube's anti-bot rate limiting, but in
// practice they make things worse: with cookies, yt-dlp's info resolves
// through the "WEB_EMBEDDED_PLAYER" client, and nearly every format under
// that client 403s a direct fetch (ffmpeg or browser) without a PO token we
// don't have — confirmed across multiple codecs/itags, reproducible outside
// our own code with plain curl. Anonymous extraction has been reliable all
// session, so cookies stay off for now. The file is left in place on the
// VPS (youtubeCookiesPath) so this is a one-line re-enable if a future
// yt-dlp release resolves the PO-token gating for authenticated clients.
const USE_YOUTUBE_COOKIES = false;

export async function getYtdlpInfo(url, format = "") {
  const args = ["--dump-json", "--no-playlist", "--js-runtimes", "deno", "--remote-components", "ejs:github"];
  if (USE_YOUTUBE_COOKIES && existsSync(youtubeCookiesPath)) args.push("--cookies", youtubeCookiesPath);
  if (format) args.push("-f", format);
  args.push(url);
  const result = await runCommand("yt-dlp", args, { timeout: 60000 });
  return JSON.parse(result.stdout);
}
