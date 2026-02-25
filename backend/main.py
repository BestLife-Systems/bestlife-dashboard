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

    # Send invite email via Supabase Auth
    async with httpx.AsyncClient(timeout=10.0) as client:
        invite_resp = await client.post(
            f"{SUPABASE_URL}/auth/v1/invite",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "email": req.email,
            },
        )
        # Log if invite fails but don't block — user is already created
        if invite_resp.status_code >= 400:
            print(f"Warning: invite email failed for {req.email}: {invite_resp.text}")

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


# ── Admin: List Users ──────────────────────────────────────────────

@app.get("/api/admin/users")
async def list_users(admin=Depends(require_admin)):
    """Admin: list all users."""
    users = await sb_request("GET", "users", params={
        "select": "*",
        "order": "last_name.asc",
    })
    return users or []


# ═══════════════════════════════════════════════════════════════════
# PAYROLL SYSTEM
# ═══════════════════════════════════════════════════════════════════

# ── Twilio Config ──────────────────────────────────────────────────
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_MESSAGING_SERVICE_SID = os.environ.get("TWILIO_MESSAGING_SERVICE_SID", "")

twilio_client = None

@app.on_event("startup")
async def init_twilio():
    global twilio_client
    if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
        try:
            from twilio.rest import Client
            twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
            logger.info("Twilio client initialized")
        except ImportError:
            logger.warning("twilio package not installed — SMS disabled")
        except Exception as e:
            logger.warning(f"Twilio init failed: {e}")
    else:
        logger.info("Twilio credentials not configured — SMS disabled")


def send_sms(to_number: str, body: str):
    """Send SMS via Twilio Messaging Service."""
    if not twilio_client or not TWILIO_MESSAGING_SERVICE_SID:
        logger.info(f"SMS skipped (no Twilio): {to_number}")
        return None
    try:
        msg = twilio_client.messages.create(
            messaging_service_sid=TWILIO_MESSAGING_SERVICE_SID,
            to=to_number,
            body=body,
        )
        logger.info(f"SMS sent to {to_number}: {msg.sid}")
        return msg.sid
    except Exception as e:
        logger.error(f"SMS send failed: {e}")
        return None


# ── Rate Catalog ───────────────────────────────────────────────────

@app.get("/api/payroll/rate-catalog")
async def get_rate_catalog(user=Depends(verify_token)):
    """Get all rate types and bill rate defaults."""
    rate_types = await sb_request("GET", "rate_types", params={
        "select": "*",
        "is_active": "eq.true",
        "order": "sort_order.asc",
    })
    bill_defaults = await sb_request("GET", "bill_rate_defaults", params={
        "select": "*",
    })
    return {
        "rate_types": rate_types or [],
        "bill_rate_defaults": bill_defaults or [],
    }


class RateTypeRequest(BaseModel):
    name: str
    unit: str = "hourly"
    default_duration_minutes: Optional[int] = None
    default_bill_rate: Optional[float] = None


@app.post("/api/payroll/rate-types")
async def create_rate_type(req: RateTypeRequest, admin=Depends(require_admin)):
    """Admin: create a new rate type."""
    result = await sb_request("POST", "rate_types", data={
        "name": req.name,
        "unit": req.unit,
        "default_duration_minutes": req.default_duration_minutes,
    })
    if req.default_bill_rate and result:
        rt_id = result[0]["id"] if isinstance(result, list) else result["id"]
        await sb_request("POST", "bill_rate_defaults", data={
            "rate_type_id": rt_id,
            "default_bill_rate": req.default_bill_rate,
        })
    return result


@app.patch("/api/payroll/rate-types/{rate_type_id}")
async def update_rate_type(rate_type_id: str, req: RateTypeRequest, admin=Depends(require_admin)):
    """Admin: update a rate type."""
    await sb_request("PATCH", f"rate_types?id=eq.{rate_type_id}", data={
        "name": req.name,
        "unit": req.unit,
        "default_duration_minutes": req.default_duration_minutes,
        "updated_at": datetime.utcnow().isoformat(),
    })
    if req.default_bill_rate is not None:
        existing = await sb_request("GET", "bill_rate_defaults", params={
            "rate_type_id": f"eq.{rate_type_id}",
        })
        if existing:
            await sb_request("PATCH", f"bill_rate_defaults?rate_type_id=eq.{rate_type_id}", data={
                "default_bill_rate": req.default_bill_rate,
            })
        else:
            await sb_request("POST", "bill_rate_defaults", data={
                "rate_type_id": rate_type_id,
                "default_bill_rate": req.default_bill_rate,
            })
    return {"status": "updated"}


