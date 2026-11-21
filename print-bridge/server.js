#!/usr/bin/env node
/**
 * 24i POS — local print bridge (ESC/POS), zero dependencies.
 *
 * Runs on the till PC and lets the browser print receipts silently to an
 * 80 mm thermal printer (e.g. Xprinter XP-80T) without a print dialog.
 *
 *   POST http://127.0.0.1:9123/print   (receipt JSON from /api/receipts/:id)
 *   GET  http://127.0.0.1:9123/health
 *
 * Printer targets (PRINTER env):
 *   tcp://192.168.1.50:9100     network/Ethernet printer (raw port 9100)
 *   \\\\localhost\\XP80          Windows: shared printer name (Share the XP-80T as "XP80")
 *   /dev/usb/lp0                Linux USB printer device
 *
 * Env: PORT (9123), PRINTER, ALLOWED_ORIGIN (your POS URL, e.g. https://pos.example.com),
 *      CUT (1), DRAWER (1 = kick the cash drawer after printing), COLS (48 for 80 mm, 32 for 58 mm)
 *
 * Note: ESC/POS text mode has no Arabic shaping, so the POS requests English
 * receipts from the bridge. For Arabic receipts use browser printing with
 * Chrome --kiosk-printing (see README).
 */
const http = require("node:http");
const net = require("node:net");
const fs = require("node:fs");

const PORT = Number(process.env.PORT || 9123);
const PRINTER = process.env.PRINTER || "";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const COLS = Number(process.env.COLS || 48);
const CUT = process.env.CUT !== "0";
const DRAWER = process.env.DRAWER === "1";

const ESC = "\x1b", GS = "\x1d";
const INIT = ESC + "@";
const ALIGN = (n) => ESC + "a" + String.fromCharCode(n); // 0 left 1 center 2 right
const BOLD = (on) => ESC + "E" + String.fromCharCode(on ? 1 : 0);
const SIZE = (n) => GS + "!" + String.fromCharCode(n); // 0 normal, 0x11 double
const FEED = (n) => ESC + "d" + String.fromCharCode(n);
const CUT_CMD = GS + "V" + String.fromCharCode(66) + String.fromCharCode(0);
const KICK = ESC + "p" + "\x00" + "\x19" + "\xfa";

const ascii = (s) => String(s ?? "").normalize("NFKD").replace(/[^\x20-\x7e]/g, "");
const line = (ch = "-") => ch.repeat(COLS) + "\n";
const lr = (l, r) => {
  l = ascii(l); r = ascii(r);
  const space = Math.max(1, COLS - l.length - r.length);
  if (l.length + r.length + 1 > COLS) return l.slice(0, COLS) + "\n" + " ".repeat(Math.max(0, COLS - r.length)) + r + "\n";
  return l + " ".repeat(space) + r + "\n";
};

function render(r) {
  let out = INIT + ALIGN(1) + BOLD(true) + SIZE(0x11) + ascii(r.storeName) + "\n" + SIZE(0) + BOLD(false);
  if (r.header) out += ascii(r.header) + "\n";
  if (r.address) out += ascii(r.address) + "\n";
  if (r.phone) out += ascii(r.phone) + "\n";
  if (r.copy) out += BOLD(true) + "*** COPY ***\n" + BOLD(false);
  if (r.refunded) out += BOLD(true) + "*** REFUNDED ***\n" + BOLD(false);
  out += ALIGN(0) + line();
  out += lr("Receipt #", r.number) + lr("Date", r.date) + lr("Cashier", r.cashier) + line();
  for (const l of r.lines || []) {
    out += BOLD(true) + ascii(l.name) + BOLD(false) + "\n";
    if (l.detail) out += "  " + ascii(l.detail) + "\n";
    out += lr(`  ${l.qty} x ${l.unitPrice}`, l.total);
    if (l.discount) out += lr("  Discount", l.discount);
  }
  out += line() + lr("Subtotal", r.subtotal);
  if (r.discount) out += lr("Discount", r.discount);
  if (r.tax) out += lr(r.tax.label, r.tax.amount);
  out += BOLD(true) + SIZE(0x01) + lr("TOTAL", r.total) + SIZE(0) + BOLD(false);
  if (r.totalLbp) out += lr("", r.totalLbp);
  out += line();
  for (const p of r.payments || []) out += lr(p.label, p.amount);
  for (const c of r.change || []) out += lr("Change", c);
  out += ALIGN(1) + ascii(r.rate) + "\n";
  if (r.footer) out += "\n" + ascii(r.footer) + "\n";
  out += "24i POS\n" + FEED(4);
  if (CUT) out += CUT_CMD;
  if (DRAWER) out += KICK;
  return Buffer.from(out, "latin1");
}

function send(buf) {
  return new Promise((resolve, reject) => {
    if (!PRINTER) return reject(new Error("PRINTER not configured"));
    if (PRINTER.startsWith("tcp://")) {
      const [host, port] = PRINTER.slice(6).split(":");
      const sock = net.connect({ host, port: Number(port || 9100) }, () => sock.end(buf));
      sock.setTimeout(8000, () => { sock.destroy(); reject(new Error("printer timeout")); });
      sock.on("close", (hadErr) => (hadErr ? null : resolve()));
      sock.on("error", reject);
      return;
    }
    fs.writeFile(PRINTER, buf, (err) => (err ? reject(err) : resolve()));
  });
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  // Chrome Private Network Access preflight (HTTPS site → localhost)
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  if (req.method === "GET" && req.url === "/health") return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, printer: PRINTER || null }));
  if (req.method === "POST" && req.url === "/print") {
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on("end", async () => {
      try {
        await send(render(JSON.parse(body)));
        res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');
      } catch (e) {
        console.error("[print-bridge]", e.message);
        res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }
  res.writeHead(404).end();
});

if (require.main === module) {
  server.listen(PORT, "127.0.0.1", () => console.log(`24i print bridge on http://127.0.0.1:${PORT} → ${PRINTER || "(set PRINTER)"}`));
}
module.exports = { render };
