# DocuCraft — CV & Invoice Studio

## Stack
- Static `index.html` + `admin.html`
- Node.js + Express API
- Supabase Auth + PostgreSQL
- Stripe subscriptions

## Setup
1. Install Node.js 18+.
2. Run `npm install`.
3. Create a Supabase project.
4. Run `supabase/schema.sql` in Supabase SQL Editor.
5. Enable Google provider in Supabase Auth and add your site URL/redirect URL.
6. Copy `.env.example` to `.env` and add your Supabase and Stripe keys.
7. Put the same Supabase URL and anon key into the two HTML files where `YOUR_SUPABASE_URL` and `YOUR_SUPABASE_ANON_KEY` appear.
8. Configure Stripe prices and put their IDs in `.env`.
9. Create a Stripe webhook pointing to `/api/stripe/webhook`, using the webhook signing secret.
10. Run `npm run dev`.
11. Open `http://localhost:3000`.

## Admin
Set `ADMIN_EMAIL` to the email of the administrator. Open `/admin.html`.

## Security
Never expose `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, or `STRIPE_WEBHOOK_SECRET` in HTML or client-side JavaScript.
The included admin check is intentionally simple for a starter. For production, use a dedicated admin role/claim and audit logging.
