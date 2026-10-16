"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function LiveParticipants() {
  const router = useRouter();

  useEffect(() => {
    const refreshParticipants = () => {
      if (document.visibilityState === "visible") router.refresh();
    };

    const initialRefresh = window.setTimeout(refreshParticipants, 0);
    const interval = window.setInterval(refreshParticipants, 3000);
    document.addEventListener("visibilitychange", refreshParticipants);
    window.addEventListener("focus", refreshParticipants);

    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshParticipants);
      window.removeEventListener("focus", refreshParticipants);
    };
  }, [router]);

  return null;
}