# ── User Pay Rates ─────────────────────────────────────────────────

@app.get("/api/payroll/user-pay-rates")
async def get_all_user_pay_rates(admin=Depends(require_admin)):
    """Admin: get all user pay rates."""
    return await sb_request("GET", "user_pay_rates", params={"select": "*"}) or []


class UserPayRatesRequest(BaseModel):
    rates: List[dict]


@app.post("/api/payroll/user-pay-rates/{user_id}")
async def set_user_pay_rates(user_id: str, req: UserPayRatesRequest, admin=Depends(require_admin)):
    """Admin: set pay rates for a user (upsert)."""
    # Delete existing rates for this user
    try:
        await sb_request("DELETE", f"user_pay_rates?user_id=eq.{user_id}")
    except Exception:
        pass

    # Insert new rates
    for rate in req.rates:
        await sb_request("POST", "user_pay_rates", data={
            "user_id": user_id,
            "rate_type_id": rate["rate_type_id"],
            "pay_rate": rate["pay_rate"],
        })

    return {"status": "saved", "count": len(req.rates)}


# ── Pay Periods ────────────────────────────────────────────────────

@app.get("/api/payroll/pay-periods")
async def get_pay_periods(admin=Depends(require_admin)):
    """Admin: list all pay periods with recipient counts."""
    periods = await sb_request("GET", "pay_periods", params={
        "select": "*",
        "order": "start_date.desc",
    })
    if not periods:
        return []

    # Enrich with recipient counts
    for p in periods:
        recipients = await sb_request("GET", "pay_period_recipients", params={
            "pay_period_id": f"eq.{p['id']}",
            "select": "id,status",
        })
        p["recipient_count"] = len(recipients) if recipients else 0
        p["received_count"] = len([r for r in (recipients or []) if r["status"] in ("received", "approved", "exported")])

    return periods


class PayPeriodCreateRequest(BaseModel):
    period_type: str  # 'first_half' or 'second_half'


@app.post("/api/payroll/pay-periods")
async def create_pay_period(req: PayPeriodCreateRequest, admin=Depends(require_admin)):
    """Admin: create a new pay period."""
    today = date.today()

    if req.period_type == "first_half":
        start = date(today.year, today.month, 1)
        end = date(today.year, today.month, 15)
        due = end
    else:
        start = date(today.year, today.month, 16)
        _, last_day = calendar.monthrange(today.year, today.month)
        end = date(today.year, today.month, last_day)
        due = end

    label = f"{start.strftime('%b %d')} – {end.strftime('%b %d, %Y')}"

    result = await sb_request("POST", "pay_periods", data={
        "period_type": req.period_type,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "due_date": due.isoformat(),
        "status": "draft",
        "label": label,
        "created_by": admin["id"],
    })

    return result


