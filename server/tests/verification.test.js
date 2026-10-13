import { test, before, after } from 'node:test';
import assert from 'node:assert';
import bcrypt from 'bcrypt';
import fs from 'node:fs';
import path from 'node:path';
import pool from '../src/config/db.js';
import app from '../src/app.js';
import { logger, logsDir } from '../src/utils/logger.js';

let server;
let baseUrl;
let adminToken;        // regular garage admin (all garage-scoped tests)
let superAdminToken;   // the seeded super_admin (platform operator)
let mechanicToken;
let testAdminId;

// The seeded 'admin' user is a super_admin and can ONLY access /api/garages,
// so the suite operates through a dedicated regular admin in the default garage.
const TEST_ADMIN_USER = 'gms_test_admin';

before(async () => {
  // Start server on an ephemeral port
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  // Ensure the regular garage admin exists in the default garage
  const [garageRows] = await pool.query('SELECT id, garage_code FROM garages ORDER BY id ASC LIMIT 1');
  const garageId = garageRows[0].id;
  SEED_GARAGE_CODE = process.env.GARAGE_CODE || garageRows[0].garage_code;
  const [existing] = await pool.query('SELECT id FROM users WHERE username = ? AND garage_id = ?', [TEST_ADMIN_USER, garageId]);
  if (existing.length === 0) {
    const hashed = await bcrypt.hash('secret123', 10);
    const [ins] = await pool.query(
      'INSERT INTO users (username, password_hash, role, garage_id) VALUES (?, ?, ?, ?)',
      [TEST_ADMIN_USER, hashed, 'admin', garageId]
    );
    testAdminId = ins.insertId;
  } else {
    testAdminId = existing[0].id;
  }

  // The mechanic fixture: npm run migrate does NOT create it (it lives in the
  // optional seed_mechanic.js), so a fresh CI database would fail every test
  // that logs in as a mechanic. Ensure it here instead of depending on demo data.
  const [mech] = await pool.query('SELECT id FROM users WHERE username = ? AND garage_id = ?', ['mechanic_bob', garageId]);
  if (mech.length === 0) {
    const hashed = await bcrypt.hash('mech123', 10);
    const [ins] = await pool.query(
      'INSERT INTO users (username, password_hash, role, garage_id) VALUES (?, ?, ?, ?)',
      ['mechanic_bob', hashed, 'mechanic', garageId]
    );
    await pool.query(
      'INSERT INTO mechanic_profiles (user_id, full_name) VALUES (?, ?)',
      [ins.insertId, 'Bob The Builder']
    );
  }
});

after(async () => {
  await pool.query('DELETE FROM users WHERE username = ?', [TEST_ADMIN_USER]);
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

// Login now always requires the garage code of the seeded (default) garage.
// Discovered from the DB in before() — the code differs per database
// ('ADMIN' on fresh installs, 'MAIN' on DBs created before the rename).
let SEED_GARAGE_CODE;

const login = async (username, password) => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, garage_code: SEED_GARAGE_CODE })
  });
  const body = await res.json();
  return { status: res.status, body };
};

// ===== Verification Plan: "Verify server starts and connects to MySQL successfully" =====

test('server starts and connects to MySQL successfully', async () => {
  const [rows] = await pool.query('SELECT 1 + 1 AS solution');
  assert.strictEqual(rows[0].solution, 2);

  const res = await fetch(`${baseUrl}/api/health`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.status, 'success');
});

test('seeded admin logs in as super_admin (DB-backed authentication works)', async () => {
  const { status, body } = await login('admin', 'admin123');
  assert.strictEqual(status, 200);
  assert.strictEqual(body.status, 'success');
  assert.ok(body.data.role === 'admin' || body.data.role === 'super_admin',
    `unexpected role: ${body.data.role}`);
  assert.ok(body.data.token);
  superAdminToken = body.data.token;
});

test('regular garage admin can log in', async () => {
  const { status, body } = await login(TEST_ADMIN_USER, 'secret123');
  assert.strictEqual(status, 200);
  assert.strictEqual(body.data.role, 'admin');
  adminToken = body.data.token;
});

