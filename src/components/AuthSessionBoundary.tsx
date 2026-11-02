"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function AuthSessionBoundary({
  userId,
  children,
}: {
  userId: string | null;
  children: React.ReactNode;
}) {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let disposed = false;

    function reconcile(currentUserId: string | null) {
      if (!disposed && currentUserId !== userId) {
        setBlocked(true);
        // A full reload discards personalized router history as well as component state.
        window.location.reload();
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      reconcile(session?.user.id ?? null);
    });

    async function verifySession() {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (disposed) return;
        if (error && !user && userId) throw error;
        reconcile(user?.id ?? null);
      } catch (error) {
        if (disposed) return;
        console.error("Session verification failed:", error);
        if (userId) {
          setBlocked(true);
          window.location.reload();
        }
      }
    }

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("focus", verifySession);
    window.addEventListener("pageshow", onPageShow);
    const interval = window.setInterval(verifySession, 30_000);

    return () => {
      disposed = true;
      subscription.unsubscribe();
      window.removeEventListener("focus", verifySession);
      window.removeEventListener("pageshow", onPageShow);
      window.clearInterval(interval);
    };
  }, [userId]);

  return blocked ? <p role="status">Refreshing your session...</p> : children;
}
