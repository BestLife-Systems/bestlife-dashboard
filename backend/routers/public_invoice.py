"""Public invoice endpoints — 3 endpoints (no auth, uses draft_token)."""
from datetime import datetime

from fastapi import APIRouter, HTTPException

from backend.deps import sb_request
from backend.models import DraftSaveRequest, SubmitRequest

router = APIRouter(prefix="/api")


@router.get("/public/invoice/{draft_token}")
async def get_public_invoice(draft_token: str):
    """Public: get invoice form for a recipient via draft token."""
    recipients = await sb_request("GET", "pay_period_recipients", params={
        "draft_token": f"eq.{draft_token}",
        "select": "*, users!user_id(id, first_name, last_name, role), pay_periods(start_date, end_date, label, due_date, status)",
    })
    if not recipients:
        raise HTTPException(status_code=404, detail="Invoice link not found or expired")

    r = recipients[0]
    period = r.get("pay_periods") or {}

    if period.get("status") != "open":
        raise HTTPException(status_code=400, detail="This pay period is no longer accepting submissions")

    if r["status"] in ("received", "approved", "exported"):
        return {"already_submitted": True, "submitted_at": r.get("submitted_at")}

    rate_types = await sb_request("GET", "rate_types", params={
        "is_active": "eq.true",
        "select": "*",
        "order": "sort_order.asc",
    })

    user = r.get("users") or {}
    user_role = user.get("role", "therapist")

    supervisees = []
    if user_role == "clinical_leader":
        team = await sb_request("GET", "users", params={
            "clinical_supervisor_id": f"eq.{user.get('id', r['user_id'])}",
            "is_active": "eq.true",
            "select": "id,first_name,last_name",
            "order": "first_name.asc",
        })
        supervisees = [
            {"id": s["id"], "name": f"{s.get('first_name', '')} {s.get('last_name', '')}".strip()}
            for s in (team or [])
        ]

    return {
        "recipient_id": r["id"],
        "user_name": f"{user.get('first_name', '')} {user.get('last_name', '')}".strip(),
        "user_role": user_role,
        "period_label": period.get("label", ""),
        "due_date": period.get("due_date"),
        "draft_data": r.get("invoice_data"),
        "submit_token": r.get("submit_token"),
        "rate_types": rate_types or [],
        "supervisees": supervisees,
    }


@router.post("/public/invoice/{draft_token}/save-draft")
async def save_draft(draft_token: str, req: DraftSaveRequest):
    """Public: save draft invoice data."""
    recipients = await sb_request("GET", "pay_period_recipients", params={
        "draft_token": f"eq.{draft_token}",
        "select": "id,status",
    })
    if not recipients:
        raise HTTPException(status_code=404, detail="Not found")

    r = recipients[0]
    if r["status"] in ("received", "approved", "exported"):
        raise HTTPException(status_code=400, detail="Already submitted")

    await sb_request("PATCH", f"pay_period_recipients?id=eq.{r['id']}", data={
        "invoice_data": req.invoice_data,
        "updated_at": datetime.utcnow().isoformat(),
    })

    return {"status": "draft_saved"}


@router.post("/public/invoice/{draft_token}/submit")
async def submit_invoice(draft_token: str, req: SubmitRequest):
    """Public: submit the invoice (single submit only)."""
    recipients = await sb_request("GET", "pay_period_recipients", params={
        "draft_token": f"eq.{draft_token}",
        "select": "id,status,submit_token",
    })
    if not recipients:
        raise HTTPException(status_code=404, detail="Not found")

    r = recipients[0]
    if r["status"] in ("received", "approved", "exported"):
        raise HTTPException(status_code=400, detail="Already submitted — single submit only")

    if str(r.get("submit_token")) != req.submit_token:
        raise HTTPException(status_code=403, detail="Invalid submit token")

    await sb_request("PATCH", f"pay_period_recipients?id=eq.{r['id']}", data={
        "invoice_data": req.invoice_data,
        "status": "received",
        "submitted_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    })

    return {"status": "submitted"}
