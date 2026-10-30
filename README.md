This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Technical Documentation

See the [technical stack and process flow determination](.github/modernize/assessment/engines/facts/business-workflows.md) for the as-built architecture, role-based workflows, sequence diagrams, business rules, and open verification items.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Transactional bookings

Apply `supabase/migrations/20261029000000_transactional_bookings.sql` through
the normal Supabase migration deployment before relying on booking concurrency guarantees.
The app's equivalent of `(shift_id, user_id)` is `(opportunity_id, volunteer_id)`.
The database locks the opportunity row with `SELECT ... FOR UPDATE`, then checks
eligibility and counts booked seats within the insert/update transaction.
Booking writes must use PostgreSQL's default `READ COMMITTED` isolation so a waiting
transaction sees the preceding transaction's committed bookings.
Updates that reactivate or move a booking are checked too.

The partial unique index rejects duplicate active (`booked` or `waitlisted`)
registrations. Cancelled history is retained and a volunteer can book again.
Waitlisted rows do not consume booked seats. Existing duplicate active registrations
must be resolved before deploying; the migration fails rather than deleting history.
Supabase authentication/RLS and the existing post-booking notifications remain in place.

`npm test` includes PostgreSQL integration tests when `BOOKING_TEST_DATABASE_URL`
points to an **empty, disposable test database**, never the application database.
They create and remove fixture tables in `public`; without that variable the
database suite is explicitly skipped. Tests cover final-seat contention, independent
opportunities, rollback, duplicates, cancellation/rebooking, and status transitions.

## Transactional capacity adjustments

Apply `supabase/migrations/20261029000003_transactional_capacity.sql` after the
transactional-bookings migration, and deploy the application changes. Opportunity
capacity updates hold the same row lock as booking creation. A database trigger
counts confirmed (`booked`) reservations after acquiring that lock and rejects
reductions below that count, rolling back the entire opportunity edit. Capacity
must be a positive integer. Waitlisted, cancelled, completed, and no-show rows do
not consume confirmed seats; no reservations are automatically cancelled or moved.
Increases make additional seats available immediately after commit.

Successful opportunity edits, bookings, and cancellations invalidate public
listing/detail, organizer edit/participants/dashboard/reports, volunteer
bookings/dashboard, and admin bookings/dashboard paths immediately after the
confirmed write, before notification work. Rejected writes do not invalidate.
This is cache invalidation, not a realtime push to other open browser tabs.
Direct database writes enforce capacity integrity but do not invoke Next.js cache
invalidation; public listing/detail requests still use no-store reads.

The disposable PostgreSQL booking suite covers both lock orders for concurrent
booking/reduction, rejected reductions, increases, rollback, and independent rows.
Action tests cover validation, rejected writes, cancellation, and invalidation
ordering even when notifications fail.

## Object authorization and tenant boundaries

Deploy `supabase/migrations/20261029000001_tenant_authorization.sql` after the
transactional-bookings migration. Both the application changes and the new database
migration are required: server actions/API handlers use privileged Prisma connections
for some operations, while Supabase RLS protects direct client requests.
Check remote migration history and a dry run before deployment; do not use
`--include-all` to apply unrelated older migrations without reviewing them.

- Opportunities are shifts, bookings are reservations, and organizations are tenants.
  Active nonprofits manage only opportunities belonging to their organization,
  regardless of `created_by`. Event participants, reports, attendance, hours, and
  signup counts use that same ownership boundary.
- Active volunteers may reserve published, nondeleted opportunities across organizations,
  view their own reservation history, and cancel only their own booked/waitlisted
  reservations. They cannot change reservation relationships or organizer-controlled
  hours. Rebooking after cancellation creates a new history row.
- Public discovery still exposes published, nondeleted opportunities and their
  skills/causes. Private drafts and reservation details are not public.
- Active administrators retain explicit platform-wide read/management privileges.
  End-user writes cannot reassign organization ownership, opportunity tenancy/creator,
  or reservation identity/volunteer/opportunity, including administrator writes.
  Any legitimate transfer requires a separately authorized trusted-backend workflow.
- Ordinary profile updates cannot change roles, activation, or approval attributes.
  Administrators can still manage those attributes. Disabled users cannot use
  private reservation or organizer operations.
- Opportunity notifications run only after an owned update returns a persisted row;
  zero-row/denied updates and cancellations are reported as failures, not successes.

The authorization migration replaces existing opportunity, booking, and association
policies so permissive legacy policies cannot override the new checks. It does not
change the transactional capacity trigger. Attendance/hour tables retain their
existing default-deny direct-client RLS; their application APIs authorize access.
Trusted backend connections bypass end-user field guards and must never be exposed
to clients. New privileged operations must use active-role and object-scope checks.

`npm test` includes authorization unit/handler tests. Set `TENANT_TEST_DATABASE_URL`
to a **separate empty, disposable PostgreSQL database** to run real RLS/trigger tests
for two tenants, two volunteers, anonymous/inactive users, admins, and booking
contention with RLS enabled. It must not be the same database as
`BOOKING_TEST_DATABASE_URL`; the suites run concurrently and create fixture objects.
The RLS suite needs a test database owner able to create the `anon`/`authenticated`
test roles. Database suites are explicitly skipped when their variables are absent.

## Public search visibility and cache freshness

