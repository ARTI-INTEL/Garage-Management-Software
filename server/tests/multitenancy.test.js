import { test, before, after } from 'node:test';
import assert from 'node:assert';
import bcrypt from 'bcrypt';
import pool from '../src/config/db.js';
import app from '../src/app.js';

// Multi-tenant isolation tests: garage B is created by the super admin,
// then we assert garage A's admin can never see or touch it.

let server;
let baseUrl;
let superToken;       // the seeded super_admin (platform operator)
let mainAdminToken;   // regular admin of the default (seeded) garage
let mainAdminGarage;  // the default garage itself
let garageBToken;     // admin of the freshly created garage

// The seeded 'admin' is super_admin and may ONLY access /api/garages, so the
// garage-scoped assertions run through a dedicated regular admin in garage A.
const MT_ADMIN_USER = 'gms_mt_admin';
let garageBCustomerId;
const garageCode = `MT${Date.now().toString(36).toUpperCase()}`;
const createdGarageCode = `SG${Date.now().toString(36).toUpperCase()}`;
// Discovered from the DB in before() — differs per database ('ADMIN' on fresh
// installs, 'MAIN' on DBs created before the rename).
let SEED_GARAGE_CODE;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  // Ensure the regular garage A admin exists in the default garage
  const [garageRows] = await pool.query('SELECT id, garage_code FROM garages ORDER BY id ASC LIMIT 1');
  const garageId = garageRows[0].id;
  SEED_GARAGE_CODE = process.env.GARAGE_CODE || garageRows[0].garage_code;
  const [existing] = await pool.query('SELECT id FROM users WHERE username = ? AND garage_id = ?', [MT_ADMIN_USER, garageId]);
  if (existing.length === 0) {
    const hashed = await bcrypt.hash('secret123', 10);
    await pool.query(
      'INSERT INTO users (username, password_hash, role, garage_id) VALUES (?, ?, ?, ?)',
      [MT_ADMIN_USER, hashed, 'admin', garageId]
    );
  }
});

after(async () => {
  // Remove the test garages (cascades to their users, customers, vehicles...)
  await pool.query('DELETE FROM garages WHERE garage_code IN (?, ?)', [garageCode, createdGarageCode]);
  await pool.query('DELETE FROM users WHERE username = ?', [MT_ADMIN_USER]);
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

const call = async (path, { method = 'GET', token, body } = {}) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json() };
};

test('seeded admin logs in as super admin of the default garage', async () => {
  const { status, body } = await call('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin123', garage_code: SEED_GARAGE_CODE }
  });
  assert.strictEqual(status, 200);
  assert.ok(body.data.garage, 'login response includes garage info');
  assert.ok(body.data.garage.code, 'garage has a code');
  superToken = body.data.token;
  mainAdminGarage = body.data.garage;
});

test('regular garage A admin can log in', async () => {
  const { status, body } = await call('/api/auth/login', {
    method: 'POST',
    body: { username: MT_ADMIN_USER, password: 'secret123', garage_code: SEED_GARAGE_CODE }
  });
  assert.strictEqual(status, 200);
  assert.strictEqual(body.data.role, 'admin');
  mainAdminToken = body.data.token;
});

test('super admin is locked out of garage data (403)', async () => {
  const { status } = await call('/api/customers', { token: superToken });
  assert.strictEqual(status, 403);
});

test('login without a garage code is rejected (400)', async () => {
  const { status, body } = await call('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin123' }
  });
  assert.strictEqual(status, 400);
  assert.match(body.message, /garage code/i);
});

test('super admin creates an isolated garage with its own admin (public signup removed)', async () => {
  // The public /api/auth/register endpoint no longer exists
  const publicReg = await call('/api/auth/register', {
    method: 'POST',
    body: { garage_name: 'X', garage_code: 'XXXXX', username: 'x', password: 'xxxxxx' }
  });
  assert.strictEqual(publicReg.status, 404);

  const { status, body } = await call('/api/garages', {
    method: 'POST',
    token: superToken,
    body: {
      garage_name: 'Tenant Test Garage',
      garage_code: garageCode,
      username: 'tenant_admin',
      password: 'secret123'
    }
  });
  assert.strictEqual(status, 201);
  assert.strictEqual(body.data.garage.garage_code, garageCode);

  // The new garage's admin logs in with username + garage code
  const login = await call('/api/auth/login', {
    method: 'POST',
    body: { username: 'tenant_admin', password: 'secret123', garage_code: garageCode }
  });
  assert.strictEqual(login.status, 200);
  assert.strictEqual(login.body.data.role, 'admin');
  assert.strictEqual(login.body.data.garage.code, garageCode);
  garageBToken = login.body.data.token;
});

