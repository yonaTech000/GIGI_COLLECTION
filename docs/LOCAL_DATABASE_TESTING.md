# Local disposable database testing

This project is not to be tested against the live Supabase project.

Use a disposable local PostgreSQL environment only.

## Option 1: local Postgres via Docker

The workspace includes a disposable Docker Compose configuration at:

- `supabase/local/docker-compose.yml`

### Start the local database

```bash
docker compose -f supabase/local/docker-compose.yml up -d
```

### Connect

```bash
psql "postgresql://postgres:postgres@127.0.0.1:5432/gigi_local"
```

### Apply SQL migrations

Apply the migrations in order:

```sql
\i supabase/migrations/001_initial_schema.sql
\i supabase/migrations/002_catalog_schema.sql
\i supabase/migrations/003_authorized_bootstrap.sql
\i supabase/migrations/004_security_privileges.sql
```

Then run the local security tests:

```sql
\i supabase/tests/local_security_tests.sql
```

## Option 2: local Supabase stack

If Docker is available and the Supabase CLI is installed, a local Supabase environment may also be used:

```bash
npx supabase init
npx supabase start
```

This is not executed in this environment because Docker/PostgreSQL tooling is unavailable here.

## Environment note

The current execution environment does not contain `docker`, `psql`, or `supabase` tooling. That prevented live execution from this machine.

The test scripts and migration files remain in the repo for a safe local-only validation cycle before any live project deployment.
