import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/_favicon/') {
    const host = new URL(request.url, 'http://localhost').searchParams.get('pageUrl') || '';
    const hue = [...host].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 360;
    response.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    response.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="hsl(${hue} 70% 50%)"/></svg>`);
    return;
  }
  const file = path.resolve(root, `.${pathname}`);
  if (!file.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end();
    return;
  }
  try {
    let body = await readFile(file);
    if (pathname === '/extension/launcher.html') {
      body = body.toString().replace('<script type="module"', '<script src="/tests/browser-fixture.js"></script><script type="module"');
    }
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
}).listen(Number(process.env.PORT || 4317), '127.0.0.1', () => process.stdout.write(`Fixture preview: http://127.0.0.1:${process.env.PORT || 4317}/extension/launcher.html\n`));
