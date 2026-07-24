#!/usr/bin/env tsx
/**
 * เว็บเซิร์ฟเวอร์แบบ static สำหรับดู Dashboard ในเครื่อง
 * (Dashboard ใช้ fetch() จึงเปิดไฟล์ตรง ๆ ด้วย file:// ไม่ได้)
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { ROOT } from '../src/config.js';

const PUBLIC_DIR = resolve(ROOT, 'public');
const PORT = Number(process.env.PORT ?? 4173);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    // กัน path traversal
    const target = resolve(PUBLIC_DIR, `.${normalize(pathname)}`);
    if (!target.startsWith(PUBLIC_DIR + sep) && target !== join(PUBLIC_DIR, 'index.html')) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const info = await stat(target).catch(() => null);
    if (!info?.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('ไม่พบไฟล์ที่ร้องขอ');
      return;
    }

    const body = await readFile(target);
    res.writeHead(200, {
      'Content-Type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    }).end(body);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      .end(`เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : String(err)}`);
  }
});

server.listen(PORT, () => {
  console.log(`\n  Air4 Intelligence Dashboard`);
  console.log(`  → http://localhost:${PORT}\n`);
  console.log(`  กด Ctrl+C เพื่อหยุด\n`);
});
