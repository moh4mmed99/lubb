import { IBM_Plex_Sans_Arabic } from "next/font/google";
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

export const metadata = {
  title: "LUBB AI",
  description: "Smart meeting system — نظام الاجتماعات الذكي",
  icons: { icon: "/favicon.svg" },
};

// Applies the saved theme before the first paint, so dark mode never flashes white.
const themeScript = `try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`;

export default async function RootLayout({ children }) {
  // Language lives in a cookie so the server renders the right direction (RTL/LTR) from the start.
  const lang = (await cookies()).get("lang")?.value === "en" ? "en" : "ar";
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} className={plex.variable} suppressHydrationWarning>
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
