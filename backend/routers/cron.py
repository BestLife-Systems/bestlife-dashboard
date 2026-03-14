"""Automated pay period scheduler — built-in daily scheduler + manual test endpoint.

Handles:
1. Auto-create upcoming pay periods (look-ahead ~45 days)
2. Auto-open periods when their submission window starts
3. Send reminder emails + texts on the agreed cadence
4. Email admin with non-submitter list after deadline passes

Runs automatically at 9:00 AM ET via built-in background loop (no external cron needed).
Manual test endpoint: POST /api/cron/daily (secured by CRON_SECRET).
"""
import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Header, HTTPException, Depends
from pydantic import BaseModel

from backend.deps import sb_request, require_admin
from backend.email_service import send_admin_summary_email, send_reminder_email
from backend.scheduler import (
    calculate_period_info,
    get_reminder_actions,
    today_et,
    upcoming_periods,
)
from backend.sms_service import send_sms, SMS_ENABLED

logger = logging.getLogger("bestlife")

router = APIRouter(prefix="/api")

CRON_SECRET = os.environ.get("CRON_SECRET", "")
APP_URL = os.environ.get("APP_URL", "https://bestlife-dashboard-production-bf81.up.railway.app")
SCHEDULER_HOUR = int(os.environ.get("SCHEDULER_HOUR", "9"))  # 9 AM ET default

ET = ZoneInfo("America/New_York")


# ══════════════════════════════════════════════════════════════════
# Built-in background scheduler (runs inside the app — no cron needed)
# ══════════════════════════════════════════════════════════════════

_last_run_date: Optional[str] = None  # in-memory guard (supplementary)


async def _get_last_run_date() -> Optional[str]:
    """Read the scheduler's last-run date from the database (survives redeploys)."""
    try:
        rows = await sb_request("GET", "app_settings", params={
            "key": "eq.scheduler_last_run",
            "select": "value",
        })
        if rows and rows[0].get("value"):
            return rows[0]["value"]
    except Exception as e:
        logger.warning(f"Could not read scheduler_last_run from DB: {e}")
    return None


async def _set_last_run_date(date_str: str):
    """Persist the scheduler's last-run date to the database."""
    try:
        existing = await sb_request("GET", "app_settings", params={
            "key": "eq.scheduler_last_run",
            "select": "key",
        })
        if existing:
            await sb_request("PATCH", "app_settings?key=eq.scheduler_last_run", data={
                "value": date_str,
            })
        else:
            await sb_request("POST", "app_settings", data={
                "key": "scheduler_last_run",
                "value": date_str,
            })
    except Exception as e:
        logger.error(f"Could not persist scheduler_last_run to DB: {e}")


async def _get_cadence_config() -> dict:
    """Read cadence offsets from app_settings (falls back to defaults)."""
    try:
        rows = await sb_request("GET", "app_settings", params={
            "key": "in.(cadence_window_open_days,cadence_deadline_days)",
        }) or []
        config = {r["key"]: r["value"] for r in rows}
    except Exception as e:
        logger.warning(f"Could not read cadence config from DB: {e}")
        config = {}
    return {
        "window_open_days": int(config.get("cadence_window_open_days", "2")),
        "deadline_days": int(config.get("cadence_deadline_days", "4")),
    }


async def _upsert_setting(key: str, value: str):
    """Insert or update a single app_settings row."""
    existing = await sb_request("GET", "app_settings", params={
        "key": f"eq.{key}", "select": "key",
    })
    if existing:
        await sb_request("PATCH", f"app_settings?key=eq.{key}", data={"value": value})
    else:
        await sb_request("POST", "app_settings", data={"key": key, "value": value})


async def _scheduler_loop():
    """Background loop: checks every 15 min, runs daily logic once at target hour."""
    global _last_run_date
    logger.info(f"Built-in scheduler started - runs daily at {SCHEDULER_HOUR}:00 AM ET")

    # Wait 30s on startup to let the app fully initialize
    await asyncio.sleep(30)

    # Restore last-run date from DB so redeploys don't re-fire
    _last_run_date = await _get_last_run_date()
    if _last_run_date:
        logger.info(f"Scheduler restored last_run_date from DB: {_last_run_date}")

    while True:
        try:
            now_et = datetime.now(ET)
            today_str = now_et.strftime("%Y-%m-%d")

            if now_et.hour >= SCHEDULER_HOUR and _last_run_date != today_str:
                logger.info(f"Scheduler firing for {today_str} ({now_et.strftime('%H:%M')} ET)")
                try:
                    results = await _run_daily_logic(today_str=today_str, dry_run=False)
                    _last_run_date = today_str
                    await _set_last_run_date(today_str)
                    logger.info(f"Scheduler complete: {results}")
                except Exception as e:
                    logger.error(f"Scheduler failed for {today_str}: {e}")
                    # Don't set _last_run_date — will retry next 15-min check
        except Exception as e:
            logger.error(f"Scheduler loop error: {e}")

        await asyncio.sleep(900)  # check every 15 minutes


