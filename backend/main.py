"""
BestLife Hub - FastAPI Backend
Handles: Auth verification, TherapyNotes upload/processing, analytics, user management, invoices.
"""
import os
import io
import json
import logging
import calendar
from datetime import datetime, timedelta, date
from typing import Optional, List

import httpx
import openpyxl
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

# ────────────────────────────────────────────────────────────────────
# Config
# ────────────────────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://jvtwvrqityxzcnsbrilk.supabase.co")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("bestlife")

app = FastAPI(title="BestLife Hub API")

# Startup logging
@app.on_event("startup")
async def startup_event():
    logger.info("BestLife Hub API starting up...")
    logger.info(f"Supabase URL: {SUPABASE_URL}")
    logger.info(f"Service key configured: {'Yes' if SUPABASE_SERVICE_KEY else 'No'}")
    logger.info(f"Anon key configured: {'Yes' if SUPABASE_ANON_KEY else 'No'}")


# ────────────────────────────────────────────────────────────────────
# Supabase helpers
# ────────────────────────────────────────────────────────────────────
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


# ────────────────────────────────────────────────────────────────────
# Models
# ────────────────────────────────────────────────────────────────────
class InviteUserRequest(BaseModel):
    email: str
    first_name: str
    last_name: str
    role: str


# ────────────────────────────────────────────────────────────────────
# API Routes
# ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


# ── User Management ──────────────────────────────────────────────

@app.post("/api/admin/invite-user")
async def invite_user(req: InviteUserRequest, admin=Depends(require_admin)):
    """Create a new user via Supabase Auth and add to users table."""
    # Create auth user with Supabase Admin API
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{SUPABASE_URL}/auth/v1/admin/users",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "email": req.email,
                "email_confirm": False,
                "user_metadata": {
                    "first_name": req.first_name,
                    "last_name": req.last_name,
                },
            },
        )

        if resp.status_code >= 400:
            error_detail = resp.json().get("msg", resp.text)
            raise HTTPException(status_code=400, detail=f"Auth error: {error_detail}")

        auth_user = resp.json()

    # Insert into users table
    await sb_request("POST", "users", data={
        "auth_id": auth_user["id"],
        "email": req.email,
        "first_name": req.first_name,
        "last_name": req.last_name,
        "role": req.role,
        "is_active": True,
    })

    # Send magic link / invite email
    async with httpx.AsyncClient(timeout=10.0) as client:
        await client.post(
            f"{SUPABASE_URL}/auth/v1/admin/generate_link",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "type": "invite",
                "email": req.email,
            },
        )

    return {"status": "invited", "email": req.email}


# ── TherapyNotes Upload & Processing ────────────────────────────

