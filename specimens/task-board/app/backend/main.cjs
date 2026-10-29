const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const statePath = process.env.STATE_FILE;
if (!statePath) throw new Error('STATE_FILE is required');
if (!fs.existsSync(statePath)) fs.writeFileSync(statePath, JSON.stringify({ tasks: [{ id: 1, title: 'Prepare quote', completed: false }] }));
const load = () => JSON.parse(fs.readFileSync(statePath, 'utf8'));
const save = (state) => fs.writeFileSync(statePath, JSON.stringify(state));
function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
http.createServer((req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/ready') return json(res, 200, { ready: true });
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(path.join(__dirname, '../frontend/view.html')));
    }
    if (req.method === 'GET' && req.url === '/api/tasks') return json(res, 200, load());
    if (req.method === 'POST' && req.url === '/api/tasks/1/complete') {
      const state = load();
      // Intentional specimen fault: the response changes, but durable state does not.
      return json(res, 200, { confirmed: true, task: { ...state.tasks[0], completed: true } });
    }
    return json(res, 404, { error: 'Not found' });
  } catch (error) { return json(res, 500, { error: error.message }); }
}).listen(Number(process.env.APP_PORT), '127.0.0.1');
