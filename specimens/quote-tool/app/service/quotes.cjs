const http = require('node:http');
const fs = require('node:fs');
const stateFile = process.env.QUOTE_STATE;
if (!stateFile) throw new Error('QUOTE_STATE is required');
if (!fs.existsSync(stateFile)) fs.writeFileSync(stateFile, JSON.stringify({ quantity: 1, unitPrice: 12, total: 12 }));
const load = () => JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const save = (state) => fs.writeFileSync(stateFile, JSON.stringify(state));
function reply(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}
http.createServer((req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/healthz') return reply(res, 200, { ready: true });
    if (req.method === 'GET' && req.url === '/quote') return reply(res, 200, load());
    if (req.method === 'POST' && req.url === '/quantity') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const { quantity } = JSON.parse(body);
          const quote = load();
          // Intentional fixture defects: invalid quantities are accepted and total is stale.
          quote.quantity = quantity;
          save(quote);
          reply(res, 200, quote);
        } catch { reply(res, 400, { error: 'Invalid JSON' }); }
      });
      return;
    }
    return reply(res, 404, { error: 'Not found' });
  } catch { return reply(res, 500, { error: 'Storage error' }); }
}).listen(Number(process.env.QUOTE_PORT), '127.0.0.1');