test('duplicate garage codes are rejected', async () => {
  const { status } = await call('/api/garages', {
    method: 'POST',
    token: superToken,
    body: {
      garage_name: 'Copycat',
      garage_code: garageCode,
      username: 'another_admin',
      password: 'secret123'
    }
  });
  assert.strictEqual(status, 400);
});

test('garage B admin only sees garage B data', async () => {
  const created = await call('/api/customers', {
    method: 'POST',
    token: garageBToken,
    body: { full_name: 'Tenant Customer', mobile_number: '+971555000111' }
  });
  assert.strictEqual(created.status, 201);
  garageBCustomerId = created.body.data.id;

  const list = await call('/api/customers', { token: garageBToken });
  assert.strictEqual(list.status, 200);
  assert.ok(list.body.data.some((c) => c.id === garageBCustomerId));
});

test('garage A admin cannot see garage B customers (list is filtered)', async () => {
  const list = await call('/api/customers', { token: mainAdminToken });
  assert.strictEqual(list.status, 200);
  assert.ok(!list.body.data.some((c) => c.id === garageBCustomerId),
    'garage B customer must not appear in garage A list');
});

test('garage A admin cannot read garage B customer by id (404)', async () => {
  const { status } = await call(`/api/customers/${garageBCustomerId}`, { token: mainAdminToken });
  assert.strictEqual(status, 404);
});

test('garage A admin cannot update garage B customer (404)', async () => {
  const { status } = await call(`/api/customers/${garageBCustomerId}`, {
    method: 'PUT',
    token: mainAdminToken,
    body: { full_name: 'Hacked', mobile_number: '+1' }
  });
  assert.strictEqual(status, 404);

  // Row unchanged in garage B
  const check = await call(`/api/customers/${garageBCustomerId}`, { token: garageBToken });
  assert.strictEqual(check.body.data.full_name, 'Tenant Customer');
});

test('garage A admin cannot modify garage B users (404)', async () => {
  const users = await call('/api/users', { token: garageBToken });
  const tenantAdminId = users.body.data.find((u) => u.username === 'tenant_admin').id;

  const { status } = await call(`/api/users/${tenantAdminId}`, {
    method: 'PUT',
    token: mainAdminToken,
    body: { is_active: false }
  });
  assert.strictEqual(status, 404);
});

test('same username in two garages is resolved by the garage code', async () => {
  // Per-run unique username so the suite is safe to re-run: the garage A copy
  // persists in the default garage after the test, so a fixed name would
  // collide with "Username already exists" on the next run.
  const sharedUsername = `shared_${Date.now().toString(36)}`;

  // Create the same username in both garages
  const inB = await call('/api/users', {
    method: 'POST',
    token: garageBToken,
    body: { username: sharedUsername, password: 'secret123', role: 'mechanic' }
  });
  assert.strictEqual(inB.status, 201);
  const inA = await call('/api/users', {
    method: 'POST',
    token: mainAdminToken,
    body: { username: sharedUsername, password: 'secret123', role: 'mechanic' }
  });
  assert.strictEqual(inA.status, 201);

  // Missing garage code is rejected outright
  const noCode = await call('/api/auth/login', {
    method: 'POST',
    body: { username: sharedUsername, password: 'secret123' }
  });
  assert.strictEqual(noCode.status, 400);

  // Resolves with the right garage code
  const withCode = await call('/api/auth/login', {
    method: 'POST',
    body: { username: sharedUsername, password: 'secret123', garage_code: garageCode }
  });
  assert.strictEqual(withCode.status, 200);
  assert.strictEqual(withCode.body.data.garage.code, garageCode);

  // And the wrong garage code fails
  const wrongCode = await call('/api/auth/login', {
    method: 'POST',
    body: { username: sharedUsername, password: 'secret123', garage_code: 'NOSUCHGARAGE' }
  });
  assert.strictEqual(wrongCode.status, 401);

  // Clean up the copy that lives in the default garage (the garage B copy is
  // removed by the garage cascade in after())
  await pool.query('DELETE FROM users WHERE username = ? AND garage_id = ?', [sharedUsername, mainAdminGarage.id]);
});