test('super admin is locked out of garage data routes (403)', async () => {
  for (const path of ['/api/customers', '/api/vehicles', '/api/dashboard/stats', '/api/settings', '/api/invoices']) {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${superAdminToken}` }
    });
    assert.strictEqual(res.status, 403, `${path} must be 403 for super_admin`);
  }
  // ...but can access its own profile and the garage panel
  const me = await fetch(`${baseUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${superAdminToken}` } });
  assert.strictEqual(me.status, 200);
  const garages = await fetch(`${baseUrl}/api/garages`, { headers: { Authorization: `Bearer ${superAdminToken}` } });
  assert.strictEqual(garages.status, 200);
});

test('mechanic can log in', async () => {
  const { status, body } = await login('mechanic_bob', 'mech123');
  assert.strictEqual(status, 200);
  assert.strictEqual(body.data.role, 'mechanic');
  mechanicToken = body.data.token;
});

test('invalid credentials are rejected', async () => {
  const { status } = await login('admin', 'wrong-password');
  assert.strictEqual(status, 401);
});

// ===== Verification Plan: "Verify Role-Based access blocks mechanic accounts from admin endpoints" =====

const adminOnlyRoutes = [
  { method: 'GET', path: '/api/customers' },
  { method: 'POST', path: '/api/customers', body: { full_name: 'X', mobile_number: '1' } },
  { method: 'GET', path: '/api/invoices' },
  { method: 'POST', path: '/api/invoices/generate', body: { vehicle_id: 1 } },
  { method: 'POST', path: '/api/invoices/1/payments', body: { amount: 10 } },
  { method: 'POST', path: '/api/jobs', body: { vehicle_id: 1, title: 'X' } },
  { method: 'POST', path: '/api/jobs/1/parts', body: { part_name: 'X' } },
  { method: 'GET', path: '/api/users/mechanics' },
  { method: 'GET', path: '/api/users' },
  { method: 'POST', path: '/api/users', body: { username: 'x', password: 'xxxxxx', role: 'mechanic' } },
  { method: 'PUT', path: '/api/users/1', body: { role: 'mechanic' } },
  { method: 'PUT', path: '/api/settings', body: { garage_name: 'Hacked' } },
  { method: 'POST', path: '/api/parts', body: { part_number: 'X1', name: 'X' } },
  { method: 'PUT', path: '/api/parts/1', body: { part_number: 'X1', name: 'X' } },
  { method: 'DELETE', path: '/api/parts/1' },
  { method: 'GET', path: '/api/quotes' },
  { method: 'POST', path: '/api/quotes/generate', body: { repair_job_id: 1 } },
  { method: 'PUT', path: '/api/quotes/1/status', body: { status: 'Approved' } },
  { method: 'GET', path: '/api/quotes/1/whatsapp' },
  { method: 'GET', path: '/api/reports' },
  { method: 'GET', path: '/api/garages' },
  { method: 'POST', path: '/api/garages', body: { garage_name: 'X', garage_code: 'XXXXX', username: 'x', password: 'xxxxxx' } },
  { method: 'DELETE', path: '/api/garages/1?confirm_code=XXXXX' }
];

for (const route of adminOnlyRoutes) {
  test(`mechanic is blocked (403) from admin route ${route.method} ${route.path}`, async () => {
    const res = await fetch(`${baseUrl}${route.path}`, {
      method: route.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mechanicToken}`
      },
      body: route.body ? JSON.stringify(route.body) : undefined
    });
    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.strictEqual(body.status, 'error');
  });
}

test('requests without a token are rejected (401)', async () => {
  const res = await fetch(`${baseUrl}/api/customers`);
  assert.strictEqual(res.status, 401);
});

test('admin can access admin route GET /api/customers', async () => {
  const res = await fetch(`${baseUrl}/api/customers`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.status, 'success');
  assert.ok(Array.isArray(body.data));
});

// ===== Stage 5 endpoints =====

