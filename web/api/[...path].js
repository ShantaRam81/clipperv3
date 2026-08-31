import { handleRequest } from "../server/app.js";

// Longer/higher-quality clip exports can take over a minute to cut. This is
// a per-function code export (not a vercel.json setting), so it works fine
// alongside the legacy "builds" config that "functions" in vercel.json
// cannot coexist with.
export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  return handleRequest(req, res);
}