@app.post("/api/payroll/pay-periods/{period_id}/open")
async def open_pay_period(period_id: str, admin=Depends(require_admin)):
    """
    Admin: open a pay period.
    - Auto-generates recipient list from active users
    - Sends initial email + SMS notifications
    """
    # Get the period
    periods = await sb_request("GET", "pay_periods", params={
        "id": f"eq.{period_id}",
        "select": "*",
    })
    if not periods:
        raise HTTPException(status_code=404, detail="Pay period not found")
    period = periods[0]

    if period["status"] != "draft":
        raise HTTPException(status_code=400, detail="Can only open draft periods")

    # Get active users (therapists, clinical_leaders, apn — not admin, front_desk)
    users = await sb_request("GET", "users", params={
        "is_active": "eq.true",
        "select": "id,first_name,last_name,email,phone_number,sms_enabled,role",
    })

    payroll_roles = {"therapist", "clinical_leader", "apn"}
    eligible = [u for u in (users or []) if u.get("role") in payroll_roles]
    logger.info(f"Opening pay period {period_id}: {len(users or [])} total users, {len(eligible)} eligible")

    # Create recipients
    created = 0
    sms_sent = 0
    sms_skipped = 0
    for user in eligible:
        try:
            recipient = await sb_request("POST", "pay_period_recipients", data={
                "pay_period_id": period_id,
                "user_id": user["id"],
                "status": "sent",
            })
            created += 1
            logger.info(f"Created recipient for {user.get('first_name')} {user.get('last_name')} ({user['id']})")

            # Send notification
            name = user.get("first_name", "")
            msg = f"Hi {name}! Your BestLife invoice for {period['label']} is now open. Please submit by {period['due_date']}."

            # SMS
            phone = user.get("phone_number")
            sms_on = user.get("sms_enabled")
            logger.info(f"  SMS check: phone={phone}, sms_enabled={sms_on}, twilio_client={'yes' if twilio_client else 'no'}")
            if phone and sms_on:
                sid = send_sms(phone, msg)
                if sid:
                    sms_sent += 1
                    if recipient:
                        rid = recipient[0]["id"] if isinstance(recipient, list) else recipient["id"]
                        await sb_request("POST", "reminder_log", data={
                            "recipient_id": rid,
                            "channel": "sms",
                            "status": "sent",
                        })
                else:
                    sms_skipped += 1
                    logger.warning(f"  SMS send returned None for {phone}")
            else:
                sms_skipped += 1

        except Exception as e:
            logger.warning(f"Failed to create recipient for {user['id']}: {e}")

    logger.info(f"Pay period opened: {created} recipients, {sms_sent} SMS sent, {sms_skipped} SMS skipped")

    # Update period status
    await sb_request("PATCH", f"pay_periods?id=eq.{period_id}", data={
        "status": "open",
        "opened_at": datetime.utcnow().isoformat(),
    })

    # Audit log
    await sb_request("POST", "audit_log", data={
        "action": "pay_period_opened",
        "entity_type": "pay_period",
        "entity_id": period_id,
        "user_id": admin["id"],
        "details": {"recipients_created": created},
    })

    return {"status": "opened", "recipients_created": created}


@app.post("/api/payroll/pay-periods/{period_id}/close")
async def close_pay_period(period_id: str, admin=Depends(require_admin)):
    """Admin: close a pay period."""
    await sb_request("PATCH", f"pay_periods?id=eq.{period_id}", data={
        "status": "closed",
        "closed_at": datetime.utcnow().isoformat(),
    })
    return {"status": "closed"}


@app.get("/api/payroll/pay-periods/{period_id}/recipients")
async def get_period_recipients(period_id: str, admin=Depends(require_admin)):
    """Admin: list all recipients for a pay period with their draft tokens."""
    # Note: pay_period_recipients has TWO FKs to users (user_id, approved_by).
    # We must disambiguate by specifying the FK column in the join hint:
    #   users!user_id(...)  tells PostgREST which FK to use.
    recipients = await sb_request("GET", "pay_period_recipients", params={
        "pay_period_id": f"eq.{period_id}",
        "select": "id,user_id,status,draft_token,submit_token,submitted_at,users!user_id(first_name,last_name,email)",
        "order": "created_at.asc",
    })

    logger.info(f"Recipients raw for period {period_id}: {recipients}")

    result = []
    for r in (recipients or []):
        user = r.pop("users", {}) or {}
        result.append({
            **r,
            "user_name": f"{user.get('first_name', '')} {user.get('last_name', '')}".strip(),
            "user_email": user.get("email", ""),
        })

    return result


# ── Approval Queue ─────────────────────────────────────────────────

@app.get("/api/payroll/approval-queue")
async def get_approval_queue(status: str = "received", admin=Depends(require_admin)):
    """Admin: get recipients filtered by status."""
    params = {
        "select": "*, users(first_name, last_name, role), pay_periods(start_date, end_date, label)",
        "order": "updated_at.desc",
    }
    if status != "all":
        params["status"] = f"eq.{status}"

    recipients = await sb_request("GET", "pay_period_recipients", params=params)

    result = []
    for r in (recipients or []):
        user = r.pop("users", {}) or {}
        period = r.pop("pay_periods", {}) or {}
        r["first_name"] = user.get("first_name", "")
        r["last_name"] = user.get("last_name", "")
        r["user_name"] = f"{r['first_name']} {r['last_name']}".strip()
        r["period_start"] = period.get("start_date")
        r["period_end"] = period.get("end_date")
        r["period_label"] = period.get("label")
        result.append(r)

    return result


