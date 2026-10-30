import assert from "node:assert/strict";
import test from "node:test";
import { isActiveRole, managedOpportunityScope } from "./access-control.ts";

test("organizer scopes use the organization owner rather than the opportunity creator", () => {
  const actor = { id: "organizer-a", role: "nonprofit", isActive: true };
  assert.deepEqual(managedOpportunityScope(actor), { organization: { user_id: "organizer-a" } });
  assert.equal(isActiveRole(actor, ["nonprofit"]), true);
});

test("only active admins receive a platform-wide scope", () => {
  assert.deepEqual(managedOpportunityScope({ id: "admin", role: "admin", isActive: true }), {});
  assert.throws(() => managedOpportunityScope({ id: "admin", role: "admin", isActive: false }), /active organizer/);
});

test("missing, inactive and volunteer actors cannot manage tenant objects", () => {
  assert.equal(isActiveRole(null, ["nonprofit"]), false);
  for (const actor of [
    { id: "inactive", role: "nonprofit", isActive: false },
    { id: "volunteer", role: "volunteer", isActive: true },
  ]) {
    assert.equal(isActiveRole(actor, ["nonprofit"]), false);
    assert.throws(() => managedOpportunityScope(actor), /active organizer/);
  }
});
