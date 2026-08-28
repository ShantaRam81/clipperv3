import { handleRequest } from "../server/app.js";

export default async function handler(req, res) {
  return handleRequest(req, res);
}
