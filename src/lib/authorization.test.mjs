import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as accessControl from "./access-control.ts";
import { isTrustedRequest } from "./request-security.ts";
import pg from "pg";
import * as opportunityValidation from "./opportunity-validation.ts";
import { MIN_PASSWORD_LENGTH, registrationInputError } from "./auth-validation.ts";
import { buildEventReport, confirmedAttendanceHours } from "./event-report.ts";
import * as dateFormat from "./date-format.ts";

// Execute the actual server modules with isolated auth/database boundaries,
// without starting Next.js or connecting unit tests to the application database.
async function loadServerModule(path, imports) {
  imports["@/lib/date-format"] = { ...dateFormat, ...imports["@/lib/date-format"] };
  imports["@/lib/auth-validation"] = { MIN_PASSWORD_LENGTH, registrationInputError };
  imports["@/lib/event-report"] = { confirmedAttendanceHours };
  imports["@/lib/opportunity-validation"] = {
    ...opportunityValidation,
    hasValidOpportunitySchedule: () => true,
    ...imports["@/lib/opportunity-validation"],
  };
  if (path.startsWith("./actions/") && ["./actions/bookings.ts", "./actions/opportunities.ts"].includes(path)) {
    imports["@/lib/opportunity-cache"] = await loadServerModule("./opportunity-cache.ts", {
      "next/cache": imports["next/cache"],
    });
  }
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  const run = new Script(`(function(require, exports) { ${outputText}\n})`, { filename: path }).runInThisContext();
  run((name) => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`);
    return imports[name];
  }, exports);
  return exports;
}

function redirect(location) {
  throw Object.assign(new Error("redirect"), { location });
}
const navigation = { redirect };
const nextServer = { NextResponse: { json: (body, init) => Response.json(body, init) } };
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const objectId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const opportunityPaths = [
  "/opportunities", `/opportunities/${objectId}`, "/nonprofit/dashboard",
  "/volunteer/bookings", "/admin/dashboard",
  `/nonprofit/opportunities/${objectId}/edit`,
  `/nonprofit/opportunities/${objectId}/participants`,
  "/nonprofit/reports", "/volunteer/dashboard", "/admin/bookings",
  "/organizations/[id]",
];

test("invalid registration inputs fail before provider or duplicate lookup access", async () => {
  for (const fields of [
    { email: "", password: "" }, { email: "not-an-email", password: "abcdef" },
    { email: "hello@example.org", password: "12345" },
    { email: "hello@example.org", password: "      " },
    { email: "hello@example.org", password: "abcdef", role: "admin" },
  ]) {
    const actions = await loadServerModule("./actions/auth.ts", {
      "next/headers": {}, "next/navigation": navigation, "next/cache": {},
      "@/lib/supabase/server": { createClient: () => assert.fail("Invalid registration must not call provider") },
      "@/lib/prisma": { prisma: { users: { findFirst: () => assert.fail("Invalid registration must not query users") } } },
      "@/lib/role-routing": {}, "@/lib/login-rate-limit": {},
    });
    const form = new FormData();
    Object.entries(fields).forEach(([key, value]) => form.set(key, value));
    await assert.rejects(actions.signUp(form), (error) => error.location?.startsWith("/register?error="));
  }
});

test("registration handles duplicate lookup and provider duplicate responses without claiming success", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const duplicateMode of ["lookup", "error", "identities", "none"]) {
    let providerCalls = 0;
    let syncCalls = 0;
    const actions = await loadServerModule("./actions/auth.ts", {
      "next/headers": {}, "next/navigation": navigation, "next/cache": {},
      "@/lib/supabase/server": { createClient: async () => ({ auth: {
        signUp: async ({ email, password, options }) => {
          providerCalls++;
          assert.equal(email, "Hello@example.org");
          assert.equal(password, "abcdef");
          assert.equal(options.data.role, "volunteer");
          return duplicateMode === "error"
            ? { data: {}, error: { code: "user_already_exists", message: "Duplicate" } }
            : { data: { user: { id: userId, email, identities: duplicateMode === "identities" ? [] : [{ id: userId }] } }, error: null };
        },
      } }) },
      "@/lib/prisma": { prisma: {
        users: { findFirst: async ({ where }) => {
          assert.equal(where.email.mode, "insensitive");
          return duplicateMode === "lookup" ? { id: userId } : null;
        } },
        profile: { updateMany: async () => { syncCalls++; } },
      } },
      "@/lib/role-routing": {}, "@/lib/login-rate-limit": {},
    });
    const form = new FormData();
    form.set("email", " Hello@example.org ");
    form.set("password", "abcdef");
    await assert.rejects(actions.signUp(form), (error) =>
      decodeURIComponent(error.location ?? "").includes(duplicateMode === "none" ? "Account created" : "already exists"));
    assert.equal(providerCalls, duplicateMode === "lookup" ? 0 : 1);
    assert.equal(syncCalls, duplicateMode === "none" ? 1 : 0);
  }
});

test("published edits reject missing titles and invalid schedules before updates", async () => {
  for (const invalid of [
    { title: "" }, { start_at: "" }, { end_at: "" }, { start_at: "garbled" },
    { end_at: "2099-01-01T10:00" }, { end_at: "2099-01-01T09:00" },
  ]) {
    const supabase = opportunityClient({ previous: { id: objectId, start_at: "2099-01-01T15:00:00Z", end_at: "2099-01-01T16:00:00Z" } });
    const actions = await loadServerModule("./actions/opportunities.ts", {
      "next/navigation": navigation, "next/cache": {},
      "@/lib/authorization": { requireNonprofitOrganization: async () => ({
        supabase,
        user: { id: userId }, organization: { id: "org-a" },
      }) },
      "@/lib/prisma": { prisma: {} }, "@/lib/date-format": {},
      "@/lib/opportunity-validation": opportunityValidation,
    });
    const form = new FormData();
    for (const [key, value] of Object.entries({
      opportunity_id: objectId, submit_action: "publish", title: "Event",
      start_at: "2099-01-01T10:00", end_at: "2099-01-01T11:00",
      description: "Volunteers help plant flowers and maintain the community garden.",
      location_name: "Community Center", capacity: "10", ...invalid,
    })) form.set(key, value);
    await assert.rejects(actions.updateOpportunity(form), (error) =>
      decodeURIComponent(error.location ?? "").includes(invalid.title === "" ? "require a title" : "valid Eastern start and end times"));
    assert.ok(supabase.calls.every((call) => !call.update));
  }
});

async function authActions(auth, invalidations = []) {
  return loadServerModule("./actions/auth.ts", {
    "next/headers": {},
    "next/navigation": navigation,
    "next/cache": { revalidatePath: (...args) => invalidations.push(args) },
    "@/lib/supabase/server": { createClient: async () => ({ auth }) },
    "@/lib/prisma": { prisma: {} },
    "@/lib/role-routing": {},
    "@/lib/login-rate-limit": {},
  });
}

function passwordForm(password = "new-password", confirmation = password) {
  const form = new FormData();
  form.set("password", password);
  form.set("confirm_password", confirmation);
  return form;
}

test("CSRF and CORS accept only same-origin API requests and authenticated browser writes", () => {
  const origin = "https://give.test";
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    for (const path of ["/login", "/api/attendance/check-in", "/api/volunteer/profile/photo", "/api/anything.svg"]) {
      const request = (headers) => new Request(`${origin}${path}`, { method, headers });
      assert.equal(isTrustedRequest(request({ origin })), true);
      assert.equal(isTrustedRequest(request({ referer: `${origin}/profile` })), true);
      for (const headers of [
        {}, { origin: "null" }, { origin: "https://evil.test" },
        { origin: "https://give.test.evil.test" }, { origin: `${origin}/` },
        { referer: "invalid" }, { referer: "https://evil.test/form" },
        { origin, "sec-fetch-site": "cross-site" },
        { origin, "sec-fetch-site": "same-site" },
      ]) assert.equal(isTrustedRequest(request(headers)), false, JSON.stringify(headers));
    }
  }
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    assert.equal(isTrustedRequest(new Request(`${origin}/api/notifications`, { method, headers: { origin: "https://evil.test" } })), false);
    assert.equal(isTrustedRequest(new Request(`${origin}/api/notifications`, { method, headers: { origin } })), true);
  }
  assert.equal(isTrustedRequest(new Request(`${origin}/callback?code=example`, { headers: { "sec-fetch-site": "cross-site" } })), true);
  assert.equal(isTrustedRequest(new Request(`${origin}/opportunities`)), true);
  assert.equal(isTrustedRequest(new Request("http://internal.test/api/test", { method: "POST", headers: { origin } })), false);
  assert.equal(isTrustedRequest(new Request("http://localhost:3000/api/test", {
    method: "POST", headers: { host: "localhost:3218", origin: "http://localhost:3218" },
  })), true);
  assert.equal(isTrustedRequest(new Request("http://localhost:3000/api/test", {
    method: "POST", headers: { host: "localhost:3218", origin: "https://evil.test", "x-forwarded-host": "evil.test" },
  })), false);
});

test("proxy rejects cross-origin requests before touching sessions and does not grant CORS", async () => {
  let sessionCalls = 0;
  class ProxyResponse extends Response {
    static json(body, init) { return Response.json(body, init); }
  }
  const handler = await loadServerModule("../proxy.ts", {
    "next/server": { NextResponse: ProxyResponse },
    "@/lib/request-security": { isTrustedRequest },
    "@/lib/supabase/middleware": { updateSession: async () => {
      sessionCalls++;
      return new Response("OK");
    } },
  });

  test("hosted login actions use their own origin regardless of a stale callback site URL", async () => {
    const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    let sessionCalls = 0;
    try {
      const handler = await loadServerModule("../proxy.ts", {
        "next/server": { NextResponse: class extends Response {
          static json(body, init) { return Response.json(body, init); }
        } },
        "@/lib/request-security": { isTrustedRequest },
        "@/lib/supabase/middleware": { updateSession: async () => {
          sessionCalls++;
          return new Response("Next action handler");
        } },
      });
      const request = (origin) => Object.assign(new Request("https://givevolunteering.app/login", {
        method: "POST", headers: {
          host: "givevolunteering.app", origin, "sec-fetch-site": "same-origin",
          "next-action": "diagnostic-action",
        },
      }), { nextUrl: new URL("https://givevolunteering.app/login") });
      assert.equal((await handler.proxy(request("https://givevolunteering.app"))).status, 200);
      assert.equal(sessionCalls, 1);
      for (const origin of ["https://evil.test", "http://localhost:3000", "https://www.givevolunteering.app"]) {
        assert.equal((await handler.proxy(request(origin))).status, 403);
      }
      assert.equal(sessionCalls, 1);
    } finally {
      if (previousSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
    }
  });
  const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://give.test").origin;
  const request = (path, method, headers = {}) => Object.assign(
    new Request(`${origin}${path}`, { method, headers }),
    { nextUrl: new URL(`${origin}${path}`) },
  );
  const denied = await handler.proxy(request("/api/test", "POST", { origin: "https://evil.test" }));
  assert.equal(denied.status, 403);
  assert.equal(sessionCalls, 0);
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
  assert.equal((await handler.proxy(request("/login", "POST", { origin }))).status, 200);
  assert.equal(sessionCalls, 1);
  const preflight = await handler.proxy(request("/api/test", "OPTIONS", { origin }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), null);
  assert.equal(sessionCalls, 1);
  assert.equal((await handler.proxy(request("/callback", "GET", { "sec-fetch-site": "cross-site" }))).status, 200);
});

test("login checks the limiter before authentication and fails closed on exhaustion or storage errors", async () => {
  for (const scenario of ["limited", "unavailable", "allowed"]) {
    let attempts = 0;
    let authCalls = 0;
    const actions = await loadServerModule("./actions/auth.ts", {
      "next/headers": {},
      "next/navigation": navigation,
      "next/cache": {},
      "@/lib/supabase/server": { createClient: async () => {
        assert.equal(attempts, 1);
        authCalls++;
        return { auth: { signInWithPassword: async () => ({ error: { message: "Invalid credentials" } }) } };
      } },
      "@/lib/prisma": { prisma: {} },
      "@/lib/role-routing": {},
      "@/lib/login-rate-limit": { consumeLoginAttempt: async (email) => {
        assert.equal(email, "USER@example.test");
        attempts++;
        if (scenario === "unavailable") throw new Error("database down");
        return { allowed: scenario === "allowed", retry_after: 900 };
      } },
    });
    const form = new FormData();
    form.set("email", " USER@example.test ");
    form.set("password", "example-password");
    const originalError = console.error;
    const errors = [];
    console.error = (...args) => errors.push(args);
    try {
      await assert.rejects(actions.signIn(form), (error) => {
        const message = new URL(error.location, "http://localhost").searchParams.get("error");
        assert.match(message, scenario === "limited" ? /Too many.*15 minutes/
          : scenario === "unavailable" ? /temporarily unavailable/ : /Invalid credentials/);
        return true;
      });
    } finally {
      console.error = originalError;
    }
    assert.equal(authCalls, scenario === "allowed" ? 1 : 0);
    assert.equal(errors.length, scenario === "limited" ? 0 : 1);
  }
});

test("login limiter uses shared PostgreSQL atomic counters, expires windows and hides client access", {
  skip: !process.env.LOGIN_TEST_DATABASE_URL && "Set LOGIN_TEST_DATABASE_URL to an empty disposable PostgreSQL database.",
}, async (t) => {
  const pool = new pg.Pool({ connectionString: process.env.LOGIN_TEST_DATABASE_URL, max: 15 });
  let created = false;
  t.after(async () => {
    try {
      if (created) await pool.query("drop table public.login_rate_limits");
    } finally { await pool.end(); }
  });
  const { rows } = await pool.query("select to_regclass('public.login_rate_limits') as existing");
  assert.equal(rows[0].existing, null);
  await pool.query(`
    do $roles$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    end $roles$;
  `);
  await pool.query(await readFile(new URL("../../supabase/migrations/20261029000002_login_rate_limits.sql", import.meta.url), "utf8"));
  created = true;
  function query(client, parts, ...values) {
    const sql = parts.reduce((text, part, index) => text + (index ? `$${index}` : "") + part, "");
    return client.query(sql, values);
  }
  const limiter = await loadServerModule("./login-rate-limit.ts", {
    "node:crypto": await import("node:crypto"),
    "@/lib/prisma": { prisma: { $transaction: async (operation) => {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const result = await operation({
          $executeRaw: (...args) => query(client, ...args),
          $queryRaw: async (...args) => (await query(client, ...args)).rows,
        });
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally { client.release(); }
    } } },
  });
  const results = await Promise.all(Array.from({ length: 30 }, (_, i) =>
    limiter.consumeLoginAttempt(i % 2 ? " USER@example.test " : "user@example.test")));
  assert.equal(results.filter((result) => result.allowed).length, 10);
  assert.equal(results.filter((result) => !result.allowed).length, 20);
  assert.ok(results.every((result) => result.retry_after > 0 && result.retry_after <= 900));
  const { rows: counters } = await pool.query("select * from public.login_rate_limits");
  assert.equal(counters.length, 1);
  assert.equal(counters[0].attempts, 11);
  assert.match(counters[0].key_hash, /^[0-9a-f]{64}$/);
  assert.equal((await limiter.consumeLoginAttempt("another@example.test")).allowed, true);
  await pool.query("update public.login_rate_limits set expires_at = now() - interval '1 second'");
  assert.equal((await limiter.consumeLoginAttempt("USER@example.test")).allowed, true);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await assert.rejects(client.query("select * from public.login_rate_limits"), { code: "42501" });
    await client.query("rollback");
  } finally { client.release(); }
});

test("recovery and authenticated password changes explicitly revoke all refresh sessions after updating", async () => {
  for (const sessionKind of ["recovery", "authenticated"]) {
    const calls = [];
    const invalidations = [];
    const actions = await authActions({
      getUser: async () => ({ data: { user: { id: userId, sessionKind } } }),
      updateUser: async (attributes) => {
        assert.deepEqual(attributes, { password: "new-password" });
        calls.push("password-updated");
        return { error: null };
      },
      signOut: async (options) => {
        assert.deepEqual(options, { scope: "global" });
        assert.deepEqual(calls, ["password-updated"]);
        calls.push("global-signout");
        return { error: null };
      },
    }, invalidations);
    const result = await actions.updatePassword(passwordForm());
    const location = new URL(result.destination, "http://localhost");
    assert.equal(location.pathname, "/login");
    assert.match(location.searchParams.get("message"), /all refresh sessions/);
    assert.match(location.searchParams.get("message"), /access tokens remain valid/);
    assert.deepEqual(calls, ["password-updated", "global-signout"]);
    assert.deepEqual(invalidations, [["/", "layout"]]);
  }
});

test("failed revocation reports the already-changed password without claiming global logout succeeded", async () => {
  const invalidations = [];
  const actions = await authActions({
    getUser: async () => ({ data: { user: { id: userId } } }),
    updateUser: async () => ({ error: null }),
    signOut: async (options) => {
      assert.deepEqual(options, { scope: "global" });
      return { error: { message: "Auth service unavailable", status: 503 } };
    },
  }, invalidations);
  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);
  try {
    const result = await actions.updatePassword(passwordForm());
    const location = new URL(result.destination, "http://localhost");
    assert.equal(location.pathname, "/login");
    assert.equal(location.searchParams.has("message"), false);
    assert.match(location.searchParams.get("error"), /password was updated/);
    assert.match(location.searchParams.get("error"), /could not confirm sign-out on all devices/);
  } finally {
    console.error = originalError;
  }
  assert.equal(errors.length, 1);
  assert.deepEqual(invalidations, [["/", "layout"]]);
});

test("invalid inputs, missing recovery users and rejected password updates never revoke sessions", async () => {
  for (const scenario of ["short", "mismatch", "expired", "update-error"]) {
    const invalidations = [];
    const actions = await authActions({
      getUser: async () => ({ data: { user: scenario === "expired" ? null : { id: userId } } }),
      updateUser: async () => ({ error: { message: "Password change rejected" } }),
      signOut: async () => assert.fail("Must not revoke sessions before a successful password update"),
    }, invalidations);
    const originalError = console.error;
    console.error = () => {};
    try {
      const form = scenario === "short" ? passwordForm("short")
        : scenario === "mismatch" ? passwordForm("new-password", "different") : passwordForm();
      const result = await actions.updatePassword(form);
      if (scenario === "expired") {
        const location = new URL(result.destination, "http://localhost");
        assert.equal(location.pathname, "/forgot-password");
        assert.ok(location.searchParams.has("error"));
      } else {
        assert.ok(result.error);
      }
    } finally {
      console.error = originalError;
    }
    assert.deepEqual(invalidations, []);
  }
});

test("ordinary sign-out preserves global scope, invalidates private UI and surfaces failures", async () => {
  for (const error of [null, { message: "Auth service unavailable", status: 503 }]) {
    const invalidations = [];
    const actions = await authActions({
      signOut: async (options) => {
        assert.deepEqual(options, { scope: "global" });
        return { error };
      },
    }, invalidations);
    const originalError = console.error;
    const errors = [];
    console.error = (...args) => errors.push(args);
    try {
      await assert.rejects(actions.signOut(), (redirectError) => {
        if (error) {
          const location = new URL(redirectError.location, "http://localhost");
          assert.equal(location.pathname, "/login");
          assert.match(location.searchParams.get("error"), /could not confirm sign-out/);
        } else {
          assert.equal(redirectError.location, "/");
        }
        return true;
      });
    } finally {
      console.error = originalError;
    }
    assert.deepEqual(invalidations, [["/", "layout"]]);
    assert.equal(errors.length, error ? 1 : 0);
  }
});

test("action authorization rejects missing, inactive and wrong-role accounts", async () => {
  for (const [user, profile] of [
    [null, null],
    [{ id: userId }, null],
    [{ id: userId }, { id: userId, role: "volunteer", isActive: true }],
  ]) {
    const auth = await loadServerModule("./authorization.ts", {
      "next/navigation": navigation,
      "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
      "@/lib/prisma": { prisma: { profile: { findUnique: async (args) => {
        assert.deepEqual(args.where, { id: userId, isActive: true });
        return profile;
      } } } },
      "@/lib/access-control": accessControl,
    });

    await assert.rejects(auth.requireActionAccount("nonprofit"), (error) => error.location.startsWith("/login"));
  }
});

test("private account guard accepts only verified active accounts with the required role", async () => {
      for (const profile of [null,
        { id: userId, role: "volunteer", isActive: false },
        { id: userId, role: "nonprofit", isActive: true },
        { id: userId, role: "volunteer", isActive: true },
      ]) {
        const auth = await loadServerModule("./authorization.ts", {
          "next/navigation": navigation,
          "@/lib/supabase/server": { createClient: async () => ({
            auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
          }) },
          "@/lib/prisma": { prisma: { profile: { findUnique: async () => profile } } },
          "@/lib/access-control": accessControl,
        });
        if (profile?.isActive && profile.role === "volunteer") {
          assert.equal((await auth.requireActionAccount("volunteer")).user.id, userId);
        } else {
          await assert.rejects(auth.requireActionAccount("volunteer"), error => error.location.startsWith("/login"));
        }
      }
    });

    test("private notification and profile pages authorize before querying personal data", async () => {
      for (const path of [
        "../app/notifications/page.tsx", "../app/notifications/new/page.tsx",
        "../app/notifications/[id]/edit/page.tsx", "../app/volunteer/profile/page.tsx",
        "../app/volunteer/profile/skills-causes/page.tsx",
      ]) {
        const reject = async () => redirect("/login");
        const handler = await loadServerModule(path, {
          "react/jsx-runtime": {},
          "next/navigation": { ...navigation, notFound: () => assert.fail("Unexpected data access") },
          "next/link": {},
          "@/components/SubmitButton": {},
          "@/components/LocalDateTime": {},
          "@/components/VolunteerSkillsAndCausesEditor": {},
          "@/lib/actions/messages": {},
          "@/lib/actions/profiles": {},
          "@/lib/types": { AVAILABILITY_DAYS: [] },
          "@/lib/authorization": { requireActionAccount: reject, requireSignedInAccount: reject },
          "@/lib/prisma": { prisma: {} },
        });
        await assert.rejects(handler.default({ searchParams: Promise.resolve({}), params: Promise.resolve({ id: objectId }) }),
          error => error.location === "/login");
        if (handler.generateMetadata) {
          await assert.rejects(handler.generateMetadata(), error => error.location === "/login");
        }
      }
    });

    test("notification reads and mutations remain scoped to the current account", async () => {
      const queries = [];
      const prisma = {
        notification: {
          findMany: args => { queries.push(args.where); return []; },
          count: args => { queries.push(args.where); return 0; },
          findFirst: async args => { queries.push(args.where); return null; },
        },
        $transaction: async promises => Promise.all(promises),
      };
      const imports = {
        "next/server": nextServer,
        "@/lib/supabase/server": { createClient: async () => ({
          auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
        }) },
        "@/lib/authorization": { getActiveProfile: async () => ({ id: userId, role: "volunteer", isActive: true }) },
        "@/lib/prisma": { prisma },
      };
      const list = await loadServerModule("../app/api/notifications/route.ts", imports);
      const response = await list.GET(new Request(`http://localhost/api/notifications?recipientId=${objectId}`));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
      assert.deepEqual(queries, [{ recipient_id: userId }, { recipient_id: userId }]);
      const read = await loadServerModule("../app/api/notifications/[id]/read/route.ts", imports);
      assert.equal((await read.PATCH(new Request("http://localhost", { method: "PATCH" }),
        { params: Promise.resolve({ id: objectId }) })).status, 404);
      assert.deepEqual(queries.at(-1), { id: objectId, recipient_id: userId });
    });

    test("session changes hide personalized UI and discard cached navigation", async () => {
      const previousWindow = globalThis.window;
      const previousDocument = globalThis.document;
      const handlers = new Map();
      let effect;
      let sessionCallback;
      let reloads = 0;
      let blocked = false;
      let unsubscribed = false;
      globalThis.window = {
        location: { reload: () => reloads++, replace: () => reloads++ },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        addEventListener: (name, handler) => handlers.set(name, handler),
        removeEventListener: name => handlers.delete(name),
        setInterval: () => 1,
        clearInterval: () => {},
        setTimeout: () => 2,
        clearTimeout: () => {},
      };
      globalThis.document = { addEventListener() {}, removeEventListener() {} };
      try {
        const boundary = await loadServerModule("../components/AuthSessionBoundary.tsx", {
          react: {
            useState: () => [blocked, value => { blocked = value; }],
            useRef: initial => ({ current: initial }),
            useEffect: callback => { effect = callback; },
          },
          "react/jsx-runtime": { jsx: () => "blocked" },
          "next/navigation": { usePathname: () => "/volunteer/dashboard" },
          "@/lib/supabase/client": { createClient: () => ({ auth: {
            onAuthStateChange: callback => {
              sessionCallback = callback;
              return { data: { subscription: { unsubscribe: () => { unsubscribed = true; } } } };
            },
            getUser: async () => ({ data: { user: null }, error: null }),
            signOut: async () => ({ error: null }),
          } }) },
        });
        assert.equal(boundary.AuthSessionBoundary({ userId, children: "personal data" }), "personal data");
        const cleanup = effect();
        sessionCallback("SIGNED_IN", { user: { id: userId } });
        assert.equal(reloads, 0);
        sessionCallback("SIGNED_OUT", null);
        assert.equal(blocked, true);
        assert.equal(reloads, 1);
        sessionCallback("SIGNED_IN", { user: { id: objectId } });
        assert.equal(reloads, 2);
        await handlers.get("focus")();
        assert.equal(reloads, 3);
        cleanup();
        assert.equal(unsubscribed, true);
        assert.equal(handlers.size, 0);
      } finally {
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
      }
    });