@app.post("/api/upload/therapynotes")
async def upload_therapynotes(file: UploadFile = File(...), admin=Depends(require_admin)):
    """Process a TherapyNotes billing export and store transactions in Supabase."""
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Please upload an .xlsx file")

    contents = await file.read()
    wb = openpyxl.load_workbook(io.BytesIO(contents), read_only=True, data_only=True)
    ws = wb.active

    # Parse headers
    headers = [str(cell.value or "").strip() for cell in next(ws.iter_rows(min_row=1, max_row=1))]
    header_map = {h: i for i, h in enumerate(headers)}

    required_cols = ["Record Type"]
    for col in required_cols:
        if col not in header_map:
            raise HTTPException(status_code=400, detail=f"Missing required column: {col}")

    # Parse rows
    transactions = []
    therapist_names = set()
    date_min = None
    date_max = None

    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or not row[0]:
            continue

        def cell(name):
            idx = header_map.get(name)
            return row[idx] if idx is not None and idx < len(row) else None

        record_type = str(cell("Record Type") or "").strip()
        patient_name = str(cell("Patient Name") or cell("Patient") or "").strip()
        provider_name = str(cell("Provider Name") or cell("Provider") or "").strip()
        service_date = cell("Service Date") or cell("Date")
        amount = cell("Amount") or cell("Payment Amount") or 0
        payer = str(cell("Payer") or cell("Payer Name") or "").strip()
        code = str(cell("Code") or cell("Procedure Code") or "").strip()
        description = str(cell("Description") or "").strip()

        # Parse date
        date_str = None
        if isinstance(service_date, datetime):
            date_str = service_date.strftime("%Y-%m-%d")
        elif service_date:
            try:
                for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y"):
                    try:
                        date_str = datetime.strptime(str(service_date).strip(), fmt).strftime("%Y-%m-%d")
                        break
                    except ValueError:
                        continue
            except Exception:
                pass

        # Parse amount
        try:
            amount_val = float(str(amount).replace("$", "").replace(",", "").replace("(", "-").replace(")", ""))
        except (ValueError, TypeError):
            amount_val = 0.0

        if provider_name:
            therapist_names.add(provider_name)

        if date_str:
            d = datetime.strptime(date_str, "%Y-%m-%d")
            if date_min is None or d < date_min:
                date_min = d
            if date_max is None or d > date_max:
                date_max = d

        transactions.append({
            "record_type": record_type,
            "patient_name": patient_name,
            "provider_name": provider_name,
            "service_date": date_str,
            "amount": amount_val,
            "payer": payer,
            "code": code,
            "description": description,
        })

    wb.close()

    if not transactions:
        raise HTTPException(status_code=400, detail="No transactions found in file")

    # Batch insert into Supabase (chunks of 500)
    chunk_size = 500
    for i in range(0, len(transactions), chunk_size):
        chunk = transactions[i:i + chunk_size]
        await sb_request("POST", "transactions", data=chunk)

    # Ensure therapists exist in users table (upsert check)
    for name in therapist_names:
        parts = name.split(None, 1)
        first = parts[0] if parts else name
        last = parts[1] if len(parts) > 1 else ""

        existing = await sb_request("GET", "therapists", params={
            "name": f"eq.{name}",
            "select": "id",
        })
        if not existing:
            await sb_request("POST", "therapists", data={
                "name": name,
                "first_name": first,
                "last_name": last,
            })

    # Update upload metadata
    await sb_request("POST", "upload_metadata", data={
        "filename": file.filename,
        "uploaded_by": admin["id"],
        "transactions_count": len(transactions),
        "therapist_count": len(therapist_names),
        "date_range_start": date_min.strftime("%Y-%m-%d") if date_min else None,
        "date_range_end": date_max.strftime("%Y-%m-%d") if date_max else None,
    })

    date_range = ""
    if date_min and date_max:
        date_range = f"{date_min.strftime('%b %d, %Y')} — {date_max.strftime('%b %d, %Y')}"

    return {
        "status": "success",
        "transactions_count": len(transactions),
        "therapist_count": len(therapist_names),
        "date_range": date_range,
    }


@app.get("/api/settings/last-upload")
async def get_last_upload(user=Depends(verify_token)):
    """Get the most recent upload metadata."""
    results = await sb_request("GET", "upload_metadata", params={
        "select": "*",
        "order": "created_at.desc",
        "limit": "1",
    })
    if results:
        return {
            "uploaded_at": results[0].get("created_at"),
            "filename": results[0].get("filename"),
        }
    return None


# ── Analytics ────────────────────────────────────────────────────