class ApproveRequest(BaseModel):
    overrides: Optional[dict] = None

class RejectRequest(BaseModel):
    reason: str

class ZeroHoursRequest(BaseModel):
    reason: str


@app.post("/api/payroll/recipients/{recipient_id}/approve")
async def approve_recipient(recipient_id: str, req: ApproveRequest, admin=Depends(require_admin)):
    """
    Admin: approve a submission.
    - Writes immutable time_entries from invoice_data
    - Calculates est_bill and est_pay using rate tables
    - Updates rollups
    """
    # Get recipient
    recipients = await sb_request("GET", "pay_period_recipients", params={
        "id": f"eq.{recipient_id}",
        "select": "*",
    })
    if not recipients:
        raise HTTPException(status_code=404, detail="Recipient not found")
    recipient = recipients[0]

    if recipient["status"] not in ("received",):
        raise HTTPException(status_code=400, detail="Can only approve received submissions")

    invoice_data = recipient.get("invoice_data") or {}
    user_id = recipient["user_id"]
    period_id = recipient["pay_period_id"]

    # Get user's pay rates
    pay_rates = await sb_request("GET", "user_pay_rates", params={
        "user_id": f"eq.{user_id}",
        "select": "*, rate_types(name, unit)",
    })
    pay_rate_map = {}
    for pr in (pay_rates or []):
        rt = pr.get("rate_types") or {}
        pay_rate_map[rt.get("name", "")] = {
            "rate_type_id": pr["rate_type_id"],
            "pay_rate": float(pr["pay_rate"]),
            "unit": rt.get("unit", "hourly"),
        }

    # Get bill rate defaults
    bill_defaults = await sb_request("GET", "bill_rate_defaults", params={
        "select": "*, rate_types(name)",
    })
    bill_rate_map = {}
    for bd in (bill_defaults or []):
        rt = bd.get("rate_types") or {}
        bill_rate_map[rt.get("name", "")] = float(bd["default_bill_rate"])

    # Write time entries from invoice_data
    total_bill = 0.0
    total_pay = 0.0
    total_hours = 0.0
    total_sessions = 0

    # invoice_data format: { "rate_type_name": { quantity, duration_minutes?, client_initials?, notes? }, ... }
    # or simple: { "rate_type_name": quantity_number }
    for rate_name, entry_data in invoice_data.items():
        if rate_name in ("notes", "op_sessions"):
            continue

        rate_info = pay_rate_map.get(rate_name, {})
        rate_type_id = rate_info.get("rate_type_id")
        pay_rate = rate_info.get("pay_rate", 0)
        bill_rate = bill_rate_map.get(rate_name, 0)
        unit = rate_info.get("unit", "hourly")

        if isinstance(entry_data, dict):
            qty = float(entry_data.get("quantity", 0))
            duration = entry_data.get("duration_minutes")
            initials = entry_data.get("client_initials")
            notes = entry_data.get("notes")
        else:
            qty = float(entry_data) if entry_data else 0
            duration = None
            initials = None
            notes = None

        if qty == 0:
            continue

        # Apply admin overrides
        override_data = req.overrides or {}
        o_bill = override_data.get(f"{rate_name}_bill")
        o_pay = override_data.get(f"{rate_name}_pay")

        est_bill = float(o_bill) if o_bill is not None else (bill_rate * qty)
        est_pay = float(o_pay) if o_pay is not None else (pay_rate * qty)

        if rate_type_id:
            await sb_request("POST", "time_entries", data={
                "recipient_id": recipient_id,
                "user_id": user_id,
                "pay_period_id": period_id,
                "rate_type_id": rate_type_id,
                "quantity": qty,
                "duration_minutes": duration,
                "client_initials": initials,
                "est_bill_amount": round(est_bill, 2),
                "est_pay_amount": round(est_pay, 2),
                "admin_bill_override": round(float(o_bill), 2) if o_bill is not None else None,
                "admin_pay_override": round(float(o_pay), 2) if o_pay is not None else None,
                "notes": notes,
                "locked": True,
            })

        total_bill += est_bill
        total_pay += est_pay

        if unit == "hourly":
            total_hours += qty
        else:
            total_sessions += int(qty)

    # Update recipient status
    await sb_request("PATCH", f"pay_period_recipients?id=eq.{recipient_id}", data={
        "status": "approved",
        "approved_at": datetime.utcnow().isoformat(),
        "approved_by": admin["id"],
        "admin_override_data": req.overrides,
        "updated_at": datetime.utcnow().isoformat(),
    })

    # Update/Insert rollup_pay_period
    existing_rollup = await sb_request("GET", "rollup_pay_period", params={
        "pay_period_id": f"eq.{period_id}",
        "user_id": f"eq.{user_id}",
    })
    rollup_data = {
        "pay_period_id": period_id,
        "user_id": user_id,
        "total_hours": round(total_hours, 2),
        "total_sessions": total_sessions,
        "est_bill_total": round(total_bill, 2),
        "est_pay_total": round(total_pay, 2),
        "margin": round(total_bill - total_pay, 2),
        "updated_at": datetime.utcnow().isoformat(),
    }
    if existing_rollup:
        await sb_request("PATCH", f"rollup_pay_period?pay_period_id=eq.{period_id}&user_id=eq.{user_id}", data=rollup_data)
    else:
        await sb_request("POST", "rollup_pay_period", data=rollup_data)

    # Update rollup_monthly based on service_date month
    # For simplicity, use the pay period's start_date month
    period_data = await sb_request("GET", "pay_periods", params={"id": f"eq.{period_id}", "select": "start_date"})
    if period_data:
        month_year = period_data[0]["start_date"][:7]  # 'YYYY-MM'
        existing_monthly = await sb_request("GET", "rollup_monthly", params={
            "user_id": f"eq.{user_id}",
            "month_year": f"eq.{month_year}",
        })
        monthly_data = {
            "user_id": user_id,
            "month_year": month_year,
            "total_hours": round(total_hours, 2),
            "total_sessions": total_sessions,
            "est_bill_total": round(total_bill, 2),
            "est_pay_total": round(total_pay, 2),
            "margin": round(total_bill - total_pay, 2),
            "updated_at": datetime.utcnow().isoformat(),
        }
        if existing_monthly:
            # Accumulate
            old = existing_monthly[0]
            monthly_data["total_hours"] = round(float(old.get("total_hours", 0)) + total_hours, 2)
            monthly_data["total_sessions"] = int(old.get("total_sessions", 0)) + total_sessions
            monthly_data["est_bill_total"] = round(float(old.get("est_bill_total", 0)) + total_bill, 2)
            monthly_data["est_pay_total"] = round(float(old.get("est_pay_total", 0)) + total_pay, 2)
            monthly_data["margin"] = round(monthly_data["est_bill_total"] - monthly_data["est_pay_total"], 2)
            await sb_request("PATCH", f"rollup_monthly?user_id=eq.{user_id}&month_year=eq.{month_year}", data=monthly_data)
        else:
            await sb_request("POST", "rollup_monthly", data=monthly_data)

    # Audit log
    await sb_request("POST", "audit_log", data={
        "action": "recipient_approved",
        "entity_type": "pay_period_recipient",
        "entity_id": recipient_id,
        "user_id": admin["id"],
        "details": {"total_bill": round(total_bill, 2), "total_pay": round(total_pay, 2)},
    })

    return {"status": "approved", "total_bill": round(total_bill, 2), "total_pay": round(total_pay, 2)}


