const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PREVIEW_PORT || 8080;
const root = __dirname;
const mappings = {
  '/views': path.join(root, 'src', 'views'),
  '/assets': path.join(root, 'src', 'assets'),
  '/renderer': path.join(root, 'src', 'renderer')
};

const mime = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function serveFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  try {
    let url = req.url || '/';
    if (url === '/' || url === '') {
      url = '/views/dashboard.html';
    }
    // match mapping prefix
    const entry = Object.entries(mappings).find(([prefix]) => url.startsWith(prefix));
    if (!entry) {
      res.statusCode = 302;
      res.setHeader('Location', '/views/dashboard.html');
      res.end('Redirect');
      return;
    }
    const [prefix, dir] = entry;
    const rel = url.slice(prefix.length);
    const filePath = path.join(dir, rel);
    // directory index fallback
    let finalPath = filePath;
    try {
      const stat = fs.statSync(finalPath);
      if (stat.isDirectory()) finalPath = path.join(finalPath, 'index.html');
    } catch {}
    serveFile(finalPath, res);
  } catch (e) {
    res.statusCode = 500;
    res.end('Server error');
  }
});

server.listen(PORT, () => {
  console.log(`Preview server listening at http://localhost:${PORT}/`);
});