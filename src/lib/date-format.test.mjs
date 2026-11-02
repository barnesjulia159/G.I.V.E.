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

test("formats a viewer's local date including previous-day and next-day boundaries", () => {
  assert.equal(formatDateTime("2026-11-05T01:00:00Z", "America/New_York"),
    "November 4, 2026, 8:00 PM EST");
  assert.equal(formatDateTime("2026-11-05T23:00:00Z", "Asia/Tokyo"),
    "November 6, 2026, 8:00 AM GMT+9");
});

test("local ranges use local midnight rather than UTC midnight", () => {
  assert.equal(formatDateTimeRange("2026-11-05T23:30:00Z", "2026-11-06T01:00:00Z", "America/New_York"),
    "November 5, 2026, 6:30 PM-8:00 PM EST");
  assert.equal(formatDateTimeRange("2026-11-06T04:30:00Z", "2026-11-06T06:00:00Z", "America/New_York"),
    "November 5, 2026, 11:30 PM - November 6, 2026, 1:00 AM EST");
});

test("ranges crossing daylight saving changes label both offsets", () => {
  assert.equal(formatDateTimeRange("2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z", "America/New_York"),
    "November 1, 2026, 1:30 AM EDT - November 1, 2026, 1:30 AM EST");
});