def start_scheduler():
    """Start the background scheduler. Call once from app startup."""
    asyncio.get_event_loop().create_task(_scheduler_loop())


# ══════════════════════════════════════════════════════════════════
# Manual test endpoint (for dry runs and date simulation)
# ══════════════════════════════════════════════════════════════════


@router.post("/cron/daily")
async def daily_cron(
    authorization: Optional[str] = Header(None),
    test_date: Optional[str] = None,
    dry_run: bool = False,
):
    """Manual trigger / test endpoint for the daily scheduler.

    Query params:
        test_date: Simulate a specific date (YYYY-MM-DD)
        dry_run: If true, show what WOULD happen without executing

    Requires CRON_SECRET Bearer token.
    """
    if not CRON_SECRET:
        raise HTTPException(status_code=500, detail="CRON_SECRET not configured — add it in Railway env vars")
    if authorization != f"Bearer {CRON_SECRET}":
        raise HTTPException(status_code=401, detail="Invalid cron secret")

    date_str = test_date or today_et().isoformat()
    return await _run_daily_logic(today_str=date_str, dry_run=dry_run)


# ══════════════════════════════════════════════════════════════════
# Core daily logic (shared by scheduler + manual endpoint)
# ══════════════════════════════════════════════════════════════════


async def _run_daily_logic(today_str: str, dry_run: bool = False) -> dict:
    """Run all daily scheduler steps for a given date.

    Returns a results dict with counts and actions taken.
    """
    from datetime import date as date_type
    today = date_type.fromisoformat(today_str)

    # Read cadence config once for the entire run
    cadence = await _get_cadence_config()
    wo_days = cadence["window_open_days"]
    dl_days = cadence["deadline_days"]

    results = {
        "date": today.isoformat(),
        "dry_run": dry_run,
        "periods_created": 0,
        "periods_opened": 0,
        "reminders_sent": 0,
        "admin_summaries_sent": 0,
        "actions_planned": [],
        "errors": [],
    }

    # ── Step 1: Auto-create upcoming pay periods ──
    if not dry_run:
        try:
            results["periods_created"] = await _auto_create_periods(today, wo_days, dl_days)
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

            end_date = date_type.fromisoformat(end_date_str)
            window_open = end_date - timedelta(days=wo_days)
            deadline = end_date + timedelta(days=dl_days)

            actions = get_reminder_actions(today, window_open, deadline)

            for action in actions:
                results["actions_planned"].append({
                    "period": period.get("label", period["id"]),
                    "action": action,
                    "status": period["status"],
                })

                if dry_run:
                    continue

                if action == "open" and period["status"] == "draft":
                    count = await _auto_open_period(period)
                    results["periods_opened"] += 1
                    results["reminders_sent"] += count

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

    logger.info(f"Daily logic complete: {results}")
    return results


# ══════════════════════════════════════════════════════════════════
# Step 1: Auto-create periods
# ══════════════════════════════════════════════════════════════════


async def _auto_create_periods(today, window_open_days: int = 2, deadline_days: int = 4) -> int:
    """Create any missing pay periods for the next 45 days."""
    needed = upcoming_periods(today, days_ahead=45, window_open_days=window_open_days, deadline_days=deadline_days)

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


# ══════════════════════════════════════════════════════════════════
# Step 2: Auto-open period
# ══════════════════════════════════════════════════════════════════


