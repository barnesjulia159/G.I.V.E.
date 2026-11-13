"use client";

import { useRef, useState } from "react";

export function ResetPasswordForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);

  async function submit(formData: FormData) {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError("");
    window.dispatchEvent(new CustomEvent("give:password-reset-pending", { detail: true }));
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(30_000),
      });
      const result: unknown = await response.json();
      if (!result || typeof result !== "object") throw new Error("Invalid password reset response");
      if ("destination" in result && typeof result.destination === "string" &&
        result.destination.startsWith("/") && !result.destination.startsWith("//")) {
        window.location.replace(result.destination);
        return;
      }
      if (!("error" in result) || typeof result.error !== "string") {
        throw new Error(`Unexpected password reset response (${response.status})`);
      }
      setError(result.error);
    } catch (error) {
      console.error("Password reset request failed:", error);
      setError("We couldn't confirm the password reset. Your password may have changed; try signing in with the new password.");
    }
    window.dispatchEvent(new CustomEvent("give:password-reset-pending", { detail: false }));
    submitting.current = false;
    setPending(false);
  }

  return (
    <form action={submit} className="auth-form">
      {error && <p role="alert" className="alert-error">{error}</p>}
      <div className="form-field">
        <label htmlFor="password" className="form-label">New password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={6} required className="form-input" />
      </div>
      <div className="form-field">
        <label htmlFor="confirm_password" className="form-label">Confirm new password</label>
        <input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" minLength={6} required className="form-input" />
      </div>
      <button type="submit" className="auth-submit" disabled={pending}>
        {pending ? "Updating..." : "Update password"}
      </button>
    </form>
  );
}
