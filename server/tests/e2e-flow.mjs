// End-to-end verification of the plan's manual flow:
// Login as Admin -> Register Customer -> Register Vehicle -> Create Diagnosis ->
// Add Parts/Labour -> Complete Job -> Generate Invoice -> View PDF ->
// Open WhatsApp Link -> Mark as Paid
const BASE = process.env.BASE_URL || 'http://localhost:5000/api';
// Discovered from the DB in main() — differs per database ('ADMIN' on fresh
// installs, 'MAIN' on DBs created before the rename).
let SEED_GARAGE_CODE;
let SEED_GARAGE_NAME;

import bcrypt from 'bcrypt';
import pool from '../src/config/db.js';

const req = async (method, path, { token, body, raw } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (raw) return { status: res.status, res };
  let json = null;
  try { json = await res.json(); } catch { /* binary */ }
  return { status: res.status, json };
};

const assert = (cond, msg) => {
  if (!cond) { console.error(`✖ FAIL: ${msg}`); process.exit(1); }
  console.log(`✔ ${msg}`);
};

const main = async () => {
  // 1. Login as the garage Admin.
  // The seeded 'admin' user is a super_admin restricted to /api/garages, so
  // the flow runs through a dedicated regular admin in the default garage.
  const [garageRows] = await pool.query('SELECT id, garage_code, garage_name FROM garages ORDER BY id ASC LIMIT 1');
  const garageId = garageRows[0].id;
  SEED_GARAGE_CODE = process.env.GARAGE_CODE || garageRows[0].garage_code;
  // The garage name is data, not a constant — fresh installs say "My Auto
  // Workshop", real databases say whatever the owner renamed it to.
  SEED_GARAGE_NAME = garageRows[0].garage_name;
  const ADMIN_USER = 'e2e_admin';
  const [admins] = await pool.query('SELECT id FROM users WHERE username = ? AND garage_id = ?', [ADMIN_USER, garageId]);
  if (admins.length === 0) {
    const hashed = await bcrypt.hash('secret123', 10);
    await pool.query('INSERT INTO users (username, password_hash, role, garage_id) VALUES (?, ?, ?, ?)', [ADMIN_USER, hashed, 'admin', garageId]);
  }
  // Same deal for the mechanic: migrate doesn't seed it (optional demo script),
  // so a fresh database must get it here or the mechanic steps below 401.
  const [mechFixture] = await pool.query('SELECT id FROM users WHERE username = ? AND garage_id = ?', ['mechanic_bob', garageId]);
  if (mechFixture.length === 0) {
    const hashed = await bcrypt.hash('mech123', 10);
    const [ins] = await pool.query('INSERT INTO users (username, password_hash, role, garage_id) VALUES (?, ?, ?, ?)', ['mechanic_bob', hashed, 'mechanic', garageId]);
    await pool.query('INSERT INTO mechanic_profiles (user_id, full_name) VALUES (?, ?)', [ins.insertId, 'Bob The Builder']);
  }
  let r = await req('POST', '/auth/login', { body: { username: ADMIN_USER, password: 'secret123', garage_code: SEED_GARAGE_CODE } });
  assert(r.status === 200 && r.json.data.token,
    `Login as Admin${r.status === 200 ? '' : ` (${r.status}: ${r.json?.message || 'no message'})`}`);
  const admin = r.json.data.token;

  // 2. Register Customer
  const phone = `+9715${Date.now().toString().slice(-8)}`;
  r = await req('POST', '/customers', { token: admin, body: { full_name: 'E2E Test Customer', mobile_number: phone, whatsapp_number: phone } });
  assert(r.status === 201, 'Register Customer');
  const customerId = r.json.data.id;

  // 3. Register Vehicle
  const plate = `E2E-${Date.now().toString().slice(-6)}`;
  r = await req('POST', '/vehicles', { token: admin, body: { customer_id: customerId, registration_number: plate, make: 'Toyota', model: 'Camry', year: 2021 } });
  assert(r.status === 201, 'Register Vehicle');
  const vehicleId = r.json.data.id;

  // 4. Create Diagnosis (job with labour)
  r = await req('POST', '/jobs', { token: admin, body: { vehicle_id: vehicleId, title: 'Brake pad replacement', description: 'Front brakes worn', labour_cost: 250, priority: 'high' } });
  assert(r.status === 201, 'Create Diagnosis with labour cost');
  const jobId = r.json.data.id;

  // 5. Add Parts
  r = await req('POST', `/jobs/${jobId}/parts`, { token: admin, body: { part_name: 'Brake Pads', part_number: 'BP-100', quantity: 2, unit_price: 75 } });
  assert(r.status === 201, 'Add Parts');

  // Assign mechanic + verify mechanic can complete their job (Stage 3)
  const mech = await req('POST', '/auth/login', { body: { username: 'mechanic_bob', password: 'mech123', garage_code: SEED_GARAGE_CODE } });
  const mechToken = mech.json.data.token;
  r = await req('PUT', `/jobs/${jobId}`, { token: admin, body: { mechanic_id: mech.json.data.id, status: 'In Progress' } });
  assert(r.status === 200, 'Admin assigns mechanic + starts job');

  // Mechanic completes the job (status only — regression check for the null-title bug)
  r = await req('PUT', `/jobs/${jobId}`, { token: mechToken, body: { status: 'Fixed' } });
  assert(r.status === 200, 'Mechanic marks job Fixed (status-only update)');

  // Verify title survived the admin status-only update path too
  r = await req('PUT', `/jobs/${jobId}`, { token: admin, body: { status: 'Fixed' } });
  assert(r.status === 200, 'Admin status-only update works (no null title crash)');
  const jobs = await req('GET', `/jobs/vehicle/${vehicleId}`, { token: admin });
  const job = jobs.json.data.find(j => j.id === jobId);
  assert(job.title === 'Brake pad replacement' && job.status === 'Fixed', 'Job title intact after status updates');

  // 6. Generate Invoice (tax_rate omitted -> uses garage_settings)
  r = await req('POST', '/invoices/generate', { token: admin, body: { vehicle_id: vehicleId, discount: 10 } });
  assert(r.status === 201, 'Generate Invoice');
  const invoiceId = r.json.data.id;
  const inv = await req('GET', `/invoices/${invoiceId}`, { token: admin });
  const expectedSubtotal = 250 + (2 * 75); // labour + parts = 400
  assert(Math.abs(parseFloat(inv.json.data.subtotal) - expectedSubtotal) < 0.01, `Subtotal correct (${expectedSubtotal})`);
  assert(Math.abs(parseFloat(inv.json.data.grand_total) - (expectedSubtotal - 10)) < 0.01, 'Grand total = subtotal - discount (tax from settings = 0)');

  // 7. View PDF
  r = await req('GET', `/invoices/${invoiceId}/pdf`, { token: admin, raw: true });
  const buf = Buffer.from(await r.res.arrayBuffer());
  assert(r.status === 200 && buf.subarray(0, 5).toString() === '%PDF-', `Download PDF (${buf.length} bytes, %PDF header)`);
  // pdfkit compresses content streams and hex-encodes text with kerning splits;
  // inflate streams, decode all hex string runs, then search the plain text
  const zlib = await import('node:zlib');
  let pdfText = '';
  let hexOnly = ''; // every hex run concatenated, operators stripped
  for (const m of buf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content = '';
    try { content = zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { content = m[1]; }
    // decode hex string runs, joining kerning-split segments into plain text:
    // [<4d792041> 30 <75746f20> 80 <57> 60 <6f726b73686f70>] -> "My Auto Workshop"
    const decodeHex = (h) => h.replace(/../g, (byte) => String.fromCharCode(parseInt(byte, 16)));
    pdfText += content.replace(/<([0-9a-fA-F]+)>((?:\s+-?\d+\s+<[0-9a-fA-F]+>)+)?/g, (_, hex, rest) => {
      let out = decodeHex(hex);
      if (rest) {
        for (const seg of rest.matchAll(/<([0-9a-fA-F]+)>/g)) out += decodeHex(seg[1]);
      }
      hexOnly += out;
      return out;
    });
  }
  // pdfkit splits a line across several show-text operators whenever the
  // measured widths shift (more digits in an invoice number, longer amounts),
  // which leaves operators in the middle of a word in `pdfText`. Search the
  // pure concatenation of hex runs too, so the needle stays contiguous.
  const hasText = (needle) => pdfText.includes(needle) || hexOnly.includes(needle);
  const dump = (needle) =>
    ` | needle=${JSON.stringify(needle)} pdfText=${JSON.stringify(pdfText.slice(0, 200))} hexOnly=${JSON.stringify(hexOnly.slice(0, 200))}`;
  assert(hasText(SEED_GARAGE_NAME), `PDF contains garage name from settings (${SEED_GARAGE_NAME})${hasText(SEED_GARAGE_NAME) ? '' : dump(SEED_GARAGE_NAME)}`);
  assert(hasText(plate), `PDF contains vehicle registration${hasText(plate) ? '' : dump(plate)}`);

  // 8. WhatsApp link
  r = await req('GET', `/invoices/${invoiceId}/whatsapp`, { token: admin });
  assert(r.status === 200 && r.json.data.whatsapp_url.startsWith('https://wa.me/'), 'WhatsApp click-to-chat URL generated');
  const decodedMsg = decodeURIComponent(r.json.data.whatsapp_url);
  assert(decodedMsg.includes('E2E Test Customer'), 'WhatsApp message uses template with customer name');
  assert(decodedMsg.includes('/api/invoices/shared/'), 'WhatsApp message contains the invoice PDF link');

  // PDF share link works WITHOUT auth (customer taps it from WhatsApp)
  const sharePath = decodedMsg.match(/\/api\/invoices\/shared\/[A-Za-z0-9._-]+/)?.[0];
  assert(sharePath, 'Share link extracted from message');
  const shareRes = await fetch(`${BASE.replace(/\/api$/, '')}${sharePath}`);
  const sbuf = Buffer.from(await shareRes.arrayBuffer());
  assert(shareRes.status === 200 && sbuf.subarray(0, 5).toString() === '%PDF-',
    `Share link serves PDF without login (${sbuf.length} bytes)`);
  assert((shareRes.headers.get('content-disposition') || '').includes('inline'), 'Share link serves PDF inline (opens in browser)');
  // Tampered token must be rejected
  const badRes = await fetch(`${BASE.replace(/\/api$/, '')}${sharePath}xx`);
  assert(badRes.status === 401, 'Tampered share token rejected (401)');
  // Share token must NOT work as an API auth token
  const shareToken = sharePath.split('/').pop();
  const impersonate = await fetch(`${BASE}/customers`, { headers: { Authorization: `Bearer ${shareToken}` } });
  assert(impersonate.status === 401, 'Share token rejected as API auth token (401)');

  // 9. Mark as Paid
  const grand = parseFloat(inv.json.data.grand_total);
  r = await req('POST', `/invoices/${invoiceId}/payments`, { token: admin, body: { amount: grand, payment_method: 'Cash' } });
  assert(r.status === 201 && r.json.data.payment_status === 'Paid', 'Record full payment -> status Paid');

  // Dashboard reflects the activity
  const stats = await req('GET', '/dashboard/stats', { token: admin });
  assert(stats.status === 200 && stats.json.data.totalVehicles >= 1, 'Dashboard stats live');
  assert(stats.json.data.statusBreakdown.some(s => s.status === 'Fixed'), 'Dashboard shows Fixed job in status chart');

  // ===== New feature checks =====

  // Parts catalog: create part, add to a new job (stock deduct), remove (stock restored)
  const pn = `E2E-${Date.now().toString().slice(-6)}`;
  r = await req('POST', '/parts', { token: admin, body: { part_number: pn, name: 'E2E Filter', cost_price: 10, sell_price: 25, qty_in_stock: 10, low_stock_threshold: 3 } });
  assert(r.status === 201, 'Create catalog part');
  const partId = r.json.data.id;

  r = await req('POST', '/jobs', { token: admin, body: { vehicle_id: vehicleId, title: 'Oil change', labour_cost: 50 } });
  const jobId2 = r.json.data.id;
  r = await req('POST', `/jobs/${jobId2}/parts`, { token: admin, body: { part_name: 'E2E Filter', part_number: pn, quantity: 2, unit_price: 25, catalog_part_id: partId } });
  assert(r.status === 201, 'Add catalog part to job');
  let cat = await req('GET', '/parts', { token: admin });
  let stock = cat.json.data.find(p => p.id === partId).qty_in_stock;
  assert(Number(stock) === 8, `Stock deducted on add (10 -> ${stock})`);

  const jobDetail = await req('GET', `/jobs/vehicle/${vehicleId}`, { token: admin });
  const addedPart = jobDetail.json.data.find(j => j.id === jobId2).parts[0];
  r = await req('DELETE', `/jobs/${jobId2}/parts/${addedPart.id}`, { token: admin });
  assert(r.status === 200, 'Remove part button endpoint works');
  cat = await req('GET', '/parts', { token: admin });
  stock = cat.json.data.find(p => p.id === partId).qty_in_stock;
  assert(Number(stock) === 10, `Stock restored on remove (-> ${stock})`);

  // Re-add the part so the quotation covers labour + parts
  r = await req('POST', `/jobs/${jobId2}/parts`, { token: admin, body: { part_name: 'E2E Filter', part_number: pn, quantity: 2, unit_price: 25, catalog_part_id: partId } });
  assert(r.status === 201, 'Re-add catalog part for quote');

  // Quotation: generate from job, PDF, WhatsApp, approve -> job advances
  r = await req('POST', '/quotes/generate', { token: admin, body: { repair_job_id: jobId2, discount: 5 } });
  assert(r.status === 201, 'Generate quotation');
  const quoteId = r.json.data.id;
  assert(r.json.data.grand_total === 95, `Quote total = labour 50 + parts 50 - discount 5 = 95 (got ${r.json.data.grand_total})`);

  const q = await req('GET', `/quotes/${quoteId}`, { token: admin });
  assert(q.json.data.items.length === 2, 'Quote has labour + part line items');
  assert(q.json.data.job_status === 'Awaiting Approval', 'Quote moved job to Awaiting Approval');

  r = await req('GET', `/quotes/${quoteId}/pdf`, { token: admin, raw: true });
  const qbuf = Buffer.from(await r.res.arrayBuffer());
  assert(r.status === 200 && qbuf.subarray(0, 5).toString() === '%PDF-', `Quote PDF generated (${qbuf.length} bytes)`);

  r = await req('GET', `/quotes/${quoteId}/whatsapp`, { token: admin });
  assert(r.status === 200 && r.json.data.whatsapp_url.includes('wa.me'), 'Quote WhatsApp link');

  r = await req('PUT', `/quotes/${quoteId}/status`, { token: admin, body: { status: 'Approved' } });
  assert(r.status === 200, 'Approve quotation');
  const jobAfter = await req('GET', `/jobs/vehicle/${vehicleId}`, { token: admin });
  assert(jobAfter.json.data.find(j => j.id === jobId2).status === 'Awaiting Repair', 'Approved quote advanced job to Awaiting Repair');

  // Status history audit trail
  const hist = await req('GET', `/jobs/${jobId2}/history`, { token: admin });
  assert(hist.status === 200 && hist.json.data.length >= 2, `Status history recorded (${hist.json.data.length} entries)`);
  assert(hist.json.data.some(h => h.to_status === 'Awaiting Repair' && h.changed_by_name === ADMIN_USER), 'History records who changed the status');

  // Job completion notification + auto service record (odometer)
  r = await req('PUT', `/jobs/${jobId2}`, { token: admin, body: { status: 'Fixed' } });
  assert(r.status === 200, 'Mark second job Fixed');
  r = await req('GET', `/jobs/${jobId2}/notify-whatsapp`, { token: admin });
  assert(r.status === 200 && decodeURIComponent(r.json.data.whatsapp_url).includes('ready for collection'), 'Job-ready WhatsApp message');
  const svc = await req('GET', `/vehicles/${vehicleId}/services`, { token: admin });
  assert(svc.status === 200 && svc.json.data.some(s => s.description === 'Oil change'),
    `Service record auto-created on Fixed (${svc.json.data.length} total for vehicle)`);

  // Payment receipt PDF
  const payId = inv.json.data.payments?.[0]?.id ?? (await req('GET', `/invoices/${invoiceId}`, { token: admin })).json.data.payments[0].id;
  r = await req('GET', `/invoices/${invoiceId}/payments/${payId}/receipt`, { token: admin, raw: true });
  const rbuf = Buffer.from(await r.res.arrayBuffer());
  assert(r.status === 200 && rbuf.subarray(0, 5).toString() === '%PDF-', `Receipt PDF generated (${rbuf.length} bytes)`);

  // Reports
  const rep = await req('GET', '/reports', { token: admin });
  assert(rep.status === 200 && rep.json.data.vat && rep.json.data.topCustomers.length >= 1, 'Reports with VAT + top customers');

  // User management: create temp mechanic, deactivate blocks login, cleanup
  const tmpUser = `e2e_tmp_${Date.now().toString().slice(-6)}`;
  r = await req('POST', '/users', { token: admin, body: { username: tmpUser, password: 'secret123', role: 'mechanic', full_name: 'Temp' } });
  assert(r.status === 201, 'Admin creates mechanic user');
  const tmpId = r.json.data.id;
  const tmpLogin = await req('POST', '/auth/login', { body: { username: tmpUser, password: 'secret123', garage_code: SEED_GARAGE_CODE } });
  assert(tmpLogin.status === 200, 'Temp mechanic can log in');
  r = await req('PUT', `/users/${tmpId}`, { token: admin, body: { is_active: false } });
  assert(r.status === 200, 'Deactivate temp mechanic');
  const blockedLogin = await req('POST', '/auth/login', { body: { username: tmpUser, password: 'secret123', garage_code: SEED_GARAGE_CODE } });
  assert(blockedLogin.status === 403, 'Deactivated user blocked from login');

  // Pagination meta
  const pg = await req('GET', '/customers?page=1&limit=1', { token: admin });
  assert(pg.json.pagination && pg.json.pagination.page === 1 && pg.json.data.length <= 1, 'Pagination meta returned');
  const legacy = await req('GET', '/customers', { token: admin });
  assert(legacy.json.pagination === undefined, 'Legacy no-param call returns plain array');

  // Cleanup temp user + catalog part (customer/vehicle/job cleanup happens below)
  // Cleanup must be checked: these URLs used to carry a doubled /api prefix,
  // so every run silently leaked a catalog part and a deactivated user.
  const delPart = await fetch(`${BASE}/parts/${partId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${admin}` } });
  assert(delPart.status === 200, `Cleanup: temp catalog part deleted (${delPart.status})`);
  // The API exposes no user-delete route, so remove the temp account by SQL
  // (same approach as verification.test.js). Reactivating it instead leaked
  // one extra "e2e_tmp_*" row into the garage on every run.
  await pool.query('DELETE FROM mechanic_profiles WHERE user_id = ?', [tmpId]);
  const [delUser] = await pool.query('DELETE FROM users WHERE id = ?', [tmpId]);
  assert(delUser.affectedRows === 1, `Cleanup: temp user deleted (${delUser.affectedRows} row)`);

  console.log('\nALL E2E CHECKS PASSED');
  await pool.end();
};

main().catch(async (e) => {
  console.error('E2E error:', e);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