test("notification refresh rejection clears private data and older requests cannot restore it", async () => {
  const previous = { fetch: globalThis.fetch, window: globalThis.window, document: globalThis.document };
  const secret = { id: objectId, title: "Private message" };
  const states = [true, [secret], 1, true, ""];
  let stateIndex = 0;
  let effect;
  let refresh;
  const pending = [];
  let requests = 0;
  globalThis.fetch = () => {
    if (++requests <= 2) return new Promise(resolve => pending.push(resolve));
    return Promise.resolve(Response.json({ message: "Unauthorized" }, { status: 401 }));
  };
  globalThis.document = { addEventListener() {}, removeEventListener() {} };
  globalThis.window = {
    addEventListener() {}, removeEventListener() {},
    setInterval: callback => { refresh = callback; return 1; }, clearInterval() {},
  };
  try {
    const component = await loadServerModule("../components/NotificationBell.tsx", {
      "next/link": {},
      "@/components/Toast": {},
      "react/jsx-runtime": { jsx: () => null, jsxs: () => null },
      react: {
        useState: () => {
          const index = stateIndex++;
          return [states[index], value => { states[index] = value; }];
        },
        useRef: value => ({ current: value }),
        useEffect: callback => { effect = callback; },
      },
    });
    component.NotificationBell();
    const cleanup = effect();
    await refresh();
    assert.deepEqual(states.slice(0, 4), [false, [], 0, false]);
    assert.match(states[4], /signed in/);
    pending[0](Response.json({ data: [secret] }));
    pending[1](Response.json({ pagination: { total: 1 } }));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(states[1], []);
    assert.equal(states[2], 0);
    cleanup();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});

function opportunityClient({ previous, updated, updateError = null }) {
  const calls = [];
  return {
    calls,
    from(table) {
      assert.equal(table, "opportunities");
      const call = { filters: [], update: null };
      calls.push(call);
      const query = {
        select() { return query; },
        eq(...filter) { call.filters.push(filter); return query; },
        update(payload) { call.update = payload; return query; },
        async maybeSingle() { return { data: call.update ? updated : previous, error: call.update ? updateError : null }; },
      };
      return query;
    },
  };
}

test("create and edit enforce the real description and location rules before publishing", async () => {
  for (const actionName of ["createOpportunity", "updateOpportunity"]) {
    for (const invalid of [
      { description: "a".repeat(49), error: "at least 50 characters" },
      { description: " ".repeat(60), error: "description" },
      { location_name: "", error: "before publishing" },
      { location_name: "TBD", error: "before publishing" },
    ]) {
      let databaseCalls = 0;
      const actions = await loadServerModule("./actions/opportunities.ts", {
        "next/navigation": navigation,
        "next/cache": { revalidatePath: () => assert.fail("Invalid publication must not invalidate caches") },
        "@/lib/authorization": { requireNonprofitOrganization: async () => ({
          supabase: { from: () => { databaseCalls++; assert.fail("Validation must run before database access"); } },
          user: { id: userId }, organization: { id: "org-a" },
        }) },
        "@/lib/prisma": { prisma: {} },
        "@/lib/date-format": {},
      });
      const form = new FormData();
      for (const [key, value] of Object.entries({
        opportunity_id: objectId, submit_action: "publish", title: "Community event",
        description: "Volunteers help plant flowers and maintain the community garden.",
        location_name: "Community Center", start_at: "2099-01-01T10:00",
        end_at: "2099-01-01T12:00", capacity: "10", ...invalid,
      })) if (key !== "error") form.set(key, value);
      await assert.rejects(actions[actionName](form), (error) =>
        decodeURIComponent(error.location ?? "").includes(invalid.error));
      assert.equal(databaseCalls, 0);
    }
  }
});

test("valid physical and remote publications pass; drafts keep incomplete location and description editable", async () => {
  for (const fields of [
    { location_name: "Community Center" },
    { address_line1: "10 Main St" },
    { city: "Seattle" },
    { is_virtual: "true" },
    { submit_action: "draft", description: "Notes", location_name: "TBD" },
  ]) {
    const saved = {
      id: objectId, title: "Event", status: fields.submit_action === "draft" ? "draft" : "published",
      start_at: "2099-01-01T10:00:00Z", end_at: "2099-01-01T12:00:00Z",
      ...fields, is_virtual: fields.is_virtual === "true",
    };
    const supabase = opportunityClient({ previous: { ...saved, status: "draft" }, updated: saved });
    const actions = await loadServerModule("./actions/opportunities.ts", {
      "next/navigation": navigation,
      "next/cache": { revalidatePath: () => {} },
      "@/lib/authorization": { requireNonprofitOrganization: async () => ({
        supabase, user: { id: userId }, organization: { id: "org-a" },
      }) },
      "@/lib/prisma": { prisma: { profile: { findMany: async () => [] } } },
      "@/lib/date-format": { formatDate: (value) => value },
    });
    const form = new FormData();
    for (const [key, value] of Object.entries({
      opportunity_id: objectId, submit_action: "publish", title: "Event",
      description: "Volunteers help plant flowers and maintain the community garden.",
      start_at: dateFormat.toEasternDateTimeInput(saved.start_at), end_at: dateFormat.toEasternDateTimeInput(saved.end_at), capacity: "10", ...fields,
    })) form.set(key, value);
    await assert.rejects(actions.updateOpportunity(form), (error) => error.location?.includes("Opportunity updated"));
    assert.equal(supabase.calls.length, 2);
  }
});

test("event creation and editing persist Eastern inputs as instants and preserve repeated times", async () => {
  let inserted;
  const createQuery = {
    insert(payload) { inserted = payload; return createQuery; },
    select() { return createQuery; },
    async single() { return { data: { id: objectId }, error: null }; },
  };
  const previous = {
    id: objectId, title: "Event", status: "draft", start_at: "2026-11-01T06:30:42.000Z",
    end_at: "2026-11-01T07:30:15.000Z", is_virtual: true,
  };
  const updateClient = opportunityClient({ previous, updated: previous });
  let supabase = { from: () => createQuery };
  const actions = await loadServerModule("./actions/opportunities.ts", {
    "next/navigation": navigation, "next/cache": { revalidatePath: () => {} },
    "@/lib/authorization": { requireNonprofitOrganization: async () => ({
      supabase, user: { id: userId }, organization: { id: "org-a" },
    }) },
    "@/lib/prisma": { prisma: {} },
    "@/lib/opportunity-validation": opportunityValidation,
  });
  const form = new FormData();
  for (const [key, value] of Object.entries({
    opportunity_id: objectId, submit_action: "draft", title: "Event", description: "Test",
    start_at: "2026-11-01T01:30", end_at: "2026-11-01T02:30",
    start_occurrence: "second", capacity: "10",
  })) form.set(key, value);
  await assert.rejects(actions.createOpportunity(form), (error) => error.location?.includes("Opportunity created"));
  assert.equal(inserted.start_at, "2026-11-01T06:30:00.000Z");
  assert.equal(inserted.end_at, "2026-11-01T07:30:00.000Z");
  supabase = updateClient;
  await assert.rejects(actions.updateOpportunity(form), (error) => error.location?.includes("Opportunity updated"));
  const payload = updateClient.calls.find((call) => call.update).update;
  assert.equal(payload.start_at, previous.start_at);
  assert.equal(payload.end_at, previous.end_at);
  form.set("start_at", "2026-03-08T02:30");
  await assert.rejects(actions.updateOpportunity(form), (error) => decodeURIComponent(error.location ?? "").includes("skipped by daylight saving"));
  assert.equal(updateClient.calls.filter((call) => call.update).length, 1);
});

test("changing between physical and virtual venues notifies booked volunteers", async () => {
  const previous = {
    id: objectId, title: "Event", status: "published", is_virtual: false,
    location_name: "Community Center", city: "Town",
    start_at: "2099-01-01T10:00:00Z", end_at: "2099-01-01T12:00:00Z",
  };
  const supabase = opportunityClient({ previous, updated: { ...previous, is_virtual: true } });
  let notifications;
  const actions = await loadServerModule("./actions/opportunities.ts", {
    "next/navigation": navigation, "next/cache": { revalidatePath: () => {} },
    "@/lib/authorization": { requireNonprofitOrganization: async () => ({
      supabase, user: { id: userId }, organization: { id: "org-a" },
    }) },
    "@/lib/prisma": { prisma: {
      booking: { findMany: async () => [{ volunteer_id: "volunteer" }] },
      notification: { createMany: async ({ data }) => { notifications = data; } },
    } },
    "@/lib/date-format": { formatDate: (value) => value, formatDateTimeRange: () => "time" },
  });
  const form = new FormData();
  for (const [key, value] of Object.entries({
    opportunity_id: objectId, submit_action: "publish", title: "Event", capacity: "10", is_virtual: "true",
    description: "Volunteers help plant flowers and maintain the community garden.",
    start_at: "2099-01-01T05:00", end_at: "2099-01-01T07:00",
  })) form.set(key, value);
  await assert.rejects(actions.updateOpportunity(form), (error) => error.location?.includes("Opportunity updated"));
  assert.ok(notifications[0].message.includes("Location changed."));
  assert.ok(notifications[0].message.includes("Updated location: Virtual"));
});

test("foreign and zero-row opportunity updates never query participants or send notifications", async () => {
  for (const previous of [null, { id: objectId, status: "published" }]) {
    const supabase = opportunityClient({ previous, updated: null });
    let privilegedCalls = 0;
    const invalidations = [];
    const actions = await loadServerModule("./actions/opportunities.ts", {
      "next/navigation": navigation,
      "next/cache": { revalidatePath: (path) => invalidations.push(path) },
      "@/lib/authorization": { requireNonprofitOrganization: async () => ({
        supabase, user: { id: userId }, organization: { id: "org-a" },
      }) },
      "@/lib/prisma": { prisma: {
        booking: { findMany: async () => { privilegedCalls++; return []; } },
        notification: { createMany: async () => { privilegedCalls++; } },
      } },
      "@/lib/opportunity-validation": {
        hasMinimumOpportunityDescription: () => true,
        hasValidOpportunityLocation: () => true,
        MIN_OPPORTUNITY_DESCRIPTION_LENGTH: 10,
      },
      "@/lib/date-format": {},
    });
    const form = new FormData();
    form.set("opportunity_id", objectId);
    form.set("submit_action", "publish");
    form.set("title", "Event");
    form.set("capacity", "10");
    form.set("start_at", "2099-01-01T10:00");
    form.set("end_at", "2099-01-01T11:00");
    await assert.rejects(actions.updateOpportunity(form), (error) => error.location.includes("access denied"));
    assert.equal(privilegedCalls, 0);
    for (const call of supabase.calls) {
      assert.ok(call.filters.some(([key, value]) => key === "organization_id" && value === "org-a"));
    }
    await assert.rejects(actions.archiveOpportunity(form), (error) => error.location.includes("access denied"));
    assert.equal(privilegedCalls, 0);
    assert.deepEqual(invalidations, []);
  }
});

test("successful schedule notifications use persisted values and tenant-scoped participants", async () => {
  const saved = {
    id: objectId, title: "Persisted title", status: "published",
    start_at: "2026-12-01T10:00:00Z", end_at: "2026-12-01T11:00:00Z",
    location_name: "Saved location", city: "", state: "",
  };
  const supabase = opportunityClient({ previous: { ...saved, start_at: "2026-12-02T10:00:00Z" }, updated: saved });
  let notifications;
  const invalidations = [];
  const actions = await loadServerModule("./actions/opportunities.ts", {
    "next/navigation": navigation,
    "next/cache": { revalidatePath: (path) => invalidations.push(path) },
    "@/lib/authorization": { requireNonprofitOrganization: async () => ({
      supabase, user: { id: userId }, organization: { id: "org-a" },
    }) },
    "@/lib/prisma": { prisma: {
      booking: { findMany: async ({ where }) => {
        assert.ok(invalidations.includes("/opportunities"));
        assert.deepEqual(where.opportunity, { organization_id: "org-a", organization: { user_id: userId } });
        return [{ volunteer_id: "participant" }];
      } },
      notification: { createMany: async ({ data }) => { notifications = data; } },
    } },
    "@/lib/opportunity-validation": {
      hasMinimumOpportunityDescription: () => true, hasValidOpportunityLocation: () => true,
    },
    "@/lib/date-format": { formatDate: (value) => value, formatDateTimeRange: (start, end) => `${start}/${end}` },
  });
  const form = new FormData();
  form.set("opportunity_id", objectId);
  form.set("submit_action", "publish");
  form.set("title", "Unpersisted title");
  form.set("capacity", "10");
  form.set("start_at", "2026-12-01T05:00");
  form.set("end_at", "2026-12-01T06:00");
  await assert.rejects(actions.updateOpportunity(form), (error) => error.location.includes("Opportunity updated"));
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].message, /Persisted title/);
  assert.match(notifications[0].message, /Saved location/);
  assert.ok(!notifications[0].message.includes("Unpersisted"));
  assert.deepEqual(invalidations, opportunityPaths);
});

