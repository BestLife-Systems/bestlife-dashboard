"""
Shared dependencies for BestLife Hub backend.
Config, logging, Supabase helpers, auth middleware.
"""
import os
import logging

import httpx
from fastapi import HTTPException, Request

# ── Config ──
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://jvtwvrqityxzcnsbrilk.supabase.co")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "") or os.environ.get("CLAUDE_API_KEY", "")

# ── Logging ──
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("bestlife")


# ── Supabase helpers ──
def sb_headers(service=False):
    """Headers for Supabase REST API calls."""
    key = SUPABASE_SERVICE_KEY if service else SUPABASE_ANON_KEY
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


async def sb_request(method, path, data=None, params=None, service=True):
    """Make a request to Supabase REST API."""
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    headers = sb_headers(service=service)
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.request(method, url, json=data, params=params, headers=headers)
        if resp.status_code >= 400:
            logger.error(f"Supabase error {resp.status_code}: {resp.text}")
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        if resp.status_code == 204:
            return None
        return resp.json()


# ── Auth middleware ──
async def verify_token(request: Request) -> dict:
    """Verify Supabase JWT and return user profile."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization token")

    token = auth.split(" ", 1)[1]

    # Verify with Supabase Auth
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "apikey": SUPABASE_ANON_KEY or SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {token}",
            },
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid token")
        auth_user = resp.json()

    # Get user profile from users table
    users = await sb_request("GET", "users", params={"auth_id": f"eq.{auth_user['id']}", "select": "*"})
    if not users:
        raise HTTPException(status_code=403, detail="User profile not found")

    return users[0]


async def require_admin(request: Request) -> dict:
    """Verify user is admin."""
    profile = await verify_token(request)
    if profile.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return profile
