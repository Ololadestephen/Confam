// Test-only fault injection: the candidate backend runs behind this local proxy.
const http = require('node:http');
const { spawn } = require('node:child_process');
const net = require('node:net');
const mode = process.argv[2];
const listener = net.createServer();
listener.listen(0, '127.0.0.1', () => {
  const port = listener.address().port;
  listener.close(() => {
    const child = spawn(process.execPath, ['backend/main.cjs'], { env: { ...process.env, APP_PORT: String(port) }, stdio: 'inherit' });
    child.on('exit', (code) => process.exit(code || 0));
    for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { child.kill(signal); });
    http.createServer((req, res) => {
      if ((mode === 'load' && req.method === 'GET' && req.url === '/api/tasks') ||
          (mode === 'complete' && req.method === 'POST' && req.url === '/api/tasks/1/complete')) {
        res.writeHead(500, { 'Content-Type': 'application/json' }); return res.end('{"error":"injected failure"}');
      }
      const proxy = http.request({ host: '127.0.0.1', port, path: req.url, method: req.method, headers: req.headers }, upstream => {
        res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res);
      });
      proxy.on('error', () => { res.writeHead(503); res.end('backend unavailable'); });
      req.pipe(proxy);
    }).listen(Number(process.env.APP_PORT), '127.0.0.1');
  });
});
