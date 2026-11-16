import assert from "node:assert/strict";
import test from "node:test";
import { easternDayBounds, easternTimeOccurrence, formatDateTime, formatDateTimeRange, parseEasternDateTimeInput, toEasternDateTimeInput } from "./date-format.ts";

test("formats same-day event ranges in Eastern time by default", () => {
  assert.equal(
    formatDateTimeRange("2026-11-05T11:08:00Z", "2026-11-05T21:06:00Z"),
    "November 5, 2026, 6:08 AM - 4:06 PM EST",
  );
});

test("uses Eastern calendar dates when an event crosses UTC midnight", () => {
  assert.equal(
    formatDateTimeRange("2026-11-05T23:30:00Z", "2026-11-06T01:00:00Z"),
    "November 5, 2026, 6:30 PM - 8:00 PM EST",
  );
});

test("formats individual timestamps in Eastern time, including daylight time", () => {
  assert.equal(formatDateTime("2026-11-05T11:08:00Z"), "November 5, 2026, 6:08 AM EST");
  assert.equal(formatDateTime("2026-07-05T11:08:00Z"), "July 5, 2026, 7:08 AM EDT");
});

test("formats a viewer's local date including previous-day and next-day boundaries", () => {
  assert.equal(formatDateTime("2026-11-05T01:00:00Z", "America/New_York"),
    "November 4, 2026, 8:00 PM EST");
  assert.equal(formatDateTime("2026-11-05T23:00:00Z", "Asia/Tokyo"),
    "November 6, 2026, 8:00 AM GMT+9");
});

test("local ranges use local midnight rather than UTC midnight", () => {
  assert.equal(formatDateTimeRange("2026-11-05T23:30:00Z", "2026-11-06T01:00:00Z", "America/New_York"),
    "November 5, 2026, 6:30 PM - 8:00 PM EST");
  assert.equal(formatDateTimeRange("2026-11-06T04:30:00Z", "2026-11-06T06:00:00Z", "America/New_York"),
    "November 5, 2026, 11:30 PM - November 6, 2026, 1:00 AM EST");
});

test("ranges crossing daylight saving changes label both offsets", () => {
  assert.equal(formatDateTimeRange("2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z", "America/New_York"),
    "November 1, 2026, 1:30 AM EDT - November 1, 2026, 1:30 AM EST");
});

test("omits stored seconds and separates both ends of a same-day range", () => {
  assert.equal(formatDateTimeRange("2026-11-05T11:08:45Z", "2026-11-05T21:06:59Z"),
    "November 5, 2026, 6:08 AM - 4:06 PM EST");
  assert.equal(formatDateTime("2026-11-05T11:08:45Z"), "November 5, 2026, 6:08 AM EST");
});

test("Eastern inputs convert independently of the server timezone and round-trip saved instants", () => {
  assert.equal(parseEasternDateTimeInput("2026-01-05T10:00").toISOString(), "2026-01-05T15:00:00.000Z");
  assert.equal(parseEasternDateTimeInput("2026-07-05T10:00").toISOString(), "2026-07-05T14:00:00.000Z");
  assert.equal(toEasternDateTimeInput("2026-07-05T14:00:37.000Z"), "2026-07-05T10:00");
  assert.equal(parseEasternDateTimeInput("2026-07-05T10:00", "2026-07-05T14:00:37.000Z").toISOString(), "2026-07-05T14:00:37.000Z");
  for (const invalid of ["2026-02-30T10:00", "2026-01-05T25:00", "2026-03-08T02:30", "2026-01-05T10:00Z"]) {
    assert.equal(parseEasternDateTimeInput(invalid), null, invalid);
  }
});

test("fall repeated times support both occurrences and preserve saved instants", () => {
  const first = "2026-11-01T05:30:00.000Z";
  const second = "2026-11-01T06:30:42.000Z";
  assert.equal(parseEasternDateTimeInput("2026-11-01T01:30").toISOString(), first);
  assert.equal(parseEasternDateTimeInput("2026-11-01T01:30", null, "second").toISOString(), "2026-11-01T06:30:00.000Z");
  assert.equal(easternTimeOccurrence(first), "first");
  assert.equal(easternTimeOccurrence(second), "second");
  assert.equal(parseEasternDateTimeInput("2026-11-01T01:30", second).toISOString(), second);
  assert.equal(parseEasternDateTimeInput("2026-11-01T01:31", second).toISOString(), "2026-11-01T05:31:00.000Z");
  assert.equal(parseEasternDateTimeInput("2026-11-01T01:30", second, "second").toISOString(), second);
  assert.equal(parseEasternDateTimeInput("2026-11-01T01:30", second, "first").toISOString(), first);
});

test("Eastern date filtering uses actual local day boundaries across DST", () => {
  for (const [day, start, end] of [
    ["2026-01-05", "2026-01-05T05:00:00.000Z", "2026-01-06T05:00:00.000Z"],
    ["2026-03-08", "2026-03-08T05:00:00.000Z", "2026-03-09T04:00:00.000Z"],
    ["2026-11-01", "2026-11-01T04:00:00.000Z", "2026-11-02T05:00:00.000Z"],
  ]) {
    const bounds = easternDayBounds(day);
    assert.equal(bounds.start.toISOString(), start);
    assert.equal(bounds.end.toISOString(), end);
  }
  assert.equal(easternDayBounds("2026-02-30"), null);
});