test("reservation cancellation scopes the volunteer and rejects zero affected rows", async () => {
  const filters = [];
  const query = {
    update() { return query; },
    eq(...filter) { filters.push(filter); return query; },
    in(...filter) { filters.push(filter); return query; },
    select() { return query; },
    async maybeSingle() { return { data: null, error: null }; },
  };
  const actions = await loadServerModule("./actions/bookings.ts", {
    "next/navigation": navigation,
    "next/cache": { revalidatePath: () => assert.fail("Rejected cancellation must not invalidate") },
    "@/lib/authorization": { requireActionAccount: async (role) => {
      assert.equal(role, "volunteer");
      return { user: { id: userId }, supabase: { from: () => query } };
    } },
    "@/lib/prisma": { prisma: {} },
    "@/lib/email": {},
    "@/lib/date-format": {},
  });
  const form = new FormData();
  form.set("booking_id", objectId);
  await assert.rejects(actions.cancelBooking(form), (error) => error.location.includes("access denied"));
  assert.deepEqual(filters, [["id", objectId], ["volunteer_id", userId], ["status", ["booked", "waitlisted"]]]);
});

test("capacity validation and database-rejected reductions never invalidate or send notifications", async () => {
  for (const capacity of ["", "0", "-1", "1.5", "NaN", "Infinity", "1"]) {
    const supabase = opportunityClient({
      previous: { id: objectId }, updated: null,
      updateError: { message: "Capacity cannot be lower than the 2 confirmed bookings." },
    });
    const invalidations = [];
    const actions = await loadServerModule("./actions/opportunities.ts", {
      "next/navigation": navigation,
      "next/cache": { revalidatePath: (path) => invalidations.push(path) },
      "@/lib/authorization": { requireNonprofitOrganization: async () => ({
        supabase, user: { id: userId }, organization: { id: "org-a" },
      }) },
      "@/lib/prisma": { prisma: {} },
      "@/lib/opportunity-validation": {},
      "@/lib/date-format": {},
    });
    const form = new FormData();
    form.set("opportunity_id", objectId);
    form.set("capacity", capacity);
    form.set("start_at", "2099-01-01T10:00");
    form.set("end_at", "2099-01-01T11:00");
    await assert.rejects(actions.updateOpportunity(form), (error) =>
      error.location.includes(capacity === "1" ? "confirmed%20bookings" : "positive integer"));
    assert.deepEqual(invalidations, []);
    assert.equal(supabase.calls.length, capacity === "1" ? 2 : 0);
  }
});

