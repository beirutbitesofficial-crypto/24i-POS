# 24i POS

A multi-tenant retail platform (POS → inventory → reporting, growing module by module like Odoo).
**Village Dairy** (جبنة · لبنة · مونة — مزبود) is the first client business on it.

Clients don't sign up themselves: a business contacts 24i, and 24i creates its workspace and
users from the **24i Platform** console. Each business only ever sees its own data.

Arabic (RTL) is the default language; English (LTR) is one click away.

---

## Architecture

| Layer | Choice |
|---|---|
| App | Next.js 15 (App Router, Server Components, Server Actions), TypeScript |
| UI | Tailwind CSS v4, shadcn-style components on Radix, Lucide icons, Recharts |
| Data | PostgreSQL 16 + Prisma 6 (migrations in `prisma/migrations`) |
| Validation | Zod on every server action |
| Auth | DB-backed sessions (httpOnly cookie, token stored as SHA-256), bcrypt passwords, lockout after 6 failed attempts |
| Money/qty | `decimal.js` everywhere + `Decimal(14,4)` money / `Decimal(14,3)` quantity columns — no floats |

```
src/
  app/
    login/  forbidden/
    platform/            24i console: client businesses, modules, users (platform admins only)
    pos/                 full-screen cashier POS
    receipt/[id]/        80 mm printable receipt
    (app)/               tenant back office: dashboard, catalog, inventory, sales, shifts, reports, settings
    api/                 media, receipts (print-bridge JSON), CSV exports, health
  server/
    services/            inventory engine, sales/refunds/shifts, reports, receipt builder, tenant provisioning
    actions/             server actions (auth → permission → Zod → service), one file per area
  lib/                   auth, permissions, money, pricing/settlement (shared client+server), i18n (ar/en)
  components/            ui kit, POS, catalog, inventory, settings, charts
prisma/                  schema, migrations, seed (+ Village Dairy logo)
print-bridge/            optional zero-dependency ESC/POS bridge for silent printing
tests/                   Vitest: pricing math, sales engine (real Postgres), permissions, conversions
```

### Data model highlights

`Organization` (tenant) → `Category → Product → ProductBrand (availability) / Variety → ProductVariant (the sellable,
stock-holding item: brand × variety × loose/packed × size × unit × price) → Barcode`.

Inventory: `InventoryLot` (cost, expiry, qty left) + append-only `StockMovement` ledger. `ProductVariant.stockQty` is a
cached balance updated in the same transaction; a test asserts ledger sum = balance.
Sales: `Sale`, `SaleItem` (name/brand/price snapshots + actual FEFO cost), `Payment` (currency + base value at the sale's
rate), `Refund`/`RefundItem`, `CashShift`/`CashMovement`, `HeldSale`, `AuditLog`, `PriceHistory`, `StockCount`,
`StockConversion`, `Purchase`/`PurchaseItem`, `Supplier`, `StoreSettings`, `Counter` (gap-free receipt numbers).
Financial rows are never deleted — there is no delete path for sales, payments, refunds, movements or shifts.

### Key guarantees

- **Server-authoritative pricing.** The browser previews totals; the server re-prices from DB prices before saving.
  Products without a price cannot be sold (`PRICE_NOT_CONFIGURED`).
- **No double charging.** Each checkout carries a client UUID (`Sale.clientRef`, unique per tenant). Retries and
  concurrent duplicates return the original sale (tested with 3 parallel submissions).
- **No overselling.** Variants are row-locked (`SELECT … FOR UPDATE`, sorted to avoid deadlocks) during sales,
  receipts, adjustments and conversions. Negative stock is blocked unless the owner enables it.
- **Real profit.** Each sale consumes lots first-expiring-first-out and records the actual lot cost.
- **Base units.** Weight items are stocked in kg: selling 500 g deducts exactly 0.500 kg.
- **Loose ↔ jarred without double counting.** *Inventory → Convert* deducts bulk kg and adds packed units in one
  transaction, carrying cost (per jar) and the earliest expiry.
- **Permissions enforced on the server** for every page, action and API route — not just hidden buttons.

---

## Roles