@app.get("/api/analytics/summary")
async def analytics_summary(user=Depends(verify_token)):
    """
    Generate therapist analytics summary from transactions table.
    Preserves the existing LTV + engagement calculation logic.
    """
    # Fetch all transactions
    all_txns = []
    offset = 0
    page_size = 1000
    while True:
        page = await sb_request("GET", "transactions", params={
            "select": "*",
            "offset": str(offset),
            "limit": str(page_size),
        })
        if not page:
            break
        all_txns.extend(page)
        if len(page) < page_size:
            break
        offset += page_size

    if not all_txns:
        raise HTTPException(status_code=404, detail="No transaction data available")

    # ── Build analytics (mirrors existing Python logic) ──
    # Separate appointments and payments
    appointments = [t for t in all_txns if t.get("record_type", "").lower() in ("appointment", "charge")]
    payments = [t for t in all_txns if t.get("record_type", "").lower() == "payment"]

    # ── LTV Calculation ──
    # Get customer → provider mapping, expected insurance per customer
    customer_provider = {}  # customer → {provider: count}
    customer_expected_ins = {}  # customer → expected insurance amount
    customer_copay = {}  # customer → total copay payments

    for appt in appointments:
        name = appt.get("patient_name", "").strip()
        provider = appt.get("provider_name", "").strip()
        amount = abs(appt.get("amount", 0))

        if not name or not provider:
            continue

        if name not in customer_provider:
            customer_provider[name] = {}
        customer_provider[name][provider] = customer_provider[name].get(provider, 0) + 1

        # Expected insurance = billed amount (appointments typically represent billed amounts)
        customer_expected_ins[name] = customer_expected_ins.get(name, 0) + amount

    # Process payments
    attributed_insurance = {}  # customer → amount
    unattributed_insurance_total = 0.0

    for pmt in payments:
        name = pmt.get("patient_name", "").strip()
        amount = abs(pmt.get("amount", 0))
        payer = pmt.get("payer", "").strip().lower()

        is_patient_payment = "patient" in payer or "copay" in payer or "self" in payer or not payer
        is_insurance = not is_patient_payment

        if name and is_patient_payment:
            customer_copay[name] = customer_copay.get(name, 0) + amount
        elif name and is_insurance:
            attributed_insurance[name] = attributed_insurance.get(name, 0) + amount
        elif is_insurance:
            unattributed_insurance_total += amount

    # Proportional allocation of unattributed insurance
    total_expected = sum(customer_expected_ins.values()) or 1
    customer_allocated_ins = {}
    for name, expected in customer_expected_ins.items():
        share = expected / total_expected
        customer_allocated_ins[name] = share * unattributed_insurance_total

    # Calculate per-customer LTV
    all_customers = set(customer_copay.keys()) | set(attributed_insurance.keys()) | set(customer_expected_ins.keys())
    customer_ltv = {}
    for name in all_customers:
        copay = customer_copay.get(name, 0)
        ins_direct = attributed_insurance.get(name, 0)
        ins_allocated = customer_allocated_ins.get(name, 0)
        customer_ltv[name] = copay + ins_direct + ins_allocated

    # ── Per-therapist metrics ──
    # Determine primary therapist per customer
    customer_primary = {}
    for name, providers in customer_provider.items():
        customer_primary[name] = max(providers, key=providers.get)

    # APN handling: Tracey Nagle gets all clients, not just primary
    APN_NAMES = {"Tracey Nagle"}

    therapist_clients = {}  # therapist → set of clients
    therapist_appt_counts = {}  # therapist → {client: count}

    for name, providers in customer_provider.items():
        primary = customer_primary.get(name)
        if primary and primary not in APN_NAMES:
            if primary not in therapist_clients:
                therapist_clients[primary] = set()
                therapist_appt_counts[primary] = {}
            therapist_clients[primary].add(name)
            therapist_appt_counts[primary][name] = providers.get(primary, 0)

    # APN: all clients they've seen
    for name, providers in customer_provider.items():
        for apn in APN_NAMES:
            if apn in providers:
                if apn not in therapist_clients:
                    therapist_clients[apn] = set()
                    therapist_appt_counts[apn] = {}
                therapist_clients[apn].add(name)
                therapist_appt_counts[apn][name] = providers[apn]

    # Build therapist summary list
    therapist_list = []
    therapist_details = {}

    for therapist, clients in therapist_clients.items():
        client_count = len(clients)
        total_rev = sum(customer_ltv.get(c, 0) for c in clients)
        avg_ltv = total_rev / client_count if client_count else 0

        appts_per_client = [therapist_appt_counts[therapist].get(c, 0) for c in clients]
        avg_appts = sum(appts_per_client) / len(appts_per_client) if appts_per_client else 0
        total_appts = sum(appts_per_client)

        therapist_list.append({
            "name": therapist,
            "client_count": client_count,
            "ltv_contribution": round(total_rev, 2),
            "is_apn": therapist in APN_NAMES,
        })

        therapist_details[therapist] = {
            "client_count": client_count,
            "avg_ltv": round(avg_ltv, 2),
            "total_revenue": round(total_rev, 2),
            "avg_appointments": round(avg_appts, 1),
            "total_appointments": total_appts,
        }

    # Sort by LTV contribution descending
    therapist_list.sort(key=lambda x: x["ltv_contribution"], reverse=True)

    # Practice averages
    all_avg_ltv = list(therapist_details.values())
    practice_avg = {
        "avg_ltv": round(sum(d["avg_ltv"] for d in all_avg_ltv) / len(all_avg_ltv), 2) if all_avg_ltv else 0,
        "avg_appointments": round(sum(d["avg_appointments"] for d in all_avg_ltv) / len(all_avg_ltv), 1) if all_avg_ltv else 0,
    }

    return {
        "therapists": therapist_list,
        "therapist_details": therapist_details,
        "practice_avg": practice_avg,
        "total_customers": len(all_customers),
        "total_revenue": round(sum(customer_ltv.values()), 2),
    }


