import assert from "node:assert/strict";
import test from "node:test";
import {
  hasMinimumOpportunityDescription,
  hasValidOpportunityLocation,
  MIN_OPPORTUNITY_DESCRIPTION_LENGTH,
  formatOpportunityLocation,
  hasValidOpportunitySchedule,
} from "./opportunity-validation.ts";

test("accepts descriptions at or above the minimum after trimming", () => {
  assert.equal(MIN_OPPORTUNITY_DESCRIPTION_LENGTH, 50);
  assert.equal(hasMinimumOpportunityDescription("a".repeat(50)), true);
  assert.equal(hasMinimumOpportunityDescription(`  ${"a".repeat(50)}  `), true);
});

test("rejects descriptions below the minimum or containing only whitespace", () => {
  assert.equal(hasMinimumOpportunityDescription("a".repeat(49)), false);
  assert.equal(hasMinimumOpportunityDescription(" ".repeat(60)), false);
});

test("accepts an explicitly remote event without a physical location", () => {
  assert.equal(hasValidOpportunityLocation({
    isVirtual: true,
    locationName: "",
    addressLine1: "",
    city: "",
  }), true);
});

test("requires a nonblank physical location for in-person events", () => {
  const emptyLocation = { isVirtual: false, locationName: " ", addressLine1: "", city: "\t" };
  assert.equal(hasValidOpportunityLocation(emptyLocation), false);
  assert.equal(hasValidOpportunityLocation({ ...emptyLocation, locationName: "Community Center" }), true);
  assert.equal(hasValidOpportunityLocation({ ...emptyLocation, addressLine1: "10 Main St" }), true);
  assert.equal(hasValidOpportunityLocation({ ...emptyLocation, city: "Seattle" }), true);
});

test("placeholder locations do not qualify for publication", () => {
  for (const placeholder of ["TBD", " To be determined ", "to be announced", "N/A", "unknown", "Location TBD"]) {
    const location = { isVirtual: false, locationName: placeholder, addressLine1: "", city: "TBD" };
    assert.equal(hasValidOpportunityLocation(location), false, placeholder);
    assert.equal(hasValidOpportunityLocation({ ...location, addressLine1: "10 Main St" }), true);
    assert.equal(hasValidOpportunityLocation({ ...location, isVirtual: true }), true);
  }
});

test("location displays consistently use remote, venue or address, and a clear legacy fallback", () => {
  assert.equal(formatOpportunityLocation({ is_virtual: true, city: "Town" }), "Virtual");
  assert.equal(formatOpportunityLocation({ location_name: " Center ", city: " Town ", state: " NY " }), "Center, Town, NY");
  assert.equal(formatOpportunityLocation({ location_name: " ", address_line1: "10 Main St" }), "10 Main St");
  assert.equal(formatOpportunityLocation({ location_name: "TBD", address_line1: "10 Main St", city: "Unknown" }), "10 Main St");
  assert.equal(formatOpportunityLocation({ location_name: "TBD", city: "N/A" }),
    "Location not provided. Contact the organization for details.");
});

test("publishing requires real timestamp values with the end strictly after the start", () => {
  const start = "2099-01-01T10:00";
  assert.equal(hasValidOpportunitySchedule(start, "2099-01-01T11:00"), true);
  assert.equal(hasValidOpportunitySchedule("2099-01-01T10:00:00Z", "2099-01-02T10:00:00Z"), true);
  for (const [from, to] of [
    ["", ""], [start, start], [start, "2099-01-01T09:00"], ["invalid", "invalid"],
    ["2099-02-30T10:00", "2099-03-03T10:00"], [start, "2099-01-01T25:00"],
    ["2099-01-01", "2099-01-02"],
  ]) assert.equal(hasValidOpportunitySchedule(from, to), false, `${from}/${to}`);
});