| | Owner / Admin | Manager | Cashier |
|---|:-:|:-:|:-:|
| Sell, search, take payments, print | ✓ | ✓ | ✓ |
| Discounts above the cashier limit, price override, remove items, refunds, reprints | ✓ | ✓ | with manager PIN |
| Products, prices, inventory, suppliers, reports, costs & margins | ✓ | ✓ | ✗ |
| Store settings, users, audit log | ✓ | ✗ | ✗ |

Managers/owners set a 4–6 digit **approval PIN** (Settings → Users) to authorise cashier actions at the till;
every approval is written to the audit log.
Platform admins (24i staff) have no tenant data access through the back office — they manage businesses and users.

---

## Critical business decisions still needed from you

The catalog was seeded **only** with what you provided. Nothing was invented: no prices, stock, barcodes, suppliers,
varieties or brand links. Everything below is editable in the UI without code changes.

1. **Which brands make which product** for Halloumi, Double Cream, Nabulsi, Labneh and Laban. The 8 brands exist,
   but none are linked to these 5 products yet (Products → product → *Available brands*), so they have no sellable
   variants. Only Labneh Mk3zale (Jaber Jaber, Lakkis, Baladi) is linked, as you specified.
2. **Package sizes and prices** for every variant (all 35 seeded variants are unpriced and blocked from sale).
   The dashboard shows a "Catalog setup" banner with the count.
3. **Jar sizes** for pickles/olives. Each has a *Loose (Falet), per kg* variant; add a *Packed* variant per jar size.
4. **Zaatar and Dates varieties**, and which brand makes **Chocolate Halawa** (seeded as a variety without a brand).
5. **Exchange rate & cash rounding.** Seeded at 89,500 LBP/USD, LBP cash rounded to the nearest 5,000 — confirm in Settings.
6. **Negative stock** is blocked by default, so stock must be received (or added as opening stock via
   *Inventory → Adjust → Add*) before selling. Flip the setting if you prefer to sell first and count later.
7. **Cashier discount limit** defaults to 0% (any discount needs a manager PIN); **VAT** is off.

Defaults chosen for units (editable per variant): cheeses, labneh, ashta, shanklish, keshek and loose olives/pickles
sell **by weight (kg)**; honey/tahini jars, bottles, bags, bread and coffee sell **per unit**. Arabic brand spellings
(e.g. البرقي for El Barki) are best guesses — fix them under Catalog → Brands.

---

## Local setup

Requirements: Node 20+ (22 recommended), PostgreSQL 14+.

```bash
cp .env.example .env            # set DATABASE_URL and the seed passwords
npm install
npx prisma migrate deploy       # create tables
npm run db:seed                 # 24i platform admin + Village Dairy tenant, catalog and logo (idempotent)
npm run dev                     # http://localhost:3000
```

Seed logins (from `.env`; **change both passwords after first login**):

| Who | Username | Lands on |
|---|---|---|
| 24i platform admin | `SEED_PLATFORM_ADMIN_USERNAME` (default `24i.admin`) | `/platform` |
| Village Dairy owner | `SEED_STORE_ADMIN_USERNAME` (default `villagedairy.owner`) | `/dashboard` |

### First-day checklist for Village Dairy
1. Settings → confirm exchange rate, rounding, receipt footer, printer.
2. Settings → Users → add cashiers; give yourself/manager an approval PIN.
3. Catalog → Products → *Needs setup* filter → link brands, add variants with size + price (+ barcodes).
4. Inventory → Receive stock (or Adjust → Add for opening stock), with expiry dates for perishables.
5. POS → open shift with the opening cash → sell.

### Environment variables

| Name | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `COOKIE_SECURE` | `true` behind HTTPS so session cookies are `Secure` |
| `SEED_*` | Credentials used only by `npm run db:seed` |

---

## Tests

```bash
createdb pos24i_test          # once; or set TEST_DATABASE_URL
npm test                      # 22 tests — runs migrations on the test DB, each suite uses its own tenant
npm run typecheck
```

Covered: exact decimal pricing (weights, discounts and allocation, inclusive/exclusive tax), USD/LBP settlement and
rounding, weight entry parsing, FEFO lot costing, idempotent and concurrent checkout, oversell/unpriced/fractional/short
payment rejection (with no stock side-effects), manager-PIN approvals, split payment + refund back to the original lot,
shift cash reconciliation, ledger = balance invariant, negative-stock back-fill, bulk→jar conversion, role permissions.

