#!/usr/bin/env node
// The local server, driven by vercel.json so local and production cannot drift.
//
// Its predecessor kept its own routing table and a test held the two in step; the
// table is gone, and with it the class of bug where a page works locally and 404s
// in production. Node only, no dependencies.
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const HERE = __dirname;                                   // code/web
const CFG = JSON.parse(fs.readFileSync(path.join(HERE, 'vercel.json'), 'utf8'));

const PORT = Number(process.argv[2]) || Number(process.env.PORT) || 3021;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

// `/app/:path*` -> a matcher that also reports what `:path*` captured.
function compile(source) {
  const names = [];
  const pattern = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:(\w+)\\\*/g, (_, name) => { names.push(name); return '(.*)'; })
    .replace(/:(\w+)/g, (_, name) => { names.push(name); return '([^/]+)'; });
  return { re: new RegExp(`^${pattern}$`), names };
}

function match(rules, pathname) {
  for (const rule of rules) {
    const { re, names } = compile(rule.source);
    const m = pathname.match(re);
    if (!m) continue;
    let destination = rule.destination;
    names.forEach((name, i) => {
      destination = destination.replace(new RegExp(`:${name}\\*|:${name}`, 'g'), m[i + 1]);
    });
    return { rule, destination };
  }
  return null;
}

function apply(rules, pathname) {
  const hit = match(rules, pathname);
  return hit === null ? null : hit.destination;
}

const REDIRECTS = CFG.redirects || [];
const REWRITES = CFG.rewrites || [];

function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const query = url.search || '';

  // trailingSlash: false -- the host normalises `/x/` to `/x` before any rule runs.
  if (CFG.trailingSlash === false && url.pathname !== '/' && url.pathname.endsWith('/')) {
    res.writeHead(308, { Location: url.pathname.replace(/\/+$/, '') + query,
                         'Cache-Control': 'no-store' });
    res.end();
    return;
  }

  const hit = match(REDIRECTS, url.pathname);
  if (hit !== null) {
    // The host answers `permanent: false` with 307 and `true` with 308.
    res.writeHead(hit.rule.permanent ? 308 : 307,
                  { Location: hit.destination + query, 'Cache-Control': 'no-store' });
    res.end();
    return;
  }

  // A rewrite if one matches, otherwise the path itself -- the host serves static
  // files by path and only needs rules for the clean routes.
  const target = apply(REWRITES, url.pathname) || url.pathname;

  const file = path.join(HERE, path.normalize(target).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(HERE) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    send(res, 404, 'not found', 'text/plain; charset=utf-8');
    return;
  }
  send(res, 200, fs.readFileSync(file),
       TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`product-web  http://localhost:${PORT}/`);
});