There is no asynchronous search index: keyword/filter search and public detail pages
query the live `public_opportunity_listings` Supabase view. Its database predicate
includes only `status = 'published'` and `is_deleted = false`, even for organizers
and admins who can otherwise read private opportunities through RLS. Draft, closed,
archived, and deleted opportunities are not public. Approval status is intentionally
not a visibility gate.

Public listing/detail requests explicitly use `cache: 'no-store'`, so fresh requests
observe committed publication changes, including changes made directly in Supabase,
without waiting for a background index sync or cache TTL. Missing/nonpublic detail
URLs return not found; database lookup failures surface as errors instead.

Successful opportunity creation, updates (including publish/unpublish/close), and
archive actions immediately invalidate the search listing, specific public detail,
nonprofit dashboard/edit/participants/reports, volunteer bookings/dashboard, and
admin dashboard/bookings. Invalidation happens
after a confirmed write and before notification/association side effects, so a failed
notification cannot leave a successfully moderated opportunity in those caches.
Rejected or zero-row writes do not invalidate anything.

This refreshes server caches and the mutating client's navigation cache; it does not
push updates into HTML already displayed in another browser tab. Those tabs see the
current state on their next server navigation or reload. External search engines and
independently configured CDN caches are outside the application's cache control.
No database migration or search-service configuration is needed for this change;
deploy the application code.

## Password changes and global sign-out

The password reset and authenticated password-change flow both use `updatePassword`.
After Supabase accepts the new password, the action explicitly calls
`auth.signOut({ scope: 'global' })` to revoke refresh sessions on all devices,
including the current recovery/login session. It checks the result before reporting
success, invalidates the root layout's cached authenticated UI, and requires a new
login. Normal sign-out also preserves the existing global scope explicitly and
surfaces errors instead of claiming success.

Password-change success and session-revocation success are separate outcomes.
If global sign-out fails, the password is already changed: the user sees an explicit
warning and must log in with the new password and retry sign-out. The installed
Supabase SDK removes its current local session even when the logout endpoint returns
a non-authentication error; remote revocation must not be inferred from local cookie
cleanup alone. Invalid/expired-session logout responses are treated as signed out by
the SDK.

This implements refresh-token invalidation, **not immediate access-JWT revocation**.
Previously issued access tokens can remain valid until their configured expiry.
Already-open remote tabs do not receive a cross-device browser event; they lose the
ability to refresh a revoked session. No custom auth-schema mutation, service-role key,
or database migration is required. There is currently no email/phone-change UI; any
future credential-change action must apply this same global-sign-out/error-handling
contract after its credential update succeeds.

## CSRF, CORS, and login throttling

The Next.js proxy checks origins before session refresh or application handlers.
Unsafe requests (`POST`, `PUT`, `PATCH`, `DELETE`, etc.), including Server Actions,
must include an exact same-origin `Origin` or, if absent, same-origin `Referer`.
Opaque `null` origins, missing provenance, cross-site Fetch Metadata, and sibling
subdomains are rejected with HTTP 403. Next.js's built-in Server Action origin
checks remain enabled; no wildcard `serverActions.allowedOrigins` is configured.
The proxy covers API paths even when they end in an image-like extension.

Cookie-authenticated APIs are same-origin only, including reads and preflights:
cross-origin API requests are rejected and no `Access-Control-Allow-Origin` or
credential-sharing headers are granted. Same-origin OPTIONS requests return 204.
Top-level GET pages and Supabase's GET auth callback remain reachable from external
navigation. Non-browser mutation clients must provide a matching origin; there is
no bearer-token exemption for these cookie-authenticated endpoints.

Set `NEXT_PUBLIC_SITE_URL` to the canonical deployment URL (scheme, hostname and
port must match the browser origin). Without it, checks use the request protocol
and browser-facing `Host`. The ingress must validate the external host/protocol and must not forward
untrusted host overrides; spoofable forwarded IP/origin headers are not used to
relax the checks. Alternate browser frontends are intentionally not allowlisted.

Before deploying the login changes, apply
`supabase/migrations/20261029000002_login_rate_limits.sql`.
The server's login action atomically consumes a PostgreSQL-backed allowance of
**10 attempts per normalized email per 15-minute window**, shared across app
instances. Attempt 11 and later are denied before Supabase authentication, with a
retry countdown. Successful and failed attempts both count; successes do not reset
the counter. Exhaustion is independent of whether the account exists. Expired
windows reset atomically and old keys are cleaned in bounded batches.

Counter keys contain SHA-256 digests, not plaintext emails (these hashes are not
encryption and should still be treated as sensitive). The table has default-deny
RLS and no ordinary-client privileges. The backend database role requires access.
If the limiter is unavailable or the migration is missing, login fails closed with
an explicit temporary-unavailability error. Other auth flows remain usable.
Server Action submissions use redirects for limit errors, not an HTTP 429 API.

This account-level limiter can temporarily deny a legitimate user after attempts
against their email. It is not IP-based and does not rely on spoofable
`X-Forwarded-For`. Keep upstream Supabase Auth rate limits/CAPTCHA and ingress
abuse limits configured: direct calls to Supabase's separate Auth endpoint do not
pass through this application's limiter or CORS policy. Local
`supabase/config.toml` is not proof of hosted Auth settings.

`npm test` covers origin/CSRF policy, proxy responses and fail-closed login paths.
Set `LOGIN_TEST_DATABASE_URL` to a separate empty disposable PostgreSQL database
to test real concurrent login counters, normalization, window expiry, and denied
client access. Do not reuse the booking/tenant test databases while those suites run.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
