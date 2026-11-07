// Serves the game folder on the home Wi-Fi so a phone (including iPhone) can open it in its browser.
// Started by Play_On_Phone.bat. Read-only: only GET/HEAD of files inside the game folder.
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2]) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon'
};

http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end();
  }
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch (e) {
    res.writeHead(400);
    return res.end();
  }
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const file = path.resolve(ROOT, '.' + urlPath);
  // Never serve anything outside the game folder
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache'
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, '0.0.0.0', () => {
  const addresses = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) addresses.push(a.address);
    }
  }
  console.log('');
  console.log('  Aerials is being served on your Wi-Fi.');
  console.log('  On your phone (same Wi-Fi), open one of these in the browser:');
  console.log('');
  for (const ip of addresses) console.log(`      http://${ip}:${PORT}`);
  if (!addresses.length) console.log('      (no network found - is this PC connected to Wi-Fi / LAN?)');
  console.log('');
  console.log('  If Windows Firewall asks, allow access on Private networks.');
  console.log('  Keep this window open while playing; close it to stop.');
}).on('error', (e) => {
  console.error(`Could not start the server on port ${PORT}: ${e.message}`);
  process.exitCode = 1;
});