@app.get("/api/analytics/therapist/{user_id}")
async def therapist_analytics(user_id: str, user=Depends(verify_token)):
    """Get analytics for a specific therapist (by user_id)."""
    # Get the user's name to match against transactions
    users = await sb_request("GET", "users", params={
        "id": f"eq.{user_id}",
        "select": "first_name,last_name",
    })
    if not users:
        raise HTTPException(status_code=404, detail="User not found")

    therapist_name = f"{users[0]['first_name']} {users[0]['last_name']}"

    # Get full summary and extract this therapist's data
    try:
        # Use the summary endpoint logic
        summary_data = await analytics_summary.__wrapped__(user) if hasattr(analytics_summary, '__wrapped__') else None
    except Exception:
        summary_data = None

    if not summary_data:
        # Fallback: compute directly
        try:
            from starlette.requests import Request as _R
            # Re-use the summary function with a mock
            all_txns = []
            offset = 0
            while True:
                page = await sb_request("GET", "transactions", params={
                    "select": "*", "offset": str(offset), "limit": "1000",
                })
                if not page:
                    break
                all_txns.extend(page)
                if len(page) < 1000:
                    break
                offset += 1000

            if not all_txns:
                raise HTTPException(status_code=404, detail="No data")

            # Quick per-therapist calc
            my_appts = [t for t in all_txns if t.get("provider_name", "").strip() == therapist_name and t.get("record_type", "").lower() in ("appointment", "charge")]
            clients = set(t.get("patient_name", "").strip() for t in my_appts if t.get("patient_name"))
            client_count = len(clients)

            appts_by_client = {}
            for t in my_appts:
                c = t.get("patient_name", "").strip()
                if c:
                    appts_by_client[c] = appts_by_client.get(c, 0) + 1

            avg_appts = sum(appts_by_client.values()) / len(appts_by_client) if appts_by_client else 0

            return {
                "client_count": client_count,
                "avg_ltv": 0,
                "total_revenue": 0,
                "avg_appointments": round(avg_appts, 1),
                "practice_avg_ltv": 0,
                "practice_avg_appointments": 0,
            }

        except Exception as e:
            raise HTTPException(status_code=404, detail="No analytics data available")

    details = summary_data.get("therapist_details", {}).get(therapist_name, {})
    practice_avg = summary_data.get("practice_avg", {})

    return {
        **details,
        "practice_avg_ltv": practice_avg.get("avg_ltv", 0),
        "practice_avg_appointments": practice_avg.get("avg_appointments", 0),
    }