test('dashboard stats endpoint returns expected shape', async () => {
  const res = await fetch(`${baseUrl}/api/dashboard/stats`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.strictEqual(res.status, 200);
  const { data } = await res.json();
  for (const key of ['totalVehicles', 'totalCustomers', 'jobsInProgress', 'readyForCollection', 'unpaidInvoices', 'totalRevenue', 'statusBreakdown', 'monthlyRevenue']) {
    assert.ok(key in data, `missing ${key}`);
  }
  assert.ok(Array.isArray(data.statusBreakdown));
  assert.ok(Array.isArray(data.monthlyRevenue));
});

test('settings endpoint is readable by admin and updatable by admin only', async () => {
  const getRes = await fetch(`${baseUrl}/api/settings`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.strictEqual(getRes.status, 200);
  const before = (await getRes.json()).data;

  const putRes = await fetch(`${baseUrl}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      garage_name: before.garage_name,
      address: before.address,
      phone: before.phone,
      logo_url: before.logo_url,
      currency: before.currency,
      tax_rate: before.tax_rate,
      whatsapp_template: before.whatsapp_template
    })
  });
  assert.strictEqual(putRes.status, 200);
  assert.strictEqual((await putRes.json()).data.garage_name, before.garage_name);
});

test('mechanic can access their assigned jobs but not generate invoices', async () => {
  const okRes = await fetch(`${baseUrl}/api/jobs/my-jobs`, {
    headers: { Authorization: `Bearer ${mechanicToken}` }
  });
  assert.strictEqual(okRes.status, 200);

  const denyRes = await fetch(`${baseUrl}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mechanicToken}` },
    body: JSON.stringify({ vehicle_id: 1, title: 'nope' })
  });
  assert.strictEqual(denyRes.status, 403);
});

// ===== New feature endpoints =====

test('parts catalog: admin CRUD + mechanic blocked + pagination shape', async () => {
  const pn = `TST-${Date.now()}`;
  const createRes = await fetch(`${baseUrl}/api/parts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ part_number: pn, name: 'Test Part', cost_price: 10, sell_price: 20, qty_in_stock: 3, low_stock_threshold: 5 })
  });
  assert.strictEqual(createRes.status, 201);
  const part = (await createRes.json()).data;
  assert.strictEqual(part.qty_in_stock, 3);

  // appears in low-stock list (3 <= 5)
  const lowRes = await fetch(`${baseUrl}/api/parts?low_stock=1`, { headers: { Authorization: `Bearer ${adminToken}` } });
  const lowParts = (await lowRes.json()).data;
  assert.ok(lowParts.some(p => p.part_number === pn));

  const dupRes = await fetch(`${baseUrl}/api/parts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ part_number: pn, name: 'Dup' })
  });
  assert.strictEqual(dupRes.status, 400);

  const delRes = await fetch(`${baseUrl}/api/parts/${part.id}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.strictEqual(delRes.status, 200);
});

test('pagination returns meta when page/limit given, plain array otherwise', async () => {
  const paginated = await fetch(`${baseUrl}/api/customers?page=1&limit=2`, { headers: { Authorization: `Bearer ${adminToken}` } });
  const pagBody = await paginated.json();
  assert.ok(Array.isArray(pagBody.data));
  assert.ok(pagBody.pagination);
  assert.strictEqual(pagBody.pagination.page, 1);
  assert.ok(pagBody.pagination.totalPages >= 1);

  const legacy = await fetch(`${baseUrl}/api/customers`, { headers: { Authorization: `Bearer ${adminToken}` } });
  const legacyBody = await legacy.json();
  assert.ok(Array.isArray(legacyBody.data));
  assert.strictEqual(legacyBody.pagination, undefined);
});

