"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "ip-creator-theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const nextTheme =
      stored === "dark" || stored === "light"
        ? stored
        : "dark";

    document.documentElement.dataset.theme = nextTheme;
    setTheme(nextTheme);
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
    setTheme(nextTheme);
  }

  return (
    <button className="theme-toggle" onClick={toggleTheme} type="button">
      {theme === "dark" ? "浅色" : "深色"}
    </button>
  );
}
