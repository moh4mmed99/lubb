import { Alexandria, Hanken_Grotesk, IBM_Plex_Sans_Arabic, Outfit } from "next/font/google";
import { cookies } from "next/headers";
import { AppShell } from "@/components/AppShell";
import { Providers } from "./providers";
import "./globals.css";

const plex = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
});

// Latin text: a tight grotesk (Arabic text falls back to Plex)
const grotesk = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-grotesk",
  display: "swap",
});

// The لُبّ wordmark: heavy and chunky
const display = Alexandria({
  subsets: ["arabic"],
  weight: ["900"],
  variable: "--font-display",
  display: "swap",
});

// The Latin "LUBB" in the overview title: a round, friendly geometric sans
const outfit = Outfit({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata = {
  title: "لُبّ · LUBB", // Arabic name with the Latin one beside it (browser tab, bookmarks)
  description: "Smart meeting system — نظام الاجتماعات الذكي",
  icons: { icon: "data:," }, // no tab icon: an empty one, so browsers don't show a stale or default logo
};

// Applies the saved theme before the first paint, so dark mode never flashes white.
const themeScript = `try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`;

export default async function RootLayout({ children }) {
  // Language lives in a cookie so the server renders the right direction (RTL/LTR) from the start.
  const lang = (await cookies()).get("lang")?.value === "en" ? "en" : "ar";
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} className={`${plex.variable} ${grotesk.variable} ${display.variable} ${outfit.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers lang={lang}>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
