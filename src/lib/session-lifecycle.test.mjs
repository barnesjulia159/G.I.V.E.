import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
import test from "node:test";
import ts from "typescript";

async function load(path, imports, globals = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  new Script(`(function(require, exports) { ${outputText}\n})`).runInNewContext(globals)((name) => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`);
    return imports[name];
  }, exports);
  return exports;
}

async function boundary({ pathname = "/volunteer/dashboard", userId = "user-a", sessionStartedAt, stored, logoutFailure = false, sessionUser = userId, verificationError = null, storageUnavailable = false } = {}) {
  let now = 1_800_000_000_000;
  class Clock extends Date {
    static now() { return now; }
  }
  const storage = new Map(stored === undefined ? [] : [[`give:last-activity:${userId}`, String(now - stored)]]);
  const windowEvents = new Map();
  const documentEvents = new Map();
  const state = [];
  let activityRef;
  let index = 0;
  let effect;
  let poll;
  let idle;
  let idleDelay;
  let authCallback;
  let logoutCalls = 0;
  let verifyCalls = 0;
  let unsubscribed = false;
  const destinations = [];
  const errors = [];
  const browserDocument = {
    visibilityState: "visible",
    addEventListener: (name, handler) => documentEvents.set(name, handler),
    removeEventListener: (name) => documentEvents.delete(name),
  };
  const browserWindow = {
    localStorage: {
      getItem: (key) => { if (storageUnavailable) throw new Error("Storage denied"); return storage.get(key) ?? null; },
      setItem: (key, value) => { if (storageUnavailable) throw new Error("Storage denied"); storage.set(key, value); },
      removeItem: (key) => { if (storageUnavailable) throw new Error("Storage denied"); storage.delete(key); },
    },
    location: { replace: (url) => destinations.push(url), reload: () => destinations.push("reload") },
    addEventListener: (name, handler) => windowEvents.set(name, handler),
    removeEventListener: (name) => windowEvents.delete(name),
    setInterval: (handler, delay) => { assert.equal(delay, 30000); poll = handler; return 1; },
    clearInterval: () => { poll = null; },
    setTimeout: (handler, delay) => { idle = handler; idleDelay = delay; return 2; },
    clearTimeout: () => { idle = null; },
  };
  const module = await load("../components/AuthSessionBoundary.tsx", {
    react: {
      useRef: (initial) => { activityRef ??= { current: initial }; return activityRef; },
      useState: (initial) => {
        const slot = index++;
        if (!(slot in state)) state[slot] = initial;
        return [state[slot], (value) => { state[slot] = typeof value === "function" ? value(state[slot]) : value; }];
      },
      useEffect: (callback) => { effect = callback; },
    },
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "next/navigation": { usePathname: () => pathname },
    "@/lib/supabase/client": { createClient: () => ({ auth: {
      onAuthStateChange: (callback) => {
        authCallback = callback;
        return { data: { subscription: { unsubscribe: () => { unsubscribed = true; } } } };
      },
      getUser: async () => { verifyCalls++; return { data: { user: sessionUser ? { id: sessionUser } : null }, error: verificationError }; },
      signOut: async (options) => {
        assert.equal(options.scope, "local");
        logoutCalls++;
        authCallback("SIGNED_OUT", null);
        return { error: logoutFailure ? new Error("offline") : null };
      },
    } }) },
  }, { window: browserWindow, document: browserDocument, Date: Clock, console: { error: (...args) => errors.push(args) } });
  const render = () => {
    index = 0;
    return module.AuthSessionBoundary({ userId, sessionStartedAt, children: "private content" });
  };
  const initial = render();
  const cleanup = effect();
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  return {
    render, initial, cleanup, storage, state, windowEvents, documentEvents, destinations, errors, browserDocument,
    advance: (milliseconds) => { now += milliseconds; },
    poll: () => poll(),
    timeout: () => idle(),
    flush,
    setSessionUser: (value) => { sessionUser = value; },
    setPathname: (value) => { pathname = value; },
    retryLogout: () => { logoutFailure = false; },
    runEffect: () => effect(),
    get logoutCalls() { return logoutCalls; },
    get verifyCalls() { return verifyCalls; },
    get unsubscribed() { return unsubscribed; },
    get idleDelay() { return idleDelay; },
  };
}

test("30-minute inactivity logs out once and hides account content before redirect", async () => {
  const app = await boundary();
  assert.equal(app.initial, "private content");
  app.advance(30 * 60000 - 1);
  await app.poll();
  assert.equal(app.logoutCalls, 0);
  app.advance(1);
  app.timeout();
  await app.flush();
  assert.equal(app.logoutCalls, 1);
  assert.equal(app.state[0], true);
  assert.ok(app.destinations[0].includes("30%20minutes"));
  assert.equal(app.destinations.length, 1, "Auth event must not reload during intentional logout");
  app.cleanup();
  assert.equal(app.unsubscribed, true);
  assert.equal(app.windowEvents.size, 0);
  assert.equal(app.documentEvents.size, 0);
});

test("real input resets inactivity; polling and hidden-page changes do not", async () => {
  const app = await boundary();
  app.advance(29 * 60000);
  app.windowEvents.get("keydown")();
  app.advance(29 * 60000);
  app.browserDocument.visibilityState = "hidden";
  app.documentEvents.get("visibilitychange")();
  await app.poll();
  assert.equal(app.logoutCalls, 0);
  app.advance(60000);
  await app.poll();
  await app.flush();
  assert.equal(app.logoutCalls, 1);
  app.cleanup();
});

test("sleep/lock resume checks the old deadline before input can renew the session", async () => {
  for (const event of ["focus", "keydown", "pageshow", "visibilitychange"]) {
    const app = await boundary();
    app.advance(31 * 60000);
    if (event === "visibilitychange") app.documentEvents.get(event)();
    else app.windowEvents.get(event)({ persisted: false });
    await app.flush();
    assert.equal(app.logoutCalls, 1, event);
    app.cleanup();
  }
});

test("shared activity keeps other tabs active and a persisted overdue deadline logs out on reopen", async () => {
  const app = await boundary();
  app.advance(29 * 60000);
  const key = "give:last-activity:user-a";
  app.storage.set(key, String(Number(app.storage.get(key)) + 29 * 60000));
  app.windowEvents.get("storage")({ key });
  app.advance(2 * 60000);
  await app.poll();
  assert.equal(app.logoutCalls, 0);
  app.cleanup();
  const reopened = await boundary({ stored: 31 * 60000 });
  await reopened.flush();
  assert.equal(reopened.logoutCalls, 1);
  reopened.cleanup();
});

test("home visits log out immediately; anonymous pages do not", async () => {
  const app = await boundary({ pathname: "/" });
  assert.notEqual(app.initial, "private content");
  await app.flush();
  assert.deepEqual(app.destinations, ["/"]);
  app.cleanup();
  const anonymous = await boundary({ pathname: "/", userId: null });
  await anonymous.flush();
  assert.equal(anonymous.initial, "private content");
  assert.equal(anonymous.logoutCalls, 0);
  anonymous.cleanup();
});

test("missing sessions sign out rather than refreshing private content", async () => {
  const app = await boundary({ sessionUser: null });
  await app.poll();
  await app.flush();
  assert.equal(app.logoutCalls, 1);
  assert.ok(app.destinations[0].includes("session%20has%20ended"));
  app.cleanup();
});

test("invalid or expired provider sessions clear authentication without a reload loop", async () => {
  for (const error of [{ status: 401 }, { status: 403 }, { name: "AuthSessionMissingError" }]) {
    const app = await boundary({ sessionUser: null, verificationError: error });
    await app.flush();
    assert.equal(app.logoutCalls, 1);
    assert.ok(app.destinations[0].includes("session%20has%20ended"));
    app.cleanup();
  }
});

test("logout failure hides content, reports error and avoids repeated reloads", async () => {
  const app = await boundary({ pathname: "/", logoutFailure: true });
  await app.flush();
  assert.equal(app.state[0], true);
  assert.ok(app.state[1].includes("Sign-out could not be confirmed"));
  assert.equal(app.destinations.length, 0);
  await app.poll();
  assert.equal(app.logoutCalls, 1);
  assert.equal(app.errors.length, 1);
  app.cleanup();
  const alert = app.render();
  app.retryLogout();
  alert.props.children[1].props.onClick();
  app.render();
  const retryCleanup = app.runEffect();
  await app.flush();
  assert.equal(app.logoutCalls, 2);
  assert.deepEqual(app.destinations, ["/"]);
  retryCleanup();
});

test("a fresh sign-in does not inherit a previous login's expired inactivity clock", async () => {
  const app = await boundary({ sessionStartedAt: "new-login", stored: 31 * 60000 });
  await app.poll();
  assert.equal(app.logoutCalls, 0);
  assert.ok(app.storage.has("give:last-activity:user-a:new-login"));
  app.cleanup();
});

test("server home logout clears request and response cookies, and prefetch never logs out", async () => {
  const responses = [];
  const writes = [];
  let cookieOptions;
  let logoutCalls = 0;
  class ResponseMock {
    constructor(body, options = {}) {
      this.body = body;
      this.status = options.status ?? 200;
      this.headers = new Headers(options.headers);
      this.cookies = { set: (...args) => writes.push(["response", ...args]) };
      responses.push(this);
    }
    static next() { return new ResponseMock(null); }
  }
  const module = await load("./supabase/middleware.ts", {
    "@supabase/ssr": { createServerClient: (_url, _key, options) => {
      cookieOptions = options.cookies;
      return { auth: {
        getUser: async () => ({ data: { user: { id: "user-a" } } }),
        signOut: async ({ scope }) => {
          assert.equal(scope, "local");
          logoutCalls++;
          cookieOptions.setAll([{ name: "auth-cookie", value: "", options: { maxAge: 0 } }]);
          return { error: null };
        },
      } };
    } },
    "next/server": { NextResponse: ResponseMock },
  }, { process: { env: {} }, console });
  const request = (path, headers = {}) => ({
    method: "GET",
    nextUrl: { pathname: path },
    headers: new Headers(headers),
    cookies: { getAll: () => [], set: (...args) => writes.push(["request", ...args]) },
  });
  const response = await module.updateSession(request("/"));
  assert.equal(logoutCalls, 1);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(writes, [
    ["request", "auth-cookie", ""],
    ["response", "auth-cookie", "", { maxAge: 0 }],
  ]);
  for (const headers of [{ "next-router-prefetch": "1" }, { purpose: "prefetch" }, { "sec-purpose": "prefetch;prerender" }]) {
    await module.updateSession(request("/", headers));
  }
  await module.updateSession(request("/opportunities"));
  assert.equal(logoutCalls, 1);
});

test("the inactivity deadline timer is rescheduled by input and cleared on unmount", async () => {
  const app = await boundary();
  assert.equal(app.idleDelay, 30 * 60000);
  app.advance(10 * 60000);
  await app.poll();
  assert.equal(app.idleDelay, 20 * 60000);
  app.windowEvents.get("pointerdown")();
  assert.equal(app.idleDelay, 30 * 60000);
  app.cleanup();
  assert.throws(() => app.timeout());
});

test("denied storage preserves the current tab's deadline across route navigation", async () => {
  const app = await boundary({ storageUnavailable: true });
  app.advance(29 * 60000);
  app.cleanup();
  app.setPathname("/volunteer/bookings");
  app.render();
  const cleanup = app.runEffect();
  assert.equal(app.idleDelay, 60000);
  app.advance(60000);
  app.timeout();
  await app.flush();
  assert.equal(app.logoutCalls, 1);
  assert.ok(app.errors.length > 0);
  cleanup();
});

test("server home logout failures fail closed rather than rendering signed-in home content", async () => {
  for (const throws of [false, true]) {
    const errors = [];
    class ResponseMock {
      constructor(body, options = {}) {
        this.body = body;
        this.status = options.status ?? 200;
        this.headers = new Headers(options.headers);
      }
      static next() { return new ResponseMock(null); }
    }
    const module = await load("./supabase/middleware.ts", {
      "@supabase/ssr": { createServerClient: () => ({ auth: {
        getUser: async () => ({ data: { user: { id: "user-a" } } }),
        signOut: async () => {
          if (throws) throw new Error("Network failure");
          return { error: new Error("Revocation failed") };
        },
      } }) },
      "next/server": { NextResponse: ResponseMock },
    }, { process: { env: {} }, console: { error: (...args) => errors.push(args) } });
    const response = await module.updateSession({
      method: "GET", nextUrl: { pathname: "/" }, headers: new Headers(),
      cookies: { getAll: () => [] },
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.equal(errors.length, 1);
  }
});
