"""Meetings: templates + instances — 7 endpoints + schedule helpers."""
import json
import calendar
from datetime import datetime, timedelta, date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from backend.deps import sb_request, verify_token, require_admin, logger
from backend.models import MeetingTemplateRequest

router = APIRouter(prefix="/api")


def _nth_weekday_in_month(year: int, month: int, day_of_week: int, nth: int) -> Optional[date]:
    """Find the nth occurrence of a weekday in a given month."""
    cal = calendar.Calendar(firstweekday=0)
    month_days = cal.monthdayscalendar(year, month)

    if nth == -1:
        for week in reversed(month_days):
            d = week[day_of_week]
            if d != 0:
                return date(year, month, d)
        return None

    count = 0
    for week in month_days:
        d = week[day_of_week]
        if d != 0:
            count += 1
            if count == nth:
                return date(year, month, d)
    return None


def _is_last_weekday_of_month(d: date) -> bool:
    """Check if this date is the last occurrence of its weekday in the month."""
    next_week = d + timedelta(days=7)
    return next_week.month != d.month


def compute_meeting_dates(template: dict, start: date, end: date) -> list:
    """Return all meeting dates for a template between start and end (inclusive)."""
    cadence = template.get("cadence", "weekly")
    rule = template.get("schedule_rule") or {}
    if isinstance(rule, str):
        try:
            rule = json.loads(rule)
        except Exception:
            rule = {}

    dates = []

    if cadence == "weekly":
        dow = int(rule.get("day_of_week", 0))
        skip_last = bool(rule.get("skip_last", False))
        current = start
        while current <= end:
            if current.weekday() == dow:
                if skip_last and _is_last_weekday_of_month(current):
                    pass
                else:
                    dates.append(current)
            current += timedelta(days=1)

    elif cadence == "monthly":
        nth = int(rule.get("nth", 1))
        dow = int(rule.get("day_of_week", 0))
        y, m = start.year, start.month
        while date(y, m, 1) <= end:
            d = _nth_weekday_in_month(y, m, dow, nth)
            if d and start <= d <= end:
                dates.append(d)
            m += 1
            if m > 12:
                m = 1
                y += 1

    elif cadence == "monthly_interval":
        every_n = int(rule.get("every_n_months", 1))
        anchor_str = rule.get("anchor", start.isoformat())
        weekday_rule = rule.get("weekday_rule")
        dom = int(rule.get("day_of_month", 1))
        try:
            anchor = date.fromisoformat(anchor_str)
        except Exception:
            anchor = start

        y, m = anchor.year, anchor.month
        while True:
            d = None
            if weekday_rule == "first_monday":
                d = _nth_weekday_in_month(y, m, 0, 1)
            else:
                try:
                    d = date(y, m, min(dom, calendar.monthrange(y, m)[1]))
                except ValueError:
                    pass
            if d and d > end:
                break
            if d and start <= d <= end:
                dates.append(d)
            m += every_n
            while m > 12:
                m -= 12
                y += 1

    elif cadence == "quarterly":
        specific_months = rule.get("months")
        if specific_months:
            day_of = int(rule.get("day", 15))
            for year in range(start.year, end.year + 1):
                for mo in specific_months:
                    try:
                        d = date(year, int(mo), min(day_of, calendar.monthrange(year, int(mo))[1]))
                        if start <= d <= end:
                            dates.append(d)
                    except ValueError:
                        pass
        else:
            moq = int(rule.get("month_of_quarter", 1))
            nth = int(rule.get("nth", 1))
            dow = int(rule.get("day_of_week", 0))
            quarter_starts = [1, 4, 7, 10]
            for qs in quarter_starts:
                target_month = qs + moq - 1
                for year in range(start.year, end.year + 1):
                    if target_month > 12:
                        continue
                    d = _nth_weekday_in_month(year, target_month, dow, nth)
                    if d and start <= d <= end:
                        dates.append(d)

    elif cadence == "yearly":
        mo = int(rule.get("month", 1))
        dy = int(rule.get("day", 1))
        for year in range(start.year, end.year + 1):
            try:
                d = date(year, mo, dy)
                if start <= d <= end:
                    dates.append(d)
            except ValueError:
                pass

    dates.sort()
    return dates


