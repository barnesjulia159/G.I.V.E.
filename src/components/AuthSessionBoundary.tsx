"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AuthSessionBoundary({
  userId,
  sessionStartedAt,
  children,
}: {
  userId: string | null;
  sessionStartedAt?: string;
  children: React.ReactNode;
}) {
  const [blocked, setBlocked] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [retry, setRetry] = useState(0);
  const pathname = usePathname();
  const activityClock = useRef({ key: "", time: 0 });

  useEffect(() => {
    const supabase = createClient();
    let disposed = false;
    let loggingOut = false;
    let failedLogout = false;
    let idleTimer: number | undefined;
    const idleTimeout = 30 * 60 * 1000;
    const activityKey = `give:last-activity:${userId}${sessionStartedAt ? `:${sessionStartedAt}` : ""}`;
    let hasLocalActivity = activityClock.current.key === activityKey;
    let lastActivity = hasLocalActivity ? activityClock.current.time : Date.now();
    let hasStoredActivity = false;

    function scheduleIdle() {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(checkIdle, Math.max(0, idleTimeout - (Date.now() - lastActivity)));
    }

    function readActivity() {
      try {
        const stored = Number(window.localStorage.getItem(activityKey));
        hasStoredActivity = Number.isFinite(stored) && stored > 0 && stored <= Date.now();
        if (hasStoredActivity) {
          lastActivity = hasLocalActivity ? Math.max(lastActivity, stored) : stored;
          hasLocalActivity = true;
          activityClock.current = { key: activityKey, time: lastActivity };
        }
      } catch (error) {
        console.error("Session activity storage unavailable; using this tab's inactivity timer:", error);
      }
    }

    function writeActivity() {
      lastActivity = Date.now();
      hasLocalActivity = true;
      activityClock.current = { key: activityKey, time: lastActivity };
      scheduleIdle();
      try {
        window.localStorage.setItem(activityKey, String(lastActivity));
        hasStoredActivity = true;
      } catch (error) {
        console.error("Session activity could not be shared across tabs:", error);
      }
    }

    async function logout(destination: string) {
      if (disposed || loggingOut || failedLogout) return;
      loggingOut = true;
      setBlocked(true);
      try {
        const { error } = await supabase.auth.signOut({ scope: "local" });
        if (error) throw error;
        try {
          window.localStorage.removeItem(activityKey);
        } catch (error) {
          console.error("Session activity cleanup failed:", error);
        }
        if (!disposed) window.location.replace(destination);
      } catch (error) {
        if (disposed) return;
        console.error("Automatic logout failed:", error);
        failedLogout = true;
        setLogoutError("Sign-out could not be confirmed. Your account content is hidden. Please retry sign-out.");
      } finally {
        loggingOut = false;
      }
    }

    function checkIdle() {
      if (!userId || disposed || failedLogout) return false;
      readActivity();
      if (Date.now() - lastActivity >= idleTimeout) {
        void logout("/login?message=You%20were%20signed%20out%20after%2030%20minutes%20of%20inactivity.");
        return true;
      }
      scheduleIdle();
      return false;
    }

    function recordActivity() {
      if (!userId || loggingOut || failedLogout || checkIdle()) return;
      writeActivity();
    }

    function reconcile(currentUserId: string | null) {
      if (!disposed && !loggingOut && !failedLogout && currentUserId !== userId) {
        setBlocked(true);
        // A full reload discards personalized router history as well as component state.
        window.location.reload();
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      reconcile(session?.user.id ?? null);
    });

    async function verifySession() {
      if (disposed || loggingOut || failedLogout || checkIdle()) return;
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (disposed) return;
        if (error && !user && userId) {
          if (error.status === 401 || error.status === 403 || error.name === "AuthSessionMissingError") {
            await logout("/login?message=Your%20session%20has%20ended.%20Please%20sign%20in%20again.");
            return;
          }
          throw error;
        }
        if (!user && userId) {
          await logout("/login?message=Your%20session%20has%20ended.%20Please%20sign%20in%20again.");
          return;
        }
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
      if (checkIdle()) return;
      if (event.persisted) window.location.reload();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void verifySession();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === activityKey) checkIdle();
    };
    const activityEvents = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
    if (userId) {
      readActivity();
      if (pathname === "/") {
        void logout("/");
      } else if (!checkIdle()) {
        if (!hasStoredActivity && !hasLocalActivity) writeActivity();
      }
      if (pathname !== "/") void verifySession();
    }
    window.addEventListener("focus", verifySession);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibilityChange);
    activityEvents.forEach((event) => window.addEventListener(event, recordActivity, { passive: true }));
    const interval = window.setInterval(verifySession, 30_000);

    return () => {
      disposed = true;
      subscription.unsubscribe();
      window.removeEventListener("focus", verifySession);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      activityEvents.forEach((event) => window.removeEventListener(event, recordActivity));
      window.clearInterval(interval);
      window.clearTimeout(idleTimer);
    };
  }, [userId, sessionStartedAt, pathname, retry]);

  if (logoutError) {
    return (
      <div role="alert" className="alert-error m-6">
        <p>{logoutError}</p>
        <button type="button" className="mt-3 underline" onClick={() => {
          setLogoutError("");
          setRetry((value) => value + 1);
        }}>Retry sign-out</button>
      </div>
    );
  }
  return blocked || (userId && pathname === "/") ? <p role="status">Refreshing your session...</p> : children;
}