The full browser workflow (set price → receive stock → open shift → weigh + scan → split change → receipt → refund;
cashier restrictions; platform onboarding and tenant isolation) was exercised end-to-end with Playwright against a
production build.

---

## Deployment

The app is a standard Next.js server + PostgreSQL. Product images and the logo are stored in the database, so no
persistent filesystem or object storage is needed.

**Option A — VPS / on-prem (Docker Compose)**
```bash
export POSTGRES_PASSWORD=$(openssl rand -hex 16)
docker compose up -d --build                      # migrations run automatically on start
# seed once from a machine with the repo checked out, pointing at that database:
DATABASE_URL=postgresql://pos:$POSTGRES_PASSWORD@<server>:5432/pos24i npm run db:seed
```
Put it behind HTTPS (Caddy/Nginx/Cloudflare) and keep `COOKIE_SECURE=true`.
*(The Dockerfile was written for this repo but couldn't be built in the authoring environment — no Docker daemon —
so run one build locally before relying on it. The standalone server it starts was verified.)*

**Option B — Vercel / Render / Railway + managed Postgres (Neon, Supabase, RDS…)**
Set `DATABASE_URL`, `COOKIE_SECURE=true`; build command `npm run build`; run
`npx prisma migrate deploy` as a release step; seed once with `npm run db:seed`.

Health check: `GET /api/health`.

### Backups

```bash
DATABASE_URL=... ./scripts/backup.sh /var/backups/pos24i      # pg_dump, keeps last 30 — run nightly via cron
DATABASE_URL=.../pos24i_restore ./scripts/restore.sh file.dump # restore into an EMPTY database, verify, then switch
```
Also enable your managed provider's point-in-time recovery if available, and copy dumps off-site.
Backup → restore was verified during development.

---

## Hardware

### Barcode scanners
Any USB/Bluetooth scanner in keyboard-wedge mode, configured to send **Enter** after the code. On the POS, scans are
captured even when the search box isn't focused. Codes are matched exactly against variant barcodes (several per
variant allowed), then SKU.

### Receipt printing (Xprinter XP-80T and other 80 mm printers)

Browsers can't print silently by default — there's always a dialog. Two supported setups:

1. **Browser printing (default, prints Arabic perfectly).** Install the printer driver, set it as the Windows default
   printer with 80 mm paper and zero margins, then start the POS with Chrome/Edge kiosk printing:
   ```
   chrome.exe --kiosk --kiosk-printing --app=https://your-pos-domain/pos
   ```
   `--kiosk-printing` skips the dialog and prints straight to the default printer. Without the flag, the normal print
   dialog appears (still works, one extra click). The receipt is rendered at 72 mm printable width (58 mm supported).
2. **Local print bridge (ESC/POS).** `print-bridge/server.js` (no dependencies) runs on the till PC and sends raw ESC/POS
   to a network printer (`tcp://ip:9100`), a Windows shared printer (`\\localhost\XP80`) or `/dev/usb/lp0`, with paper
   cut and optional cash-drawer kick. Select *Local print bridge* in Settings. Limitation: ESC/POS text mode can't shape
   Arabic, so bridge receipts print in English. If the bridge is down the POS falls back to browser printing.

Reprints are marked **COPY**, require the reprint permission or a manager PIN, and are audited.

---

## POS quick reference

- **F2** search · **F4** pay · **F8** hold · **Esc** close · scan anytime
- Weighed items: quick buttons 250 g / 500 g / 750 g / 1 kg, or type grams (`750`) or kg (`0.75`) on the keypad
- Tap a cart line to change qty/weight, add a line discount, override the price, or remove it
- Payment: cash/card/transfer in USD or LBP, split across several tenders; change in $, LBP, or $ + LBP;
  LBP amounts follow the configured cash rounding
- Held sales are stored on the server (resume from any till); the in-progress cart also survives a page refresh
- If the network drops during checkout, *Retry* re-sends the same sale ID — it can't be charged twice
