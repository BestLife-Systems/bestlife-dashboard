# BestLife Hub — Developer Context

## Company Info
- **Official name**: BestLife Counseling Services (NOT "BestLife Behavioral Health")
- **Location**: Cape May Court House, NJ
- **Type**: ABA therapy practice
- **Product name**: BestLife Hub (internal operations dashboard)

## Architecture
- **Frontend**: React (Vite) — `frontend/`
- **Backend**: FastAPI (Python) — `backend/`
- **Database**: Supabase (Postgres + Auth)
- **Email**: SendGrid
- **SMS**: Twilio
- **Hosting**: Railway
- **AI**: Anthropic Claude (Betty assistant + KB content generation)

## Production URLs
- **App**: `https://bestlife-dashboard-production-bf81.up.railway.app`
- **Backend env vars**: `APP_URL`, `FRONTEND_URL` must point to production URL

## Email System
- Automated invoice reminders run via built-in scheduler (daily at 9 AM ET)
- Scheduler auto-opens pay periods and sends to ALL eligible users (payroll roles)
- Set `EMAIL_WHITELIST` env var to restrict email recipients during testing
- SendGrid sender: `frontdesk@bestlifenj.com`

## Key Gotcha: Supabase SITE_URL
- The welcome/login email uses Supabase's `generate_link` API
- The `action_link` returned redirects through Supabase auth
- Supabase SITE_URL in the dashboard MUST be set to the production URL
- If SITE_URL is still `http://localhost:5000`, login links will break
