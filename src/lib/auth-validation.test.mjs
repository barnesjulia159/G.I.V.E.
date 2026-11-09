import assert from "node:assert/strict";
import test from "node:test";
import { MIN_PASSWORD_LENGTH, registrationInputError } from "./auth-validation.ts";

test("registration reports missing fields, malformed emails, short passwords and invalid account types", () => {
  assert.equal(MIN_PASSWORD_LENGTH, 6);
  for (const [email, password, role, expected] of [
    ["", "", "volunteer", "Email and password are required."],
    ["hello@example.org", "", "volunteer", "Email and password are required."],
    ["not-an-email", "abcdef", "volunteer", "Enter a valid email address."],
    ["two@@example.org", "abcdef", "volunteer", "Enter a valid email address."],
    ["hello@example.org", "12345", "volunteer", "Password must contain at least 6 non-padding characters."],
    ["hello@example.org", "  abc  ", "volunteer", "Password must contain at least 6 non-padding characters."],
    ["hello@example.org", "abcdef", "admin", "Invalid account type."],
  ]) assert.equal(registrationInputError(email, password, role), expected);
});

test("valid volunteer/nonprofit signups retain the existing six-character policy", () => {
  for (const role of ["volunteer", "nonprofit"]) {
    assert.equal(registrationInputError("hello+volunteer@example.org", "abcdef", role), null);
  }
});
