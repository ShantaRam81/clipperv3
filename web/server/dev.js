import { createServer } from "node:http";
import { handleRequest } from "./app.js";

const port = Number(process.env.PORT || 3000);
createServer(handleRequest).listen(port, () => {
  console.log(`Clipper v3 web is running at http://localhost:${port}`);
});
