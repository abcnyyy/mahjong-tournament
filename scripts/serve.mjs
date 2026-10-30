// scripts/serve.mjs —— 本地静态预览服务器（仅用于本地查看/测试）
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const root = process.argv[2] || 'dist';
const port = Number(process.argv[3] || 8123);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/麻将赛事管理.html';
    const file = normalize(join(process.cwd(), root, p));
    if (!file.startsWith(normalize(join(process.cwd(), root)))) {
      res.writeHead(403); res.end('forbidden'); return;
    }
    const s = await stat(file);
    if (!s.isFile()) { res.writeHead(404); res.end('not found'); return; }
    const buf = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  } catch (e) {
    res.writeHead(404); res.end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log('preview server: http://127.0.0.1:' + port + '/'));
