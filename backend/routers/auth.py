"""Auth / User Management — invite, cleanup, list, resend welcome."""
import os
import re
import httpx
from fastapi import APIRouter, Depends, HTTPException

from backend.deps import (
    SUPABASE_URL, SUPABASE_SERVICE_KEY,
    sb_request, require_admin, logger,
)
from backend.models import InviteUserRequest
from backend.email_service import send_welcome_email

FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://bestlife-dashboard-production-bf81.up.railway.app")


def _fix_action_link(action_link: str) -> str:
    """Rewrite the Supabase action_link to use FRONTEND_URL instead of SITE_URL.

    Supabase generate_link returns a redirect URL that ultimately lands on
    whatever SITE_URL is configured in the Supabase dashboard.  If that's
    still set to localhost, the emailed link will be broken.  This helper
    replaces any localhost (or other wrong) redirect_to with FRONTEND_URL.
    """
    if not action_link:
        return action_link
    # The action_link format is:
    # https://<supabase>/auth/v1/verify?...&redirect_to=<encoded_url>
    # Replace the redirect_to param to point at production
    import urllib.parse
    parsed = urllib.parse.urlparse(action_link)
    params = urllib.parse.parse_qs(parsed.query)
    if "redirect_to" in params:
        params["redirect_to"] = [f"{FRONTEND_URL}/reset-password"]
        new_query = urllib.parse.urlencode(params, doseq=True)
        action_link = urllib.parse.urlunparse(parsed._replace(query=new_query))
    return action_link

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

    # Generate invite link and send welcome email
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            link_resp = await client.post(
                f"{SUPABASE_URL}/auth/v1/admin/generate_link",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "type": "recovery",
                    "email": req.email,
                    "options": {"redirect_to": f"{FRONTEND_URL}/reset-password"},
                },
            )
            if link_resp.status_code < 400:
                link_data = link_resp.json()
                action_link = _fix_action_link(link_data.get("action_link", ""))
                if action_link:
                    await send_welcome_email(
                        to_email=req.email,
                        user_name=req.first_name,
                        login_url=action_link,
                    )
                else:
                    logger.warning(f"No action_link in generate_link response for {req.email}")
            else:
                logger.warning(f"generate_link failed for {req.email}: {link_resp.text}")
    except Exception as e:
        logger.error(f"Welcome email failed for {req.email}: {e}")

    return {"status": "created", "email": req.email, "user_id": user_id}


@router.post("/admin/send-welcome-email/{user_id}")
async def resend_welcome_email(user_id: str, admin=Depends(require_admin)):
    """Resend the welcome / set-password email for an existing user."""
    users = await sb_request("GET", "users", params={
        "id": f"eq.{user_id}",
        "select": "email,first_name",
    })
    if not users:
        raise HTTPException(status_code=404, detail="User not found")

    user = users[0]
    email = user["email"]
    name = user.get("first_name", "there")

    async with httpx.AsyncClient(timeout=15.0) as client:
        link_resp = await client.post(
            f"{SUPABASE_URL}/auth/v1/admin/generate_link",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "type": "recovery",
                "email": email,
                "options": {"redirect_to": f"{FRONTEND_URL}/reset-password"},
            },
        )
        if link_resp.status_code >= 400:
            raise HTTPException(status_code=500, detail=f"Failed to generate link: {link_resp.text}")

        action_link = _fix_action_link(link_resp.json().get("action_link", ""))
        if not action_link:
            raise HTTPException(status_code=500, detail="No action link returned")

    sent, reason = await send_welcome_email(
        to_email=email,
        user_name=name,
        login_url=action_link,
    )
    if not sent:
        raise HTTPException(status_code=500, detail=f"Email delivery failed: {reason}")

    return {"status": "sent", "email": email}


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