test("booking creation and cancellation invalidate committed availability before side effects", async () => {
  for (const operation of ["create", "cancel"]) {
    const invalidations = [];
    let committed = false;
    const query = {
      select() { return query; }, eq() { return query; }, in() { return query; },
      insert() { return query; }, update() { return query; },
      async single() { committed = true; return { data: { id: "booking" }, error: null }; },
      async maybeSingle() {
        if (operation === "cancel") {
          committed = true;
          return { data: { id: "booking", opportunity_id: objectId }, error: null };
        }
        return { data: { id: objectId, title: "Event", organization_id: "org-a", is_virtual: true }, error: null };
      },
    };
    const actions = await loadServerModule("./actions/bookings.ts", {
      "next/navigation": navigation,
      "next/cache": { revalidatePath: (path) => {
        assert.ok(committed, "Never invalidate before the database confirms persistence");
        invalidations.push(path);
      } },
      "@/lib/authorization": { requireActionAccount: async () => ({
        user: { id: userId }, supabase: { from: () => query },
      }) },
      "@/lib/prisma": { prisma: { notification: { createMany: async () => {
        assert.deepEqual(invalidations, opportunityPaths);
        throw new Error("notification failure");
      } } } },
      "@/lib/email": {},
      "@/lib/date-format": { formatDateTimeRange: () => "time" },
    });
    const form = new FormData();
    form.set("opportunity_id", objectId);
    form.set("booking_id", "booking");
    const originalError = console.error;
    console.error = () => {};
    try {
      await assert.rejects(
        operation === "create" ? actions.createBooking(form) : actions.cancelBooking(form),
        (error) => error.location.includes(operation === "create" ? "notifications" : "Booking cancelled"),
      );
    } finally {
      console.error = originalError;
    }
    assert.deepEqual(invalidations, opportunityPaths);
  }
});

