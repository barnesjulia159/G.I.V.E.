"use client";

import { useState } from "react";

export function SendTestEmailButton() {
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  async function sendTestEmail() {
    setIsSending(true);
    setMessage("");

    try {
      const response = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipient,
          subject: "GIVE test email",
          message: "This is a test email from the GIVE volunteering platform.",
        }),
      });
      const result = await response.json().catch(() => null);
      setMessage(response.ok ? "Test email sent." : result?.error ?? "Unable to send test email.");
    } catch {
      setMessage("Unable to send test email.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="mt-8 rounded-xl bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold">Email delivery</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <label htmlFor="test-email-recipient" className="sr-only">Test email recipient</label>
        <input
          id="test-email-recipient"
          type="email"
          required
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
          placeholder="Recipient email"
          className="form-input min-w-64 flex-1"
        />
        <button
          type="button"
          onClick={sendTestEmail}
          disabled={!recipient || isSending}
          className="rounded-md bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {isSending ? "Sending..." : "Send Test Email"}
        </button>
      </div>
      {message && <p className="mt-3 text-sm text-slate-700">{message}</p>}
    </div>
  );
}