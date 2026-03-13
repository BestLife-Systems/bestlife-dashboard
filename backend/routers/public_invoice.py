"""Public invoice endpoints — 5 endpoints (no auth, uses draft_token)."""
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import Response

from backend.deps import sb_request
from backend.email_service import send_invoice_email
from backend.models import DraftSaveRequest, SubmitRequest, UpdateInvoiceRequest
from backend.pdf_invoice import generate_invoice_pdf

logger = logging.getLogger("bestlife")

router = APIRouter(prefix="/api")

EDIT_WINDOW_HOURS = 24


async def _send_invoice_email_bg(draft_token: str, is_update: bool = False):
    """Background task: generate PDF and email it to the provider."""
    try:
        recipients = await sb_request("GET", "pay_period_recipients", params={
            "draft_token": f"eq.{draft_token}",
            "select": "invoice_data,submitted_at,users!user_id(first_name,last_name,email),pay_periods(label)",
        })
        if not recipients:
            return

        r = recipients[0]
        user = r.get("users") or {}
        email = user.get("email", "")
        user_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or "Provider"
        period = r.get("pay_periods") or {}
        period_label = period.get("label", "")

        pdf_bytes = generate_invoice_pdf(
            invoice_data=r.get("invoice_data") or {},
            user_name=user_name,
            period_label=period_label,
            submitted_at=r.get("submitted_at"),
        )

        await send_invoice_email(
            to_email=email,
            user_name=user_name,
            period_label=period_label,
            pdf_bytes=pdf_bytes,
            is_update=is_update,
        )
    except Exception as e:
        logger.error(f"Background email task failed: {e}")


@router.get("/public/invoice/{draft_token}")
async def get_public_invoice(draft_token: str):
    """Public: get invoice form for a recipient via draft token."""
    recipients = await sb_request("GET", "pay_period_recipients", params={
        "draft_token": f"eq.{draft_token}",
        "select": "*, users!user_id(id, first_name, last_name, role, email), pay_periods(start_date, end_date, label, due_date, status)",
    })
    if not recipients:
        raise HTTPException(status_code=404, detail="Invoice link not found or expired")

    r = recipients[0]
    period = r.get("pay_periods") or {}

    if period.get("status") != "open":
        raise HTTPException(status_code=400, detail="This pay period is no longer accepting submissions")

    # ── Already submitted: check 24-hour edit window ──
    if r["status"] in ("received",):
        submitted_at = r.get("submitted_at")
        if submitted_at:
            # Parse submitted_at — handle both naive and timezone-aware strings
            if isinstance(submitted_at, str):
                submitted_dt = datetime.fromisoformat(submitted_at.replace("Z", "+00:00"))
                if submitted_dt.tzinfo is None:
                    submitted_dt = submitted_dt.replace(tzinfo=timezone.utc)
            else:
                submitted_dt = submitted_at

            deadline = submitted_dt + timedelta(hours=EDIT_WINDOW_HOURS)
            now = datetime.now(timezone.utc)

            if now < deadline:
                # Within edit window — return full form data for editing
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

                rate_types = await sb_request("GET", "rate_types", params={
                    "is_active": "eq.true",
                    "select": "*",
                    "order": "sort_order.asc",
                })

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
                    "editable": True,
                    "submitted_at": r.get("submitted_at"),
                    "edit_deadline": deadline.isoformat(),
                }

        # Past edit window or no submitted_at
        return {"already_submitted": True, "submitted_at": r.get("submitted_at"), "editable": False}

    if r["status"] in ("approved", "exported"):
        return {"already_submitted": True, "submitted_at": r.get("submitted_at"), "editable": False}

    # ── Not yet submitted: normal draft flow ──
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
async def submit_invoice(draft_token: str, req: SubmitRequest, background_tasks: BackgroundTasks):
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
        "submitted_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })

    # Fire-and-forget: generate PDF + email to provider
    background_tasks.add_task(_send_invoice_email_bg, draft_token, False)

    return {"status": "submitted"}


@router.post("/public/invoice/{draft_token}/update")
async def update_invoice(draft_token: str, req: UpdateInvoiceRequest, background_tasks: BackgroundTasks):
    """Public: update a submitted invoice within the 24-hour edit window."""
    recipients = await sb_request("GET", "pay_period_recipients", params={
        "draft_token": f"eq.{draft_token}",
        "select": "id,status,submit_token,submitted_at",
    })
    if not recipients:
        raise HTTPException(status_code=404, detail="Not found")

    r = recipients[0]

    # Must be in 'received' status (not yet approved/exported)
    if r["status"] != "received":
        raise HTTPException(status_code=400, detail="Invoice cannot be updated in its current state")

    # Validate submit token
    if str(r.get("submit_token")) != req.submit_token:
        raise HTTPException(status_code=403, detail="Invalid submit token")

    # Check 24-hour window
    submitted_at = r.get("submitted_at")
    if not submitted_at:
        raise HTTPException(status_code=400, detail="No submission timestamp found")

    if isinstance(submitted_at, str):
        submitted_dt = datetime.fromisoformat(submitted_at.replace("Z", "+00:00"))
        if submitted_dt.tzinfo is None:
            submitted_dt = submitted_dt.replace(tzinfo=timezone.utc)
    else:
        submitted_dt = submitted_at

    deadline = submitted_dt + timedelta(hours=EDIT_WINDOW_HOURS)
    now = datetime.now(timezone.utc)

    if now >= deadline:
        raise HTTPException(status_code=400, detail="The 24-hour edit window has closed")

    await sb_request("PATCH", f"pay_period_recipients?id=eq.{r['id']}", data={
        "invoice_data": req.invoice_data,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })

    # Fire-and-forget: generate updated PDF + email to provider
    background_tasks.add_task(_send_invoice_email_bg, draft_token, True)

    return {"status": "updated", "edit_deadline": deadline.isoformat()}


@router.get("/public/invoice/{draft_token}/pdf")
async def download_invoice_pdf(draft_token: str):
    """Public: download a PDF summary of a submitted invoice."""
    recipients = await sb_request("GET", "pay_period_recipients", params={
        "draft_token": f"eq.{draft_token}",
        "select": "id,status,invoice_data,submitted_at,users!user_id(first_name,last_name),pay_periods(label)",
    })
    if not recipients:
        raise HTTPException(status_code=404, detail="Not found")

    r = recipients[0]

    # Only allow PDF for submitted invoices
    if r["status"] == "sent":
        raise HTTPException(status_code=400, detail="Invoice has not been submitted yet")

    user = r.get("users") or {}
    user_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or "Provider"
    period = r.get("pay_periods") or {}
    period_label = period.get("label", "")

    try:
        pdf_bytes = generate_invoice_pdf(
            invoice_data=r.get("invoice_data") or {},
            user_name=user_name,
            period_label=period_label,
            submitted_at=r.get("submitted_at"),
        )
    except Exception as e:
        logger.error(f"PDF generation failed for {draft_token}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {e}")

    filename = f"Invoice-{period_label.replace(' ', '-')}.pdf" if period_label else "Invoice.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