async def _auto_open_period(period: dict) -> int:
    """Open a draft period: create recipients, send initial email + SMS.

    Returns the number of notifications sent.
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

    users = await sb_request("GET", "users", params={
        "is_active": "eq.true",
        "select": "id,first_name,last_name,email,phone_number,sms_enabled,role",
    })

    payroll_roles = {"therapist", "clinical_leader", "apn", "ba", "supervisor"}
    eligible = [u for u in (users or []) if u.get("role") in payroll_roles]

    notification_count = 0

    for user in eligible:
        try:
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

            # Email
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

            # SMS (silently skipped when SMS_ENABLED is false)
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

    # Update period status
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


# ══════════════════════════════════════════════════════════════════
# Step 3: Send reminders
# ══════════════════════════════════════════════════════════════════


async def _send_reminders(period: dict, action: str) -> int:
    """Send reminders to providers who haven't submitted.

    Channels by action:
        remind_3:  email only (SMS disabled for now)
        remind_1:  email only
        due_today: email only
    SMS will be added for all when SMS_ENABLED=true.
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

    recipients = await sb_request("GET", "pay_period_recipients", params={
        "pay_period_id": f"eq.{period_id}",
        "status": "eq.sent",
        "select": "id,draft_token,reminder_count,users!user_id(first_name,last_name,email,phone_number,sms_enabled)",
    })

    # Check what was already sent today to avoid duplicate emails on redeploy
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    already_sent_today = set()
    try:
        sent_logs = await sb_request("GET", "reminder_log", params={
            "created_at": f"gte.{today_start}",
            "channel": "eq.email",
            "status": "eq.sent",
            "select": "recipient_id",
        })
        already_sent_today = {log["recipient_id"] for log in (sent_logs or [])}
    except Exception as e:
        logger.warning(f"Could not check reminder_log for duplicates: {e}")

    count = 0
    for r in (recipients or []):
        rec_id = r["id"]

        # Skip if we already sent this recipient an email today
        if rec_id in already_sent_today:
            logger.info(f"Skipping duplicate reminder for recipient {rec_id} (already sent today)")
            continue

        user = r.get("users") or {}
        name = user.get("first_name", "")
        full_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()
        draft_token = r.get("draft_token", "")
        invoice_url = f"{APP_URL}/invoice/{draft_token}"

        # Email (all reminder types)
        if user.get("email"):
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

        # SMS (silently skipped when SMS_ENABLED is false)
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

        # Update reminder tracking
        await sb_request("PATCH", f"pay_period_recipients?id=eq.{rec_id}", data={
            "reminder_count": (r.get("reminder_count") or 0) + 1,
            "last_reminder_at": datetime.now(timezone.utc).isoformat(),
        })

    logger.info(f"Reminders ({action}) for {period_label}: {count} sent to {len(recipients or [])} providers")
    return count


# ══════════════════════════════════════════════════════════════════
# Step 4: Admin summary
# ══════════════════════════════════════════════════════════════════


async def _send_admin_summary(period: dict):
    """Email admin(s) with the list of providers who didn't submit."""
    period_id = period["id"]
    period_label = period.get("label", "")

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


# ══════════════════════════════════════════════════════════════════
# Admin endpoints — scheduler status / config / dry-run
# ══════════════════════════════════════════════════════════════════


@router.get("/scheduler/status")
async def scheduler_status(admin=Depends(require_admin)):
    """Return current scheduler configuration, last-run info, and upcoming cadence."""
    from datetime import date as date_type

    today = today_et()
    cadence = await _get_cadence_config()
    wo_days = cadence["window_open_days"]
    dl_days = cadence["deadline_days"]

    # Build upcoming cadence (next ~45 days)
    cadence_preview = []
    periods = upcoming_periods(today, days_ahead=45, window_open_days=wo_days, deadline_days=dl_days)
    for p in periods:
        end_date = p["end_date"]
        window_open = end_date - timedelta(days=wo_days)
        deadline = end_date + timedelta(days=dl_days)
        info = calculate_period_info(p["start_date"], p["end_date"], wo_days, dl_days)

        # For each date in the cadence window, show what fires
        actions_by_date = {}
        for d_offset in range(-3, 10):  # scan days around period
            check_date = window_open + timedelta(days=d_offset)
            if check_date < today - timedelta(days=7):
                continue
            actions = get_reminder_actions(check_date, window_open, deadline)
            if actions:
                actions_by_date[check_date.isoformat()] = actions

        cadence_preview.append({
            "label": p["label"],
            "period_type": p["period_type"],
            "start_date": p["start_date"].isoformat(),
            "end_date": p["end_date"].isoformat(),
            "window_open": window_open.isoformat(),
            "deadline": deadline.isoformat(),
            "pay_date": info["effective_pay_date"].isoformat(),
            "actions": actions_by_date,
        })

    # Recent periods — filter out far-future drafts
    cutoff = (today + timedelta(days=30)).isoformat()
    db_periods = await sb_request("GET", "pay_periods", params={
        "select": "id,label,status,start_date,end_date,due_date,opened_at,window_open,deadline",
        "start_date": f"lte.{cutoff}",
        "order": "start_date.desc",
        "limit": "20",  # Get more to match with cadence preview
    }) or []

    # Create a lookup for existing periods by start/end date
    db_lookup = {(p["start_date"], p["end_date"]): p for p in db_periods}

    # Enhance cadence_preview with database IDs where periods exist
    enhanced_cadence = []
    for p in cadence_preview:
        key = (p["start_date"], p["end_date"])
        db_period = db_lookup.get(key)

        enhanced_period = {
            **p,
            "id": db_period["id"] if db_period else None,
            "status": db_period["status"] if db_period else "draft",
            "db_window_open": db_period.get("window_open") if db_period else None,
            "db_deadline": db_period.get("deadline") if db_period else None,
        }

        # Use database overrides if they exist, otherwise use calculated dates
        if enhanced_period["db_window_open"]:
            enhanced_period["window_open"] = enhanced_period["db_window_open"]
        if enhanced_period["db_deadline"]:
            enhanced_period["deadline"] = enhanced_period["db_deadline"]

        enhanced_cadence.append(enhanced_period)

    return {
        "scheduler_running": True,
        "last_run_date": _last_run_date,
        "scheduler_hour": SCHEDULER_HOUR,
        "sms_enabled": SMS_ENABLED,
        "app_url": APP_URL,
        "today": today.isoformat(),
        "cadence_config": cadence,
        "cadence_preview": enhanced_cadence,
        "recent_periods": db_periods[:6],  # Keep just the most recent 6
    }