@router.post("/meetings/generate")
async def generate_meeting_instances(days: int = 120, admin=Depends(require_admin)):
    """Generate meeting_instances for all active templates."""
    today = date.today()
    window_end = today + timedelta(days=days)

    templates = await sb_request("GET", "meeting_templates", params={
        "active": "eq.true",
        "select": "*",
    })

    if not templates:
        return {"status": "ok", "generated": 0, "skipped": 0, "message": "No active meeting templates found"}

    generated = 0
    skipped = 0

    for tmpl in templates:
        meeting_dates = compute_meeting_dates(tmpl, today, window_end)

        for md in meeting_dates:
            instance = {
                "template_id": tmpl["id"],
                "title": tmpl["title"],
                "meeting_date": md.isoformat(),
            }

            try:
                await sb_request("POST", "meeting_instances", data=instance)
                generated += 1
            except HTTPException as e:
                if e.status_code in (409, 422, 400):
                    skipped += 1
                else:
                    logger.warning(f"Meeting instance insert failed: {e.detail}")
                    skipped += 1

    return {
        "status": "ok",
        "generated": generated,
        "skipped": skipped,
        "window_days": days,
        "templates_processed": len(templates),
    }


@router.get("/meetings/instances")
async def get_meeting_instances(user=Depends(verify_token)):
    """Get upcoming meeting instances for the current user."""
    today_str = date.today().isoformat()
    user_role = user.get("role", "therapist")

    instances = await sb_request("GET", "meeting_instances", params={
        "select": "*, meeting_templates(audience_roles, meeting_time)",
        "meeting_date": f"gte.{today_str}",
        "order": "meeting_date.asc",
        "limit": "50",
    })

    if not instances:
        return []

    filtered = []
    for inst in instances:
        tmpl = inst.get("meeting_templates") or {}
        audience = tmpl.get("audience_roles") or []
        meeting_time = tmpl.get("meeting_time")
        if not audience or user_role == "admin" or user_role in audience:
            inst.pop("meeting_templates", None)
            if meeting_time:
                inst["meeting_time"] = meeting_time
            filtered.append(inst)
        if len(filtered) >= 20:
            break

    return filtered


@router.get("/meetings/templates")
async def get_meeting_templates(admin=Depends(require_admin)):
    """Admin: list all meeting templates."""
    templates = await sb_request("GET", "meeting_templates", params={
        "select": "*",
        "order": "title.asc",
    })
    return templates or []


@router.post("/meetings/templates")
async def create_meeting_template(req: MeetingTemplateRequest, admin=Depends(require_admin)):
    """Admin: create a new meeting template."""
    data = req.dict()
    data["created_by_user_id"] = admin["id"]
    result = await sb_request("POST", "meeting_templates", data=data)
    return result


@router.patch("/meetings/templates/{template_id}")
async def update_meeting_template(template_id: str, req: MeetingTemplateRequest, admin=Depends(require_admin)):
    """Admin: update a meeting template."""
    data = req.dict()
    data["updated_at"] = datetime.utcnow().isoformat()
    result = await sb_request("PATCH", f"meeting_templates?id=eq.{template_id}", data=data)
    return result


@router.delete("/meetings/templates/{template_id}")
async def delete_meeting_template(template_id: str, admin=Depends(require_admin)):
    """Admin: deactivate a meeting template."""
    result = await sb_request("PATCH", f"meeting_templates?id=eq.{template_id}", data={"active": False})
    return {"status": "deactivated", "id": template_id}


@router.delete("/meetings/instances/{instance_id}")
async def delete_meeting_instance(instance_id: str, admin=Depends(require_admin)):
    """Admin: delete a meeting instance."""
    await sb_request("DELETE", f"meeting_instances?id=eq.{instance_id}")
    return {"status": "deleted", "id": instance_id}
