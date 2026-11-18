const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'polemap_test_'));
const tmpData = path.join(tmpRoot, 'data');
const tmpUploads = path.join(tmpRoot, 'uploads');
fs.mkdirSync(tmpData, { recursive: true });
fs.mkdirSync(tmpUploads, { recursive: true });

process.env.POLEMAP_DATA_DIR = tmpData;
process.env.POLEMAP_UPLOADS_DIR = tmpUploads;
process.env.POLEMAP_SEC_LOGS_FILE = path.join(tmpData, 'security_logs.json');
process.env.MASTER_KEY = 'thedatazero';
process.env.MASTER_PASSWORD = 'test-polemap-master-pass';
process.env.CORS_ORIGINS = 'https://maesaios.com,http://localhost:3406';

const { createApp } = require('../server.cjs');
const { resetRadarStateForTests } = require('../src/security/radar.cjs');

let srv;
let base;

test.before(async () => {
  const app = createApp();
  srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  base = `http://127.0.0.1:${srv.address().port}`;
});

test.after(async () => {
  if (srv) await new Promise(r => srv.close(r));
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test('no hardcoded passwords or shortcut PIN remain in server.cjs / src/', () => {
  const files = [
    path.join(__dirname, '..', 'server.cjs'),
    path.join(__dirname, '..', 'docker-compose.yml'),
    path.join(__dirname, '..', 'src', 'config.cjs'),
    path.join(__dirname, '..', 'src', 'auth', 'auth.cjs')
  ];
  const legacyPin = ['1984', '2528'].join('');
  for (const f of files) {
    const txt = fs.readFileSync(f, 'utf8');
    assert.equal(txt.includes(legacyPin), false, `${f} must not contain hardcoded PIN/password`);
  }
});

test('public read endpoints and modular frontend assets serve 200 OK', async () => {
  resetRadarStateForTests();
  for (const p of ['/polemap/', '/polemap/manage', '/polemap/back', '/polemap/public/css/index.css', '/polemap/public/js/index.js', '/polemap/public/css/manage.css', '/polemap/public/js/manage.js', '/polemap/public/css/back.css', '/polemap/public/js/back.js', '/polemap/api/poles', '/polemap/api/reports/summary', '/polemap/api/health']) {
    const res = await fetch(`${base}${p}`);
    assert.equal(res.status, 200, `Expected 200 for ${p}`);
  }
});

test('strict CORS blocks evil origin and allows https://maesaios.com', async () => {
  const evil = await fetch(`${base}/polemap/api/poles`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' }
  });
  assert.equal(evil.status, 403);
  assert.equal(evil.headers.get('access-control-allow-origin'), null);

  const good = await fetch(`${base}/polemap/api/poles`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://maesaios.com', 'Access-Control-Request-Method': 'GET' }
  });
  assert.equal(good.status, 204);
  assert.equal(good.headers.get('access-control-allow-origin'), 'https://maesaios.com');
});