test("publication transitions invalidate all affected views immediately after persistence", async () => {
  for (const [action, expectedStatus] of [["draft", "draft"], ["close", "closed"], ["archive", "archived"], ["publish", "published"]]) {
    const saved = { id: objectId, status: expectedStatus };
    const supabase = opportunityClient({ previous: { id: objectId, status: "draft" }, updated: saved });
    const invalidations = [];
    const actions = await loadServerModule("./actions/opportunities.ts", {
      "next/navigation": navigation,
      "next/cache": { revalidatePath: (path) => {
        assert.ok(supabase.calls.some((call) => call.update?.status === expectedStatus));
        invalidations.push(path);
      } },
      "@/lib/authorization": { requireNonprofitOrganization: async () => ({
        supabase, user: { id: userId }, organization: { id: "org-a" },
      }) },
      "@/lib/prisma": { prisma: { profile: { findMany: async () => {
        assert.equal(invalidations.length, opportunityPaths.length);
        return [];
      } } } },
      "@/lib/opportunity-validation": {
        hasMinimumOpportunityDescription: () => true, hasValidOpportunityLocation: () => true,
      },
      "@/lib/date-format": { formatDate: (value) => value },
    });
    const form = new FormData();
    form.set("opportunity_id", objectId);
    form.set("submit_action", action);
    form.set("title", "Event");
    form.set("capacity", "10");
    form.set("start_at", "2099-01-01T10:00");
    form.set("end_at", "2099-01-01T11:00");
    await assert.rejects(
      action === "archive" ? actions.archiveOpportunity(form) : actions.updateOpportunity(form),
      (error) => error.location?.includes(action === "archive" ? "Opportunity archived" : "Opportunity updated"),
    );
    assert.deepEqual(invalidations, opportunityPaths);
  }
});

