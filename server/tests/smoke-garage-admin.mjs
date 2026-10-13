// Live-server smoke test for the new super-admin garage actions:
// edit info + temporary disable (blocks access, deletes nothing).
// Run with the API up on localhost:5000:  node tests/smoke-garage-admin.mjs
import pool from '../src/config/db.js';

const BASE = 'http://localhost:5000/api';
const failures = [];
const check = (cond, msg) => {
  console.log(`${cond ? '✔' : '✖'} ${msg}`);
  if (!cond) failures.push(msg);
};

const req = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
};

const main = async () => {
  const [garageRows] = await pool.query('SELECT id, garage_code FROM garages ORDER BY id ASC LIMIT 1');
  const seed = garageRows[0];
  const tempCode = `SMK${Date.now().toString(36).toUpperCase()}`;

  // Super admin session
  const superLogin = await req('POST', '/auth/login', {
    body: { username: 'admin', password: 'admin123', garage_code: seed.garage_code }
  });
  check(superLogin.status === 200 && superLogin.json.data.role === 'super_admin', 'super admin logs in');
  const superToken = superLogin.json.data.token;

  // New endpoint exists and the list exposes the flag
  const list = await req('GET', '/garages', { token: superToken });
  check(list.status === 200, 'GET /garages works');
  check(list.json.data.every((g) => 'is_active' in g), 'garage list exposes is_active');

  // Create a throwaway garage with its admin
  const created = await req('POST', '/garages', {
    token: superToken,
    body: { garage_name: 'Smoke Test Garage', garage_code: tempCode, username: 'smoke_admin', password: 'secret123' }
  });
  check(created.status === 201, 'temp garage created');
  const garageId = created.json.data.garage.id;

  try {
    // 1. Edit the garage info
    const edit = await req('PUT', `/garages/${garageId}`, {
      token: superToken,
      body: { garage_name: 'Smoke Test Garage Renamed', phone: '+971555000123', address: '42 Smoke Lane' }
    });
    check(edit.status === 200, 'PUT /garages/:id updates the garage');
    check(edit.json.data.garage_name === 'Smoke Test Garage Renamed', 'new name saved');
    check(edit.json.data.garage_code === tempCode, 'omitted garage code kept');

    const dupe = await req('PUT', `/garages/${garageId}`, {
      token: superToken, body: { garage_name: 'x', garage_code: seed.garage_code }
    });
    check(dupe.status === 400, 'duplicate garage code rejected (400)');

    const [userRows] = await pool.query('SELECT COUNT(*) c FROM users WHERE garage_id = ?', [garageId]);
    const usersBefore = userRows[0].c;

    // 2. Temporarily disable
    const off = await req('PATCH', `/garages/${garageId}/status`, { token: superToken, body: { is_active: false } });
    check(off.status === 200 && off.json.data.is_active === 0, 'PATCH status disables the garage');

    const blockedLogin = await req('POST', '/auth/login', {
      body: { username: 'smoke_admin', password: 'secret123', garage_code: tempCode }
    });
    check(blockedLogin.status === 403 && /disabled/i.test(blockedLogin.json.message),
      `disabled garage refuses login (403: "${blockedLogin.json?.message}")`);

    const [userRows2] = await pool.query('SELECT COUNT(*) c FROM users WHERE garage_id = ?', [garageId]);
    check(userRows2[0].c === usersBefore, 'no data deleted while disabled');

    // 3. Re-enable
    const on = await req('PATCH', `/garages/${garageId}/status`, { token: superToken, body: { is_active: true } });
    check(on.status === 200 && on.json.data.is_active === 1, 'PATCH status re-enables the garage');

    const backLogin = await req('POST', '/auth/login', {
      body: { username: 'smoke_admin', password: 'secret123', garage_code: tempCode }
    });
    check(backLogin.status === 200, 'garage admin can log in again after re-enable');
    const adminToken = backLogin.json.data.token;

    // 4. Live token of a disabled garage user is refused (disable again, then re-enable)
    await req('PATCH', `/garages/${garageId}/status`, { token: superToken, body: { is_active: false } });
    const blockedApi = await req('GET', '/customers', { token: adminToken });
    check(blockedApi.status === 401 && /disabled/i.test(blockedApi.json.message),
      `existing session is blocked (401: "${blockedApi.json?.message}")`);
    await req('PATCH', `/garages/${garageId}/status`, { token: superToken, body: { is_active: true } });

    // 5. Cannot disable own garage
    const own = await req('PATCH', `/garages/${seed.id}/status`, { token: superToken, body: { is_active: false } });
    check(own.status === 400 && /cannot disable/i.test(own.json.message), 'super admin cannot disable their own garage');
  } finally {
    // Cleanup: remove the throwaway garage (cascade) even if assertions failed
    await pool.query('DELETE FROM garages WHERE garage_code = ?', [tempCode]);
    console.log('cleaned up temp garage');
  }

  await pool.end();
  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log('\nAll smoke checks passed');
};

main().catch(async (err) => {
  console.error('SMOKE FAILED:', err);
  try { await pool.end(); } catch { /* already closed */ }
  process.exit(1);
});
