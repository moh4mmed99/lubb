"use client";

import { useEffect, useState } from "react";

/** Light/dark toggle. The initial theme is applied by the inline script in app/layout.jsx. */
export function useTheme() {
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* storage unavailable */
    }
    setTheme(next);
  };
  return { theme, toggle };
}
