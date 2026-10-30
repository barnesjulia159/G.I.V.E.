import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

const connectionString = process.env.BOOKING_TEST_DATABASE_URL;

test("transactional booking constraints in PostgreSQL", {
  skip: !connectionString && "Set BOOKING_TEST_DATABASE_URL to an empty, disposable PostgreSQL database.",
}, async (t) => {
  const pool = new pg.Pool({ connectionString, max: 4, connectionTimeoutMillis: 5000 });
  let fixtureCreated = false;
  let db;
  t.after(async () => {
    try {
      if (fixtureCreated) {
        await pool.query(`
          drop table if exists public.bookings;
          drop table if exists public.opportunities;
          drop function if exists public.validate_booking_insert();
          drop function if exists public.validate_opportunity_capacity();
          drop type if exists public.booking_status;
        `);
      }
    } finally {
      db?.release();
      await pool.end();
    }
  });
  db = await pool.connect();

  // Never run this fixture against the application's database.
  const { rows } = await db.query(`
    select to_regclass('public.bookings') as bookings,
      to_regclass('public.opportunities') as opportunities,
      to_regtype('public.booking_status') as status,
      to_regprocedure('public.validate_booking_insert()') as validation
  `);
  assert.ok(Object.values(rows[0]).every((value) => value === null), "Test database must not contain application booking objects");
  fixtureCreated = true;
  await db.query(`
    create type public.booking_status as enum ('booked', 'waitlisted', 'cancelled', 'completed', 'no_show');
    create table public.opportunities (
      id uuid primary key, capacity integer not null,
      status text not null default 'published',
      is_deleted boolean not null default false,
      start_at timestamptz not null default now() + interval '1 day'
    );
    create table public.bookings (
      id uuid primary key default gen_random_uuid(),
      opportunity_id uuid not null references public.opportunities,
      volunteer_id uuid not null, status public.booking_status not null default 'booked'
    );
    create function public.validate_booking_insert() returns trigger
      language plpgsql as 'begin return new; end;';
    create trigger legacy_booking_insert before insert on public.bookings
      for each row execute function public.validate_booking_insert();
  `);
  await db.query(await readFile(new URL("../migrations/20261029000000_transactional_bookings.sql", import.meta.url), "utf8"));
  await db.query(await readFile(new URL("../migrations/20261029000003_transactional_capacity.sql", import.meta.url), "utf8"));
  const { rows: triggers } = await db.query(`
    select tgname from pg_trigger
    where tgrelid = 'public.bookings'::regclass and not tgisinternal
  `);
  assert.deepEqual(triggers.map((row) => row.tgname), ["validate_booking_write"]);

  async function opportunity(capacity = 1, status = "published") {
    const id = randomUUID();
    await db.query("insert into public.opportunities (id, capacity, status) values ($1, $2, $3)", [id, capacity, status]);
    return id;
  }

  async function book(client, id, user = randomUUID(), status = "booked") {
    return client.query(
      "insert into public.bookings (opportunity_id, volunteer_id, status) values ($1, $2, $3) returning id",
      [id, user, status],
    );
  }

  async function waitForLock(client) {
    for (let attempt = 0; ; attempt++) {
      const { rows } = await db.query(
        "select wait_event_type from pg_stat_activity where pid = $1", [client.processID],
      );
      if (rows[0]?.wait_event_type === "Lock") return;
      assert.ok(attempt < 100, "Competing write must wait for the opportunity lock");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  await t.test("capacity reductions preserve confirmed bookings and ignore inactive/waitlisted history", async () => {
    const id = await opportunity(4);
    await book(db, id);
    await book(db, id);
    for (const status of ["waitlisted", "cancelled", "completed", "no_show"]) {
      await book(db, id, randomUUID(), status);
    }
    await db.query("update public.opportunities set capacity = 2 where id = $1", [id]);
    await assert.rejects(db.query("update public.opportunities set capacity = 1 where id = $1", [id]), /2 confirmed bookings/);
    for (const capacity of [0, -1, null]) {
      await assert.rejects(db.query("update public.opportunities set capacity = $2 where id = $1", [id, capacity]), /positive integer/);
    }
    assert.equal((await db.query("select capacity from public.opportunities where id = $1", [id])).rows[0].capacity, 2);
    await db.query("update public.opportunities set capacity = 3 where id = $1", [id]);
    await book(db, id);
  });

  await t.test("a reduction waits for a booking then rejects without changing capacity", async () => {
    const id = await opportunity(2);
    await book(db, id);
    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await first.query("begin");
      await book(first, id);
      const reduction = assert.rejects(second.query("update public.opportunities set capacity = 1 where id = $1", [id]), /2 confirmed bookings/);
      await waitForLock(second);
      await first.query("commit");
      await reduction;
      assert.equal((await db.query("select capacity from public.opportunities where id = $1", [id])).rows[0].capacity, 2);
    } finally {
      await first.query("rollback");
      first.release();
      second.release();
    }
  });

  await t.test("a booking waits for a reduction then rejects at the new capacity", async () => {
    const id = await opportunity(2);
    await book(db, id);
    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await first.query("begin");
      await first.query("update public.opportunities set capacity = 1 where id = $1", [id]);
      const booking = assert.rejects(book(second, id), /This opportunity is full/);
      await waitForLock(second);
      await first.query("commit");
      await booking;
      assert.equal((await db.query("select count(*)::int as count from public.bookings where opportunity_id = $1", [id])).rows[0].count, 1);
    } finally {
      await first.query("rollback");
      first.release();
      second.release();
    }
  });

  await t.test("rollback restores capacity and unrelated opportunities remain writable", async () => {
    const id = await opportunity(2);
    const other = await opportunity(2);
    const first = await pool.connect();
    try {
      await first.query("begin");
      await first.query("update public.opportunities set capacity = 1 where id = $1", [id]);
      await db.query("set statement_timeout = '2s'");
      await db.query("update public.opportunities set capacity = 3 where id = $1", [other]);
      await first.query("rollback");
      assert.equal((await db.query("select capacity from public.opportunities where id = $1", [id])).rows[0].capacity, 2);
      await book(db, id);
      await book(db, id);
    } finally {
      await db.query("reset statement_timeout");
      await first.query("rollback");
      first.release();
    }
  });

  await t.test("concurrent volunteers cannot take the same final spot", async () => {
    const id = await opportunity();
    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await first.query("begin");
      await book(first, id);
      const competing = assert.rejects(book(second, id), /This opportunity is full/);
      // Observe the actual lock wait rather than relying on a sleep.
      for (let attempt = 0; ; attempt++) {
        const { rows: waiting } = await db.query(
          "select wait_event_type from pg_stat_activity where pid = $1", [second.processID],
        );
        if (waiting[0]?.wait_event_type === "Lock") break;
        assert.ok(attempt < 100, "Second booking must block on the opportunity row");
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      await first.query("commit");
      await competing;
      const { rows: counts } = await db.query("select count(*)::int as count from public.bookings where opportunity_id = $1", [id]);
      assert.equal(counts[0].count, 1);
    } finally {
      await first.query("rollback");
      first.release();
      second.release();
    }
  });

  await t.test("different opportunities do not block each other and rollback releases capacity", async () => {
    const id = await opportunity();
    const other = await opportunity();
    const first = await pool.connect();
    try {
      await first.query("begin");
      await book(first, id);
      await db.query("set statement_timeout = '2s'");
      await book(db, other);
      await first.query("rollback");
      await book(db, id);
    } finally {
      await db.query("reset statement_timeout");
      await first.query("rollback");
      first.release();
    }
  });

  await t.test("active duplicates fail, including booked/waitlisted pairs, but cancellation allows rebooking", async () => {
    const id = await opportunity(3);
    const user = randomUUID();
    const { rows: [original] } = await book(db, id, user);
    await assert.rejects(book(db, id, user), { code: "23505" });
    await assert.rejects(book(db, id, user, "waitlisted"), { code: "23505" });
    await db.query("update public.bookings set status = 'cancelled' where id = $1", [original.id]);
    await book(db, id, user);
    const { rows: history } = await db.query("select status from public.bookings where opportunity_id = $1", [id]);
    assert.deepEqual(history.map((row) => row.status).sort(), ["booked", "cancelled"]);
  });

  await t.test("reactivation and moving a booking cannot overfill an opportunity", async () => {
    const id = await opportunity();
    const other = await opportunity();
    const { rows: [cancelled] } = await book(db, id, randomUUID(), "cancelled");
    const { rows: [waitlisted] } = await book(db, id, randomUUID(), "waitlisted");
    await book(db, id);
    const { rows: [moving] } = await book(db, other);
    for (const booking of [cancelled, waitlisted]) {
      await assert.rejects(db.query("update public.bookings set status = 'booked' where id = $1", [booking.id]), /This opportunity is full/);
    }
    await assert.rejects(db.query("update public.bookings set opportunity_id = $1 where id = $2", [id, moving.id]), /This opportunity is full/);
    await db.query("update public.bookings set status = 'cancelled' where id = $1", [moving.id]);
  });

  await t.test("unavailable opportunities fail without persisting bookings", async () => {
    const id = await opportunity(1, "draft");
    await assert.rejects(book(db, id), /Only published opportunities/);
    await db.query("update public.opportunities set status = 'published', is_deleted = true where id = $1", [id]);
    await assert.rejects(book(db, id), /no longer available/);
    await db.query("update public.opportunities set is_deleted = false, start_at = now() - interval '1 day' where id = $1", [id]);
    await assert.rejects(book(db, id), /already started/);
    const { rows: counts } = await db.query("select count(*)::int as count from public.bookings where opportunity_id = $1", [id]);
    assert.equal(counts[0].count, 0);
  });
});
