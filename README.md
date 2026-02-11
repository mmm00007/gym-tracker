# Iron Tracker — AI-Powered Gym Log

Mobile-first gym tracker with AI machine identification and smart recommendations.

## Architecture

```
┌─────────────────────┐     ┌──────────────────┐     ┌──────────────┐
│  React SPA          │────▶│  FastAPI Backend  │────▶│  Anthropic   │
│  (Netlify)          │     │  (Render)         │     │  Claude API  │
│                     │     └──────────────────┘     └──────────────┘
│  - All UI           │
│  - Direct DB access │────▶┌──────────────────┐
│  - Auth             │     │  Supabase        │
└─────────────────────┘     │  - PostgreSQL    │
                            │  - Auth + RLS    │
                            └──────────────────┘
```

- **Frontend** (Netlify) → all UI, auth, CRUD via Supabase JS client
- **Backend** (Render) → lightweight Anthropic API proxy (keeps key secret)
- **Database** (Supabase) → PostgreSQL + auth + row-level security

## Setup

### 1. Supabase

1. Create project at [supabase.com](https://supabase.com)
2. **SQL Editor** → paste and run `supabase_schema.sql`
3. **Authentication → Settings** → enable Email provider
4. Note your **Project URL** and **Anon public key** (Settings → API)

### 2. Backend (Render)

1. New **Web Service** on [render.com](https://render.com)
2. Connect repo or upload `backend/`
3. Settings:
   - **Runtime**: Python
   - **Build**: `pip install -r requirements.txt`
   - **Start**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Root Directory**: `backend`
4. Env vars:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ALLOWED_ORIGINS=https://your-app.netlify.app
   SET_CENTRIC_LOGGING=true
   LIBRARY_SCREEN_ENABLED=true
   ANALYSIS_ON_DEMAND_ONLY=true
   SUPABASE_URL=https://abc123.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   CRON_SHARED_SECRET=super-secret
   ```

### 3. Frontend (Netlify)

1. New site on [netlify.com](https://netlify.com), connect repo
2. Build settings:
   - **Build command**: `npm run build`
   - **Publish directory**: `frontend/dist`
   - **Base directory**: `frontend`
3. Env vars:
   ```
   VITE_SUPABASE_URL=https://abc123.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   VITE_API_URL=https://gym-tracker-api.onrender.com
   VITE_SET_CENTRIC_LOGGING=true
   VITE_LIBRARY_SCREEN_ENABLED=true
   VITE_ANALYSIS_ON_DEMAND_ONLY=true
   ```

### 4. Update CORS

Update Render's `ALLOWED_ORIGINS` to your Netlify **site origin** (scheme + host only, no path), e.g. `https://your-app.netlify.app`.

**Troubleshooting**
- If Render logs show `OPTIONS /api/health` returning `400`, the browser CORS preflight is being rejected. Double-check that `ALLOWED_ORIGINS` is set to the Netlify site origin (not the Render API URL) and redeploy the backend.

## Local Development

Use `frontend/.env.phase-complete` as a smoke-test profile where all phase-complete feature flags are ON by default.

```bash
# Backend
cd backend
pip install -r requirements.txt
ANTHROPIC_API_KEY=sk-ant-... ALLOWED_ORIGINS=http://localhost:5173 uvicorn main:app --reload

# Frontend (new terminal)
cd frontend
npm install
# Create frontend/.env.local with VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL
npm run dev
```

## Stabilization Contract

Phase 0 contract lock is documented in [`docs/data-contract-lock.md`](docs/data-contract-lock.md).

## Features

- 📸 AI Machine ID — photo → Claude → exercise, muscles, form tips
- 🗄 Machine Library — save & reuse, edit all fields
- ⚡ Fast Set Logging — big sliders + quick-adjust for sweaty hands
- ⏱ Auto Rest Timer — counts after each set, rest time saved
- 📊 AI Session Insights — Claude analyzes workout + history (token-capped, not session-capped)
- 💪 Soreness Tracking — prompted 1-3 days post-workout, fed into AI
- 🔐 Per-user auth with row-level security

## Database Schema

| Table | Purpose |
|-------|---------|
| `machines` | Gym machine library per user |
| `sessions` | Legacy/historical session records (non-authoritative in Phase 1) |
| `sets` | Individual sets (reps, weight, rest, optional duration) |
| `soreness_reports` | Post-session muscle soreness (0-4 scale) |
| `recommendation_scopes` | Explicit scope metadata for recommendation generation |
| `analysis_reports` | Persisted recommendation and weekly trend outputs |

## Cost

| Layer | Tech | Cost |
|-------|------|------|
| Frontend | React + Vite | Netlify free tier |
| Backend | FastAPI | Render free ($7/mo to avoid cold starts) |
| Database | Supabase | Free tier (500MB) |
| AI | Claude Sonnet | ~$0.01-0.05 per session |
