import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

const connectionString = process.env.ATTENDANCE_TEST_DATABASE_URL;

test("attendance confirmation constraints and mutation privileges in PostgreSQL", {
  skip: !connectionString && "Set ATTENDANCE_TEST_DATABASE_URL to an empty, disposable PostgreSQL database.",
}, async (t) => {
  const pool = new pg.Pool({ connectionString, max: 2, connectionTimeoutMillis: 5000 });
  let fixtureCreated = false;
  t.after(async () => {
    try {
      if (fixtureCreated) await pool.query("drop table public.attendance_logs");
    } finally {
      await pool.end();
    }
  });
  const { rows } = await pool.query("select to_regclass('public.attendance_logs') as attendance");
  const { rows: tables } = await pool.query("select tablename from pg_tables where schemaname = 'public'");
  assert.equal(rows[0].attendance, null, "Never run on an application database");
  assert.equal(tables.length, 0, "An empty disposable database is required");
  await pool.query(`
    do $roles$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    end $roles$;
    create table public.attendance_logs (
      id uuid primary key default gen_random_uuid(), status text not null,
      check_in_at timestamptz, check_out_at timestamptz
    );
    grant usage on schema public to anon, authenticated;
    grant select, insert, update, delete on public.attendance_logs to anon, authenticated;
  `);
  fixtureCreated = true;
  await pool.query(await readFile(new URL("../migrations/20261109000001_confirmed_attendance.sql", import.meta.url), "utf8"));
  const { rows: [pending] } = await pool.query(`
    insert into public.attendance_logs (status, check_in_at, check_out_at)
    values ('present','2026-10-16T09:00:00Z','2026-10-16T11:30:00Z') returning *
  `);
  assert.equal(pending.verified_at, null);
  assert.equal(pending.verified_by, null);
  const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  for (const query of [
    "update public.attendance_logs set verified_at = now() where id = $1",
    "update public.attendance_logs set status = 'absent', verified_at = now(), verified_by = $2 where id = $1",
    "update public.attendance_logs set check_out_at = null, verified_at = now(), verified_by = $2 where id = $1",
  ]) {
    await assert.rejects(pool.query(query, query.includes("$2") ? [pending.id, ownerId] : [pending.id]), (error) => error.code === "23514");
  }
  await pool.query("update public.attendance_logs set verified_at=now(), verified_by=$2 where id=$1", [pending.id, ownerId]);
  const result = await pool.query(`
    update public.attendance_logs set check_out_at = now()
    where id=$1 and check_out_at is null and verified_at is null returning *
  `, [pending.id]);
  assert.equal(result.rowCount, 0, "A volunteer transition cannot overwrite confirmed times");
  const { rows: privileges } = await pool.query(`
    select role_name, has_table_privilege(role_name, 'public.attendance_logs', 'INSERT') as can_insert,
      has_table_privilege(role_name, 'public.attendance_logs', 'UPDATE') as can_update,
      has_table_privilege(role_name, 'public.attendance_logs', 'DELETE') as can_delete
    from (values ('anon'), ('authenticated')) as roles(role_name)
  `);
  for (const role of privileges) {
    assert.equal(role.can_insert, false);
    assert.equal(role.can_update, false);
    assert.equal(role.can_delete, false);
  }
});