# ── Task Generation ──────────────────────────────────────────────

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
            # Include every N days from start
            delta = (current - start).days
            include = (delta % every_n == 0)

        elif schedule_type == "weekly":
            weekdays = rule.get("weekdays", [0, 1, 2, 3, 4])  # Mon–Fri default
            # Python weekday(): Mon=0, Sun=6
            include = current.weekday() in weekdays

        elif schedule_type == "monthly":
            day_of_month = int(rule.get("day_of_month", 1))
            include = current.day == day_of_month

        if include:
            due = current + timedelta(days=offset)
            due_dates.append(due)

        current += timedelta(days=1)

    return due_dates


@app.post("/api/tasks/generate")
async def generate_task_instances(days: int = 30, admin=Depends(require_admin)):
    """
    Generate task_instances for all active templates over the next `days` days.
    Safe to call repeatedly — unique constraint prevents duplicates.
    Admin-only.
    """
    today = date.today()
    window_end = today + timedelta(days=days)

    # Fetch all active templates
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
                # 409 Conflict = duplicate (unique constraint) — expected, skip silently
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


@app.get("/api/tasks/instances")
async def get_task_instances(user=Depends(verify_token)):
    """
    Get task instances for the current user.
    Admins see all; others see only their own (by user_id or role).
    """
    params = {
        "select": "*, task_templates(title, schedule_type)",
        "order": "due_date.asc",
    }

    if user.get("role") != "admin":
        # Filter to user's own instances or role-based ones
        params["or"] = f"(assigned_to_user_id.eq.{user['id']},assigned_to_role.eq.{user['role']})"

    instances = await sb_request("GET", "task_instances", params=params)
    return instances or []


@app.patch("/api/tasks/instances/{instance_id}")
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


@app.get("/api/tasks/templates")
async def get_task_templates(admin=Depends(require_admin)):
    """Admin: list all task templates."""
    templates = await sb_request("GET", "task_templates", params={
        "select": "*",
        "order": "created_at.desc",
    })
    return templates or []


class TaskTemplateRequest(BaseModel):
    title: str
    description: Optional[str] = None
    tags: Optional[List[str]] = []
    priority: str = "medium"
    assigned_to_role: Optional[str] = None
    assigned_to_user_id: Optional[str] = None
    schedule_type: str = "weekly"
    schedule_rule: Optional[str] = "{}"
    timezone: str = "America/New_York"
    default_due_offset_days: int = 0
    active: bool = True


@app.post("/api/tasks/templates")
async def create_task_template(req: TaskTemplateRequest, admin=Depends(require_admin)):
    """Admin: create a new task template."""
    data = req.dict()
    data["created_by_user_id"] = admin["id"]
    result = await sb_request("POST", "task_templates", data=data)
    return result


@app.patch("/api/tasks/templates/{template_id}")
async def update_task_template(template_id: str, req: TaskTemplateRequest, admin=Depends(require_admin)):
    """Admin: update an existing task template."""
    data = req.dict()
    data["updated_at"] = datetime.utcnow().isoformat()
    result = await sb_request("PATCH", f"task_templates?id=eq.{template_id}", data=data)
    return result


@app.delete("/api/tasks/templates/{template_id}")
async def delete_task_template(template_id: str, admin=Depends(require_admin)):
    """Admin: soft-delete (deactivate) a task template."""
    result = await sb_request("PATCH", f"task_templates?id=eq.{template_id}", data={"active": False})
    return {"status": "deactivated", "id": template_id}


# ── Meeting Generation ────────────────────────────────────────────