// ===== Super-admin garage management =====

test('regular garage admin is blocked (403) from garage management', async () => {
  const { status } = await call('/api/garages', { token: garageBToken });
  assert.strictEqual(status, 403);
});

test('super admin lists all garages with stats', async () => {
  const { status, body } = await call('/api/garages', { token: superToken });
  assert.strictEqual(status, 200);
  const codes = body.data.map((g) => g.garage_code);
  assert.ok(codes.includes(garageCode), 'tenant garage appears in the list');
  const tenant = body.data.find((g) => g.garage_code === garageCode);
  assert.ok(tenant.user_count >= 1, 'user_count is populated');
});

test('super admin creates a garage with its admin user', async () => {
  const { status, body } = await call('/api/garages', {
    method: 'POST',
    token: superToken,
    body: {
      garage_name: 'Super Created Garage',
      garage_code: createdGarageCode,
      username: 'sg_admin',
      password: 'secret123'
    }
  });
  assert.strictEqual(status, 201);
  assert.strictEqual(body.data.garage.garage_code, createdGarageCode);

  // The created garage's admin can log in with the garage code
  const login = await call('/api/auth/login', {
    method: 'POST',
    body: { username: 'sg_admin', password: 'secret123', garage_code: createdGarageCode }
  });
  assert.strictEqual(login.status, 200);
  assert.strictEqual(login.body.data.role, 'admin');
});

test('super admin cannot delete their own garage', async () => {
  const { status, body } = await call(`/api/garages/${mainAdminGarage.id}?confirm_code=${mainAdminGarage.code}`, {
    method: 'DELETE',
    token: superToken
  });
  assert.strictEqual(status, 400);
  assert.match(body.message, /cannot delete the garage you belong to/i);
});

test('delete requires the matching confirm code', async () => {
  const list = await call('/api/garages', { token: superToken });
  const tenant = list.body.data.find((g) => g.garage_code === garageCode);

  const wrong = await call(`/api/garages/${tenant.id}?confirm_code=WRONGCODE`, {
    method: 'DELETE',
    token: superToken
  });
  assert.strictEqual(wrong.status, 400);

  // Still exists
  const check = await call('/api/garages', { token: superToken });
  assert.ok(check.body.data.some((g) => g.id === tenant.id));
});

// ===== Edit garage info + temporary disable =====

test('super admin edits garage info (PUT /api/garages/:id)', async () => {
  const list = await call('/api/garages', { token: superToken });
  const tenant = list.body.data.find((g) => g.garage_code === garageCode);
  assert.ok(tenant, 'tenant garage exists before editing');

  const upd = await call(`/api/garages/${tenant.id}`, {
    method: 'PUT',
    token: superToken,
    body: { garage_name: 'Tenant Test Garage Renamed', phone: '+971500000002', address: '12 Rewritten Street' }
  });
  assert.strictEqual(upd.status, 200);
  assert.strictEqual(upd.body.data.garage_name, 'Tenant Test Garage Renamed');
  assert.strictEqual(upd.body.data.phone, '+971500000002');
  assert.strictEqual(upd.body.data.address, '12 Rewritten Street');
  // omitted fields (garage_code) keep their previous value
  assert.strictEqual(upd.body.data.garage_code, garageCode);

  // duplicate code -> 400
  const dupe = await call(`/api/garages/${tenant.id}`, {
    method: 'PUT', token: superToken,
    body: { garage_name: 'Tenant Test Garage Renamed', garage_code: createdGarageCode }
  });
  assert.strictEqual(dupe.status, 400);
  assert.match(dupe.body.message, /already taken/i);

  // malformed code -> 400 (validation shared with create)
  const badCode = await call(`/api/garages/${tenant.id}`, {
    method: 'PUT', token: superToken,
    body: { garage_name: 'Tenant Test Garage Renamed', garage_code: 'x' }
  });
  assert.strictEqual(badCode.status, 400);
  assert.match(badCode.body.message, /3-30 characters/i);

  // missing name -> 400 (schema validation)
  const noName = await call(`/api/garages/${tenant.id}`, {
    method: 'PUT', token: superToken, body: { phone: '+1' }
  });
  assert.strictEqual(noName.status, 400);
  assert.match(noName.body.message, /garage name is required/i);

  // non-super-admin still blocked
  const denied = await call(`/api/garages/${tenant.id}`, {
    method: 'PUT', token: garageBToken,
    body: { garage_name: 'Hijacked' }
  });
  assert.strictEqual(denied.status, 403);

  // change shows up in the list
  const after = await call('/api/garages', { token: superToken });
  const updated = after.body.data.find((g) => g.id === tenant.id);
  assert.strictEqual(updated.garage_name, 'Tenant Test Garage Renamed');
  assert.strictEqual(Number(updated.is_active), 1, 'new is_active flag is exposed in the list');
});

