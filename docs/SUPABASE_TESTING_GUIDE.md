# GIGI COLLECTION — Disposable Supabase Runtime Testing Guide

This document is for a completely separate, disposable Supabase project. It is not for your live project.

The purpose is to validate the database schema, auth flow, profile setup, role assignment, route protection, and RLS behavior before production deployment.

Important safety rules:
- Do not connect to the live Supabase project.
- Do not execute SQL in production.
- Do not expose service-role credentials in chat, code, or screenshots.
- Do not weaken RLS or role restrictions to make testing pass.
- Do not add sample products, fake prices, or fabricated customer data.

## 1. What has already been checked locally

The workspace has been reviewed and the codebase is in a safe static state for disposable testing.

Confirmed local checks:
- The project uses the browser-safe public Supabase URL and anon key only.
- Frontend auth configuration is in `src/config/supabase.js` and `src/config/auth.js`.
- Public customer signup is intentionally separate from the trusted admin bootstrap flow.
- The app is designed around two privileged roles: developer and owner.
- Public storefront reads remain public.
- The role model is enforced by database-side functions and RLS, not by hidden routes or frontend-only checks.
- The migration order is correct for a fresh disposable setup.
- The project passes local lint and build checks.

Pending verification:
- Database execution in a disposable Supabase runtime.
- Auth-user creation in Supabase Auth.
- Actual role assignment behavior.
- Actual RLS enforcement in a live database context.

## 2. Project preparation

Use a completely new Supabase project created only for testing.

Do not reuse the live project.

Recommended setup process:
1. In Supabase, click New project.
2. Pick a throwaway project name such as `gigi-collection-test`.
3. Choose a temporary organization or personal account that is not production.
4. Wait for the project to finish provisioning.
5. Open the project dashboard.

## 3. Get the project values

In the Supabase dashboard, go to:
- Project Settings
- API

Copy these values into your local environment file:
- Project URL
- Anon publishable key

Do not copy or store the service-role key in the frontend.

Do not paste secrets into chat.

## 4. Configure the local environment

In your local project folder, create a `.env.local` file if it does not already exist.

Use values like this:

```env
VITE_SUPABASE_URL=https://your-disposable-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_BUSINESS_WHATSAPP_NUMBER=254700000000
```

Be sure that:
- `.env.local` is not committed to Git.
- `.env.example` remains a placeholder-only file.
- No service-role key is added anywhere in the frontend app.
- The app does not silently run against an unintended project.

## 5. Migration execution order

Apply the migrations in this order in the Supabase SQL Editor for a fresh disposable project:

1. `001_initial_schema.sql`
2. `002_catalog_schema.sql`
3. `003_authorized_bootstrap.sql`
4. `004_security_privileges.sql`
5. `006_customer_profile_and_permissions_fix.sql`

Do not run `005_authorized_admin_bootstrap.sql` as part of the normal migration sequence unless you intentionally choose to use it as a separate manual admin template.

## 6. Verify the schema after migration

After running the migrations, validate the database objects.