def _nth_weekday_in_month(year: int, month: int, day_of_week: int, nth: int) -> Optional[date]:
    """
    Find the nth occurrence of a weekday in a given month.
    day_of_week: 0=Mon..6=Sun
    nth: 1-based (1=first, 2=second, ...) or -1 for last.
    Returns a date or None if invalid.
    """
    # calendar.monthcalendar returns weeks starting Monday by default
    cal = calendar.Calendar(firstweekday=0)  # Monday = 0
    month_days = cal.monthdayscalendar(year, month)

    if nth == -1:
        # Last occurrence: iterate weeks in reverse
        for week in reversed(month_days):
            d = week[day_of_week]
            if d != 0:
                return date(year, month, d)
        return None

    # Positive nth: count occurrences
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
    # If adding 7 days pushes us to next month, it's the last one
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
                    pass  # Skip last occurrence of this weekday
                else:
                    dates.append(current)
            current += timedelta(days=1)

    elif cadence == "monthly":
        nth = int(rule.get("nth", 1))
        dow = int(rule.get("day_of_week", 0))
        # Iterate each month in range
        y, m = start.year, start.month
        while date(y, m, 1) <= end:
            d = _nth_weekday_in_month(y, m, dow, nth)
            if d and start <= d <= end:
                dates.append(d)
            # Next month
            m += 1
            if m > 12:
                m = 1
                y += 1

    elif cadence == "monthly_interval":
        every_n = int(rule.get("every_n_months", 1))
        anchor_str = rule.get("anchor", start.isoformat())
        weekday_rule = rule.get("weekday_rule")  # e.g. "first_monday"
        dom = int(rule.get("day_of_month", 1))
        try:
            anchor = date.fromisoformat(anchor_str)
        except Exception:
            anchor = start

        # Start from anchor, step by every_n_months
        y, m = anchor.year, anchor.month
        while True:
            d = None
            if weekday_rule == "first_monday":
                d = _nth_weekday_in_month(y, m, 0, 1)  # 1st Monday
            else:
                try:
                    d = date(y, m, min(dom, calendar.monthrange(y, m)[1]))
                except ValueError:
                    pass
            if d and d > end:
                break
            if d and start <= d <= end:
                dates.append(d)
            # Step forward
            m += every_n
            while m > 12:
                m -= 12
                y += 1

    elif cadence == "quarterly":
        # Two modes:
        # 1) "months": [4, 7, 10] — specific months with day 15 default
        # 2) "month_of_quarter" + "nth" + "day_of_week" — nth weekday in nth month of quarter
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
            moq = int(rule.get("month_of_quarter", 1))  # 1, 2, or 3
            nth = int(rule.get("nth", 1))
            dow = int(rule.get("day_of_week", 0))
            # Quarters: Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec
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
                pass  # Invalid date (e.g., Feb 30)

    dates.sort()
    return dates


@app.post("/api/meetings/generate")
async def generate_meeting_instances(days: int = 120, admin=Depends(require_admin)):
    """
    Generate meeting_instances for all active templates over the next `days` days.
    Safe to call repeatedly — unique constraint prevents duplicates.
    Admin-only.
    """
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


@app.get("/api/meetings/instances")
async def get_meeting_instances(user=Depends(verify_token)):
    """
    Get upcoming meeting instances for the current user.
    Filters by audience_roles on the template (empty = all roles).
    Returns the next 20 meetings from today onward.
    """
    today_str = date.today().isoformat()
    user_role = user.get("role", "therapist")

    # Fetch upcoming instances with template info (service key to bypass RLS for join)
    instances = await sb_request("GET", "meeting_instances", params={
        "select": "*, meeting_templates(audience_roles, meeting_time)",
        "meeting_date": f"gte.{today_str}",
        "order": "meeting_date.asc",
        "limit": "50",
    })

    if not instances:
        return []

    # Filter by audience role client-side (since Supabase REST join filtering is limited)
    filtered = []
    for inst in instances:
        tmpl = inst.get("meeting_templates") or {}
        audience = tmpl.get("audience_roles") or []
        meeting_time = tmpl.get("meeting_time")
        # Empty audience = visible to all; admin sees everything
        if not audience or user_role == "admin" or user_role in audience:
            # Flatten meeting_time into the instance and remove nested template data
            inst.pop("meeting_templates", None)
            if meeting_time:
                inst["meeting_time"] = meeting_time
            filtered.append(inst)
        if len(filtered) >= 20:
            break

    return filtered


