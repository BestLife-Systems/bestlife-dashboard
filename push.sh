#!/bin/bash
# BestLife Hub - Push to GitHub
# Run from the bestlife-dashboard directory

set -e

echo "🚀 Pushing BestLife Hub Phase 1 to GitHub..."

# Check if git is initialized
if [ ! -d ".git" ]; then
  echo "Initializing git repo..."
  git init
  git remote add origin https://github.com/BestLife-Systems/bestlife-dashboard.git
fi

# Stage all files
git add -A

# Commit
git commit -m "Phase 1: Multi-user platform with Supabase

- Supabase Auth (email/password login, forgot password)
- Role-based routing (Admin, Clinical Leader, Therapist)
- Admin: Analytics, Payroll, User Management, Settings
- Therapist: Personal Stats, Invoice Submission, PTO Balances
- Clinical Leader: Supervisee Analytics
- Knowledge Base placeholder
- TherapyNotes upload → Supabase transactions
- LTV + Client Engagement analytics preserved
- Mobile responsive dark theme
- Railway deployment ready"

# Push
git push origin main --force

echo "✅ Pushed to GitHub. Railway should auto-deploy."
echo ""
echo "📋 Next steps:"
echo "1. Set environment variables in Railway (see .env.example)"
echo "2. Run supabase/schema.sql in Supabase SQL Editor (if not already done)"
echo "3. Create admin user (see supabase/seed.sql)"