test("newly published opportunities invalidate public caches even if notifications fail", async () => {
  const invalidations = [];
  const query = {
    insert() { return query; }, select() { return query; },
    async single() { return { data: { id: objectId }, error: null }; },
  };
  const actions = await loadServerModule("./actions/opportunities.ts", {
    "next/navigation": navigation,
    "next/cache": { revalidatePath: (path) => invalidations.push(path) },
    "@/lib/authorization": { requireNonprofitOrganization: async () => ({
      supabase: { from: () => query }, user: { id: userId }, organization: { id: "org-a" },
    }) },
    "@/lib/prisma": { prisma: { profile: { findMany: async () => {
      assert.equal(invalidations.length, opportunityPaths.length);
      return [{ id: "volunteer" }];
    } }, notification: { createMany: async () => { throw new Error("notification failure"); } } } },
    "@/lib/opportunity-validation": {
      hasMinimumOpportunityDescription: () => true, hasValidOpportunityLocation: () => true,
    },
    "@/lib/date-format": { formatDateTimeRange: () => "time" },
  });
  const form = new FormData();
  for (const [key, value] of Object.entries({
    submit_action: "publish", title: "Event", description: "Description",
    start_at: "2026-12-01T10:00", end_at: "2026-12-01T11:00", capacity: "10",
  })) form.set(key, value);
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args);
  try {
    await assert.rejects(actions.createOpportunity(form), (error) => error.location?.includes("notifications could not be sent"));
  } finally {
    console.error = originalError;
  }
  assert.equal(errors.length, 1);
  assert.ok(invalidations.includes(`/opportunities/${objectId}`));
});

test("uncached Supabase clients force no-store without changing request headers or ordinary clients", async () => {
  let options;
  const server = await loadServerModule("./supabase/server.ts", {
    "@supabase/ssr": { createServerClient: (_url, _key, config) => { options = config; return {}; } },
    "next/headers": { cookies: async () => ({ getAll: () => [], set() {} }) },
  });
  await server.createClient();
  assert.equal(options.global, undefined);
  await server.createClient({ noStore: true });
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (...args) => {
    requests.push(args);
    return new Response("{}");
  };
  try {
    await options.global.fetch("https://example.test", { cache: "force-cache", headers: { apikey: "test-key" } });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(requests[0][1].cache, "no-store");
  assert.deepEqual(requests[0][1].headers, { apikey: "test-key" });
});

test("public listing and detail read the live visibility view without caching for every publication state", async () => {
  let state = { status: "published", is_deleted: false };
  let mode = "list";
  const supabase = {
    auth: { getUser: async () => ({ data: { user: null } }) },
    from(table) {
      const query = {
        select() { return query; }, order() { return query; }, eq() { return query; }, range() { return query; },
        gt() { return query; },
        then(resolve, reject) {
          if (table !== "public_opportunity_listings") return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          const visible = state.status === "published" && !state.is_deleted;
          return Promise.resolve({ data: visible ? [{ id: objectId, title: "Visible" }] : [], error: null }).then(resolve, reject);
        },
        async maybeSingle() {
          assert.equal(table, "public_opportunity_listings");
          return { data: state.status === "published" && !state.is_deleted ? { id: objectId, title: "Visible" } : null, error: null };
        },
      };
      return query;
    },
  };
  const jsx = (type, props) => ({ type: typeof type === "string" ? type : "component", props });
  const imports = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/link": {},
    "next/navigation": { notFound: () => { throw new Error("not found"); } },
    "@/lib/supabase/server": { createClient: async (options) => {
      assert.deepEqual(options, { noStore: true }, mode);
      return supabase;
    } },
    "@/components/OpportunityCard": {},
    "@/lib/actions/bookings": {},
    "@/components/SubmitButton": {},
    "@/components/LocalDateTime": {},
    "@/lib/date-format": { formatDateTimeRange: () => "time" },
  };
  const listing = await loadServerModule("../app/(public)/opportunities/page.tsx", imports);
  const detail = await loadServerModule("../app/(public)/opportunities/[id]/page.tsx", imports);
  for (state of [
    { status: "published", is_deleted: false }, { status: "draft", is_deleted: false },
    { status: "closed", is_deleted: false }, { status: "archived", is_deleted: true },
    { status: "published", is_deleted: true }, { status: "published", is_deleted: false },
  ]) {
    const visible = state.status === "published" && !state.is_deleted;
    mode = "list";
    const rendered = await listing.default({ searchParams: Promise.resolve({ search: "" }) });
    assert.equal(JSON.stringify(rendered).includes(objectId), visible);
    mode = "detail";
    const request = detail.default({ params: Promise.resolve({ id: objectId }), searchParams: Promise.resolve({}) });
    if (visible) await request;
    else await assert.rejects(request, /not found/);
  }
});

