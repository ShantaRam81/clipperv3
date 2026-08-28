export function statusError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function sendJson(res, payload, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

export async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function validateUrl(value) {
  if (!value) throw statusError("Укажите ссылку на источник.", 400);
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported protocol");
    return url;
  } catch {
    throw statusError("Ссылка должна быть валидным http/https URL.", 400);
  }
}
