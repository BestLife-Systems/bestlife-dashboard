"""Automated pay period scheduler — daily cron endpoint.

Handles:
1. Auto-create upcoming pay periods (look-ahead ~45 days)
2. Auto-open periods when their submission window starts
3. Send reminder emails + texts on the agreed cadence
4. Email admin with non-submitter list after deadline passes

Secured by CRON_SECRET Bearer token.
"""
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException

from backend.deps import sb_request
from backend.email_service import send_admin_summary_email, send_reminder_email
from backend.scheduler import (
    get_reminder_actions,
    today_et,
    upcoming_periods,
)
from backend.sms_service import send_sms

logger = logging.getLogger("bestlife")

router = APIRouter(prefix="/api")

CRON_SECRET = os.environ.get("CRON_SECRET", "")
APP_URL = os.environ.get("APP_URL", "https://bestlifenj.com")


# ── Auth helper ───────────────────────────────────────────────────


def _verify_cron(authorization: Optional[str]):
    """Verify the cron request has the correct Bearer token."""
    if not CRON_SECRET:
        raise HTTPException(status_code=500, detail="CRON_SECRET not configured")
    if authorization != f"Bearer {CRON_SECRET}":
        raise HTTPException(status_code=401, detail="Invalid cron secret")


# ── Main daily endpoint ──────────────────────────────────────────


@router.post("/cron/daily")
async def daily_cron(
    authorization: Optional[str] = Header(None),
    test_date: Optional[str] = None,
    dry_run: bool = False,
):
    """Daily scheduler — run once per day at 9:00 AM ET.

    1. Auto-create any missing upcoming pay periods
    2. Auto-open periods whose submission window starts today
    3. Send reminders (3-day, 1-day, due-today) to non-submitters
    4. Email admin summary the day after deadline

    Query params for testing:
        test_date: Simulate a specific date (YYYY-MM-DD)
        dry_run: If true, calculate actions but don't execute them
    """
    _verify_cron(authorization)

    if test_date:
        from datetime import date as date_type
        today = date_type.fromisoformat(test_date)
        logger.info(f"Cron running in {'DRY RUN' if dry_run else 'TEST'} mode for date: {today}")
    else:
        today = today_et()
    results = {
        "date": today.isoformat(),
        "dry_run": dry_run,
        "periods_created": 0,
        "periods_opened": 0,
        "reminders_sent": 0,
        "admin_summaries_sent": 0,
        "actions_planned": [],  # always populated — shows what WOULD happen
        "errors": [],
    }

    # ── Step 1: Auto-create upcoming pay periods ──
    if not dry_run:
        try:
            results["periods_created"] = await _auto_create_periods(today)
        except Exception as e:
            logger.error(f"Auto-create failed: {e}")
            results["errors"].append(f"auto_create: {e}")

    # ── Step 2: Process all draft + open periods ──
    periods = await sb_request("GET", "pay_periods", params={
        "status": "in.(draft,open)",
        "select": "*",
    })

    for period in (periods or []):
        try:
            end_date_str = period.get("end_date", "")
            if not end_date_str:
                continue

            from datetime import date as date_type
            end_date = date_type.fromisoformat(end_date_str)
            window_open = end_date - timedelta(days=2)
            deadline = end_date + timedelta(days=4)

            actions = get_reminder_actions(today, window_open, deadline)

            for action in actions:
                # Always log what would happen
                results["actions_planned"].append({
                    "period": period.get("label", period["id"]),
                    "action": action,
                    "status": period["status"],
                })

                if dry_run:
                    continue  # report only, don't execute

                if action == "open" and period["status"] == "draft":
                    count = await _auto_open_period(period)
                    results["periods_opened"] += 1
                    results["reminders_sent"] += count  # initial notifications

                elif action in ("remind_3", "remind_1", "due_today"):
                    if period["status"] == "open":
                        count = await _send_reminders(period, action)
                        results["reminders_sent"] += count

                elif action == "admin_summary":
                    if period["status"] == "open":
                        await _send_admin_summary(period)
                        results["admin_summaries_sent"] += 1

        except Exception as e:
            logger.error(f"Error processing period {period.get('id')}: {e}")
            results["errors"].append(f"period_{period.get('id')}: {e}")

    logger.info(f"Daily cron complete: {results}")
    return results