@router.post("/scheduler/dry-run")
async def scheduler_dry_run(
    test_date: Optional[str] = None,
    admin=Depends(require_admin),
):
    """Run a dry-run of the scheduler for a given date (defaults to today).

    Shows what actions WOULD fire without actually executing them.
    """
    date_str = test_date or today_et().isoformat()
    return await _run_daily_logic(today_str=date_str, dry_run=True)


@router.post("/scheduler/run-now")
async def scheduler_run_now(admin=Depends(require_admin)):
    """Manually trigger the daily scheduler for today (real run, not dry-run).

    Use with caution — this will send real emails/SMS if providers are due.
    """
    global _last_run_date
    date_str = today_et().isoformat()
    results = await _run_daily_logic(today_str=date_str, dry_run=False)
    _last_run_date = date_str
    await _set_last_run_date(date_str)
    return results


@router.patch("/scheduler/cadence")
async def update_cadence(body: dict, admin=Depends(require_admin)):
    """Update the submission window cadence offsets.

    Body: { "window_open_days": 2, "deadline_days": 4 }
    """
    window = body.get("window_open_days")
    deadline = body.get("deadline_days")

    if window is not None:
        window = int(window)
        if not (1 <= window <= 7):
            raise HTTPException(400, "window_open_days must be between 1 and 7")
        await _upsert_setting("cadence_window_open_days", str(window))

    if deadline is not None:
        deadline = int(deadline)
        if not (2 <= deadline <= 10):
            raise HTTPException(400, "deadline_days must be between 2 and 10")
        await _upsert_setting("cadence_deadline_days", str(deadline))

    return await _get_cadence_config()


class PeriodUpdateRequest(BaseModel):
    window_open: str
    deadline: str


@router.patch("/pay-periods/{period_id}")
async def update_pay_period(
    period_id: str,
    request: PeriodUpdateRequest,
    admin=Depends(require_admin),
):
    """Update the window_open and deadline dates for a specific pay period."""
    from datetime import date as date_type

    try:
        # Validate dates
        window_date = date_type.fromisoformat(request.window_open)
        deadline_date = date_type.fromisoformat(request.deadline)

        if deadline_date <= window_date:
            raise HTTPException(status_code=400, detail="Deadline must be after window open date")

        # Update the period
        result = await sb_request("PATCH", f"pay_periods?id=eq.{period_id}", data={
            "window_open": request.window_open,
            "deadline": request.deadline,
        })

        # Log the change
        await sb_request("POST", "audit_log", data={
            "action": "pay_period_dates_updated",
            "entity_type": "pay_period",
            "entity_id": period_id,
            "details": {
                "window_open": request.window_open,
                "deadline": request.deadline,
                "updated_by": "admin",
            },
        })

        return {"success": True, "message": "Pay period updated successfully"}

    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")
    except Exception as e:
        logger.error(f"Failed to update pay period {period_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update pay period")
