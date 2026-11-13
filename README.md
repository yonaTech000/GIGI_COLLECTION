# GIGI COLLECTION

This project is a Vite + React storefront with a protected admin portal. Phase 1 adds the real Supabase backend and secure admin authentication while preserving the existing storefront and styling.

## Required environment variables

Create a local `.env` file in the project root based on `.env.example`:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_BUSINESS_WHATSAPP_NUMBER=254700000000
```

Important:
- Do not place the Supabase service-role key in frontend code.
- Only the URL and anon/public key belong in the browser environment.
- Keep the service-role key in a secure server-side environment if you later add backend automation.

## Supabase setup

1. Create a Supabase project.
2. Open the project SQL editor.
3. Apply the migration in `supabase/migrations/001_initial_schema.sql`.
4. In Supabase Auth, create the two authorised accounts:
   - developer email account
   - business owner email account
5. After both accounts are created, update the `public.profiles` table to assign the roles:

```sql
update public.profiles set role = 'developer' where email = 'your-developer-email@example.com';
update public.profiles set role = 'owner' where email = 'your-owner-email@example.com';
```

6. Ensure no additional account registrations are enabled in the project configuration.

## Security model

- Frontend login is performed through `@supabase/supabase-js` via Supabase Auth.
- The app only trusts a profile record from the database for role assignment.
- RLS policies restrict profile access to the authenticated user or the developer.
- The database enforces the two-account limit and blocks role escalation.
- Public registration is intentionally disabled for the admin flow.

## Local development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run lint
npm run build
```

The project build should pass only when the required environment variables are present and valid.

## Manual follow-up required

The live authentication tests for developer login, owner login, and role enforcement require the actual Supabase project to be configured and the final two accounts created in the Supabase dashboard.
