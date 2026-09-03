// Zero-dependency static file server for local preview only.
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const port = process.env.PORT || 8080;

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json"
};

http.createServer(function (req, res) {
  let reqPath = decodeURIComponent(req.url.split("?")[0]);
  if (reqPath === "/") reqPath = "/index.html";
  const filePath = path.join(root, reqPath);
  if (!filePath.startsWith(root)) { res.writeHead(403); res.end("forbidden"); return; }
  fs.readFile(filePath, function (err, data) {
    if (err) { res.writeHead(404); res.end("not found: " + reqPath); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(data);
  });
}).listen(port, function () { console.log("serving " + root + " on http://localhost:" + port); });