@app.post("/api/payroll/recipients/{recipient_id}/reject")
async def reject_recipient(recipient_id: str, req: RejectRequest, admin=Depends(require_admin)):
    """Admin: reject a submission."""
    await sb_request("PATCH", f"pay_period_recipients?id=eq.{recipient_id}", data={
        "status": "rejected",
        "rejection_reason": req.reason,
        "approved_by": admin["id"],
        "updated_at": datetime.utcnow().isoformat(),
    })
    return {"status": "rejected"}


@app.post("/api/payroll/recipients/{recipient_id}/zero-hours")
async def zero_hours_recipient(recipient_id: str, req: ZeroHoursRequest, admin=Depends(require_admin)):
    """Admin: mark as zero hours with reason."""
    await sb_request("PATCH", f"pay_period_recipients?id=eq.{recipient_id}", data={
        "status": "zero_hours",
        "zero_hours_reason": req.reason,
        "approved_by": admin["id"],
        "updated_at": datetime.utcnow().isoformat(),
    })
    return {"status": "zero_hours"}


# ── Export Batches ─────────────────────────────────────────────────

@app.get("/api/payroll/export-batches")
async def get_export_batches(admin=Depends(require_admin)):
    """Admin: list all export batches + count of exportable."""
    batches = await sb_request("GET", "export_batches", params={
        "select": "*",
        "order": "created_at.desc",
    })
    # Count approved (not yet exported)
    approved = await sb_request("GET", "pay_period_recipients", params={
        "status": "eq.approved",
        "select": "id",
    })
    return {
        "batches": batches or [],
        "exportable_count": len(approved) if approved else 0,
    }