test('reports endpoint returns expected shape', async () => {
  const res = await fetch(`${baseUrl}/api/reports`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.strictEqual(res.status, 200);
  const { data } = await res.json();
  for (const key of ['revenueByMonth', 'mechanicPerformance', 'topCustomers', 'vat', 'paymentMethods']) {
    assert.ok(key in data, `missing ${key}`);
  }
  assert.ok('total_tax' in data.vat);
});

test('user management: create mechanic, deactivate blocks login, cleanup', async () => {
  const username = `tmp_mech_${Date.now()}`;
  const createRes = await fetch(`${baseUrl}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ username, password: 'secret123', role: 'mechanic', full_name: 'Temp Mechanic' })
  });
  assert.strictEqual(createRes.status, 201);
  const created = (await createRes.json()).data;
  assert.strictEqual(created.role, 'mechanic');

  // created user can log in
  const loginOk = await login(username, 'secret123');
  assert.strictEqual(loginOk.status, 200);

  // deactivate -> login blocked with 403
  const deact = await fetch(`${baseUrl}/api/users/${created.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ is_active: false })
  });
  assert.strictEqual(deact.status, 200);
  const loginBlocked = await login(username, 'secret123');
  assert.strictEqual(loginBlocked.status, 403);

  // self-lockout protection (against the test admin's OWN account)
  const selfLock = await fetch(`${baseUrl}/api/users/${testAdminId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ is_active: false })
  });
  assert.strictEqual(selfLock.status, 400);

  // cleanup: delete temp user
  await pool.query('DELETE FROM mechanic_profiles WHERE user_id = ?', [created.id]);
  await pool.query('DELETE FROM users WHERE id = ?', [created.id]);
});

test('password change requires current password', async () => {
  // wrong current password -> 401
  const bad = await fetch(`${baseUrl}/api/users/me/password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mechanicToken}` },
    body: JSON.stringify({ current_password: 'not-my-password', new_password: 'newsecret1' })
  });
  assert.strictEqual(bad.status, 401);

  // short new password -> 400
  const short = await fetch(`${baseUrl}/api/users/me/password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mechanicToken}` },
    body: JSON.stringify({ current_password: 'mech123', new_password: '123' })
  });
  assert.strictEqual(short.status, 400);
});

// ===== Pagination on parts / users / quotes (same contract as customers) =====

test('parts, users and quotes return pagination meta with page/limit', async () => {
  for (const path of ['/api/parts', '/api/users', '/api/quotes']) {
    const res = await fetch(`${baseUrl}${path}?page=1&limit=2`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.status, 200, `${path} must be 200`);
    const body = await res.json();
    assert.ok(Array.isArray(body.data), `${path} data must be an array`);
    assert.ok(body.data.length <= 2, `${path} must respect limit=2`);
    assert.ok(body.pagination, `${path} must include pagination meta`);
    assert.strictEqual(body.pagination.page, 1);
    assert.strictEqual(body.pagination.limit, 2);
    assert.ok(body.pagination.totalPages >= 1, `${path} totalPages >= 1`);
    assert.ok(typeof body.pagination.total === 'number');
  }
});

test('parts, users and quotes stay a plain array without page/limit (legacy clients)', async () => {
  for (const path of ['/api/parts', '/api/users', '/api/quotes']) {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const body = await res.json();
    assert.strictEqual(body.pagination, undefined, `${path} must not send pagination meta`);
  }
});

// ===== Input validation middleware =====

test('validation rejects missing required fields with a 400', async () => {
  const res = await fetch(`${baseUrl}/api/customers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ mobile_number: '+971500000001' }) // full_name missing
  });
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.strictEqual(body.status, 'error');
  assert.match(body.message, /full name is required/i);
});

test('validation rejects bad types and out-of-range numbers with a 400', async () => {
  // non-numeric quantity
  const badType = await fetch(`${baseUrl}/api/parts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ part_number: 'VAL-1', name: 'Validation Part', qty_in_stock: 'lots' })
  });
  assert.strictEqual(badType.status, 400);
  assert.match((await badType.json()).message, /whole number|number/i);

  // negative price (min: 0)
  const negative = await fetch(`${baseUrl}/api/parts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ part_number: 'VAL-2', name: 'Validation Part', cost_price: -5 })
  });
  assert.strictEqual(negative.status, 400);
  assert.match((await negative.json()).message, /at least 0/i);
});

