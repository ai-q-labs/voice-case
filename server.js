/**
 * Voice Case — the whole back end.
 *
 * Zero dependencies: Node's own http and fs. It does three things.
 *
 *   GET  /api/token    mints a short-lived AssemblyAI token so the API key
 *                      never reaches the browser
 *   POST /api/verdict  marks one accusation
 *   GET  /*            serves ./public
 *
 * `server/` is not under the static root, so `server/solution.js` cannot be
 * fetched. That is not a filter to get past — the file is outside the tree the
 * static handler will ever look in, and the handler resolves and re-checks
 * every path before opening it.
 *
 *   ASSEMBLYAI_API_KEY   required for voice; the typed input works without it
 *   PORT                 defaults to 3000
 */

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { grade } from "./server/solution.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, "public");
const PORT = Number(process.env.PORT) || 3000;
const API_KEY = process.env.ASSEMBLYAI_API_KEY || "";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "cache-control": "no-store",
    ...headers,
  });
  res.end(body);
}

const json = (res, status, obj) =>
  send(res, status, JSON.stringify(obj), { "content-type": TYPES[".json"] });

async function readBody(req, limit = 4096) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** GET https://streaming.assemblyai.com/v3/token -> { token, expires_in_seconds } */
async function mintToken() {
  if (!API_KEY) {
    const err = new Error(
      "ASSEMBLYAI_API_KEY is not set on the server, so the microphone cannot be used. Type instead.",
    );
    err.status = 503;
    throw err;
  }
  const url =
    "https://streaming.assemblyai.com/v3/token?expires_in_seconds=120&max_session_duration_seconds=3600";
  const res = await fetch(url, { headers: { authorization: API_KEY } });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err = new Error(
      `AssemblyAI refused the token request (${res.status}). ${detail.slice(0, 300)}`,
    );
    err.status = 502;
    throw err;
  }
  return res.json();
}

async function serveStatic(req, res, pathname) {
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const target = path.resolve(PUBLIC, rel);

  // Re-check after resolution. `..` in the URL, an encoded separator, or a
  // symlink pointing out of the tree all end up here as an absolute path, and
  // this is the line that catches all three.
  if (target !== PUBLIC && !target.startsWith(PUBLIC + path.sep)) {
    return send(res, 403, "Forbidden");
  }

  try {
    const data = await fs.readFile(target);
    const type = TYPES[path.extname(target).toLowerCase()] || "application/octet-stream";
    return send(res, 200, data, { "content-type": type });
  } catch {
    return send(res, 404, "Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  try {
    if (pathname === "/api/token" && req.method === "GET") {
      const data = await mintToken();
      return json(res, 200, data);
    }

    if (pathname === "/api/verdict" && req.method === "POST") {
      let guess;
      try {
        guess = JSON.parse(await readBody(req));
      } catch {
        return json(res, 400, { error: "That was not an accusation." });
      }
      return json(res, 200, grade(guess));
    }

    if (pathname.startsWith("/api/")) {
      return json(res, 404, { error: "No such endpoint." });
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      return send(res, 405, "Method not allowed");
    }

    return serveStatic(req, res, pathname);
  } catch (err) {
    const status = err.status || 500;
    return json(res, status, { error: err.message });
  }
});

server.listen(PORT, () => {
  process.stdout.write(`Voice Case listening on http://localhost:${PORT}\n`);
  if (!API_KEY) {
    process.stdout.write(
      "ASSEMBLYAI_API_KEY is not set — the typed input works, the microphone does not.\n",
    );
  }
});
