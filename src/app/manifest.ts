import type { MetadataRoute } from "next";

/** Makes 24i POS installable as a desktop / tablet app (Chrome, Edge, Safari). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "24i POS",
    short_name: "24i POS",
    description: "24i POS — point of sale, inventory and reports",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    orientation: "any",
    background_color: "#0b1011",
    theme_color: "#0b1011",
    lang: "ar",
    dir: "rtl",
    categories: ["business", "finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "نقطة البيع · POS", url: "/pos", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "لوحة التحكم · Dashboard", url: "/dashboard", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
