import { spawn } from "node:child_process";
import { statusError } from "./http.js";

export function runCommand(command, args, options = {}) {
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
