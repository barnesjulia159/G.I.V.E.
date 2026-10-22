import assert from "node:assert/strict";
import test from "node:test";
import { formatDateTime, formatDateTimeRange } from "./date-format.ts";

test("formats same-day event ranges consistently with a timezone", () => {
  assert.equal(
    formatDateTimeRange("2026-11-05T11:08:00Z", "2026-11-05T21:06:00Z"),
    "November 5, 2026, 11:08 AM-9:06 PM UTC",
  );
});

test("includes both dates when an event crosses UTC midnight", () => {
  assert.equal(
    formatDateTimeRange("2026-11-05T23:30:00Z", "2026-11-06T01:00:00Z"),
    "November 5, 2026, 11:30 PM - November 6, 2026, 1:00 AM UTC",
  );
});

test("formats individual attendance timestamps with timezone", () => {
  assert.equal(formatDateTime("2026-11-05T11:08:00Z"), "November 5, 2026, 11:08 AM UTC");
});