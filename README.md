# Garage Management System (GMS)

Full-stack garage management system for automotive repair workshops: vehicles, customers, repair diagnostics, parts, mechanics, invoicing (PDF), payments, and WhatsApp integration.

**Multi-tenant:** one deployment serves many garages. Every garage gets its own isolated data (customers, vehicles, jobs, invoices, parts, users, settings), its own invoice/quote number sequences, and a unique **garage code** which is always required at login. There is no public signup — a **super admin** manages garages from the **Garages** page in the app (create garages, edit a garage's info, see per-garage user/customer/vehicle counts, temporarily disable a garage, and delete a garage with all its data — deletion requires typing the garage code and cannot target your own garage). A **temporarily disabled** garage keeps every row in the database while all of its access stops: its users cannot log in and their existing sessions are refused on every API route, until the super admin re-enables it. The seeded `admin` user is promoted to `super_admin` by the migration and can **only** access the garage panel — every garage-data route returns 403 for it, so day-to-day work happens through each garage's own `admin` account.

**Stack:** React (Vite + Tailwind CSS) · Node.js + Express · MySQL

## Project Structure

```
garage-management-system/
├── client/                 # React frontend (Vite, Tailwind CSS v4)
│   └── src/
│       ├── components/     # Shared UI (Modal)
│       ├── context/        # Auth context (JWT)
│       ├── layouts/        # Dashboard layout (sidebar nav)
│       ├── pages/          # Dashboard, Customers, Vehicles, VehicleDetails,
│       │                   # MyJobs, Invoices, InvoiceDetails, Settings, Login
│       ├── services/       # axios API client + settings helper
│       ├── App.jsx         # Routes (protected)
│       └── main.jsx
├── server/
│   ├── src/
│   │   ├── config/         # db pool + env config
│   │   ├── controllers/    # auth, customers, vehicles, jobs, invoices,
│   │   │                   # users, settings, dashboard
│   │   ├── middleware/     # JWT protect + role authorize (RBAC)
│   │   ├── routes/         # one file per resource
│   │   ├── services/       # pdfService (pdfkit)
│   │   ├── utils/          # token generation
│   │   ├── app.js          # express app
│   │   └── server.js       # entrypoint (tests DB, then listens)
│   ├── migrations/         # schema.sql, run_migrations.js, seed scripts
│   ├── tests/              # automated verification tests
│   ├── .env.example
│   └── package.json
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+
- MySQL 8.x running locally (or reachable host)

### 1. Configure the backend

```bash
cd server
cp .env.example .env
# edit .env: DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET
```

### 2. Create the database schema and seed users

```bash
npm run migrate
```

This creates the database (`gms_db` by default), all tables, the default admin user, and default garage settings.

**Default credentials**

| Role     | Username      | Password   |
|----------|---------------|------------|
| Admin    | `admin`       | `admin123` |
| Mechanic | `mechanic_bob`| `mech123`  |

All seeded users belong to the default garage (code `ADMIN` by default). The **garage code is required at login** — enter `ADMIN` (or your configured `GARAGE_CODE`) along with the username and password.

The seeded `admin` / `admin123` account is the **super admin**: after login it lands on the Garages panel and nothing else. To use a garage, either create one from that panel (each garage gets its own `admin` account), or promote a user in the default garage with `UPDATE users SET role = 'admin' WHERE username = '...';` in MySQL.

Optional demo data:

```bash
node migrations/seed.js           # sample customer + 2 vehicles
node migrations/seed_mechanic.js  # extra mechanic user
```

### 3. Run the backend

```bash
npm run dev    # nodemon, http://localhost:5000
# or
npm start
```

Health check: `GET http://localhost:5000/api/health`

### 4. Run the frontend

```bash
cd client
npm install
npm run dev    # http://localhost:5173
```

### Alternative: Docker (one command)

```bash
docker compose up --build
# client -> http://localhost:8080, API -> http://localhost:5000
```

The server container runs migrations automatically on start.

## Features by Stage

- **Stage 1 — Setup, Schema, Auth:** MySQL schema (10 tables), JWT login, bcrypt hashing, role-based access control (`admin` / `mechanic`).
- **Stage 2 — Customers & Vehicles:** register, search, details views; vehicle-to-customer ownership.
- **Stage 3 — Repair Workflow:** diagnosis/job creation, parts + labour, mechanic assignment, status flow (Awaiting Diagnosis → Diagnosed → … → Fixed / Unable to Fix), mechanic "My Jobs" view.
- **Stage 4 — Invoicing, Payments, WhatsApp:** invoice generation from jobs (line-item snapshots), pdfkit PDF download, partial/full payments with status updates, WhatsApp click-to-chat link (Option A) built from a configurable template.
- **Stage 5 — Dashboard & Settings:** live stats (vehicles, jobs by status, revenue charts, outstanding invoices) and garage settings (name, address, phone, currency, tax rate, WhatsApp template) used by invoice generation, the PDF header, and WhatsApp messages.
- **Stage 6 — Docs & Verification:** this README + automated backend tests.

## Extended Features

- **User management** (`/users`, admin-only): create admins/mechanics, edit profiles, reset passwords, deactivate accounts. Deactivated users are blocked at login; you cannot deactivate your own account.
- **Quotations** (`/quotations`): generate a quote from any job (*Request Quote*), send it via WhatsApp for approval, download as PDF. Approving advances the job to *Awaiting Repair*; rejecting returns it to *Diagnosed*.
- **Parts catalog + stock** (`/parts`): inventory with cost/sell price and low-stock thresholds. Adding a catalog part to a job deducts stock; removing it restores stock. Low-stock alerts appear on the dashboard.
- **Job status history**: every status change is recorded (from → to, who, when) and shown in a timeline on the vehicle page.
- **Service history by odometer**: marking a job *Fixed* auto-logs a service record (date + current odometer); the vehicle page shows "last serviced at X km".
- **Customer notifications**: *Notify Customer* on a completed job opens a WhatsApp click-to-chat message ("ready for collection").
- **Payment receipts**: each payment on an invoice has a downloadable receipt PDF.
- **Invoice PDF in WhatsApp**: *Send via WhatsApp* appends a signed, no-login PDF link (30-day expiry) to the message, so the customer can open the invoice PDF straight from the chat. The link position is customizable with the `{pdf_link}` template variable (appended at the end if omitted); set `PUBLIC_URL` in `server/.env` to the API's public address so the link works from customers' phones.
- **Reports** (`/reports`, admin-only): revenue by month, mechanic performance (jobs completed, avg hours), top customers, VAT/tax summary, payment-method breakdown.
- **Discount UI**: invoice generation modal supports discount + notes (tax rate comes from Settings).
- **Pagination**: customers/vehicles/invoices/parts/users/quotations lists are paginated server-side (10 per page). Requests without `page`/`limit` still return the plain array, so older clients keep working.
- **Input validation**: write endpoints are guarded by a declarative validator (`server/src/middleware/validate.js`) that rejects missing fields, wrong types and out-of-range values with a readable 400 before anything reaches SQL.
- **Password recovery**: the app sends no email, so recovery is admin-issued — a garage admin clicks **Reset code** on the Users page, reads the 6-digit code out to the locked-out user, who redeems it via **Forgot password?** on the login page. Only a bcrypt hash is stored, codes expire in 15 minutes and are single-use; every failure returns one generic message so the endpoint can't be used to probe accounts.
- **Hardening**: login rate limiting (20/15 min per IP), a general API budget (5000/15 min), password-reset attempts limited to 10/15 min, 8h JWT expiry with automatic logout on 401, self-service password change (Settings page).
- **Request logging**: one `METHOD path status duration` line per request (5xx go to stderr). Automatically silent during tests; set `LOG_REQUESTS=off` to silence a running server.
- **Ops**: `server/scripts/backup_db.sh` (timestamped mysqldump, 14-backup retention) and `docker-compose.yml` (MySQL + server + client in one command).

## API Overview

All routes are prefixed with `/api`. Protected routes require `Authorization: Bearer <token>`.

| Method | Route | Access |
|--------|-------|--------|
| POST | `/auth/login` | Public |
| GET | `/auth/me` | Any authenticated user |
| GET/POST | `/customers` | Admin |
| GET/PUT | `/customers/:id` | Admin |
| GET | `/vehicles` | Any authenticated user |
| POST/PUT | `/vehicles(/:id)` | Admin |
| GET | `/jobs/vehicle/:vehicleId` | Any authenticated user |
| GET | `/jobs/my-jobs` | Mechanic (assigned only) |
| POST | `/jobs` | Admin |
| PUT | `/jobs/:id` | Admin, or assigned mechanic (status only) |
| POST/DELETE | `/jobs/:id/parts(...)` | Admin |
| GET | `/invoices` | Admin |
| POST | `/invoices/generate` | Admin |
| GET | `/invoices/:id` · `/invoices/:id/pdf` · `/invoices/:id/whatsapp` | Authenticated (PDF) / Admin (WhatsApp) |
| GET | `/invoices/shared/:token` | Public — signed no-login PDF share link (30-day expiry, used in WhatsApp messages) |
| POST | `/invoices/:id/payments` | Admin |
| GET/PUT | `/settings` | Authenticated / Admin |
| GET | `/dashboard/stats` | Authenticated |
| GET/POST/PUT/DELETE | `/parts(/:id)` | Authenticated read / Admin write |
| GET/POST | `/quotes(/generate)` · `GET /quotes/:id/pdf` | Admin (read: authenticated) |
| PUT | `/quotes/:id/status` · `GET /quotes/:id/whatsapp` | Admin |
| GET | `/reports` | Admin |
| GET/POST/PUT | `/users` (+ `/users/:id`) | Admin |
| GET/POST `/garages` · `PUT /garages/:id` · `PATCH /garages/:id/status` · `DELETE /garages/:id?confirm_code=CODE` | Super Admin |
| PUT | `/users/me/password` | Any authenticated user |
| GET | `/jobs/:id/history` · `/jobs/:id/notify-whatsapp` | Authenticated |
| GET | `/vehicles/:id/services` | Authenticated |

## Verification

### Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request:

- **Client** — `npm run lint`, `npm test`, `npm run build`
- **Server** — syntax-checks every source and test file, runs the migrations and both DB-backed suites against a MySQL 8 service container

### Automated backend tests

```bash
cd server
npm test       # verification + multi-tenant isolation tests
```

The multi-tenant suite creates a second garage through the super-admin
garage API and asserts full data isolation (lists filtered, cross-garage
by-id reads/updates return 404, login always requires a garage code).

Covers the plan's automated checks:

1. **Server starts and connects to MySQL** — pool query + health endpoint.
2. **RBAC blocks mechanic accounts from admin endpoints** — 19 admin-only routes assert 403 for mechanics, 401 without a token, 200 for admin.
3. Parts CRUD, pagination shapes, reports shape, user management (create/deactivate/login-block/self-lockout guard), password change.
4. Pagination on parts/users/quotes (meta with `page`/`limit`, plain array without), input-validation 400s (missing field, bad type, out-of-range, bad enum), and the full reset-code flow (issue → redeem → old password dead → replay rejected → same generic error for unknown users).

### Frontend tests

```bash
cd client
npm test       # Vitest + Testing Library: login flow, invoice view/payment,
               # super admin garage panel (edit + temporary disable actions)
```

### End-to-end API flow

```bash
cd server
node tests/e2e-flow.mjs   # 55 checks, needs the server running on :5000
```

The flow logs in 4 times per run, so running it repeatedly against one long-lived
server eventually trips the login rate limiter (20 / 15 min / IP) — restart the
server (or wait 15 minutes) if a run fails on `Login as Admin (429: ...)`.

Covers: login → customer → vehicle → diagnosis → parts/labour → mechanic completes job → invoice → PDF (text verified) → WhatsApp → payment → dashboard; plus catalog stock in/out, quote generate→PDF→WhatsApp→approve with status-history audit, job-ready notification, auto service record, receipt PDF, reports, user deactivation blocking login, and pagination meta.

### Super-admin garage panel smoke test

```bash
cd server
node tests/smoke-garage-admin.mjs   # needs the server running on :5000
```

Creates a throwaway garage, edits its info (name/phone/address, duplicate-code
rejection), temporarily disables it (login → 403, live session → 401, user rows
totally untouched), re-enables it (login + API work again), checks the
cannot-disable-your-own-garage guard, then deletes the throwaway garage.

### Manual end-to-end flow

1. Login as **Admin** (`admin` / `admin123`).
2. **Customers → New Customer** — register a customer.
3. **Vehicles → Register Vehicle** — attach it to the customer.
4. Open the vehicle → **Add Diagnosis** (title, labour, assign mechanic).
5. **Add Parts** on the job (pick from the catalog to deduct stock); set the job status through the workflow (or let the mechanic do it from **My Jobs** — the **History** button shows the audit trail).
6. **Request Quote** on a job → send it from **Quotations** via WhatsApp → approve it to advance the job.
7. **Generate Invoice** on the vehicle page (discount modal; tax rate comes from Settings).
8. Open the invoice → **Download PDF** (garage header + configured currency) → **Send via WhatsApp** (the message also carries a no-login link so the customer can open/download the invoice PDF) → **Record Payment** until status is *Paid* → download a **Receipt** per payment.
9. On job completion use **Notify Customer** ("ready for collection" WhatsApp message); the service history records date + odometer automatically.
10. Check **Dashboard** (stats, low-stock alerts), **Reports**, **Parts**, **Users**, and **Settings** (change garage name/currency/tax/template or your password).

## Configuration (.env)

| Variable | Purpose |
|----------|---------|
| `PORT` | API port (default 5000) |
| `CLIENT_URL` | CORS origin (default http://localhost:5173) |
| `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL connection |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Token signing |
| `GARAGE_NAME`, `GARAGE_ADDRESS`, `GARAGE_PHONE`, `CURRENCY`, `TAX_RATE` | Defaults applied to the initial garage created by the migration |
| `GARAGE_CODE` | Code of the initial (default) garage, default `ADMIN` |

Frontend build-time config (`client/.env`):

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Base URL of the API without trailing slash (default `http://localhost:5000`). Set this when deploying, e.g. `VITE_API_URL=https://api.yourdomain.com` |

Garage settings are editable at runtime from the **Settings** page and are stored per garage on the `garages` row; the seeded defaults take precedence over `.env` after creation.

## Logging

The server writes plain-text logs to **`server/logs/`** (created automatically
if missing) via `server/src/utils/logger.js` — dependency-free, like the rest
of the logging in this project:

| File | Contents |
|------|----------|
| `logs/app.log` | every level (`debug`/`info`/`warn`/`error`): startup, app events, plus a copy of each error |
| `logs/error.log` | `error` lines only — global error handler, rejected tokens, 5xx requests, with the stack flattened onto the same line |
| `logs/access.log` | one line per completed request: `<iso-timestamp> METHOD /path STATUS DURATIONms` |

Line format: `2026-10-13T15:07:05.239Z [INFO] message {optional json meta}`.
Writes use `appendFileSync`, so an entry survives a hard crash, and each file
rotates at 1 MB keeping one `*.log.1` backup so a long-running server cannot
fill the disk. A logging failure never breaks a request — every write is
guarded and falls back to stderr.

The console mirrors the same lines except under the test runner
(`NODE_TEST_CONTEXT` / `NODE_ENV=test`), which keeps `npm test` output
readable while the files still record everything.

| Variable | Purpose |
|----------|---------|
| `LOG_LEVEL` | Minimum level written: `debug`, `info` (default), `warn` or `error` |
| `LOG_CONSOLE` | `off` silences the console mirror completely (files still written) |
| `LOG_REQUESTS` | `off` silences the per-request console lines (access.log still written) |

```bash
cd server
tail -f logs/app.log      # or logs/access.log / logs/error.log
```
