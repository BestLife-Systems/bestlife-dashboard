"""Auth / User Management — 3 endpoints (invite, cleanup, list users)."""
import httpx
from fastapi import APIRouter, Depends, HTTPException

from backend.deps import (
    SUPABASE_URL, SUPABASE_SERVICE_KEY,
    sb_request, require_admin, logger,
)
from backend.models import InviteUserRequest

router = APIRouter(prefix="/api")


@router.post("/admin/invite-user")
async def invite_user(req: InviteUserRequest, admin=Depends(require_admin)):
    """Create a new user via Supabase Admin API and add to users table."""
    import secrets

    temp_password = secrets.token_urlsafe(24)
    async with httpx.AsyncClient(timeout=15.0) as client:
        create_resp = await client.post(
            f"{SUPABASE_URL}/auth/v1/admin/users",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "email": req.email,
                "password": temp_password,
                "email_confirm": True,
                "user_metadata": {
                    "first_name": req.first_name,
                    "last_name": req.last_name,
                },
            },
        )

        if create_resp.status_code >= 400:
            err_body = create_resp.json() if create_resp.headers.get("content-type", "").startswith("application/json") else {}
            error_detail = err_body.get("msg") or err_body.get("error_description") or err_body.get("message") or create_resp.text
            raise HTTPException(status_code=400, detail=f"Auth error: {error_detail}")

        auth_user = create_resp.json()
        auth_id = auth_user.get("id", "")

    user_data = {
        "auth_id": auth_id,
        "email": req.email,
        "first_name": req.first_name,
        "last_name": req.last_name,
        "role": req.role,
        "employment_status": req.employment_status or "full_time",
        "is_active": True,
    }
    if req.phone_number:
        user_data["phone_number"] = req.phone_number
    if req.sms_enabled is not None:
        user_data["sms_enabled"] = req.sms_enabled
    if req.supervision_required is not None:
        user_data["supervision_required"] = req.supervision_required
    if req.clinical_supervisor_id:
        user_data["clinical_supervisor_id"] = req.clinical_supervisor_id

    try:
        new_user = await sb_request("POST", "users", data=user_data)
        user_id = new_user[0]["id"] if isinstance(new_user, list) else new_user.get("id")
    except Exception as e:
        logger.error(f"Users table insert failed for {req.email}, cleaning up auth user {auth_id}: {e}")
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.delete(
                    f"{SUPABASE_URL}/auth/v1/admin/users/{auth_id}",
                    headers={
                        "apikey": SUPABASE_SERVICE_KEY,
                        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    },
                )
        except Exception as cleanup_err:
            logger.error(f"Failed to clean up auth user: {cleanup_err}")
        raise HTTPException(status_code=400, detail=str(e))

    return {"status": "created", "email": req.email, "user_id": user_id}


@router.delete("/admin/cleanup-auth-user")
async def cleanup_auth_user(email: str, admin=Depends(require_admin)):
    """Delete an orphaned auth user (exists in auth but not in users table)."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{SUPABASE_URL}/auth/v1/admin/users",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            },
            params={"page": 1, "per_page": 1000},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to list auth users")

        auth_users = resp.json().get("users", [])
        target = None
        for u in auth_users:
            if u.get("email", "").lower() == email.lower():
                target = u
                break

        if not target:
            raise HTTPException(status_code=404, detail=f"No auth user found with email {email}")

        del_resp = await client.delete(
            f"{SUPABASE_URL}/auth/v1/admin/users/{target['id']}",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            },
        )
        if del_resp.status_code >= 400:
            raise HTTPException(status_code=500, detail=f"Failed to delete auth user: {del_resp.text}")

    return {"status": "deleted", "email": email, "auth_id": target["id"]}


@router.get("/admin/users")
async def list_users(admin=Depends(require_admin)):
    """Admin: list all users."""
    users = await sb_request("GET", "users", params={
        "select": "*",
        "order": "last_name.asc",
    })
    return users or []