In the SQL editor, run:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
```

You should see the expected public tables such as:
- profiles
- catalog_categories
- catalog_products

Then check the key functions:

```sql
select routine_name
from information_schema.routines
where routine_schema = 'public'
order by routine_name;
```

Look for:
- is_developer
- is_authorized_admin
- handle_new_user
- update_profiles_updated_at
- enforce_profile_account_limit
- enforce_profile_role_guard
- bootstrap_first_developer
- assign_authorized_role
- authorized_account_status

Check triggers:

```sql
select trigger_name, event_object_table
from information_schema.triggers
where event_object_schema = 'public'
order by event_object_table, trigger_name;
```

Expected important items:
- on_auth_user_created
- profiles_updated_at
- profiles_account_limit
- profiles_role_guard
- catalog_categories_updated_at
- catalog_products_updated_at

Check indexes and constraints:

```sql
select indexname, tablename
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;
```

Then confirm the role guard is still present.

## 7. Create the first developer account

This is done in the Supabase Dashboard, not in the app.

Steps:
1. Open Authentication > Users.
2. Click Add user.
3. Create a real developer account using a secure email and password.
4. Add any approved username metadata if needed.
5. Confirm the account appears in `auth.users`.

The app itself should not be used to create privileged users.

## 8. Bootstrap the first developer role

This is the trusted database-side step.

In the SQL editor, run:

```sql
select public.bootstrap_first_developer(
  (select id from public.profiles where email = 'developer@example.com')
);
```

This must be executed under a trusted DB-owner/admin context.

If the function rejects the call, check:
- the user exists in `public.profiles`
- the developer role does not already exist
- the caller is the trusted database/admin connection
- the migration was applied in the right order

## 9. Create the owner account and assign the owner role

Create the owner account in the Supabase dashboard first.

Then verify the profile row exists:

```sql
select * from public.profiles where email = 'owner@example.com';
```

Then assign the role from the developer session or trusted DB-owner context:

```sql
select public.assign_authorized_role(
  (select id from public.profiles where email = 'owner@example.com'),
  'owner'
);
```

Expected result:
- exactly one developer account in the database
- exactly one owner account in the database
- no more than two privileged profiles total

## 10. Verify the final authorized state

Run:

```sql
select * from public.profiles order by role, email;
select * from public.authorized_account_status();
```

Expected state:
- one developer
- one owner
- bootstrap_complete = true
- no additional privileged roles

## 11. Customer registration and login test

Customer sign-up must be a normal customer account flow, not an admin-bootstrap path.

In the app, test:
1. Go to the public sign-up flow.
2. Enter a valid phone number.
3. Choose a username.
4. Submit the phone OTP flow.
5. Verify the account is created with a customer profile role.

Then test login:
- sign in using the phone/username login flow
- confirm the customer profile is loaded
- confirm the session role is `customer`

Expected:
- customer can browse public products
- customer cannot change the developer or owner role
- customer cannot access developer-only controls

## 12. Developer and owner access testing

Expected permissions by identity:

### Unauthenticated visitor
- Read public product information: allowed
- Create customer profile: not allowed
- Create or edit products: not allowed
- Access developer or owner dashboard: not allowed
- Call privileged DB functions: not allowed

### Customer
- Read public product information: allowed
- Update own profile metadata: allowed in limited scope
- Create or edit products: not allowed
- Manage categories: not allowed
- Manage store settings: not allowed
- Assign privileged roles: not allowed
- Access developer-only settings: not allowed

### Owner
- Read public product information: allowed
- Manage categories: allowed
- Update inventory and product data: allowed
- Update store settings: allowed
- Access owner area: allowed
- Assign privileged roles: not allowed unless the trusted DB function is intentionally used in a privileged admin workflow
- Access developer-only controls: not allowed

### Developer
- Read public product information: allowed
- Manage product data: allowed
- Manage categories: allowed
- Manage store settings: allowed
- View profile data for authorized roles: allowed
- Assign owner or other authorized roles via trusted database procedure: allowed only in the secure database function path
- Call first-developer bootstrap function: not allowed from the regular app path

### Trusted database administrator
- Execute bootstrap and privileged admin functions: allowed
- Manage database object ownership: allowed
- Apply migrations: allowed
- Adjust production-sensitive state: allowed only in the disposable project

## 13. Frontend and database validation

The app should ensure route protection and database protection both exist.

Route hiding alone is not authorization.

Check that:
- unauthenticated users cannot access protected dashboards
- the database rejects unauthorized actions with policies and functions
- developer-only controls are hidden from customer views
- the owner and developer do not receive customer privileges by default

A UI-only button or route check is never enough. The database must enforce restrictions.

## 14. Common errors and troubleshooting

### Error: relation public.profiles does not exist
Cause:
- migrations were not applied in the correct order
- the schema is missing the profile table

Fix:
- apply the required migration sequence again in the disposable project

### Error: only one owner account is allowed
Cause:
- duplicate owner assignment was attempted
- an existing profile already holds the owner role

Fix:
- inspect the current `public.profiles` table
- revoke the duplicate assignment path in the database workflow

### Error: role changes are restricted to the trusted bootstrap functions
Cause:
- direct client-side role update attempted
- update was not done through the approved database function

Fix:
- use the secure role-assignment function
- do not bypass the trusted path

### Error: Supabase is not configured
Cause:
- `.env.local` is missing or invalid
- the app is pointed at an empty environment

Fix:
- add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- restart the local dev server

### Error: OTP not received or login fails
Cause:
- wrong phone formatting
- invalid OTP
- missing profile row
- app not connected to the intended project

Fix:
- confirm the project URL and anon key match the disposable test project
- confirm the profile row exists
- confirm the phone number format matches the expected normalization rules

## 15. Required manual actions in the Supabase Dashboard

These actions must be performed manually in the dashboard, not in code chat:

- Create the disposable project.
- Retrieve the project URL and anon key.
- Create the developer Auth account.
- Create the owner Auth account.
- Verify the `auth.users` rows.
- Run the required SQL migrations.
- Confirm tables, functions, policies, and triggers exist.
- Bootstrap the developer role using the trusted SQL function.
- Provision the owner account using the approved development path.
- Validate customer sign-up and login behavior.
- Validate protected dashboard access by role.

## 16. Local static checks already completed

These steps were completed in the local workspace without connecting to a live Supabase project:
- audit of current app configuration
- migration review and ordering validation
- local auth and role-flow review
- environment variable review
- lint verification
- production build verification

Current local result:
- `npm run lint` passed
- `npm run build` passed

This means the project is ready for disposable runtime testing but not yet runtime-validated against a live database.

## 17. What remains unverified until runtime testing

The following items require a disposable Supabase runtime test and have not been confirmed by live execution:
- actual database role assignment behavior
- actual RLS policy enforcement
- OTP sign-up flow in a real Supabase Auth project
- customer and admin login success under real project conditions
- protected dashboard access control under real session data
- concurrent bootstrap safety in a live transaction environment

## 18. Final note

The app is prepared for a controlled disposable runtime test, with the correct migration order and a secure admin bootstrap model.

No live Supabase modification is being performed here.

Before production deployment, this disposable project validation must be completed and any live database issues resolved in the non-production environment first.
