import assert from "node:assert/strict";
import test from "node:test";
import {
  hasMinimumOpportunityDescription,
  hasValidOpportunityLocation,
  MIN_OPPORTUNITY_DESCRIPTION_LENGTH,
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