"use client";

import {
  Archive,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Languages,
  ListTodo,
  Moon,
  MonitorPlay,
  PlusCircle,
  Presentation,
  Radio,
  ScrollText,
  Sun,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/lib/theme";
import { RollingWordmark } from "./RollingWordmark";
import { enter, spring } from "./motion";

const nav = [
  { href: "/", key: "live", icon: Radio },
  { href: "/kpis", key: "kpis", icon: BarChart3 },
  { href: "/setup", key: "setup", icon: PlusCircle },
  { href: "/meetings", key: "history", icon: Archive },
  { href: "/minutes", key: "minutes", icon: ScrollText },
  { href: "/tasks", key: "tasks", icon: ListTodo },
  { href: "/presentations", key: "presentations", icon: Presentation },
  { href: "/stage", key: "stage", icon: MonitorPlay },
];

export function AppShell({ children }) {
  const { t, i18n } = useTranslation();
  const { theme, toggle } = useTheme();
  const pathname = usePathname();
  const isActive = (href) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const toggleLang = () => i18n.changeLanguage(i18n.language === "ar" ? "en" : "ar");
  const Arrow = i18n.language === "ar" ? ArrowLeft : ArrowRight;

  // The room screen fills the whole monitor: no sidebar or bars
  if (pathname === "/stage") return <main className="h-full">{children}</main>;

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
      {/* Desktop sidebar: the inverse of the page (black in light mode, light in dark mode), one row per section */}
      <aside className="no-print hidden w-60 shrink-0 flex-col bg-rail px-5 py-6 text-rail-fg md:flex">
        {/* only the name rolls on hover; its rolling box ends above the tagline, so the tagline stays still and untouched */}
        <Link href="/" className="group/brand mb-2" aria-label="لُبّ">
          <RollingWordmark size="md" />
        </Link>
        <p className="label mb-10 text-rail-fg/60">{t("brand.tagline")}</p>
        <nav className="flex flex-1 flex-col border-t border-rail-fg/20">
          {nav.map(({ href, key, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={`relative -mx-2 flex items-center justify-between gap-3 rounded-lg border-b border-rail-fg/20 px-3 py-3 text-[15px] transition-colors ${
                  active ? "text-black" : "text-rail-fg/75 hover:bg-rail-fg/10 hover:text-rail-fg"
                }`}
              >
                {/* one green highlight that slides to whichever page is open */}
                {active && <motion.span layoutId="nav-active" transition={spring} className="absolute inset-0 rounded-lg bg-signal" />}
                <span className="relative flex items-center gap-3">
                  <Icon size={18} strokeWidth={1.75} className={active ? "" : "text-rail-fg/55"} />
                  {t(`nav.${key}`)}
                </span>
                {active && (
                  <motion.span
                    className="relative"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...spring, delay: 0.08 }}
                  >
                    <Arrow size={16} />
                  </motion.span>
                )}
              </Link>
            );
          })}
        </nav>
        {prefs}
      </aside>

      {/* Mobile top bar */}
      <header className="no-print flex items-center justify-between bg-rail px-4 py-1 text-rail-fg md:hidden">
        <Link href="/" aria-label="لُبّ" className="group/brand">
          <RollingWordmark size="sm" />
        </Link>
        {prefs}
      </header>

      <main className="min-w-0 flex-1 overflow-y-auto pb-14 md:pb-0">
        {/* keyed by path, so every page plays its entrance */}
        <motion.div key={pathname} {...enter}>
          {children}
        </motion.div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="no-print fixed inset-x-0 bottom-0 flex overflow-x-auto bg-rail text-rail-fg md:hidden">
        {nav.map(({ href, key, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`relative flex-1 whitespace-nowrap border-e border-rail-fg/20 px-3 py-2 text-center text-[11px] ${isActive(href) ? "text-black" : "text-rail-fg/75"}`}
          >
            {isActive(href) && <motion.span layoutId="nav-active-mobile" transition={spring} className="absolute inset-0 bg-signal" />}
            <span className="relative flex flex-col items-center gap-1">
              <Icon size={18} strokeWidth={1.75} />
              {t(`nav.${key}`)}
            </span>
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
      className="grid size-9 place-items-center rounded-lg text-rail-fg/60 transition-colors hover:bg-rail-fg hover:text-rail"
    >
      {children}
    </button>
  );
}
