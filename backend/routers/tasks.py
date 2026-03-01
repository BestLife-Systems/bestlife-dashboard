"""Tasks: templates + instances — 7 endpoints + compute_due_dates()."""
import json
from datetime import datetime, timedelta, date
from typing import List

from fastapi import APIRouter, Depends, Request, HTTPException

from backend.deps import sb_request, verify_token, require_admin, logger
from backend.models import TaskTemplateRequest

router = APIRouter(prefix="/api")


def compute_due_dates(template: dict, start: date, end: date) -> List[date]:
    """Return all due dates for a template between start and end (inclusive)."""
    schedule_type = template.get("schedule_type", "weekly")
    try:
        rule = json.loads(template.get("schedule_rule") or "{}")
    except Exception:
        rule = {}

    offset = int(template.get("default_due_offset_days") or 0)
    due_dates = []
    current = start

    while current <= end:
        include = False

        if schedule_type == "daily":
            every_n = int(rule.get("every_n_days", 1))
            delta = (current - start).days
            include = (delta % every_n == 0)

        elif schedule_type == "weekly":
            weekdays = rule.get("weekdays", [0, 1, 2, 3, 4])  # Mon–Fri default
            include = current.weekday() in weekdays

        elif schedule_type == "monthly":
            day_of_month = int(rule.get("day_of_month", 1))
            include = current.day == day_of_month

        if include:
            due = current + timedelta(days=offset)
            due_dates.append(due)

        current += timedelta(days=1)

    return due_dates


@router.post("/tasks/generate")
async def generate_task_instances(days: int = 30, admin=Depends(require_admin)):
    """Generate task_instances for all active templates over the next `days` days."""
    today = date.today()
    window_end = today + timedelta(days=days)

    templates = await sb_request("GET", "task_templates", params={
        "active": "eq.true",
        "select": "*",
    })

    if not templates:
        return {"status": "ok", "generated": 0, "skipped": 0, "message": "No active templates found"}

    generated = 0
    skipped = 0

    for tmpl in templates:
        due_dates = compute_due_dates(tmpl, today, window_end)

        for due in due_dates:
            instance = {
                "template_id": tmpl["id"],
                "title": tmpl["title"],
                "description": tmpl.get("description"),
                "tags": tmpl.get("tags", []),
                "priority": tmpl.get("priority", "medium"),
                "assigned_to_user_id": tmpl.get("assigned_to_user_id"),
                "assigned_to_role": tmpl.get("assigned_to_role"),
                "due_date": due.isoformat(),
                "status": "backlog",
            }

            try:
                await sb_request("POST", "task_instances", data=instance)
                generated += 1
            except HTTPException as e:
                if e.status_code in (409, 422, 400):
                    skipped += 1
                else:
                    logger.warning(f"Task instance insert failed: {e.detail}")
                    skipped += 1

    return {
        "status": "ok",
        "generated": generated,
        "skipped": skipped,
        "window_days": days,
        "templates_processed": len(templates),
    }


@router.get("/tasks/instances")
async def get_task_instances(user=Depends(verify_token)):
    """Get task instances for the current user."""
    params = {
        "select": "*, task_templates(title, schedule_type)",
        "order": "due_date.asc",
    }

    if user.get("role") != "admin":
        params["or"] = f"(assigned_to_user_id.eq.{user['id']},assigned_to_role.eq.{user['role']})"

    instances = await sb_request("GET", "task_instances", params=params)
    if not instances:
        return []

    # Deduplicate: for each title+due_date combo, if ANY instance is 'done', exclude all
    done_keys = set()
    for inst in instances:
        if inst.get("status") in ("done", "skipped"):
            key = f"{inst.get('title')}|{inst.get('due_date')}"
            done_keys.add(key)

    deduped = {}
    for inst in instances:
        key = f"{inst.get('title')}|{inst.get('due_date')}"
        if key in done_keys:
            if inst.get("status") in ("done", "skipped"):
                if key not in deduped or deduped[key].get("status") not in ("done", "skipped"):
                    deduped[key] = inst
            continue
        if key not in deduped:
            deduped[key] = inst

    return list(deduped.values())


@router.patch("/tasks/instances/{instance_id}")
async def update_task_instance(instance_id: str, request: Request, user=Depends(verify_token)):
    """Update a task instance status."""
    body = await request.json()
    allowed_fields = {"status", "completed_at"}
    update_data = {k: v for k, v in body.items() if k in allowed_fields}

    if "status" in update_data and update_data["status"] == "done":
        update_data["completed_at"] = datetime.utcnow().isoformat()
    elif "status" in update_data and update_data["status"] != "done":
        update_data["completed_at"] = None

    update_data["updated_at"] = datetime.utcnow().isoformat()

    result = await sb_request("PATCH", f"task_instances?id=eq.{instance_id}", data=update_data)
    return result


@router.get("/tasks/templates")
async def get_task_templates(admin=Depends(require_admin)):
    """Admin: list all task templates."""
    templates = await sb_request("GET", "task_templates", params={
        "select": "*",
        "order": "created_at.desc",
    })
    return templates or []


@router.post("/tasks/templates")
async def create_task_template(req: TaskTemplateRequest, admin=Depends(require_admin)):
    """Admin: create a new task template."""
    data = req.dict()
    data["created_by_user_id"] = admin["id"]
    result = await sb_request("POST", "task_templates", data=data)
    return result


@router.patch("/tasks/templates/{template_id}")
async def update_task_template(template_id: str, req: TaskTemplateRequest, admin=Depends(require_admin)):
    """Admin: update an existing task template."""
    data = req.dict()
    data["updated_at"] = datetime.utcnow().isoformat()
    result = await sb_request("PATCH", f"task_templates?id=eq.{template_id}", data=data)
    return result


@router.delete("/tasks/templates/{template_id}")
async def delete_task_template(template_id: str, admin=Depends(require_admin)):
    """Admin: soft-delete (deactivate) a task template."""
    result = await sb_request("PATCH", f"task_templates?id=eq.{template_id}", data={"active": False})
    return {"status": "deactivated", "id": template_id}
