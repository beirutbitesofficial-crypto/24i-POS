"use client";

/**
 * Receipt printing.
 *  BROWSER: loads /receipt/:id in a hidden iframe and calls print(). Launch Chrome/Edge with
 *           --kiosk-printing to print silently to the default (thermal) printer.
 *  BRIDGE:  posts receipt JSON to the local 24i print bridge (ESC/POS, see /print-bridge).
 *           Falls back to the browser path if the bridge is unreachable.
 */
export async function printReceipt(saleId: string, mode: "BROWSER" | "BRIDGE", bridgeUrl?: string | null): Promise<void> {
  if (mode === "BRIDGE" && bridgeUrl) {
    try {
      const data = await fetch(`/api/receipts/${saleId}?lang=en`, { cache: "no-store" }).then((r) => {
        if (!r.ok) throw new Error("receipt");
        return r.json();
      });
      const res = await fetch(`${bridgeUrl.replace(/\/$/, "")}/print`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (res.ok) return;
    } catch {
      /* fall through to browser printing */
    }
  }
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.src = `/receipt/${saleId}?autoprint=1`;
  document.body.appendChild(frame);
  setTimeout(() => frame.remove(), 60_000);
}

/** Open the cash drawer through the local print bridge (drawer cable in the printer's DK port). */
export async function openDrawer(bridgeUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${bridgeUrl.replace(/\/$/, "")}/drawer`, { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}
