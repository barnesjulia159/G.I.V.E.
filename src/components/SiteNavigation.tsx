"use client";

import { useState, type ReactNode } from "react";

export function SiteNavigation({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="site-menu" data-open={open}>
      <button
        type="button"
        className="site-menu-toggle"
        aria-expanded={open}
        aria-controls="main-navigation"
        onClick={() => setOpen(!open)}
      >
        <span className="site-menu-icon" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span>Menu</span>
      </button>
      <nav
        id="main-navigation"
        aria-label="Main navigation"
        className="site-nav"
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest('a, button[type="submit"]')) setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            event.currentTarget.parentElement?.querySelector("button")?.focus();
          }
        }}
      >
        {children}
      </nav>
    </div>
  );
}
