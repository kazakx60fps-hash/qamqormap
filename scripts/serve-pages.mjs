// GitHub Pages-ті жергілікті имитациялау: dist-pages/ бумасын /qamqormap/ жолында береді,
// табылмаған жолға 404.html қайтарады (GitHub Pages сияқты). Тек тексеру үшін.
//   node scripts/serve-pages.mjs [port] [base]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist-pages');
const port = Number(process.argv[2] || 4173);
const base = process.argv[3] || '/qamqormap';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (!u.pathname.startsWith(base)) { res.writeHead(404); return res.end('not found'); }
  let p = decodeURIComponent(u.pathname.slice(base.length)) || '/';
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, path.normalize(p));
  if (f.startsWith(root) && fs.existsSync(f) && fs.statSync(f).isFile()) {
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    return fs.createReadStream(f).pipe(res);
  }
  res.writeHead(404, { 'Content-Type': TYPES['.html'] });
  fs.createReadStream(path.join(root, '404.html')).pipe(res);
}).listen(port, () => console.log(`[pages] http://localhost:${port}${base}/`));
