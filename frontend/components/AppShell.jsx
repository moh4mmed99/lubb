"use client";

import { Archive, Languages, LayoutGrid, Moon, PlusCircle, Smartphone, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/lib/theme";
import { Logo } from "./Logo";

const nav = [
  { href: "/", key: "live", icon: LayoutGrid },
  { href: "/setup", key: "setup", icon: PlusCircle },
  { href: "/meetings", key: "history", icon: Archive },
  { href: "/simulator", key: "simulator", icon: Smartphone },
];

export function AppShell({ children }) {
  const { t, i18n } = useTranslation();
  const { theme, toggle } = useTheme();
  const pathname = usePathname();
  const isActive = (href) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const toggleLang = () => i18n.changeLanguage(i18n.language === "ar" ? "en" : "ar");

  const prefs = (
    <div className="flex gap-1">
      <IconButton onClick={toggleLang} label={i18n.language === "ar" ? "English" : "العربية"}>
        <Languages size={17} />
      </IconButton>
      <IconButton onClick={toggle} label={t("nav.theme")}>
        {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
      </IconButton>
    </div>
  );

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="no-print hidden w-56 shrink-0 flex-col border-e border-line bg-card px-3 py-5 md:flex">
        <Link href="/" className="mb-8 px-2">
          <Logo />
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5">
          {nav.map(({ href, key, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition ${
                isActive(href) ? "bg-subtle font-medium text-fg" : "text-muted hover:text-fg"
              }`}
            >
              <Icon size={17} strokeWidth={1.75} />
              {t(`nav.${key}`)}
            </Link>
          ))}
        </nav>
        <div className="px-1">{prefs}</div>
      </aside>

      {/* Mobile top bar */}
      <header className="no-print flex items-center justify-between border-b border-line bg-card px-4 py-3 md:hidden">
        <Logo />
        {prefs}
      </header>

      <main className="min-w-0 flex-1 overflow-y-auto pb-16 md:pb-0">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="no-print fixed inset-x-0 bottom-0 flex justify-around border-t border-line bg-card py-2 md:hidden">
        {nav.map(({ href, key, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-label={t(`nav.${key}`)}
            className={`rounded-lg p-2 ${isActive(href) ? "text-fg" : "text-muted"}`}
          >
            <Icon size={20} strokeWidth={1.75} />
          </Link>
        ))}
      </nav>
    </div>
  );
}

function IconButton({ onClick, label, children }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-subtle hover:text-fg"
    >
      {children}
    </button>
  );
}