test('super admin cannot disable their own garage', async () => {
  const { status, body } = await call(`/api/garages/${mainAdminGarage.id}/status`, {
    method: 'PATCH',
    token: superToken,
    body: { is_active: false }
  });
  assert.strictEqual(status, 400);
  assert.match(body.message, /cannot disable the garage you belong to/i);
});

test('temporarily disabling a garage blocks all access but keeps every row', async () => {
  const list = await call('/api/garages', { token: superToken });
  const tenant = list.body.data.find((g) => g.garage_code === garageCode);
  const [rowsBefore] = await pool.query('SELECT COUNT(*) AS c FROM customers WHERE garage_id = ?', [tenant.id]);
  assert.ok(rowsBefore[0].c >= 1, 'garage B has data before disabling');

  const off = await call(`/api/garages/${tenant.id}/status`, {
    method: 'PATCH', token: superToken, body: { is_active: false }
  });
  assert.strictEqual(off.status, 200);
  assert.strictEqual(off.body.data.is_active, 0);

  // 1. New logins are refused
  const login = await call('/api/auth/login', {
    method: 'POST',
    body: { username: 'tenant_admin', password: 'secret123', garage_code: garageCode }
  });
  assert.strictEqual(login.status, 403);
  assert.match(login.body.message, /temporarily disabled/i);

  // 2. Already-issued tokens are refused on every API route
  const api = await call('/api/customers', { token: garageBToken });
  assert.strictEqual(api.status, 401);
  assert.match(api.body.message, /temporarily disabled/i);

  // 3. ...but nothing was deleted
  const [rowsAfter] = await pool.query('SELECT COUNT(*) AS c FROM customers WHERE garage_id = ?', [tenant.id]);
  assert.strictEqual(rowsAfter[0].c, rowsBefore[0].c, 'customer rows survive the disable');
  const stillListed = await call('/api/garages', { token: superToken });
  assert.ok(stillListed.body.data.some((g) => g.id === tenant.id), 'garage still listed');

  // 4. Re-enabling restores access without any data migration
  const on = await call(`/api/garages/${tenant.id}/status`, {
    method: 'PATCH', token: superToken, body: { is_active: true }
  });
  assert.strictEqual(on.status, 200);
  assert.strictEqual(on.body.data.is_active, 1);

  const loginAgain = await call('/api/auth/login', {
    method: 'POST',
    body: { username: 'tenant_admin', password: 'secret123', garage_code: garageCode }
  });
  assert.strictEqual(loginAgain.status, 200);
  const apiAgain = await call('/api/customers', { token: garageBToken });
  assert.strictEqual(apiAgain.status, 200);
  assert.ok(apiAgain.body.data.some((c) => c.id === garageBCustomerId), 'data still reachable after re-enable');
});

test('super admin deletes a garage and all its data', async () => {
  const list = await call('/api/garages', { token: superToken });
  const tenant = list.body.data.find((g) => g.garage_code === garageCode);

  const del = await call(`/api/garages/${tenant.id}?confirm_code=${garageCode}`, {
    method: 'DELETE',
    token: superToken
  });
  assert.strictEqual(del.status, 200);

  // Gone from the list
  const after1 = await call('/api/garages', { token: superToken });
  assert.ok(!after1.body.data.some((g) => g.garage_code === garageCode));

  // Its admin can no longer log in
  const login = await call('/api/auth/login', {
    method: 'POST',
    body: { username: 'tenant_admin', password: 'secret123', garage_code: garageCode }
  });
  assert.strictEqual(login.status, 401);
});
