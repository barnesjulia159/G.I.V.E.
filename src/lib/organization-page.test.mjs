import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { Script } from "node:vm";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { formatOpportunityLocation } from "./opportunity-validation.ts";

const require = createRequire(import.meta.url);
const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const organization = {
  id: organizationId, name: "Community Helpers", mission_statement: "Support our neighbors.",
  description: "We bring people together.\nEveryone is welcome.", contact_name: "Volunteer team",
  contact_email: "hello@example.org", contact_phone: "555-0100", website_url: "example.org",
  address_line1: "123 Main Street", address_line2: null, city: "Town", state: "NY", zip_code: "10001",
};
const opportunity = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", organization_id: organizationId,
  organization_name: organization.name, title: "Community garden", description: "Plant together.",
  start_at: "2099-01-01T10:00:00Z", end_at: "2099-01-01T12:00:00Z",
  capacity: 10, spots_remaining: 5, city: "Town", state: "NY", is_virtual: false,
};

async function loadModule(path, imports = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  new Script(`(function(require, exports) { ${outputText}\n})`, { filename: path })
    .runInThisContext()((name) => {
      if (name === "react/jsx-runtime") return require(name);
      assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`);
      return imports[name];
    }, exports);
  return exports;
}

const uiImports = {
  "@/lib/opportunity-validation": { formatOpportunityLocation },
  "next/link": { default: ({ children, ...props }) => createElement("a", props, children) },
  "@/components/LocalDateTime": { LocalDateTime: ({ value }) => createElement("time", null, value) },
};
const { OpportunityCard } = await loadModule("../components/OpportunityCard.tsx", uiImports);

function database(results) {
  const calls = [];
  return {
    calls,
    from(table) {
      const operations = [];
      calls.push({ table, operations });
      const result = results[table] ?? { data: [], error: null };
      const query = {
        then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
      };
      for (const method of ["select", "eq", "order", "neq", "update", "insert", "maybeSingle", "single"]) {
        query[method] = (...args) => { operations.push([method, ...args]); return query; };
      }
      return query;
    },
  };
}

async function publicPage(results = {}, id = organizationId) {
  const db = database({
    organizations: { data: organization, error: null },
    public_opportunity_listings: { data: [opportunity], error: null },
    ...results,
  });
  const { default: Page } = await loadModule("../app/(public)/organizations/[id]/page.tsx", {
    ...uiImports,
    "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); } },
    "@/components/OpportunityCard": { OpportunityCard },
    "@/lib/supabase/server": { createClient: async (options) => {
      assert.deepEqual(options, { noStore: true });
      return db;
    } },
  });
  return { db, render: async () => renderToStaticMarkup(await Page({ params: Promise.resolve({ id }) })) };
}

test("public organization home shows real profile fields and only queries that tenant's public listings", async () => {
  const { db, render } = await publicPage({
    public_opportunity_listings: { data: [
      opportunity,
      { ...opportunity, id: "past", title: "Past cleanup", start_at: "2000-01-01T10:00:00Z", end_at: "2000-01-01T12:00:00Z" },
      { ...opportunity, id: "ongoing", title: "Ongoing work", start_at: "2000-01-01T10:00:00Z" },
    ], error: null },
  });
  const html = await render();
  for (const value of [organization.name, organization.mission_statement, organization.description,
    organization.contact_name, organization.contact_email, organization.contact_phone, organization.address_line1,
    "Upcoming and ongoing opportunities", "Past opportunities (1)", "Ongoing work"]) {
    assert.ok(html.includes(value), value);
  }
  assert.ok(html.includes('href="https://example.org/"'));
  assert.ok(html.includes('href="mailto:hello@example.org"'));
  assert.ok(html.includes('href="tel:555-0100"'));
  for (const id of [opportunity.id, "past", "ongoing"]) assert.ok(html.includes(`href="/opportunities/${id}"`));
  assert.deepEqual(db.calls.map(({ table }) => table), ["organizations", "public_opportunity_listings"]);
  assert.ok(db.calls[0].operations.some(([method, field, value]) => method === "eq" && field === "id" && value === organizationId));
  assert.ok(db.calls[1].operations.some(([method, field, value]) => method === "eq" && field === "organization_id" && value === organizationId));
  const columns = db.calls[0].operations.find(([method]) => method === "select")[1];
  assert.ok(!columns.includes("user_id") && !columns.includes("is_approved"));
});

test("empty opportunities are explicit and absent optional profile fields are omitted", async () => {
  const { render } = await publicPage({
    organizations: { data: { ...organization, description: null, website_url: null, contact_phone: null }, error: null },
    public_opportunity_listings: { data: [], error: null },
  });
  const html = await render();
  assert.ok(html.includes("No upcoming opportunities right now."));
  for (const value of ["About our organization", "Past opportunities", 'href="tel:', "Website"]) {
    assert.ok(!html.includes(value), value);
  }
});

test("unknown and malformed organization IDs return not found", async () => {
  const missing = await publicPage({ organizations: { data: null, error: null } });
  await assert.rejects(missing.render, /NOT_FOUND/);
  assert.equal(missing.db.calls.length, 1);
  const invalid = await publicPage({}, "not-a-uuid");
  await assert.rejects(invalid.render, /NOT_FOUND/);
  assert.equal(invalid.db.calls.length, 0);
});

test("database failures are logged and not presented as missing organizations or empty opportunities", async (t) => {
  const errors = [];
  t.mock.method(console, "error", (...args) => errors.push(args));
  const failedProfile = await publicPage({ organizations: { data: null, error: { message: "offline" } } });
  await assert.rejects(failedProfile.render, /Organization details could not be loaded/);
  const failedListings = await publicPage({ public_opportunity_listings: { data: null, error: { message: "offline" } } });
  const html = await failedListings.render();
  assert.ok(html.includes('role="alert"'));
  assert.ok(html.includes("opportunities could not be loaded"));
  assert.ok(!html.includes("No upcoming opportunities"));
  assert.equal(errors.length, 2);
});

test("website links accept HTTP(S) and bare domains but never executable or credential URLs", async () => {
  for (const website_url of ["javascript:alert(1)", "data:text/html,bad", "https://user:password@example.org", "http://["]) {
    const { render } = await publicPage({ organizations: { data: { ...organization, website_url }, error: null } });
    assert.ok(!(await render()).includes('target="_blank"'), website_url);
  }
  for (const website_url of ["https://example.org/about", "http://example.org", "www.example.org"]) {
    const { render } = await publicPage({ organizations: { data: { ...organization, website_url }, error: null } });
    const html = await render();
    assert.ok(html.includes('target="_blank"'));
    assert.ok(html.includes('rel="noopener noreferrer"'));
  }
});

async function renderOpportunityDetails(listing = opportunity, results = {}) {
  const db = database({ public_opportunity_listings: { data: listing, error: null }, ...results });
  db.auth = { getUser: async () => ({ data: { user: null } }) };
  const { default: Page } = await loadModule("../app/(public)/opportunities/[id]/page.tsx", {
    ...uiImports,
    "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); } },
    "@/lib/supabase/server": { createClient: async () => db },
    "@/lib/actions/bookings": { createBooking: () => {} },
    "@/components/SubmitButton": {},
  });
  return renderToStaticMarkup(await Page({
    params: Promise.resolve({ id: opportunity.id }), searchParams: Promise.resolve({}),
  }));
}

test("opportunity cards and details link to their organization without changing detail navigation", async () => {
  const card = renderToStaticMarkup(createElement(OpportunityCard, { opportunity }));
  assert.ok(card.includes(`href="/organizations/${organizationId}"`));
  assert.ok(card.includes(`href="/opportunities/${opportunity.id}"`));
  const html = await renderOpportunityDetails();
  assert.ok(html.includes(`href="/organizations/${organizationId}"`));
  assert.ok(html.includes("Learn about this organization"));
  assert.ok(html.includes("Create account"));
});

test("capacity is singular only for one available spot on cards and details", async () => {
  for (const spots_remaining of [0, 1, 2]) {
    const listing = { ...opportunity, spots_remaining };
    const card = renderToStaticMarkup(createElement(OpportunityCard, { opportunity: listing }));
    const html = await renderOpportunityDetails(listing);
    assert.ok(card.includes(spots_remaining === 1 ? "Spot remaining:" : "Spots remaining:"));
    assert.ok(html.includes(`${spots_remaining} ${spots_remaining === 1 ? "spot" : "spots"} remaining`));
  }
});

test("skills and causes distinguish empty associations from lookup failures", async (t) => {
  const empty = await renderOpportunityDetails();
  assert.ok(empty.includes("No skills listed by the organization."));
  assert.ok(empty.includes("No causes listed by the organization."));
  const logs = [];
  t.mock.method(console, "error", (...args) => logs.push(args));
  const html = await renderOpportunityDetails(opportunity, {
    opportunity_skills: { data: null, error: { message: "offline" } },
    opportunity_causes: { data: [{ causes: { name: "Environment" } }], error: null },
  });
  assert.ok(html.includes("Skills could not be loaded. Please try again."));
  assert.ok(html.includes('role="alert"'));
  assert.ok(html.includes("Environment"));
  assert.ok(!html.includes("No skills listed by the organization."));
  assert.equal(logs.length, 1);
});

test("organization profile saves invalidate public pages only after successful persistence", async () => {
  for (const writeError of [null, { message: "Write denied" }]) {
    const calls = [];
    const db = database({ organizations: { data: { id: organizationId }, error: writeError } });
    db.auth = { getUser: async () => ({ data: { user: { id: "owner" } } }) };
    const { saveOrganizationProfile } = await loadModule("./actions/organizations.ts", {
      "next/navigation": { redirect: (location) => { throw Object.assign(new Error("redirect"), { location }); } },
      "next/cache": { revalidatePath: (...args) => calls.push(args) },
      "@/lib/supabase/server": { createClient: async () => db },
    });
    const form = new FormData();
    for (const [key, value] of Object.entries(organization)) if (value) form.set(key, value);
    await assert.rejects(() => saveOrganizationProfile(form), (error) => {
      assert.ok(error.location.startsWith(writeError ? "/nonprofit/organization?error=" : "/nonprofit/dashboard?message="));
      return true;
    });
    if (writeError) assert.deepEqual(calls, []);
    else {
      assert.ok(calls.some(([path, type]) => path === "/organizations/[id]" && type === "page"));
      assert.ok(calls.some(([path, type]) => path === "/opportunities/[id]" && type === "page"));
    }
  }
});

test("opportunity mutations invalidate the organization route with the required dynamic page type", async () => {
  const calls = [];
  const { invalidateOpportunityViews } = await loadModule("./opportunity-cache.ts", {
    "next/cache": { revalidatePath: (...args) => calls.push(args) },
  });
  invalidateOpportunityViews(opportunity.id);
  assert.ok(calls.some(([path, type]) => path === "/organizations/[id]" && type === "page"));
});

  async function renderDirectory(params = {}, fixture = {}) {
    const events = fixture.events ?? [
      { ...opportunity, id: "a", title: "Garden", city: "Town" },
      { ...opportunity, id: "b", title: "Cleanup", city: "Town" },
      { ...opportunity, id: "c", title: "Garden", city: "Elsewhere" },
    ];
    const tables = {
      skills: [{ id: "s1", name: "Gardening" }, { id: "s2", name: "Cleaning" }],
      causes: [{ id: "c1", name: "Environment" }, { id: "c2", name: "Community" }],
      opportunity_skills: [
        { opportunity_id: "a", skill_id: "s1" }, { opportunity_id: "b", skill_id: "s2" }, { opportunity_id: "c", skill_id: "s1" },
      ],
      opportunity_causes: [
        { opportunity_id: "a", cause_id: "c1" }, { opportunity_id: "b", cause_id: "c1" }, { opportunity_id: "c", cause_id: "c2" },
      ],
      public_opportunity_listings: events,
    };
    const calls = [];
    const db = {
      from(table) {
        const operations = [];
        calls.push({ table, operations });
        let rows = [...tables[table]];
        const query = {
          select() { return query; },
          order(...args) { operations.push(["order", ...args]); return query; },
          in(column, values) { rows = rows.filter((row) => values.includes(row[column])); return query; },
          gt(column, value) { rows = rows.filter((row) => row[column] > value); return query; },
          lt(column, value) { rows = rows.filter((row) => row[column] < value); return query; },
          ilike(column, value) { rows = rows.filter((row) => row[column]?.toLowerCase().includes(value.slice(1, -1).toLowerCase())); return query; },
          or(value) {
            operations.push(["or", value]);
            rows = rows.filter((row) => [row.title, row.description, row.organization_name]
              .some((text) => text?.toLowerCase().includes((params.search ?? "").toLowerCase())));
            return query;
          },
          range(start, end) {
            operations.push(["range", start, end]);
            // PostgREST applies filters before range regardless of builder call order.
            query.bounds = [start, end];
            return query;
          },
          then(resolve, reject) {
            const data = query.bounds ? rows.slice(query.bounds[0], query.bounds[1] + 1) : rows;
            return Promise.resolve({ data, error: fixture.errorTable === table ? { message: "offline" } : null }).then(resolve, reject);
          },
        };
        return query;
      },
    };
    const { default: Page } = await loadModule("../app/(public)/opportunities/page.tsx", {
      ...uiImports, "@/components/OpportunityCard": {
        OpportunityCard: ({ opportunity: row }) => createElement("article", { "data-event-id": row.id }, row.title),
      },
      "@/lib/supabase/server": { createClient: async (options) => {
        assert.deepEqual(options, { noStore: true });
        return db;
      } },
    });
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve(params) }));
    const ids = [...html.matchAll(/data-event-id="([^"]+)"/g)].map((match) => match[1]);
    return { html, ids, calls };
  }

  test("all skill/cause combinations intersect across groups and allow any selected value within a group", async () => {
    const skillSets = [[], ["s1"], ["s2"], ["s1", "s2"]];
    const causeSets = [[], ["c1"], ["c2"], ["c1", "c2"]];
    const skillsByEvent = { a: "s1", b: "s2", c: "s1" };
    const causesByEvent = { a: "c1", b: "c1", c: "c2" };
    for (const skill of skillSets) for (const cause of causeSets) {
      const expected = ["a", "b", "c"].filter((id) =>
        (!skill.length || skill.includes(skillsByEvent[id])) &&
        (!cause.length || cause.includes(causesByEvent[id])));
      const { ids } = await renderDirectory({ skill, cause });
      assert.deepEqual(ids, expected, JSON.stringify({ skill, cause }));
    }
    const combined = await renderDirectory({ skill: "s1", cause: "c1", search: "Garden", city: "Town", date: "2099-01-01" });
    assert.deepEqual(combined.ids, ["a"]);
  });

  test("clear filters restores the unfiltered first page and resets form controls", async () => {
    const filtered = await renderDirectory({ skill: "s1", cause: "c1", city: "Town", search: "Garden", page: "2" });
    assert.ok(filtered.html.includes('href="/opportunities"'));
    const cleared = await renderDirectory();
    assert.deepEqual(cleared.ids, ["a", "b", "c"]);
    assert.ok(!cleared.html.includes("checked="));
    assert.ok(!cleared.html.includes('value="Town"'));
    assert.ok(!cleared.html.includes("Previous page"));
  });

  test("invalid filters and lookup errors produce explicit feedback instead of misleading empty results", async () => {
    for (const params of [{ skill: "retired" }, { cause: "retired" }, { date: "2099-02-30" }, { page: "0" }, { page: "1.5" }]) {
      const { html, ids } = await renderDirectory(params);
      assert.deepEqual(ids, []);
      assert.ok(html.includes('role="alert"'));
      assert.ok(!html.includes("No volunteer opportunities match"));
    }
    const { html } = await renderDirectory({ skill: "s1" }, { errorTable: "opportunity_skills" });
    assert.ok(html.includes("Filters could not be loaded"));
  });

  test("directory pages are bounded to 24 cards and preserve repeated filters in navigation", async () => {
    const events = Array.from({ length: 10000 }, (_, index) => ({ ...opportunity, id: String(index) }));
    const first = await renderDirectory({}, { events });
    assert.equal(first.ids.length, 24);
    assert.ok(first.html.includes("Next page"));
    assert.ok(!first.html.includes("Previous page"));
    const second = await renderDirectory({ page: "2" }, { events });
    assert.equal(second.ids[0], "24");
    assert.equal(second.ids.length, 24);
    assert.ok(second.html.includes("Previous page"));
    const query = second.calls.find(({ table }) => table === "public_opportunity_listings");
    assert.deepEqual(query.operations.find(([method]) => method === "range"), ["range", 24, 48]);
    assert.ok(query.operations.some(([method, column]) => method === "order" && column === "id"));
    const filtered = await renderDirectory({ skill: ["s1", "s2"], cause: ["c1", "c2"], page: "2", city: "Town" });
    assert.ok(filtered.html.includes("skill=s1&amp;skill=s2"));
    assert.ok(filtered.html.includes("cause=c1&amp;cause=c2"));
    assert.ok(filtered.html.includes("city=Town"));
  });

  test("keyword punctuation is quoted as one PostgREST search value", async () => {
    const search = 'garden,(test) "quoted" %_\\';
    const { calls } = await renderDirectory({ search });
    const query = calls.find(({ table }) => table === "public_opportunity_listings");
    const filter = query.operations.find(([method]) => method === "or")[1];
    const literal = `%${search.replace(/\\/g, "\\\\").replace(/[%_]/g, "\\$&")}%`;
    assert.equal(filter, ["title", "description", "organization_name"].map((column) => `${column}.ilike.${JSON.stringify(literal)}`).join(","));
  });