@app.post("/api/payroll/export-batches/generate")
async def generate_export_batch(admin=Depends(require_admin)):
    """
    Admin: generate an export batch from all approved (not yet exported) recipients.
    Prevents double export.
    """
    # Get all approved recipients
    recipients = await sb_request("GET", "pay_period_recipients", params={
        "status": "eq.approved",
        "select": "*, users(first_name, last_name, email), pay_periods(start_date, end_date, label)",
    })

    if not recipients:
        raise HTTPException(status_code=400, detail="No approved recipients to export")

    # Build CSV
    csv_lines = ["Name,Email,Pay Period,Total Hours,Est Bill,Est Pay,Margin"]
    total_pay = 0.0
    recipient_ids = []

    for r in recipients:
        user = r.get("users") or {}
        period = r.get("pay_periods") or {}
        name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()
        email = user.get("email", "")
        period_label = period.get("label", f"{period.get('start_date', '')} - {period.get('end_date', '')}")

        # Get rollup for this recipient
        rollup = await sb_request("GET", "rollup_pay_period", params={
            "pay_period_id": f"eq.{r['pay_period_id']}",
            "user_id": f"eq.{r['user_id']}",
            "select": "*",
        })
        rp = rollup[0] if rollup else {}

        hours = rp.get("total_hours", 0)
        bill = rp.get("est_bill_total", 0)
        pay = rp.get("est_pay_total", 0)
        margin = rp.get("margin", 0)

        csv_lines.append(f"{name},{email},{period_label},{hours},{bill},{pay},{margin}")
        total_pay += float(pay)
        recipient_ids.append(r["id"])

    csv_text = "\n".join(csv_lines)
    filename = f"payroll-export-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.csv"

    # Create batch record
    batch = await sb_request("POST", "export_batches", data={
        "record_count": len(recipient_ids),
        "total_pay": round(total_pay, 2),
        "csv_text": csv_text,
        "exported_by": admin["id"],
        "label": filename,
    })

    # Mark recipients as exported
    for rid in recipient_ids:
        await sb_request("PATCH", f"pay_period_recipients?id=eq.{rid}", data={
            "status": "exported",
            "updated_at": datetime.utcnow().isoformat(),
        })

    # Audit log
    await sb_request("POST", "audit_log", data={
        "action": "export_batch_created",
        "entity_type": "export_batch",
        "entity_id": batch[0]["id"] if isinstance(batch, list) else batch.get("id"),
        "user_id": admin["id"],
        "details": {"record_count": len(recipient_ids), "total_pay": round(total_pay, 2)},
    })

    return {"status": "exported", "csv_text": csv_text, "filename": filename, "record_count": len(recipient_ids)}


@app.get("/api/payroll/export-batches/{batch_id}/download")
async def download_export_batch(batch_id: str, admin=Depends(require_admin)):
    """Admin: download a previously generated batch."""
    batches = await sb_request("GET", "export_batches", params={
        "id": f"eq.{batch_id}",
        "select": "*",
    })
    if not batches:
        raise HTTPException(status_code=404, detail="Batch not found")
    b = batches[0]
    return {"csv_text": b.get("csv_text", ""), "filename": b.get("label", "export.csv")}