test("public discovery excludes past and exactly-started events while retaining future events", async () => {
  const jsx = (type, props) => ({ type: typeof type === "string" ? type : "component", props });
  let cutoff;
  const before = Date.now();
  const listing = await loadServerModule("../app/(public)/opportunities/page.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/link": {},
    "@/components/OpportunityCard": {},
    "@/lib/supabase/server": { createClient: async (options) => {
      assert.deepEqual(options, { noStore: true });
      return { from(table) {
        const query = {
          select() { return query; }, order() { return query; }, range() { return query; },
          gt(column, value) {
            assert.equal(table, "public_opportunity_listings");
            assert.equal(column, "start_at");
            cutoff = Date.parse(value);
            return query;
          },
          then(resolve, reject) {
            const events = table === "public_opportunity_listings" ? [
              { id: "past-event", start_at: cutoff - 1 },
              { id: "started-event", start_at: cutoff },
              { id: "future-event", start_at: cutoff + 1 },
            ].filter((event) => event.start_at > cutoff) : [];
            return Promise.resolve({ data: events, error: null }).then(resolve, reject);
          },
        };
        return query;
      } };
    } },
  });
  const rendered = JSON.stringify(await listing.default({ searchParams: Promise.resolve({}) }));
  assert.ok(cutoff >= before && cutoff <= Date.now());
  assert.ok(rendered.includes("future-event"));
  assert.ok(!rendered.includes("past-event"));
  assert.ok(!rendered.includes("started-event"));
});

test("time display consistently uses Eastern time", async () => {
  const format = await import("./date-format.ts");
  const display = await loadServerModule("../components/LocalDateTime.tsx", {
    react: {},
    "@/lib/date-format": format,
  });
  const value = "2026-11-05T01:00:00Z";
  assert.equal(display.LocalDateTime({ value }), "November 4, 2026, 8:00 PM EST");
  assert.equal(display.LocalDateTime({ value, dateOnly: true }), "November 4, 2026");
  assert.equal(display.LocalDateTime({ value, end: "2026-11-05T02:00:00Z" }),
    "November 4, 2026, 8:00 PM - 9:00 PM EST");
});

const routeCases = [
  ["../app/api/attendance/record/route.ts", "POST", { bookingId: objectId, status: "present" }],
  ["../app/api/attendance/manual-checkout/route.ts", "PATCH", {
    bookingId: objectId, checkInAt: "2026-01-01T10:00:00Z", checkOutAt: "2026-01-01T11:00:00Z",
  }],
  ["../app/api/attendance/hours/override/route.ts", "PATCH", { bookingId: objectId, hours: 2 }],
  ["../app/api/attendance/hours/record/route.ts", "POST", { opportunityId: objectId, volunteerId: userId, hours: 2 }],
  ["../app/api/attendance/check-in/route.ts", "POST", { bookingId: objectId }],
  ["../app/api/attendance/check-out/route.ts", "POST", { bookingId: objectId }],
  ["../app/api/attendance/hours/route.ts", "GET", null],
  ["../app/api/nonprofit/signup-counts/route.ts", "GET", null],
  ["../app/api/notifications/route.ts", "GET", null],
  ["../app/api/notifications/route.ts", "POST", { title: "Test", message: "Test" }],
  ["../app/api/notifications/[id]/read/route.ts", "PATCH", null],
  ["../app/api/volunteer/profile/skills-causes/route.ts", "GET", null],
  ["../app/api/volunteer/profile/skills-causes/route.ts", "PATCH", { skills: [], causes: [] }],
  ["../app/api/volunteer/profile/photo/route.ts", "POST", null],
  ["../app/api/volunteer/profile/photo/route.ts", "DELETE", null],
];

for (const [path, method, body] of routeCases) {
  test(`${path}: unauthenticated and inactive requests fail before object access`, async () => {
    for (const user of [null, { id: userId }]) {
      const handler = await loadServerModule(path, {
        "next/server": nextServer,
        "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
        "@/lib/prisma": { prisma: {} },
        "@/lib/authorization": { getActiveProfile: async () => null },
        "@/lib/access-control": accessControl,
      });
      const response = await handler[method](new Request("http://localhost/api/test", {
        method, ...(body ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
      }), { params: Promise.resolve({ id: objectId }) });
      assert.equal(response.status, user ? 403 : 401);
    }
  });
}

test("organizer reservation and hours endpoints scope object queries before reading foreign records", async () => {
  for (const [path, method, body] of routeCases.slice(0, 4)) {
    let objectLookups = 0;
    const findFirst = async ({ where }) => {
      objectLookups++;
      const scope = where.opportunity ?? where;
      assert.deepEqual(scope.organization, { user_id: userId });
      return null;
    };
    const handler = await loadServerModule(path, {
      "next/server": nextServer,
      "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: userId } } }) } }) },
      "@/lib/prisma": { prisma: { booking: { findFirst }, opportunity: { findFirst } } },
      "@/lib/authorization": { getActiveProfile: async () => ({ id: userId, role: "nonprofit", isActive: true }) },
      "@/lib/access-control": accessControl,
    });

    const response = await handler[method](new Request("http://localhost/api/test", { method, body: JSON.stringify(body) }));
    assert.ok([403, 404].includes(response.status));
    assert.equal(objectLookups, 1);
  }
});

test("manual attendance API requires explicit timestamp offsets", async () => {
  let saved;
  const handler = await loadServerModule("../app/api/attendance/manual-checkout/route.ts", {
    "next/server": nextServer,
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: userId } } }) } }) },
    "@/lib/prisma": { prisma: {
      booking: { findFirst: async () => ({ id: objectId, status: "booked", opportunity: { organization: { user_id: userId } } }) },
      attendanceLog: { upsert: async ({ create }) => { saved = create; return create; } },
    } },
    "@/lib/authorization": { getActiveProfile: async () => ({ id: userId, role: "nonprofit", isActive: true }) },
    "@/lib/access-control": accessControl,
  });
  const request = (checkInAt, checkOutAt) => new Request("http://localhost/api/test", {
    method: "PATCH", body: JSON.stringify({ bookingId: objectId, checkInAt, checkOutAt }),
  });
  const invalid = await handler.PATCH(request("2026-07-05T10:00", "2026-07-05T11:00"));
  assert.equal(invalid.status, 400);
  assert.equal(saved, undefined);
  const valid = await handler.PATCH(request("2026-07-05T10:00:00-04:00", "2026-07-05T11:00:00-04:00"));
  assert.equal(valid.status, 200);
  assert.equal(saved.check_in_at.toISOString(), "2026-07-05T14:00:00.000Z");
  assert.equal(saved.check_out_at.toISOString(), "2026-07-05T15:00:00.000Z");
});

test("self-service attendance reads and writes scope the reservation to the volunteer", async () => {
  for (const [path, method, model, whereKey] of [
    ["../app/api/attendance/check-in/route.ts", "GET", "booking", "volunteer_id"],
    ["../app/api/attendance/check-in/route.ts", "POST", "booking", "volunteer_id"],
    ["../app/api/attendance/check-out/route.ts", "POST", "attendanceLog", "booking"],
  ]) {
    const handler = await loadServerModule(path, {
      "next/server": nextServer,
      "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: userId } } }) } }) },
      "@/lib/prisma": { prisma: { [model]: { findFirst: async ({ where }) => {
        assert.deepEqual(where[whereKey], whereKey === "booking" ? { volunteer_id: userId } : userId);
        return null;
      } } } },
      "@/lib/authorization": { getActiveProfile: async () => ({ id: userId, role: "volunteer", isActive: true }) },
      "@/lib/access-control": accessControl,
    });

    const response = await handler[method](new Request(`http://localhost/api/test?bookingId=${objectId}`, {
      method, ...(method === "POST" ? { body: JSON.stringify({ bookingId: objectId }) } : {}),
    }));
    assert.equal(response.status, 404);
  }
});

