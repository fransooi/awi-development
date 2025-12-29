#!/usr/bin/env node
/*
  Minimal static file server for AWI-Data (no deps).

  Usage:
    node static-server.js

  Options (env):
    PORT=8787
    ROOT=<custom-path>  (default: ./data relative to script location)
    READONLY=1   (default: 1; when 1, disallows any non-GET/HEAD)

  Notes:
  - Serves files from ROOT
  - Directory listing is enabled (simple HTML)
  - Prevents path traversal
*/

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const url = require('url');

const ROOT = process.env.ROOT || path.join(__dirname, '../data');
const PORT = Number(process.env.PORT || 8787);
const READONLY = (process.env.READONLY ?? '1') !== '0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
};

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeJoin(root, requestPathname) {
  // Decode safely and normalize
  const decoded = decodeURIComponent(requestPathname || '/');
  const stripped = decoded.replace(/^\/+/g, '');
  const joined = path.join(root, stripped);
  const normalizedRoot = path.resolve(root) + path.sep;
  const normalizedTarget = path.resolve(joined);
  if (!normalizedTarget.startsWith(normalizedRoot) && normalizedTarget !== path.resolve(root)) {
    return null;
  }
  return normalizedTarget;
}

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  if (body && res.req.method !== 'HEAD') res.end(body);
  else res.end();
}

async function listDirectory(absDirPath, urlPathname) {
  const items = await fsp.readdir(absDirPath, { withFileTypes: true });
  const rows = [];

  // Parent link
  if (urlPathname !== '/') {
    const parent = urlPathname.replace(/\/+$/g, '').split('/').slice(0, -1).join('/') || '/';
    rows.push({ name: '..', href: parent.endsWith('/') ? parent : parent + '/', type: 'dir' });
  }

  for (const ent of items) {
    const isDir = ent.isDirectory();
    const name = ent.name;
    const href = (urlPathname.endsWith('/') ? urlPathname : urlPathname + '/') + encodeURIComponent(name) + (isDir ? '/' : '');
    rows.push({ name, href, type: isDir ? 'dir' : 'file' });
  }

  // Sort dirs then files
  rows.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const title = `AWI-Data — ${urlPathname}`;
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial; margin:0; padding:24px; background:#0b1020; color:#e8ecff;}
    a{color:#6ee7ff; text-decoration:none;}
    a:hover{text-decoration:underline;}
    .path{color:rgba(232,236,255,.75); margin-bottom:14px;}
    .card{border:1px solid rgba(232,236,255,.12); border-radius:14px; background:rgba(18,26,51,.75); padding:14px;}
    .row{display:flex; gap:12px; padding:8px 6px; border-bottom:1px solid rgba(232,236,255,.08); align-items:center;}
    .row:last-child{border-bottom:none;}
    .badge{display:inline-block; min-width:44px; text-align:center; font-size:12px; padding:2px 8px; border-radius:999px; border:1px solid rgba(232,236,255,.16); color:rgba(232,236,255,.75);}
    .badge.dir{border-color:rgba(110,231,255,.28); color:rgba(110,231,255,.95); background:rgba(110,231,255,.08);}
    .badge.file{border-color:rgba(167,139,250,.28); color:rgba(167,139,250,.95); background:rgba(167,139,250,.08);}
    .name{flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
    .top{display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:10px;}
    .small{font-size:12px; color:rgba(232,236,255,.6);}
    code{color:#e8ecff;}
  </style>
</head>
<body>
  <div class="top">
    <div>
      <div style="font-size:18px; font-weight:650;">AWI-Data</div>
      <div class="path">Path: <code>${escapeHtml(urlPathname)}</code></div>
    </div>
    <div class="small">ROOT: <code>${escapeHtml(ROOT)}</code></div>
  </div>

  <div class="card">
    ${rows.map(r => {
      const badge = r.type === 'dir' ? 'dir' : 'file';
      return `<div class="row"><span class="badge ${badge}">${badge}</span><div class="name"><a href="${r.href}">${escapeHtml(r.name)}</a></div></div>`;
    }).join('')}
  </div>

  <div class="small" style="margin-top:14px;">
    Tip: append <code>?download=1</code> to force download.
  </div>
</body>
</html>`;

  return Buffer.from(html, 'utf-8');
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME[ext] || 'application/octet-stream';
}

function shouldForceDownload(parsedUrl) {
  return parsedUrl.searchParams?.get('download') === '1';
}

const server = http.createServer(async (req, res) => {
  try {
    const method = req.method || 'GET';
    if (READONLY && method !== 'GET' && method !== 'HEAD') {
      return send(res, 405, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Method Not Allowed');
    }

    const parsed = new url.URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = parsed.pathname || '/';

    const absPath = safeJoin(ROOT, pathname);
    if (!absPath) {
      return send(res, 403, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Forbidden');
    }

    let st;
    try {
      st = await fsp.stat(absPath);
    } catch {
      return send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not Found');
    }

    if (st.isDirectory()) {
      const html = await listDirectory(absPath, pathname.endsWith('/') ? pathname : pathname + '/');
      return send(res, 200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }, html);
    }

    // File
    const headers = {
      'Content-Type': contentTypeFor(absPath),
      'Content-Length': String(st.size),
      'Cache-Control': 'no-store',
    };

    if (shouldForceDownload(parsed)) {
      headers['Content-Disposition'] = `attachment; filename="${path.basename(absPath)}"`;
    }

    res.writeHead(200, headers);
    if (method === 'HEAD') return res.end();

    const stream = fs.createReadStream(absPath);
    stream.on('error', () => {
      try { res.destroy(); } catch {}
    });
    stream.pipe(res);
  } catch (e) {
    return send(res, 500, { 'Content-Type': 'text/plain; charset=utf-8' }, `Server Error\n${String(e && e.stack ? e.stack : e)}`);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  // eslint-disable-next-line no-console
  console.log(`AWI-Data static server running:`);
  console.log(`  ROOT = ${ROOT}`);
  console.log(`  URL  = http://127.0.0.1:${PORT}/`);
});