# ── Public Invoice Flow (no auth required) ─────────────────────────

@app.get("/api/public/invoice/{draft_token}")
async def get_public_invoice(draft_token: str):
    """
    Public: get invoice form for a recipient via draft token.
    Returns rate types and any existing draft data.
    """
    recipients = await sb_request("GET", "pay_period_recipients", params={
        "draft_token": f"eq.{draft_token}",
        "select": "*, users(first_name, last_name), pay_periods(start_date, end_date, label, due_date, status)",
    })
    if not recipients:
        raise HTTPException(status_code=404, detail="Invoice link not found or expired")

    r = recipients[0]
    period = r.get("pay_periods") or {}

    if period.get("status") != "open":
        raise HTTPException(status_code=400, detail="This pay period is no longer accepting submissions")

    if r["status"] in ("received", "approved", "exported"):
        return {"already_submitted": True, "submitted_at": r.get("submitted_at")}

    # Get rate types
    rate_types = await sb_request("GET", "rate_types", params={
        "is_active": "eq.true",
        "select": "*",
        "order": "sort_order.asc",
    })

    user = r.get("users") or {}
    return {
        "recipient_id": r["id"],
        "user_name": f"{user.get('first_name', '')} {user.get('last_name', '')}".strip(),
        "period_label": period.get("label", ""),
        "due_date": period.get("due_date"),
        "draft_data": r.get("invoice_data"),
        "submit_token": r.get("submit_token"),
        "rate_types": rate_types or [],
    }


class DraftSaveRequest(BaseModel):
    invoice_data: dict


@app.post("/api/public/invoice/{draft_token}/save-draft")
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


class SubmitRequest(BaseModel):
    submit_token: str
    invoice_data: dict


@app.post("/api/public/invoice/{draft_token}/submit")
async def submit_invoice(draft_token: str, req: SubmitRequest):
    """
    Public: submit the invoice (single submit only).
    Validates submit_token, saves final invoice_data, marks as received.
    """
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


# ── Reminders ──────────────────────────────────────────────────────

@app.post("/api/payroll/send-reminders")
async def send_reminders(admin=Depends(require_admin)):
    """
    Admin: send reminders for open pay periods.
    Cadence: on open, day 3, day before due, morning of due.
    Only sends if status is 'sent' (not yet received).
    """
    # Get open periods
    periods = await sb_request("GET", "pay_periods", params={
        "status": "eq.open",
        "select": "*",
    })

    if not periods:
        return {"status": "no_open_periods", "sent": 0}

    sent_count = 0
    today = date.today()

    for period in periods:
        due = date.fromisoformat(period["due_date"])
        opened = period.get("opened_at")
        if opened:
            opened_date = datetime.fromisoformat(opened.replace("Z", "+00:00")).date()
        else:
            opened_date = today

        days_since_open = (today - opened_date).days
        days_until_due = (due - today).days

        # Check if today is a reminder day
        should_send = (
            days_since_open == 3 or
            days_until_due == 1 or
            days_until_due == 0
        )

        if not should_send:
            continue

        # Get recipients who haven't submitted
        recipients = await sb_request("GET", "pay_period_recipients", params={
            "pay_period_id": f"eq.{period['id']}",
            "status": "eq.sent",
            "select": "*, users(first_name, phone_number, sms_enabled)",
        })

        for r in (recipients or []):
            user = r.get("users") or {}
            name = user.get("first_name", "")
            phone = user.get("phone_number")
            sms_ok = user.get("sms_enabled", False)

            if phone and sms_ok:
                if days_until_due == 0:
                    msg = f"Hi {name} — your BestLife invoice for {period['label']} is due TODAY! Please submit ASAP."
                elif days_until_due == 1:
                    msg = f"Hi {name} — reminder: your BestLife invoice for {period['label']} is due tomorrow."
                else:
                    msg = f"Hi {name} — friendly reminder to submit your BestLife invoice for {period['label']} (due {period['due_date']})."

                sid = send_sms(phone, msg)
                if sid:
                    await sb_request("POST", "reminder_log", data={
                        "recipient_id": r["id"],
                        "channel": "sms",
                        "status": "sent",
                    })
                    await sb_request("PATCH", f"pay_period_recipients?id=eq.{r['id']}", data={
                        "reminder_count": (r.get("reminder_count") or 0) + 1,
                        "last_reminder_at": datetime.utcnow().isoformat(),
                    })
                    sent_count += 1

    return {"status": "ok", "sent": sent_count}


