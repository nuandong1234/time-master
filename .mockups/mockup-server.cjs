const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 52341;

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".svg": "image/svg+xml",
};

const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, req.url === "/" ? "review-time-ranges.html" : req.url);
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/html" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[ext] || "text/plain" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}/`;
  console.log(`Mockup server started at ${url}`);
  // Try to open browser
  const { exec } = require("child_process");
  exec(`start ${url}`);
});