test('validation rejects values outside the job status enum', async () => {
  const res = await fetch(`${baseUrl}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ vehicle_id: 1, title: 'Anything', status: 'Exploded' })
  });
  assert.strictEqual(res.status, 400);
  assert.match((await res.json()).message, /status must be one of/i);
});

// ===== Password reset (admin-issued one-time code) =====

test('admin issues a reset code, user redeems it, old code cannot be replayed', async () => {
  const username = `tmp_reset_${Date.now()}`;
  const createRes = await fetch(`${baseUrl}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ username, password: 'origpass1', role: 'mechanic', full_name: 'Reset Me' })
  });
  assert.strictEqual(createRes.status, 201);
  const userId = (await createRes.json()).data.id;

  // 1. Admin issues the code
  const issueRes = await fetch(`${baseUrl}/api/users/${userId}/reset-code`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.strictEqual(issueRes.status, 201);
  const issued = (await issueRes.json()).data;
  assert.match(String(issued.code), /^\d{6}$/, 'code must be 6 digits');
  assert.strictEqual(issued.expires_in_minutes, 15);

  // 2. A wrong code is rejected with the generic message
  const wrong = await fetch(`${baseUrl}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, garage_code: SEED_GARAGE_CODE, code: '000000', new_password: 'brandnew1' })
  });
  assert.strictEqual(wrong.status, 400);
  const wrongMessage = (await wrong.json()).message;
  assert.match(wrongMessage, /invalid or expired reset code/i);

  // 3. The real code works and the old password stops working
  const redeem = await fetch(`${baseUrl}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, garage_code: SEED_GARAGE_CODE, code: issued.code, new_password: 'brandnew1' })
  });
  assert.strictEqual(redeem.status, 200);
  assert.strictEqual((await login(username, 'origpass1')).status, 401, 'old password must be dead');
  assert.strictEqual((await login(username, 'brandnew1')).status, 200, 'new password must work');

  // 4. Replaying the same code must fail (single-use)
  const replay = await fetch(`${baseUrl}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, garage_code: SEED_GARAGE_CODE, code: issued.code, new_password: 'thirdpass1' })
  });
  assert.strictEqual(replay.status, 400);
  assert.strictEqual((await login(username, 'brandnew1')).status, 200, 'password unchanged by replay');

  // 5. Unknown user -> same generic 400 (no account probing)
  const ghost = await fetch(`${baseUrl}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'nobody_here', garage_code: SEED_GARAGE_CODE, code: '999999', new_password: 'whatever1' })
  });
  assert.strictEqual(ghost.status, 400);
  assert.strictEqual((await ghost.json()).message, wrongMessage, 'same message for unknown user and bad code');

  // cleanup
  await pool.query('DELETE FROM mechanic_profiles WHERE user_id = ?', [userId]);
  await pool.query('DELETE FROM users WHERE id = ?', [userId]);
});

// ===== File logger (logs/) =====

test('logger writes to logs/app.log, logs/error.log and logs/access.log', async () => {
  const marker = `logger-selftest-${Date.now()}`;
  const read = (file) => fs.readFileSync(path.join(logsDir, file), 'utf8');

  logger.info(marker, { via: 'test' });
  logger.error(`${marker} boom`, new Error('kaboom'));

  const appLog = read('app.log');
  assert.ok(appLog.includes(marker), 'info line lands in app.log');
  assert.ok(appLog.includes('[INFO]'), 'lines carry a level tag');
  assert.ok(appLog.includes(`${marker} boom`), 'errors are also appended to app.log');

  const errorLog = read('error.log');
  assert.ok(errorLog.includes(`${marker} boom`), 'errors land in error.log');
  assert.ok(errorLog.includes('kaboom'), 'the Error object is serialised into the line');

  // Every completed request is appended to access.log (line shape:
  // <iso> METHOD /path STATUS DURATIONms)
  const before = read('access.log');
  const res = await fetch(`${baseUrl}/api/health`);
  assert.strictEqual(res.status, 200);
  const added = read('access.log').slice(before.length);
  assert.match(added, /GET \/api\/health 200 \d+\.\d+ms/);
});

// MUST be the last test: hammering /api/auth/login exhausts the rate limiter
// for this process (20 requests / 15 min / IP), which would break logins above.
test('login rate limiter kicks in after repeated failed attempts (429)', async () => {
  let saw429 = false;
  let lastStatus = 0;
  for (let i = 0; i < 30 && !saw429; i++) {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: `wrong-${i}`, garage_code: SEED_GARAGE_CODE })
    });
    lastStatus = res.status;
    if (res.status === 429) saw429 = true;
  }
  assert.strictEqual(saw429, true, `expected a 429 within 30 attempts, last status ${lastStatus}`);
  const body = await (await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'still-wrong', garage_code: SEED_GARAGE_CODE })
  })).json();
  assert.strictEqual(body.status, 'error');
  assert.match(body.message, /too many/i);
});