# ── Analytics (Rollup-Based) ───────────────────────────────────────

@app.get("/api/analytics/hours-margin")
async def analytics_hours_margin(view: str = "pay_period", user=Depends(verify_token)):
    """Analytics: Hours & Margin from rollups."""
    if view == "monthly":
        rollups = await sb_request("GET", "rollup_monthly", params={
            "select": "*, users(first_name, last_name)",
            "order": "month_year.desc",
        })
    else:
        rollups = await sb_request("GET", "rollup_pay_period", params={
            "select": "*, users(first_name, last_name), pay_periods(label)",
            "order": "updated_at.desc",
        })

    rows = []
    for r in (rollups or []):
        u = r.get("users") or {}
        rows.append({
            "user_name": f"{u.get('first_name', '')} {u.get('last_name', '')}".strip(),
            "total_hours": float(r.get("total_hours", 0)),
            "est_bill": float(r.get("est_bill_total", 0)),
            "est_pay": float(r.get("est_pay_total", 0)),
            "margin": float(r.get("margin", 0)),
            "period": r.get("pay_periods", {}).get("label") if view != "monthly" else r.get("month_year"),
        })

    return {"rows": rows}


@app.get("/api/analytics/performance")
async def analytics_performance(user=Depends(verify_token)):
    """Analytics: Performance tracking with threshold flags."""
    rollups = await sb_request("GET", "rollup_monthly", params={
        "select": "*, users(first_name, last_name, role)",
        "order": "user_id.asc",
    })

    # Aggregate by user
    user_hours = {}
    for r in (rollups or []):
        uid = r["user_id"]
        u = r.get("users") or {}
        if uid not in user_hours:
            user_hours[uid] = {
                "user_name": f"{u.get('first_name', '')} {u.get('last_name', '')}".strip(),
                "role": u.get("role", ""),
                "total_hours": 0,
                "months": 0,
            }
        user_hours[uid]["total_hours"] += float(r.get("total_hours", 0))
        user_hours[uid]["months"] += 1

    result = []
    for uid, data in user_hours.items():
        weeks = max(data["months"] * 4.33, 1)
        avg_weekly = data["total_hours"] / weeks
        result.append({
            "user_name": data["user_name"],
            "role": data["role"],
            "avg_weekly_hours": round(avg_weekly, 1),
            "client_count": None,
        })

    return result


@app.get("/api/analytics/supervision-compliance")
async def analytics_supervision(user=Depends(verify_token)):
    """Analytics: Supervision compliance for clinical leaders."""
    profile = user
    role = profile.get("role")

    # Get users who require supervision
    params = {
        "supervision_required": "eq.true",
        "select": "id, first_name, last_name, clinical_supervisor_id",
    }

    # Scope: admin sees all, clinical_leader sees own supervisees, others see self
    if role == "clinical_leader":
        params["clinical_supervisor_id"] = f"eq.{profile['id']}"
    elif role != "admin":
        params["id"] = f"eq.{profile['id']}"

    supervisees = await sb_request("GET", "users", params=params)

    result = []
    for s in (supervisees or []):
        # Get supervisor name
        sup_name = "—"
        if s.get("clinical_supervisor_id"):
            sups = await sb_request("GET", "users", params={
                "id": f"eq.{s['clinical_supervisor_id']}",
                "select": "first_name,last_name",
            })
            if sups:
                sup_name = f"{sups[0]['first_name']} {sups[0]['last_name']}"

        result.append({
            "supervisee_name": f"{s['first_name']} {s['last_name']}",
            "supervisor_name": sup_name,
            "sessions_required": None,
            "sessions_completed": 0,
            "compliant": s.get("clinical_supervisor_id") is not None,
        })

    return result


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
