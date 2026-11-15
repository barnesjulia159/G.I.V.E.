import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
import ts from "typescript";
import { groupHoursByOpportunity } from "./hours-summary.ts";
import * as dateFormat from "./date-format.ts";

test("distinct events with the same title retain separate hours rows", () => {
  const entries = [
    { opportunityId: "event-a", opportunityTitle: "Community cleanup", hours: 2 },
    { opportunityId: "event-b", opportunityTitle: "Community cleanup", hours: 3 },
    { opportunityId: "event-a", opportunityTitle: "Community cleanup", hours: 1.5 },
  ];
  assert.deepEqual(groupHoursByOpportunity(entries), [
    { id: "event-a", title: "Community cleanup", hours: 3.5, pendingApproval: false },
    { id: "event-b", title: "Community cleanup", hours: 3, pendingApproval: false },
  ]);
  assert.equal(entries[0].hours, 2);
});

test("grouping preserves total hours and accepts empty histories", () => {
  assert.deepEqual(groupHoursByOpportunity([]), []);
  const entries = [
    { opportunityId: "event-a", opportunityTitle: "Original title", hours: 0 },
    { opportunityId: "event-a", opportunityTitle: "Updated title", hours: 2 },
    { opportunityId: "event-b", opportunityTitle: "Event", hours: 3.25 },
  ];
  const groups = groupHoursByOpportunity(entries);
  assert.equal(groups.length, 2);
  assert.equal(groups.reduce((total, entry) => total + entry.hours, 0), 5.25);
});

test("pending attendance is labelled without contributing unconfirmed hours", () => {
  const groups = groupHoursByOpportunity([
    { opportunityId: "event", opportunityTitle: "Event", hours: 0, verificationPending: true },
    { opportunityId: "event", opportunityTitle: "Event", hours: 2, verificationPending: false },
  ]);
  assert.deepEqual(groups, [{ id: "event", title: "Event", hours: 2, pendingApproval: true }]);
});

test("manual attendance saves Eastern inputs as instants and rejects skipped times", async () => {
    const source = await readFile(new URL("../components/ManualCheckoutControl.tsx", import.meta.url), "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    });

    for (const scenario of [
      { inputs: ["2026-07-05T10:00", "2026-07-05T11:00", "first", "first"], expected: ["2026-07-05T14:00:00.000Z", "2026-07-05T15:00:00.000Z"] },
      { inputs: ["2026-11-01T01:15", "2026-11-01T01:45", "first", "second"], expected: ["2026-11-01T05:15:00.000Z", "2026-11-01T06:45:00.000Z"] },
      { inputs: [], initial: ["2026-11-01T06:15:42.000Z", "2026-11-01T07:45:17.000Z"], expected: ["2026-11-01T06:15:42.000Z", "2026-11-01T07:45:17.000Z"] },
      { inputs: ["2026-03-08T02:30", "2026-03-08T04:00", "first", "first"], expected: null },
    ]) {
      let stateIndex = 0;
      let saved;
      const updates = [];
      const jsx = (type, props) => ({ type, props });
      const imports = {
        react: { useState: (initial) => [scenario.inputs[stateIndex++] ?? initial, (value) => updates.push(value)] },
        "react/jsx-runtime": { jsx, jsxs: jsx },
        "next/navigation": { useRouter: () => ({ refresh() {} }) },
        "@/components/Toast": {},
        "@/lib/date-format": dateFormat,
      };
      const exports = {};
      new Script(`(function(require, exports) { ${outputText}\n})`).runInNewContext({
        console, JSON,
        fetch: async (_url, options) => {
          saved = JSON.parse(options.body);
          return { ok: true, json: async () => ({}) };
        },
        BroadcastChannel: class { postMessage() {} close() {} },
      })((name) => {
        assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`);
        return imports[name];
      }, exports);
      const tree = exports.ManualCheckoutControl({ bookingId: "booking", initialCheckInAt: scenario.initial?.[0] ?? null, initialCheckOutAt: scenario.initial?.[1] ?? null });
      function findButton(node) {
        if (!node || typeof node !== "object") return null;
        if (node.type === "button") return node;
        const children = node.props?.children;
        return (Array.isArray(children) ? children : [children]).map(findButton).find(Boolean);
      }
      await findButton(tree).props.onClick();
      if (scenario.expected) {
        assert.deepEqual([saved.checkInAt, saved.checkOutAt], scenario.expected);
      } else {
        assert.equal(saved, undefined);
        assert.ok(updates.some((value) => typeof value === "string" && value.includes("skipped by daylight saving")));
      }
    }
  });

test("dashboard loads asynchronously and retains polling, broadcast, visibility refresh and cleanup", async () => {
  const source = await readFile(new URL("../components/VolunteerHoursDashboard.tsx", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const updates = [];
  let effect;
  let refresh;
  let interval;
  let visibilityListener;
  let channel;
  let requests = 0;
  let intervalCleared = false;
  let listenerRemoved = false;
  const imports = {
    react: {
      useState: (initial) => [initial, (value) => updates.push(value)],
      useCallback: (callback, dependencies) => {
        assert.equal(dependencies.length, 0);
        refresh = callback;
        return callback;
      },
      useEffect: (callback, dependencies) => {
        assert.equal(dependencies.length, 1);
        assert.equal(dependencies[0], refresh);
        effect = callback;
      },
    },
    "react/jsx-runtime": { jsx: () => null, jsxs: () => null },
    "@/components/LocalDateTime": {},
    "@/lib/hours-summary": { groupHoursByOpportunity },
  };
  const exports = {};
  new Script(`(function(require, exports) { ${outputText}\n})`).runInNewContext({
    console,
    fetch: async (url, options) => {
      assert.equal(url, "/api/attendance/hours");
      assert.equal(options.cache, "no-store");
      requests++;
      return { ok: true, json: async () => ({ data: [], totalHours: requests }) };
    },
    setInterval: (callback, delay) => {
      assert.equal(delay, 3000);
      interval = callback;
      return 42;
    },
    clearInterval: (id) => { assert.equal(id, 42); intervalCleared = true; },
    BroadcastChannel: class {
      constructor(name) {
        assert.equal(name, "attendance-updates");
        channel = { closed: false, close() { channel.closed = true; } };
        return channel;
      }
    },
    document: {
      visibilityState: "visible",
      addEventListener: (name, listener) => { assert.equal(name, "visibilitychange"); visibilityListener = listener; },
      removeEventListener: (name, listener) => {
        assert.equal(name, "visibilitychange");
        assert.equal(listener, visibilityListener);
        listenerRemoved = true;
      },
    },
  })((name) => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`);
    return imports[name];
  }, exports);
  exports.VolunteerHoursDashboard();
  const cleanup = effect();
  assert.equal(requests, 1);
  assert.equal(updates.length, 0, "Effect setup must not synchronously set state");
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(updates.some((value) => value?.totalHours === 1));
  await interval();
  channel.onmessage({ data: { type: "hours-recorded" } });
  visibilityListener();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests, 4);
  cleanup();
  assert.equal(intervalCleared, true);
  assert.equal(listenerRemoved, true);
  assert.equal(channel.closed, true);
});
