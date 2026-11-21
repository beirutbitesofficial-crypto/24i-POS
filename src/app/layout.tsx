import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "@fontsource/playfair-display/600.css";
import "./globals.css";
import { Toaster } from "sonner";
import { getI18n } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";

export const metadata: Metadata = {
  title: { default: "24i POS", template: "%s · 24i POS" },
  description: "24i POS — point of sale, inventory and reporting for retail stores",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0e1525" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, dir } = await getI18n();
  return (
    <html lang={locale} dir={dir}>
      <body className="min-h-dvh">
        <I18nProvider locale={locale}>
          {children}
          <Toaster position={dir === "rtl" ? "top-left" : "top-right"} richColors closeButton dir={dir} toastOptions={{ style: { fontFamily: "inherit" } }} />
        </I18nProvider>
      </body>
    </html>
  );
}
