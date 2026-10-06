"use client";

import { createContext, ReactNode, useContext, useEffect, useState } from "react";

const SignupCountsContext = createContext<Record<string, number>>({});

export function LiveSignupCounts({
  initialCounts,
  children,
}: {
  initialCounts: Record<string, number>;
  children: ReactNode;
}) {
  const [counts, setCounts] = useState(initialCounts);

  useEffect(() => {
    let active = true;

    async function refreshCounts() {
      try {
        const response = await fetch("/api/nonprofit/signup-counts", { cache: "no-store" });
        if (!response.ok) return;
        const result: { counts?: Record<string, number> } = await response.json();
        if (active && result.counts) setCounts(result.counts);
      } catch (error) {
        console.error("Failed to refresh opportunity signup counts:", error);
      }
    }

    const initialRefresh = window.setTimeout(() => void refreshCounts(), 0);
    const interval = window.setInterval(() => void refreshCounts(), 3000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshCounts();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return (
    <SignupCountsContext.Provider value={counts}>
      {children}
    </SignupCountsContext.Provider>
  );
}

export function LiveSignupCount({ opportunityId }: { opportunityId: string }) {
  const counts = useContext(SignupCountsContext);
  return <td className="px-4 py-3">{counts[opportunityId] ?? 0}</td>;
}