async function attendanceHandler(path, prisma, role = "volunteer") {
      return loadServerModule(path, {
        "next/server": nextServer,
        "@/lib/supabase/server": { createClient: async () => ({
          auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
        }) },
        "@/lib/prisma": { prisma },
        "@/lib/authorization": {
          getActiveProfile: async () => ({ id: userId, role, isActive: true }),
          managedOpportunityScope: () => ({ organization: { user_id: userId } }),
        },
        "@/lib/access-control": accessControl,
      });
    }

    const attendanceRequest = (body) => new Request("http://localhost/api/attendance", {
      method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
    });

    test("self check-in rejects times outside the event and never creates confirmed hours", async () => {
      const now = Date.now();
      for (const [start, end, expected] of [
        [now + 3600000, now + 7200000, 409],
        [now - 7200000, now - 3600000, 409],
        [now - 3600000, now + 3600000, 201],
      ]) {
        let writes = 0;
        const handler = await attendanceHandler("../app/api/attendance/check-in/route.ts", {
          booking: { findFirst: async ({ select, where }) => {
            assert.equal(where.volunteer_id, userId);
            assert.ok(select.opportunity.select.start_at);
            return {
              id: objectId, volunteer_id: userId, status: "booked",
              opportunity: { start_at: new Date(start), end_at: new Date(end), status: "published", is_deleted: false },
            };
          } },
          attendanceLog: {
            findUnique: async () => null,
            create: async ({ data }) => {
              writes++;
              assert.equal(data.verified_at ?? null, null);
              assert.equal(data.verified_by ?? null, null);
              return { ...data, id: "attendance", verified_at: null, verified_by: null };
            },
          },
        });
        const response = await handler.POST(attendanceRequest({ bookingId: objectId }));
        assert.equal(response.status, expected);
        assert.equal(writes, expected === 201 ? 1 : 0);
      }
    });

    test("self checkout is bounded by event end and cannot race past organizer confirmation", async () => {
      const now = Date.now();
      const session = {
        id: "attendance", check_in_at: new Date(now - 90 * 60000), check_out_at: null, verified_at: null,
        booking: {
          volunteer_id: userId, status: "booked",
          opportunity: { start_at: new Date(now - 2 * 3600000), end_at: new Date(now - 30 * 60000), is_deleted: false },
        },
      };
      for (const concurrentConfirmation of [false, true]) {
        const handler = await attendanceHandler("../app/api/attendance/check-out/route.ts", {
          attendanceLog: {
            findFirst: async () => session,
            updateManyAndReturn: async ({ where, data }) => {
              assert.equal(where.verified_at, null);
              assert.equal(where.check_out_at, null);
              assert.equal(where.check_in_at, session.check_in_at);
              assert.equal(data.check_out_at.getTime(), session.booking.opportunity.end_at.getTime());
              assert.equal(data.verified_at, null);
              assert.equal(data.verified_by, null);
              return concurrentConfirmation ? [] : [{ ...session, ...data }];
            },
          },
        });
        const response = await handler.POST(attendanceRequest({ bookingId: objectId }));
        assert.equal(response.status, concurrentConfirmation ? 409 : 200);
      }
    });

    test("organizer approval confirms only reviewed completed present sessions and rejects concurrent timestamp changes", async () => {
      const checkIn = new Date("2026-10-16T09:00:00Z");
      const checkOut = new Date("2026-10-16T11:30:00Z");
      for (const [status, checkout, concurrent, expectedHours] of [
        ["present", checkOut, false, 2.5],
        ["present", null, false, 0],
        ["absent", checkOut, false, 0],
        ["present", checkOut, true, null],
      ]) {
        let confirmed;
        const handler = await attendanceHandler("../app/api/attendance/record/route.ts", {
          booking: { findFirst: async ({ where }) => {
            assert.deepEqual(where.opportunity.organization, { user_id: userId });
            return { id: objectId, status: "booked", opportunity: { organization: { user_id: userId } } };
          } },
          attendanceLog: {
            findUnique: async () => ({ id: "attendance", check_in_at: checkIn, check_out_at: checkout }),
            updateManyAndReturn: async ({ where, data }) => {
              assert.equal(where.check_in_at, checkIn);
              assert.equal(where.check_out_at, checkout);
              assert.equal(Boolean(data.verified_at), status === "present" && checkout !== null);
              assert.equal(data.verified_by, status === "present" && checkout ? userId : null);
              confirmed = { ...data, check_in_at: checkIn, check_out_at: checkout };
              return concurrent ? [] : [confirmed];
            },
          },
        }, "nonprofit");
        const response = await handler.POST(attendanceRequest({ bookingId: objectId, status }));
        assert.equal(response.status, concurrent ? 409 : 201);
        if (!concurrent) assert.equal(confirmedAttendanceHours(confirmed), expectedHours);
      }
    });

    test("confirmed attendance cannot be overwritten by volunteer check-in or checkout", async () => {
      const now = Date.now();
      const confirmed = {
        id: "attendance", check_in_at: new Date(now - 1800000), check_out_at: new Date(now - 60000),
        verified_at: new Date(now), verified_by: "organizer",
      };
      const booking = {
        id: objectId, volunteer_id: userId, status: "booked",
        opportunity: { start_at: new Date(now - 3600000), end_at: new Date(now + 3600000), status: "published", is_deleted: false },
      };
      for (const path of ["../app/api/attendance/check-in/route.ts", "../app/api/attendance/check-out/route.ts"]) {
        const handler = await attendanceHandler(path, {
          booking: { findFirst: async () => booking },
          attendanceLog: {
            findUnique: async () => confirmed,
            findFirst: async () => ({ ...confirmed, booking }),
            create: () => assert.fail("Confirmed sessions are immutable to volunteers"),
            updateManyAndReturn: () => assert.fail("Confirmed sessions are immutable to volunteers"),
          },
        });

        assert.equal((await handler.POST(attendanceRequest({ bookingId: objectId }))).status, 409);
      }
    });

test("volunteer and organizer totals agree on pending, confirmed, manual and overridden hours", async () => {
          const checkIn = new Date("2026-10-16T09:00:00Z");
          const checkOut = new Date("2026-10-16T11:30:00Z");
          for (const [confirmed, override, manual, expected] of [
            [false, null, 0, 0], [true, null, 0, 2.5], [true, null, 1, 3.5], [true, 0, 1, 0],
          ]) {
            const booking = {
              id: "booking", volunteer_id: userId, opportunity_id: objectId, status: "booked",
              booked_at: checkIn, notes: null, hours_override: override, hours_override_notes: null,
              opportunity: { title: "Event" },
              attendanceLog: {
                id: "attendance", status: "present", notes: null, recorded_at: checkOut,
                check_in_at: checkIn, check_out_at: checkOut,
                verified_at: confirmed ? checkOut : null, verified_by: confirmed ? "organizer" : null,
              },
            };
            const entries = manual ? [{
              id: "manual", volunteer_id: userId, opportunity_id: objectId, hours: manual,
              notes: "Setup", recorded_at: checkOut, opportunities: { title: "Event" },
            }] : [];
            for (const role of ["volunteer", "nonprofit"]) {
              const handler = await attendanceHandler("../app/api/attendance/hours/route.ts", {
                opportunity: { findFirst: async ({ where }) => {
                  assert.deepEqual(where.organization, { user_id: userId });
                  return { id: objectId };
                } },
                booking: { findMany: async ({ where }) => {
                  assert.equal(where.status.not, "cancelled");
                  if (role === "volunteer") assert.equal(where.volunteer_id, userId);
                  else assert.deepEqual(where.opportunity.organization, { user_id: userId });
                  return [booking];
                } },
                volunteer_hours: { findMany: async () => entries },
              }, role);
              const response = await handler.GET(new Request(`http://localhost/api/attendance/hours${role === "nonprofit" ? `?opportunityId=${objectId}` : ""}`));
              assert.equal(response.status, 200);
              const result = await response.json();
              assert.equal(result.totalHours, expected);
              assert.equal(result.totalHours, buildEventReport([booking], entries, []).totalHours);
              assert.equal(result.data[0].verificationPending, !confirmed && override === null);
            }
          }
        });
