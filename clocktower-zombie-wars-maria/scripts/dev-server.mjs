import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const extension = extname(safePath);
  const base = [".png", ".webp"].includes(extension) ? "public" : "src";
  const filePath = join(root, base, safePath);

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      "content-type": types[extension] || "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("未找到页面");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Local URL: http://localhost:${port}`);
});
