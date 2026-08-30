import { spawn } from "node:child_process";
import { statusError } from "./http.js";

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
      if (code === 0) resolveRun({ stdout, stderr });
      else rejectRun(statusError(stderr || `${command} завершился с кодом ${code}`, 500));
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

export async function getYtdlpInfo(url, format = "") {
  const args = ["--dump-json", "--no-playlist", "--js-runtimes", "deno", "--remote-components", "ejs:github"];
  if (format) args.push("-f", format);
  args.push(url);
  const result = await runCommand("yt-dlp", args, { timeout: 60000 });
  return JSON.parse(result.stdout);
}
