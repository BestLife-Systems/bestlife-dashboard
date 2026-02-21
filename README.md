# BestLife Hub

Operations dashboard for BestLife therapy practice. Multi-user platform with role-based access, therapist analytics, invoice management, and PTO tracking.

## Live URL

**https://bestlife-dashboard-production-bf81.up.railway.app**

## Tech Stack

- **Frontend:** React 18 + Vite + React Router
- **Backend:** Python FastAPI
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth (email/password)
- **Hosting:** Railway

## Quick Start

### 1. Database Setup

Run the schema in Supabase SQL Editor:
```
supabase/schema.sql
```

Then create your first admin user:
1. Go to Supabase Dashboard → Authentication → Users → Add User
2. Enter admin email + password
3. Copy the auth UUID
4. Run the seed SQL (see `supabase/seed.sql`)

### 2. Environment Variables

Set in Railway (or `.env` for local dev):
```
SUPABASE_URL=https://jvtwvrqityxzcnsbrilk.supabase.co
SUPABASE_ANON_KEY=<your anon key>
SUPABASE_SERVICE_ROLE_KEY=<your service role key>
VITE_SUPABASE_URL=https://jvtwvrqityxzcnsbrilk.supabase.co
VITE_SUPABASE_ANON_KEY=<your anon key>
```

### 3. Local Development

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

### 4. Deploy

```bash
git add . && git commit -m "deploy" && git push
```
Railway auto-deploys from GitHub.

## User Roles

| Role | Access |
|------|--------|
| Admin | All features: analytics, payroll, user management, settings |
| Clinical Leader | Personal stats, supervisee analytics, invoices, time off |
| Therapist | Personal stats, invoice submission, time off balances |

## Architecture

```
bestlife-dashboard/
├── backend/
│   ├── main.py              # FastAPI + analytics engine
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Router + role-based navigation
│   │   ├── components/      # Layout, Modal, StatusBadge, ProtectedRoute
│   │   ├── hooks/           # useAuth (Supabase auth context)
│   │   ├── lib/             # supabase client, api helpers
│   │   └── pages/           # admin/, therapist/, clinical/, shared/
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── supabase/
│   ├── schema.sql           # Full DB schema with RLS
│   └── seed.sql             # Initial admin user setup
├── Dockerfile               # Multi-stage build
├── railway.toml
└── .env.example
```