# ── Meeting Template CRUD ─────────────────────────────────────────

class MeetingTemplateRequest(BaseModel):
    title: str
    cadence: str = "weekly"
    schedule_rule: Optional[dict] = {}
    audience_roles: Optional[List[str]] = []
    meeting_time: Optional[str] = None
    active: bool = True


@app.get("/api/meetings/templates")
async def get_meeting_templates(admin=Depends(require_admin)):
    """Admin: list all meeting templates."""
    templates = await sb_request("GET", "meeting_templates", params={
        "select": "*",
        "order": "title.asc",
    })
    return templates or []


@app.post("/api/meetings/templates")
async def create_meeting_template(req: MeetingTemplateRequest, admin=Depends(require_admin)):
    """Admin: create a new meeting template."""
    data = req.dict()
    data["created_by_user_id"] = admin["id"]
    result = await sb_request("POST", "meeting_templates", data=data)
    return result


@app.patch("/api/meetings/templates/{template_id}")
async def update_meeting_template(template_id: str, req: MeetingTemplateRequest, admin=Depends(require_admin)):
    """Admin: update a meeting template."""
    data = req.dict()
    data["updated_at"] = datetime.utcnow().isoformat()
    result = await sb_request("PATCH", f"meeting_templates?id=eq.{template_id}", data=data)
    return result


@app.delete("/api/meetings/templates/{template_id}")
async def delete_meeting_template(template_id: str, admin=Depends(require_admin)):
    """Admin: deactivate a meeting template."""
    result = await sb_request("PATCH", f"meeting_templates?id=eq.{template_id}", data={"active": False})
    return {"status": "deactivated", "id": template_id}


# ── Meeting Instance CRUD ─────────────────────────────────────────

class MeetingInstanceRequest(BaseModel):
    title: str
    meeting_date: str
    template_id: Optional[str] = None


@app.delete("/api/meetings/instances/{instance_id}")
async def delete_meeting_instance(instance_id: str, admin=Depends(require_admin)):
    """Admin: delete a meeting instance."""
    await sb_request("DELETE", f"meeting_instances?id=eq.{instance_id}")
    return {"status": "deleted", "id": instance_id}


# ── Announcements CRUD ────────────────────────────────────────────

class AnnouncementRequest(BaseModel):
    title: str
    body: Optional[str] = None
    category: str = "general"
    audience_roles: Optional[List[str]] = []
    effective_date: str
    expiration_date: Optional[str] = None


@app.get("/api/announcements")
async def get_announcements(admin=Depends(require_admin)):
    """Admin: list all announcements (including expired)."""
    results = await sb_request("GET", "announcements", params={
        "select": "*",
        "order": "effective_date.desc",
    })
    return results or []


@app.post("/api/announcements")
async def create_announcement(req: AnnouncementRequest, admin=Depends(require_admin)):
    """Admin: create an announcement."""
    data = req.dict()
    data["created_by_user_id"] = admin["id"]
    result = await sb_request("POST", "announcements", data=data)
    return result


@app.patch("/api/announcements/{announcement_id}")
async def update_announcement(announcement_id: str, req: AnnouncementRequest, admin=Depends(require_admin)):
    """Admin: update an announcement."""
    data = req.dict()
    result = await sb_request("PATCH", f"announcements?id=eq.{announcement_id}", data=data)
    return result


@app.delete("/api/announcements/{announcement_id}")
async def delete_announcement(announcement_id: str, admin=Depends(require_admin)):
    """Admin: delete an announcement."""
    await sb_request("DELETE", f"announcements?id=eq.{announcement_id}")
    return {"status": "deleted", "id": announcement_id}


# ── Static File Serving (Production) ────────────────────────────

# Mount the built frontend in production
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(frontend_dist):
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        file_path = os.path.join(frontend_dist, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_dist, "index.html"))