# ── Step 1: Auto-create periods ──────────────────────────────────


async def _auto_create_periods(today) -> int:
    """Create any missing pay periods for the next 45 days."""
    needed = upcoming_periods(today, days_ahead=45)

    # Fetch existing periods to avoid duplicates
    existing = await sb_request("GET", "pay_periods", params={
        "select": "start_date,end_date",
    }) or []
    existing_set = {(p["start_date"], p["end_date"]) for p in existing}

    created = 0
    for p in needed:
        key = (p["start_date"].isoformat(), p["end_date"].isoformat())
        if key in existing_set:
            continue

        await sb_request("POST", "pay_periods", data={
            "period_type": p["period_type"],
            "start_date": p["start_date"].isoformat(),
            "end_date": p["end_date"].isoformat(),
            "due_date": p["due_date"].isoformat(),
            "status": "draft",
            "label": p["label"],
        })
        created += 1
        logger.info(f"Auto-created pay period: {p['label']}")

    return created


# ── Step 2: Auto-open period ─────────────────────────────────────


async def _auto_open_period(period: dict) -> int:
    """Open a draft period: create recipients, send initial email + SMS.

    Returns the number of notifications sent.
    """
    period_id = period["id"]
    period_label = period.get("label", "")
    due_date_str = period.get("due_date", "")

    # Format deadline for display
    try:
        from datetime import date as date_type
        deadline_date = date_type.fromisoformat(due_date_str)
        deadline_display = deadline_date.strftime("%A, %B %d")
    except Exception:
        deadline_display = due_date_str

    # Get eligible users
    users = await sb_request("GET", "users", params={
        "is_active": "eq.true",
        "select": "id,first_name,last_name,email,phone_number,sms_enabled,role",
    })

    payroll_roles = {"therapist", "clinical_leader", "apn", "ba"}
    eligible = [u for u in (users or []) if u.get("role") in payroll_roles]

    notification_count = 0

    for user in eligible:
        try:
            # Create recipient row (draft_token auto-generated by DB)
            recipient = await sb_request("POST", "pay_period_recipients", data={
                "pay_period_id": period_id,
                "user_id": user["id"],
                "status": "sent",
            })

            rec = recipient[0] if isinstance(recipient, list) else recipient
            draft_token = rec.get("draft_token", "")
            rec_id = rec["id"]
            invoice_url = f"{APP_URL}/invoice/{draft_token}"

            name = user.get("first_name", "")
            full_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()

            # Send initial email
            if user.get("email"):
                sent = await send_reminder_email(
                    to_email=user["email"],
                    user_name=full_name,
                    period_label=period_label,
                    deadline=deadline_display,
                    invoice_url=invoice_url,
                    reminder_type="open",
                )
                if sent:
                    await sb_request("POST", "reminder_log", data={
                        "recipient_id": rec_id,
                        "channel": "email",
                        "status": "sent",
                    })
                    notification_count += 1

            # Send initial SMS
            phone = user.get("phone_number")
            sms_on = user.get("sms_enabled")
            if phone and sms_on:
                msg = (
                    f"Hi {name}! Your BestLife invoice for {period_label} is now open. "
                    f"Please submit by {deadline_display}. "
                    f"Link: {invoice_url}"
                )
                sid = send_sms(phone, msg)
                if sid:
                    await sb_request("POST", "reminder_log", data={
                        "recipient_id": rec_id,
                        "channel": "sms",
                        "status": "sent",
                    })
                    notification_count += 1

        except Exception as e:
            logger.warning(f"Failed to create/notify recipient for {user['id']}: {e}")

    # Update period status to open
    await sb_request("PATCH", f"pay_periods?id=eq.{period_id}", data={
        "status": "open",
        "opened_at": datetime.now(timezone.utc).isoformat(),
    })

    # Audit log
    await sb_request("POST", "audit_log", data={
        "action": "pay_period_auto_opened",
        "entity_type": "pay_period",
        "entity_id": period_id,
        "details": {"recipients_created": len(eligible), "trigger": "cron"},
    })

    logger.info(f"Auto-opened period {period_id} ({period_label}): {len(eligible)} recipients, {notification_count} notifications")
    return notification_count


# ── Step 3: Send reminders ────────────────────────────────────────


