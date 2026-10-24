// Minimal static server with COOP/COEP (so the page is crossOriginIsolated and can call
// performance.measureUserAgentSpecificMemory). Maps URL prefixes to directories.
//   startServer({ '/src/': dir, '/data/': dir, '/gen/': dir }) -> { port, close }
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.las': 'application/octet-stream' };

export function startServer(mounts, port = 0) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const prefix = Object.keys(mounts).find((p) => url.pathname.startsWith(p));
    if (!prefix) {
      res.writeHead(404).end();
      return;
    }
    const root = path.resolve(mounts[prefix]);
    const file = path.resolve(root, decodeURIComponent(url.pathname.slice(prefix.length)));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      'Content-Length': fs.statSync(file).size,
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ port: server.address().port, close: () => server.close() }));
  });
}