test('anonymous callers are blocked with 401 on pole mutations, user management, and security logs', async () => {
  resetRadarStateForTests();
  const protectedEndpoints = [
    ['POST', '/polemap/api/poles', { name: 'x', coordinates: '20.4,99.8' }],
    ['PUT', '/polemap/api/poles/123', { name: 'x' }],
    ['DELETE', '/polemap/api/poles/123'],
    ['GET', '/polemap/api/superadmin/users'],
    ['POST', '/polemap/api/superadmin/users', { username: 'hacker', password: '123' }],
    ['GET', '/polemap/api/users'],
    ['GET', '/polemap/api/security/logs'],
    ['DELETE', '/polemap/api/security/logs'],
    ['POST', '/polemap/api/security/unban-ip', { ip: '1.2.3.4' }]
  ];
  for (const [method, url, body] of protectedEndpoints) {
    const res = await fetch(`${base}${url}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    assert.equal(res.status, 401, `Expected 401 for anonymous ${method} ${url}`);
  }
});

test('DEC-027: staff/admin can CRUD poles with valid PNG magic bytes, but gets 403 on /superadmin & /security', async () => {
  resetRadarStateForTests();

  // 1. Login as Master Key -> create staff account
  const saLogin = await fetch(`${base}/polemap/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'thedatazero', password: 'test-polemap-master-pass', gate: 'back' })
  }).then(r => r.json());
  assert.equal(saLogin.success, true);
  assert.ok(saLogin.token.includes('.'));

  const createStaff = await fetch(`${base}/polemap/api/superadmin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${saLogin.token}` },
    body: JSON.stringify({ username: 'staff1', password: 'staffpass123', name: 'เจ้าหน้าที่ 1', role: 'admin' })
  }).then(r => r.json());
  assert.equal(createStaff.success, true);

  // 2. Staff blocked from /back login gate and /superadmin & /security APIs
  const backGateBlock = await fetch(`${base}/polemap/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'staff1', password: 'staffpass123', gate: 'back' })
  });
  assert.equal(backGateBlock.status, 403);

  const staffLogin = await fetch(`${base}/polemap/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'staff1', password: 'staffpass123' })
  }).then(r => r.json());
  assert.equal(staffLogin.success, true);

  const forbiddenUsers = await fetch(`${base}/polemap/api/superadmin/users`, {
    headers: { Authorization: `Bearer ${staffLogin.token}` }
  });
  assert.equal(forbiddenUsers.status, 403);

  const forbiddenLogs = await fetch(`${base}/polemap/api/security/logs`, {
    headers: { Authorization: `Bearer ${staffLogin.token}` }
  });
  assert.equal(forbiddenLogs.status, 403);

  // 3. Magic Bytes image check: reject fake PHP payload disguised as data:image/png
  const fakeImgRes = await fetch(`${base}/polemap/api/poles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staffLogin.token}` },
    body: JSON.stringify({
      name: 'เสาปลอม',
      coordinates: '20.43,99.88',
      image: 'data:image/png;base64,' + Buffer.from('<?php system($_GET["c"]); ?>').toString('base64')
    })
  });
  assert.equal(fakeImgRes.status, 400);

  // 4. Valid 1x1 PNG magic bytes succeeds, update preserves created_by, delete cleans up
  const validPngB64 = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52
  ]).toString('base64');

  const createdPole = await fetch(`${base}/polemap/api/poles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staffLogin.token}` },
    body: JSON.stringify({
      name: 'จุดทดสอบ 1',
      community: 'แม่สาย หมู่ 1',
      device_type: 'ลำโพง',
      coordinates: '20.431,99.881',
      image: `data:image/png;base64,${validPngB64}`
    })
  }).then(r => r.json());
  assert.equal(createdPole.success, true);
  assert.equal(createdPole.data.created_by, 'staff1');
  assert.ok(createdPole.data.image.endsWith('.png'));

  const updatedPole = await fetch(`${base}/polemap/api/poles/${createdPole.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${saLogin.token}` },
    body: JSON.stringify({ name: 'จุดทดสอบ 1 (แก้ไข)' })
  }).then(r => r.json());
  assert.equal(updatedPole.success, true);
  assert.equal(updatedPole.data.created_by, 'staff1');
  assert.equal(updatedPole.data.updated_by, 'thedatazero');

  const delPole = await fetch(`${base}/polemap/api/poles/${createdPole.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${staffLogin.token}` }
  }).then(r => r.json());
  assert.equal(delPole.success, true);
});

test('404/401 sweep triggers automatic 429 IP ban and logs CRITICAL alert', async () => {
  resetRadarStateForTests();
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${base}/polemap/api/unknown-scan-${i}`);
    assert.equal(r.status, 404);
  }
  const blocked = await fetch(`${base}/polemap/api/health`);
  assert.equal(blocked.status, 429);
  resetRadarStateForTests();
});