async def _send_reminders(period: dict, action: str) -> int:
    """Send reminders to providers who haven't submitted.

    action: 'remind_3' (text), 'remind_1' (email+text), 'due_today' (text)
    Returns count of notifications sent.
    """
    period_id = period["id"]
    period_label = period.get("label", "")
    due_date_str = period.get("due_date", "")

    try:
        from datetime import date as date_type
        deadline_date = date_type.fromisoformat(due_date_str)
        deadline_display = deadline_date.strftime("%A, %B %d")
    except Exception:
        deadline_display = due_date_str

    # Get recipients who haven't submitted (status = 'sent')
    recipients = await sb_request("GET", "pay_period_recipients", params={
        "pay_period_id": f"eq.{period_id}",
        "status": "eq.sent",
        "select": "id,draft_token,users!user_id(first_name,last_name,email,phone_number,sms_enabled)",
    })

    # Determine channels per action
    send_email = action in ("remind_1",)  # email only on day-before
    send_text = True  # always text

    count = 0
    for r in (recipients or []):
        user = r.get("users") or {}
        name = user.get("first_name", "")
        full_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()
        draft_token = r.get("draft_token", "")
        invoice_url = f"{APP_URL}/invoice/{draft_token}"
        rec_id = r["id"]

        # Email
        if send_email and user.get("email"):
            sent = await send_reminder_email(
                to_email=user["email"],
                user_name=full_name,
                period_label=period_label,
                deadline=deadline_display,
                invoice_url=invoice_url,
                reminder_type=action,
            )
            if sent:
                await sb_request("POST", "reminder_log", data={
                    "recipient_id": rec_id,
                    "channel": "email",
                    "status": "sent",
                })
                count += 1

        # SMS
        if send_text:
            phone = user.get("phone_number")
            sms_on = user.get("sms_enabled")
            if phone and sms_on:
                if action == "remind_3":
                    msg = f"Reminder: Your BestLife invoice for {period_label} is due in 3 days ({deadline_display}). Submit here: {invoice_url}"
                elif action == "remind_1":
                    msg = f"Your BestLife invoice for {period_label} is due tomorrow! Submit now: {invoice_url}"
                elif action == "due_today":
                    msg = f"Last chance - your BestLife invoice for {period_label} is due today. Submit now: {invoice_url}"
                else:
                    msg = f"Reminder: Your BestLife invoice for {period_label} needs to be submitted. {invoice_url}"

                sid = send_sms(phone, msg)
                if sid:
                    await sb_request("POST", "reminder_log", data={
                        "recipient_id": rec_id,
                        "channel": "sms",
                        "status": "sent",
                    })
                    count += 1

        # Update recipient reminder tracking
        await sb_request("PATCH", f"pay_period_recipients?id=eq.{rec_id}", data={
            "reminder_count": (r.get("reminder_count") or 0) + 1,
            "last_reminder_at": datetime.now(timezone.utc).isoformat(),
        })

    logger.info(f"Reminders ({action}) for {period_label}: {count} sent to {len(recipients or [])} providers")
    return count


# ── Step 4: Admin summary ────────────────────────────────────────


async def _send_admin_summary(period: dict):
    """Email admin(s) with the list of providers who didn't submit."""
    period_id = period["id"]
    period_label = period.get("label", "")

    # Get non-submitters
    recipients = await sb_request("GET", "pay_period_recipients", params={
        "pay_period_id": f"eq.{period_id}",
        "status": "eq.sent",
        "select": "id,users!user_id(first_name,last_name)",
    })

    if not recipients:
        logger.info(f"Admin summary for {period_label}: everyone submitted!")
        return

    non_submitters = []
    for r in (recipients or []):
        user = r.get("users") or {}
        name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()
        if name:
            non_submitters.append(name)

    # Get admin users
    admins = await sb_request("GET", "users", params={
        "role": "eq.admin",
        "is_active": "eq.true",
        "select": "email,first_name",
    })

    for admin in (admins or []):
        if admin.get("email"):
            await send_admin_summary_email(
                to_email=admin["email"],
                admin_name=admin.get("first_name", "Admin"),
                period_label=period_label,
                non_submitters=non_submitters,
            )

    logger.info(f"Admin summary for {period_label}: {len(non_submitters)} non-submitters emailed to {len(admins or [])} admins")
