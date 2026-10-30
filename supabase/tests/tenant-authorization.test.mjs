import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

const connectionString = process.env.TENANT_TEST_DATABASE_URL;

test("tenant authorization in PostgreSQL", {
  skip: !connectionString && "Set TENANT_TEST_DATABASE_URL to an empty, disposable PostgreSQL database.",
}, async (t) => {
  const pool = new pg.Pool({ connectionString, max: 4, connectionTimeoutMillis: 5000 });
  let fixtureCreated = false;
  t.after(async () => {
    try {
      if (fixtureCreated) {
        await pool.query(`
          drop table if exists public.opportunity_skills, public.opportunity_causes, public.bookings,
            public.opportunities, public.organizations, public.profiles cascade;
          drop function if exists public.validate_booking_insert(), public.validate_opportunity_capacity(), public.protect_booking_fields(),
            public.protect_authorization_fields(), public.can_view_opportunity(uuid),
            public.user_owns_opportunity(uuid), public.is_admin(), public.is_nonprofit(), public.is_volunteer();
          drop type if exists public.booking_status;
          drop schema auth cascade;
        `);
      }
    } finally {
      await pool.end();
    }
  });
  const { rows: existing } = await pool.query(`
    select to_regclass('public.profiles') as profiles, to_regclass('public.opportunities') as opportunities,
      to_regclass('public.bookings') as bookings, to_regclass('public.organizations') as organizations,
      to_regnamespace('auth') as auth, to_regtype('public.booking_status') as status
  `);
  assert.ok(Object.values(existing[0]).every((value) => value === null), "An empty disposable database is required");
  fixtureCreated = true;
  await pool.query(`
    do $roles$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    end $roles$;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    create table public.profiles (
      id uuid primary key, role text not null, is_active boolean not null default true,
      approval_status text not null default 'approved', display_name text
    );
    create table public.organizations (id uuid primary key, user_id uuid not null references public.profiles);
    create table public.opportunities (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations,
      created_by uuid not null references public.profiles, title text not null default 'Event',
      status text not null default 'published', capacity integer not null default 10,
      is_deleted boolean not null default false,
      start_at timestamptz not null default now() + interval '1 day'
    );
    create type public.booking_status as enum ('booked', 'waitlisted', 'cancelled', 'completed', 'no_show');
    create table public.bookings (
      id uuid primary key default gen_random_uuid(), opportunity_id uuid not null references public.opportunities,
      volunteer_id uuid not null references public.profiles, status public.booking_status not null default 'booked',
      notes text, cancelled_at timestamptz, hours_override double precision, hours_override_notes text,
      hours_override_by uuid, hours_override_at timestamptz,
      updated_at timestamptz not null default now()
    );
    create table public.opportunity_skills (opportunity_id uuid references public.opportunities, skill_id uuid);
    create table public.opportunity_causes (opportunity_id uuid references public.opportunities, cause_id uuid);
    create function public.is_admin() returns boolean language sql stable security definer set search_path = public as
      $$select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and is_active)$$;
    create function public.is_nonprofit() returns boolean language sql stable security definer set search_path = public as
      $$select exists (select 1 from profiles where id = auth.uid() and role = 'nonprofit' and is_active)$$;
    create function public.is_volunteer() returns boolean language sql stable security definer set search_path = public as
      $$select exists (select 1 from profiles where id = auth.uid() and role = 'volunteer' and is_active)$$;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant select on all tables in schema public to anon;
    alter table public.profiles enable row level security;
    create policy profile_read on public.profiles for select to authenticated using (true);
    create policy profile_self_update on public.profiles for update to authenticated
      using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
    alter table public.organizations enable row level security;
    create policy organization_read on public.organizations for select to anon, authenticated using (true);
    create policy organization_update on public.organizations for update to authenticated
      using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
    create policy legacy_creator_update on public.opportunities for update to authenticated
      using (created_by = auth.uid()) with check (created_by = auth.uid());
    create policy legacy_unrestricted_booking_update on public.bookings for update to authenticated
      using (volunteer_id = auth.uid()) with check (volunteer_id = auth.uid());
    create policy legacy_public_skills on public.opportunity_skills for select to anon, authenticated using (true);
  `);
  for (const migration of ["20261029000000_transactional_bookings.sql", "20261029000001_tenant_authorization.sql",
    "20261029000003_transactional_capacity.sql"]) {
    await pool.query(await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8"));
  }

  const ids = Object.fromEntries(["ownerA", "ownerB", "volunteerA", "volunteerB", "admin", "inactive",
    "orgA", "orgB", "publicA", "publicB", "draftA", "draftB", "reservationA", "reservationB"].map((key) => [key, randomUUID()]));
  for (const key of ["ownerA", "ownerB", "volunteerA", "volunteerB", "admin", "inactive"]) {
    const role = key.startsWith("owner") ? "nonprofit" : key === "admin" ? "admin" : "volunteer";
    await pool.query("insert into public.profiles (id, role, is_active) values ($1, $2, $3)", [ids[key], role, key !== "inactive"]);
  }
  for (const suffix of ["A", "B"]) {
    await pool.query("insert into public.organizations values ($1, $2)", [ids[`org${suffix}`], ids[`owner${suffix}`]]);
    for (const kind of ["public", "draft"]) {
      await pool.query("insert into public.opportunities (id, organization_id, created_by, status) values ($1,$2,$3,$4)",
        [ids[`${kind}${suffix}`], ids[`org${suffix}`], ids[`owner${suffix}`], kind === "public" ? "published" : "draft"]);
    }
    await pool.query("insert into public.bookings (id, opportunity_id, volunteer_id) values ($1,$2,$3)",
      [ids[`reservation${suffix}`], ids[`public${suffix}`], ids[`volunteer${suffix}`]]);
    await pool.query("insert into public.opportunity_skills values ($1,$2),($3,$4)",
      [ids[`public${suffix}`], randomUUID(), ids[`draft${suffix}`], randomUUID()]);
  }

  async function asActor(id, operation) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(id ? "set local role authenticated" : "set local role anon");
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [id ?? ""]);
      const result = await operation(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  await t.test("capacity guards count all confirmed bookings under RLS and preserve tenant boundaries", async () => {
    const id = randomUUID();
    await pool.query("insert into public.opportunities (id, organization_id, created_by, capacity) values ($1,$2,$3,3)",
      [id, ids.orgA, ids.ownerA]);
    for (const user of [ids.volunteerA, ids.volunteerB]) {
      await asActor(user, (client) => client.query(
        "insert into public.bookings (opportunity_id, volunteer_id) values ($1,$2)", [id, user],
      ));
    }
    await assert.rejects(asActor(ids.ownerA, (client) => client.query(
      "update public.opportunities set capacity = 1 where id = $1", [id],
    )), /2 confirmed bookings/);
    const foreign = await asActor(ids.ownerB, (client) => client.query(
      "update public.opportunities set capacity = 4 where id = $1", [id],
    ));
    assert.equal(foreign.rowCount, 0);
    await asActor(ids.ownerA, (client) => client.query(
      "update public.opportunities set capacity = 2 where id = $1", [id],
    ));
    assert.equal((await pool.query("select capacity from public.opportunities where id = $1", [id])).rows[0].capacity, 2);
    await pool.query("delete from public.bookings where opportunity_id = $1", [id]);
    await pool.query("delete from public.opportunities where id = $1", [id]);
  });
  const query = (actor, sql, args = []) => asActor(actor, (client) => client.query(sql, args));
  const denied = (actor, sql, args = []) => assert.rejects(query(actor, sql, args), { code: "42501" });

  await t.test("anonymous discovery stays public without exposing drafts, associations or reservations", async () => {
    assert.equal((await query(null, "select * from public.opportunities")).rowCount, 2);
    assert.equal((await query(null, "select * from public.opportunity_skills")).rowCount, 2);
    assert.equal((await query(null, "select * from public.bookings")).rowCount, 0);
    await denied(null, "insert into public.bookings (opportunity_id, volunteer_id) values ($1,$2)", [ids.publicA, ids.volunteerA]);
  });

  await t.test("nonprofits cannot read private tenant objects or mutate a foreign published opportunity", async () => {
    assert.equal((await query(ids.ownerA, "select * from public.opportunities where id = $1", [ids.draftB])).rowCount, 0);
    assert.equal((await query(ids.ownerA, "select * from public.bookings where id = $1", [ids.reservationB])).rowCount, 0);
    assert.equal((await query(ids.ownerA, "select * from public.bookings where id = $1", [ids.reservationA])).rowCount, 1);
    assert.equal((await query(ids.ownerA, "update public.opportunities set title = 'forged' where id = $1 returning id", [ids.publicB])).rowCount, 0);
    assert.equal((await query(ids.ownerA, "delete from public.opportunities where id = $1", [ids.publicB])).rowCount, 0);
    assert.equal((await query(ids.ownerA, "update public.opportunities set title = 'owned' where id = $1 returning id", [ids.draftA])).rowCount, 1);
    await denied(ids.ownerA, "insert into public.opportunities (organization_id, created_by) values ($1,$2)", [ids.orgB, ids.ownerA]);
    await denied(ids.ownerA, "insert into public.opportunities (organization_id, created_by) values ($1,$2)", [ids.orgA, ids.ownerB]);
    assert.equal((await query(ids.ownerA, "insert into public.opportunities (organization_id, created_by, status) values ($1,$2,'draft') returning id", [ids.orgA, ids.ownerA])).rowCount, 1);
  });

  await t.test("tenant identity and reservation relationships are immutable", async () => {
    await denied(ids.ownerA, "update public.opportunities set organization_id = $1 where id = $2", [ids.orgB, ids.publicA]);
    await denied(ids.ownerA, "update public.opportunities set created_by = $1 where id = $2", [ids.ownerB, ids.publicA]);
    await denied(ids.admin, "update public.organizations set user_id = $1 where id = $2", [ids.volunteerA, ids.orgA]);
    await denied(ids.volunteerA, "update public.bookings set opportunity_id = $1 where id = $2", [ids.publicB, ids.reservationA]);
    await denied(ids.admin, "update public.bookings set volunteer_id = $1 where id = $2", [ids.volunteerB, ids.reservationA]);
  });

  await t.test("association reads and writes follow the opportunity tenant", async () => {
    assert.equal((await query(ids.ownerA, "select * from public.opportunity_skills where opportunity_id = $1", [ids.draftB])).rowCount, 0);
    for (const [table, column] of [["opportunity_skills", "skill_id"], ["opportunity_causes", "cause_id"]]) {
      await denied(ids.ownerA, `insert into public.${table} values ($1,$2)`, [ids.publicB, randomUUID()]);
      assert.equal((await query(ids.ownerA, `insert into public.${table} values ($1,$2) returning ${column}`, [ids.draftA, randomUUID()])).rowCount, 1);
      assert.equal((await query(ids.ownerB, `delete from public.${table} where opportunity_id = $1`, [ids.draftA])).rowCount, 0);
      assert.ok((await query(ids.ownerA, `delete from public.${table} where opportunity_id = $1`, [ids.draftA])).rowCount > 0);
    }
  });

  await t.test("profile editing cannot mint roles or reactivate accounts; admin management remains allowed", async () => {
    await denied(ids.volunteerA, "update public.profiles set role = 'admin' where id = $1", [ids.volunteerA]);
    await denied(ids.inactive, "update public.profiles set is_active = true where id = $1", [ids.inactive]);
    await denied(ids.volunteerA, "update public.profiles set approval_status = 'pending' where id = $1", [ids.volunteerA]);
    assert.equal((await query(ids.volunteerA, "update public.profiles set display_name = 'Updated' where id = $1 returning id", [ids.volunteerA])).rowCount, 1);
    await query(ids.admin, "update public.profiles set is_active = true where id = $1", [ids.inactive]);
    await query(ids.admin, "update public.profiles set is_active = false where id = $1", [ids.inactive]);
  });

  await t.test("volunteers cannot read/cancel others, forge hours or reassign a booking", async () => {
    assert.equal((await query(ids.volunteerA, "select * from public.bookings where id = $1", [ids.reservationB])).rowCount, 0);
    assert.equal((await query(ids.volunteerA, "update public.bookings set status = 'cancelled', cancelled_at = now() where id = $1", [ids.reservationB])).rowCount, 0);
    await denied(ids.volunteerA, "update public.bookings set hours_override = 24 where id = $1", [ids.reservationA]);
    await denied(ids.volunteerA, "insert into public.bookings (opportunity_id, volunteer_id, hours_override) values ($1,$2,24)", [ids.publicB, ids.volunteerA]);
    await denied(ids.volunteerA, "insert into public.bookings (opportunity_id, volunteer_id) values ($1,$2)", [ids.publicA, ids.volunteerB]);
    await denied(ids.volunteerA, "insert into public.bookings (opportunity_id, volunteer_id) values ($1,$2)", [ids.draftB, ids.volunteerA]);
    assert.equal((await query(ids.volunteerA, "update public.bookings set status = 'cancelled', cancelled_at = now() where id = $1 returning id", [ids.reservationA])).rowCount, 1);
    assert.equal((await query(ids.volunteerA, "update public.bookings set status = 'booked' where id = $1", [ids.reservationA])).rowCount, 0);
    assert.equal((await query(ids.volunteerA, "insert into public.bookings (opportunity_id, volunteer_id) values ($1,$2) returning id", [ids.publicA, ids.volunteerA])).rowCount, 1);
  });

  await t.test("disabled actors lose reservation access and nonprofit management rights", async () => {
    await denied(ids.inactive, "insert into public.bookings (opportunity_id, volunteer_id) values ($1,$2)", [ids.publicA, ids.inactive]);
    await query(ids.admin, "update public.profiles set is_active = false where id = $1", [ids.ownerA]);
    assert.equal((await query(ids.ownerA, "select * from public.bookings")).rowCount, 0);
    assert.equal((await query(ids.ownerA, "update public.opportunities set title = 'disabled' where id = $1", [ids.publicA])).rowCount, 0);
    assert.equal((await query(ids.ownerA, "update public.organizations set user_id = user_id where id = $1", [ids.orgA])).rowCount, 0);
    await query(ids.admin, "update public.profiles set is_active = true where id = $1", [ids.ownerA]);
  });

  await t.test("active admins retain explicit cross-tenant read and hours-management privileges", async () => {
    assert.ok((await query(ids.admin, "select * from public.opportunities")).rowCount >= 4);
    assert.ok((await query(ids.admin, "select * from public.bookings")).rowCount >= 2);
    assert.equal((await query(ids.admin, "update public.bookings set hours_override = 2 where id = $1 returning id", [ids.reservationB])).rowCount, 1);
    assert.equal((await query(ids.admin, "update public.opportunities set title = 'admin edit' where id = $1 returning id", [ids.publicB])).rowCount, 1);
  });

  await t.test("authenticated RLS booking writes retain final-seat serialization", async () => {
    const opportunityId = randomUUID();
    await pool.query("insert into public.opportunities (id, organization_id, created_by, capacity) values ($1,$2,$3,1)",
      [opportunityId, ids.orgA, ids.ownerA]);
    const first = await pool.connect();
    const second = await pool.connect();
    try {
      for (const [client, actor] of [[first, ids.volunteerA], [second, ids.volunteerB]]) {
        await client.query("begin");
        await client.query("set local role authenticated");
        await client.query("select set_config('request.jwt.claim.sub', $1, true)", [actor]);
      }
      const insert = "insert into public.bookings (opportunity_id, volunteer_id) values ($1,$2)";
      await first.query(insert, [opportunityId, ids.volunteerA]);
      const rejected = assert.rejects(second.query(insert, [opportunityId, ids.volunteerB]), /This opportunity is full/);
      for (let attempt = 0; ; attempt++) {
        const { rows } = await pool.query("select wait_event_type from pg_stat_activity where pid = $1", [second.processID]);
        if (rows[0]?.wait_event_type === "Lock") break;
        assert.ok(attempt < 100, "Competing reservation must wait for the opportunity lock");
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      await first.query("commit");
      await rejected;
      const { rows } = await pool.query("select count(*)::int as count from public.bookings where opportunity_id = $1", [opportunityId]);
      assert.equal(rows[0].count, 1);
    } finally {
      await first.query("rollback");
      await second.query("rollback");
      first.release();
      second.release();
    }
  });
});
