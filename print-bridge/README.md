# 24i POS print bridge (optional)

Silent ESC/POS printing to an 80 mm thermal printer from the browser POS.

```bash
# Network printer
PRINTER=tcp://192.168.1.50:9100 ALLOWED_ORIGIN=https://pos.example.com node server.js
# Windows USB printer: share the XP-80T as "XP80" in Printer properties → Sharing
set PRINTER=\\localhost\XP80 && node server.js
# Linux USB
PRINTER=/dev/usb/lp0 node server.js
```

Then in **Settings → Printer** choose *Local print bridge* and set the URL to `http://127.0.0.1:9123`.
Run it at startup (Windows Task Scheduler / `pm2` / systemd). If the bridge is unreachable, the POS
automatically falls back to browser printing.

Limitation: ESC/POS text mode cannot shape Arabic, so bridge receipts are printed in English.
For Arabic receipts use browser printing with Chrome's `--kiosk-printing` flag (see the main README).
