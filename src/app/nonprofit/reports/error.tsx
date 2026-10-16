"use client";

export default function ReportsError({ reset }: { reset: () => void }) {
  return (
    <section>
      <h1 className="text-2xl font-bold">Report unavailable</h1>
      <p className="alert-error">Volunteer records could not be loaded. No report totals are available.</p>
      <button type="button" className="form-input" onClick={reset}>Try again</button>
    </section>
  );
}