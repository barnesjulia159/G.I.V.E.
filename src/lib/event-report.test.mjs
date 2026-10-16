import assert from "node:assert/strict";
import test from "node:test";
import { buildEventReport } from "./event-report.ts";

const booking = {
  id: "booking-1", volunteer_id: "volunteer-1", status: "booked",
  hours_override: null, hours_override_notes: null, notes: null,
  attendanceLog: {
    status: "present", check_in_at: new Date("2026-10-16T09:00:00Z"),
    check_out_at: new Date("2026-10-16T11:30:00Z"), notes: null,
  },
};
const manual = { volunteer_id: "volunteer-1", hours: 1, notes: "Setup" };

test("completed attendance and manual entries are additive", () => {
  const report = buildEventReport([booking], [manual], []);
  assert.equal(report.totalHours, 3.5);
  assert.equal(report.volunteerCount, 1);
  assert.equal(report.rows[0].manualHours, 1);
});

test("zero override replaces attendance and suppresses manual entries", () => {
  const report = buildEventReport([{ ...booking, hours_override: 0 }], [manual], []);
  assert.equal(report.totalHours, 0);
  assert.equal(report.rows[0].overrideHours, 0);
  assert.deepEqual(report.rows[0].notes, []);
});

test("an open session counts as checked in but earns no duration yet", () => {
  const report = buildEventReport([{ ...booking, attendanceLog: { ...booking.attendanceLog, check_out_at: null } }], [], []);
  assert.equal(report.totalHours, 0);
  assert.equal(report.checkedInCount, 1);
});

test("cancelled bookings are excluded but standalone manual hours remain", () => {
  const report = buildEventReport([{ ...booking, status: "cancelled" }], [manual], []);
  assert.equal(report.totalHours, 1);
  assert.equal(report.rows[0].sessions.length, 0);
});

test("multiple registrations do not duplicate manual hours", () => {
  const report = buildEventReport([booking, { ...booking, id: "booking-2" }], [manual], []);
  assert.equal(report.totalHours, 6);
  assert.equal(report.volunteerCount, 1);
});

test("empty events and invalid timestamp intervals produce zero totals", () => {
  assert.equal(buildEventReport([], [], []).totalHours, 0);
  assert.equal(buildEventReport([{ ...booking, attendanceLog: { ...booking.attendanceLog, check_out_at: new Date("2026-10-16T08:00:00Z") } }], [], []).totalHours, 0);
});