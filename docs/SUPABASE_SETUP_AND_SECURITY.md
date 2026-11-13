# Supabase setup and security guide

This document captures the hardened account and database model for GIGI COLLECTION. It is a controlled bootstrap guide and review document. It does not authorize any live database changes or role assignments.

## Scope

This project is designed around exactly two authorised accounts:

- One Developer / Super Admin
- One Business Owner

The browser is never trusted for privileged authorization. All trusted access checks should live in Supabase Auth, Postgres RLS, and database-side trigger functions.

## Local environment and repository hygiene

- Keep local environment values in a local-only file such as `.env.local`.
- Do not commit real secrets.
- Keep `.env.example` tracked as a placeholder file only.
- Ensure `.gitignore` excludes `.env`, `.env.*`, and `.env.local`.
- Never print or log credentials in application code, terminal output, or support reports.

## Required database setup order

Apply migrations in this order for a fresh project:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_catalog_schema.sql`
3. `supabase/migrations/003_authorized_bootstrap.sql`
4. `supabase/migrations/004_security_privileges.sql`
5. `supabase/migrations/006_customer_profile_and_permissions_fix.sql`

The file `supabase/migrations/005_authorized_admin_bootstrap.sql` is a reusable bootstrap template only. It is not part of the schema migration sequence and should not be run as a standard migration.

## Secure provisioning flow

Do not permit public registration for the privileged developer and owner accounts. Use the Supabase Dashboard for Auth account creation and the SQL Editor for the trusted database-side bootstrap steps.

### Important runtime testing boundary

The SQL Editor and the frontend website are different environments.

- SQL Editor tests validate database behavior. They are not proof that a browser user is logged in.
- `auth.uid()` is only meaningful inside an authenticated session. It is not a substitute for a logged-in website user when you are running plain SQL in the SQL Editor.
- The application routes already defined in the frontend are the public customer flow and the protected dashboard flow under `/gc-portal`, including `/gc-portal/login`, `/gc-portal/signup`, `/gc-portal/verify-otp`, and the dashboard routes such as `/gc-portal/overview`.
- The frontend resolves a signed-in authorized admin session to the dashboard route, and the database remains the authority for access control.

### Step 1 — Create the first developer Auth account

- Open the Supabase Dashboard.
- Go to Authentication > Users.
- Create the developer account using the real developer email and secure password.
- Keep that account separate from the customer signup flow.
- Confirm that the row exists in `auth.users`.
- Do not assume the system profile row is present until you verify it.

### Step 2 — Confirm the profile row exists

The trigger in the profile migration creates the matching row in `public.profiles` after an auth user insert unless the row already exists.

Run this in the SQL Editor:

```sql
select id, email, username, role, created_at
from public.profiles
where email = 'developer@example.com';
```

Expected result:

- the developer profile row exists
- the profile is linked to the correct `auth.users.id`
- the role is initially `customer` unless the trusted bootstrap has already assigned developer access

### Step 3 — Execute the trusted bootstrap function from the SQL Editor

This step must be executed in the SQL Editor as the trusted database-owner/admin context, not from a browser session.

```sql
select public.bootstrap_first_developer(
  (select id from public.profiles where email = 'developer@example.com')
);
```

This function enforces:

- the caller is the trusted database owner/admin context,
- the first developer bootstrap runs only once,
- no public user can self-promote to developer,
- the lock prevents race conditions during simultaneous bootstrap attempts.

### Step 4 — Verify the developer role assignment

After the bootstrap function runs, confirm the role in the SQL Editor:

```sql
select id, email, username, role
from public.profiles
where email = 'developer@example.com';
```

Expected result:

- `role = 'developer'`
- exactly one developer account exists

### Step 5 — Sign in as the developer in the application

Use the existing website login route in the app, not a SQL Editor session.

- Open the app and go to `/gc-portal/login`.
- Sign in with the developer email and password.
- The frontend resolves an authorized admin session to the dashboard route.
- A real authenticated developer JWT is now present in the browser session.

### Step 6 — Create the owner Auth account

- In the Supabase Dashboard, create the owner Auth account.
- Use the dedicated owner account email and secure password.
- Confirm the `auth.users` row exists.

### Step 7 — Confirm the owner profile exists

```sql
select id, email, username, role
from public.profiles
where email = 'owner@example.com';
```

Expected result:

- a profile row exists for the owner account
- the row is linked to the correct `auth.users.id`
- the role is not yet privileged unless the trusted flow has assigned it

### Step 8 — Provision the owner through the authenticated developer process

This is not a SQL Editor-only bootstrap. It must be executed as a real authenticated developer request, using the developer JWT through the app or an authenticated API call.

```sql
select public.assign_authorized_role(
  (select id from public.profiles where email = 'owner@example.com'),
  'owner'
);
```

This function enforces:

- only an authenticated developer can call it,
- the caller cannot assign their own role,
- there can be only one owner,
- direct client-side updates are rejected,
- a transaction lock prevents concurrent bypass attempts.

### Step 9 — Verify the final authorized state

```sql
select * from public.profiles order by role, email;
select * from public.authorized_account_status();
```

Expected result:

- one row with role `developer`
- one row with role `owner`
- `bootstrap_complete = true`

### Step 10 — It is intentionally not re-opened

After both roles are assigned, the system remains in the two-account model. Do not reopen public registration for privileged roles. Do not expose bootstrapping to the storefront.

## Security model

### Profile table

`public.profiles` stores the relationship between a Supabase Auth user and the application role model. It is keyed by `auth.users.id` and linked by a foreign key.

### Trusted role checks

Roles are not trusted from the frontend. The app reads role information from the profile record after a real session is established.

### Trigger enforcement

The database ensures:

- a maximum of 2 total authorised profiles,
- no more than 1 developer,
- no more than 1 owner,
- direct role changes are blocked unless the trusted admin function executes in a privileged database-definer context,
- profile identity is immutable,
- a user cannot change their own role.

### Row level security

The profile table RLS is intentionally strict:

- authenticated users read their own profile,
- developers can read all profiles,
- developers can update non-role profile metadata only,
- client-side direct insert and delete are denied,
- users cannot change their role via direct update,
- unauthenticated users cannot see protected profile rows.

### Catalog RLS

Public read access is allowed for storefront browsing, while writes are restricted to authenticated authorized admins.

## Concurrency protection

The two-account enforcement uses `pg_advisory_xact_lock(hashtext('gigi_authorized_accounts'))` in the account-limit trigger and the trusted role-assignment function. This serializes competing transactions and prevents simultaneous sign-up attempts from bypassing the limit.

The design is intentionally database-side. It does not rely on hidden routes, browser checks, or local storage.

## SQL Editor tests versus authenticated application tests

Use the correct environment for each test.

### A. SQL Editor tests

These tests validate the database itself.

Run them in the Supabase SQL Editor:

- schema and migration verification
- table, index, trigger, function and RLS inspection
- first developer bootstrap using the trusted DB-owner/admin context
- verification of the resulting developer profile
- check that `public.profiles` contains the expected rows and roles

Example checks:

```sql
select id, email, username, role from public.profiles order by role, email;
select * from public.authorized_account_status();
```

These results prove the database state, not website authentication.

### B. Authenticated application and API tests

These tests validate real browser and authenticated-session behavior.

Run them through the application UI or an authenticated API request with a real JWT:

- customer registration and login
- developer login
- owner login
- `assign_authorized_role()` with a genuine authenticated developer JWT
- direct profile role-escalation attempts
- RLS enforcement for each role

These must be done with real user sessions and should not be inferred from SQL Editor execution alone.

### Test matrix

| Test | Where to execute | Required account or role | Expected result | What it proves |
| --- | --- | --- | --- | --- |
| Bootstrap trusted developer account | SQL Editor with trusted DB-owner/admin context | Database administrator | `bootstrap_first_developer()` succeeds once | The first developer bootstrap works without client-side bypass |
| Verify developer profile row | SQL Editor | Database admin | Profile row exists and `role = 'developer'` | The database-side bootstrap created the required account state |
| Owner provisioning by developer | Authenticated app/API with developer JWT | Developer | `assign_authorized_role()` succeeds | The trusted developer-authenticated path works |
| Direct customer role update | Authenticated app/API as customer | Customer | Update fails | Customers cannot escalate themselves |
| Direct owner role update | Authenticated app/API as owner | Owner | Update fails | Owners cannot create privileged role changes |
| Duplicate developer attempt | SQL Editor or app path | Database admin or developer | Rejected | Second developer creation is prevented |
| Duplicate owner attempt | SQL Editor or app path | Developer | Rejected | Single-owner rule is enforced |
| Unauthenticated storefront access | Browser or API | Visitor | Public read access allowed, protected admin routes denied | Public catalog remains open while admin controls stay protected |

### Required field validation and proof points

For every runtime test, record:

- where it was executed:
  - Supabase Dashboard,
  - SQL Editor,
  - VS Code terminal,
  - browser UI,
  - or authenticated API
- which account or role was used
- expected result
- actual result
- what the result proves about the system

Do not treat a SQL Editor query executed as `postgres` as evidence that a website user is authenticated.
Do not use `auth.uid()` in SQL Editor checks as if it were a logged-in browser session.

## Manual verification checklist

After the trusted bootstrap and owner provisioning steps are complete, verify the following with a live disposable project:

- developer login succeeds in the app
- owner login succeeds in the app
- developer can access the admin dashboard route under `/gc-portal`
- owner can access the permitted owner area
- developer cannot assign themselves another role
- owner cannot create a third account or escalate privileges
- unauthenticated visitors cannot access protected admin data
- direct API or SQL attempts by non-authorised users fail

## Testing plan

### Local tests

The following checks are local to the project and can be run without a live database:

- lint pass
- build pass
- frontend route guard evaluation for unauthenticated access
- no credential leakage in source or generated output

### Disposable project runtime tests

The following checks require a separate disposable Supabase project and actual runtime execution:

- developer bootstrap through the SQL Editor and trusted DB-owner context
- developer sign-in through the app
- owner creation and provisioning through the authenticated developer flow
- direct role escalation rejection for customer and owner sessions
- duplicate developer and owner prevention
- RLS enforcement for protected profile and dashboard data
- owner and developer route access verification
- concurrent account provisioning checks under parallel requests

## Security limitations and remaining considerations

- The browser still exposes only the public publishable key; this is intentional.
- The real database setup has to happen in the live Supabase project, not in a local workspace.
- If a new admin flow is later needed, it should be implemented as a secure backend or SQL-admin function rather than from the browser.
- Do not add public registration to the storefront. This project is intentionally restricted to its two authorised accounts.

## Summary

The hardened approach keeps the app storefront public while protecting the admin layer with trusted Supabase auth, database-side role enforcement, and transaction-safe account limits. No hidden route or browser-only rule should be treated as the final authority.
