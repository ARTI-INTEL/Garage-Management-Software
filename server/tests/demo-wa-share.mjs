// Demo: what the customer actually receives when you hit "Send via WhatsApp"
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = await mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: (process.env.DB_PASSWORD || '').replace(/^"|"$/g, ''),
  database: process.env.DB_NAME || 'gms_db'
});

const [inv] = await pool.query('SELECT id, customer_id FROM invoices ORDER BY id DESC LIMIT 1');
const invoiceId = inv[0].id;

const res = await fetch('http://localhost:5000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'admin123' })
});
const { data } = await res.json();

const wa = await fetch(`http://localhost:5000/api/invoices/${invoiceId}/whatsapp`, {
  headers: { Authorization: 'Bearer ' + data.token }
});
const w = await wa.json();

console.log('--- message the customer receives ---');
console.log(decodeURIComponent(w.data.whatsapp_url.split('text=')[1]));

console.log('\n--- fetching share link (as the customer would, no login) ---');
const pdf = await fetch(w.data.pdf_url);
const buf = Buffer.from(await pdf.arrayBuffer());
console.log('status=' + pdf.status,
  'type=' + pdf.headers.get('content-type'),
  'disp=' + pdf.headers.get('content-disposition'),
  'bytes=' + buf.length,
  'header=' + buf.subarray(0, 5).toString());

await pool.end();
