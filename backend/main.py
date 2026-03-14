"""
BestLife Hub - FastAPI Backend
Handles: Auth verification, TherapyNotes upload/processing, analytics, user management, invoices.
"""
import os
import json
import logging
import calendar
from collections import OrderedDict
from datetime import datetime, timedelta, date
from typing import Optional, List

import httpx
from fastapi import FastAPI, HTTPException, Depends, Request, Body
from fastapi.responses import FileResponse
from pydantic import BaseModel

import backend.deps as deps
from backend.deps import (
    SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY,
    sb_request, verify_token, require_admin, logger,
)

# Routers (extracted from main.py in Phase 2)
from backend.routers import announcements, tasks, meetings, auth, public_invoice, upload, ai, settings, cron
from backend.routers.cron import start_scheduler
from backend.sms_service import init_twilio, send_sms

app = FastAPI(title="BestLife Hub API")

# ── Register routers ──
app.include_router(announcements.router)
app.include_router(tasks.router)
app.include_router(meetings.router)
app.include_router(auth.router)
app.include_router(public_invoice.router)
app.include_router(upload.router)
app.include_router(ai.router)
app.include_router(settings.router)
app.include_router(cron.router)


# ── Startup ──
@app.on_event("startup")
async def startup_event():
    logger.info("BestLife Hub API starting up...")
    logger.info(f"Supabase URL: {SUPABASE_URL}")
    logger.info(f"Service key configured: {'Yes' if SUPABASE_SERVICE_KEY else 'No'}")
    sg_key = os.environ.get("SENDGRID_API_KEY", "")
    logger.info(f"SendGrid key configured: {'Yes (len=' + str(len(sg_key)) + ')' if sg_key else 'No'}")

    # Load keys from Supabase app_settings when not in env vars
    if SUPABASE_SERVICE_KEY:
        keys_to_load = []
        if not deps.ANTHROPIC_API_KEY:
            keys_to_load.append("ANTHROPIC_API_KEY")
        if not sg_key:
            keys_to_load.append("SENDGRID_API_KEY")

        for key_name in keys_to_load:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.get(
                        f"{SUPABASE_URL}/rest/v1/app_settings",
                        params={"key": f"eq.{key_name}", "select": "value"},
                        headers={
                            "apikey": SUPABASE_SERVICE_KEY,
                            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                        },
                    )
                    if resp.status_code == 200:
                        rows = resp.json()
                        if rows and rows[0].get("value"):
                            val = rows[0]["value"]
                            if key_name == "ANTHROPIC_API_KEY":
                                deps.ANTHROPIC_API_KEY = val
                            else:
                                os.environ[key_name] = val
                            logger.info(f"Loaded {key_name} from Supabase app_settings (len={len(val)})")
                        else:
                            logger.warning(f"app_settings: no {key_name} row found")
                    else:
                        logger.warning(f"Could not read app_settings for {key_name}: {resp.status_code}")
            except Exception as e:
                logger.warning(f"Failed to load {key_name} from Supabase: {e}")

    if deps.ANTHROPIC_API_KEY:
        logger.info(f"Anthropic key ready: Yes (len={len(deps.ANTHROPIC_API_KEY)}, prefix={deps.ANTHROPIC_API_KEY[:8]}...)")
    else:
        logger.warning("Anthropic key: NOT configured (Betty AI will be unavailable)")

    # Run lightweight schema migrations via Supabase SQL Editor API
    if SUPABASE_SERVICE_KEY:
        migrations = [
            ("users_role_check", "ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check; ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'clinical_leader', 'therapist', 'front_desk', 'ba', 'medical_biller', 'apn', 'intern'));"),
            ("pay_periods_custom_dates", "ALTER TABLE pay_periods ADD COLUMN IF NOT EXISTS window_open DATE, ADD COLUMN IF NOT EXISTS deadline DATE;"),
        ]
        for name, sql in migrations:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(
                        f"{SUPABASE_URL}/rest/v1/rpc/run_sql",
                        json={"sql": sql},
                        headers={
                            "apikey": SUPABASE_SERVICE_KEY,
                            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                            "Content-Type": "application/json",
                            "Prefer": "return=minimal",
                        },
                    )
                    if resp.status_code in (200, 204):
                        logger.info(f"Migration '{name}' applied successfully")
                    else:
                        logger.info(f"Migration '{name}' skipped (run_sql not available: {resp.status_code}). Run manually in Supabase SQL editor: {sql}")
            except Exception as e:
                logger.info(f"Migration '{name}' skipped: {e}")


# ────────────────────────────────────────────────────────────────────
# API Routes
# ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


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
    except Exception as e:
        logger.debug(f"Analytics summary shortcut failed (will use fallback): {e}")
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

# ═══════════════════════════════════════════════════════════════════
# PAYROLL SYSTEM
# ═══════════════════════════════════════════════════════════════════

# ── Twilio Config ──────────────────────────────────────────────────
# SMS extracted to backend.sms_service (imported above as send_sms)

@app.on_event("startup")
async def startup_init_twilio():
    init_twilio()

@app.on_event("startup")
async def startup_scheduler():
    """Start the built-in daily scheduler (runs at 9 AM ET)."""
    start_scheduler()


# ── Rate Catalog ───────────────────────────────────────────────────

@app.get("/api/payroll/rate-catalog")
async def get_rate_catalog(user=Depends(verify_token)):
    """Get all rate types and bill rate defaults."""
    # Deactivate legacy duplicate ADOS types (parentheses versions replaced by dash versions)
    legacy_ados = ["ADOS Assessment (In Home)", "ADOS Assessment (In Office)", "ADOS In Home", "ADOS At Office"]
    for name in legacy_ados:
        await sb_request("PATCH", f"rate_types?name=eq.{name}&is_active=eq.true", data={"is_active": False})

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
    return await sb_request("GET", "user_pay_rates", params={"select": "*"}) or []


class UserPayRatesRequest(BaseModel):
    rates: List[dict]


@app.post("/api/payroll/user-pay-rates/{user_id}")
async def set_user_pay_rates(user_id: str, req: UserPayRatesRequest, admin=Depends(require_admin)):
    """Admin: set pay rates for a user (upsert). Historical billing data is
    protected by time_entries snapshots — safe to update rates in place."""
    saved = 0
    for rate in req.rates:
        rt_id = rate["rate_type_id"]
        pay_rate = rate["pay_rate"]
        # Check if existing rate exists for this user + rate_type
        existing = await sb_request("GET", "user_pay_rates", params={
            "user_id": f"eq.{user_id}",
            "rate_type_id": f"eq.{rt_id}",
            "select": "id",
            "limit": "1",
        })
        if existing:
            await sb_request("PATCH", f"user_pay_rates?user_id=eq.{user_id}&rate_type_id=eq.{rt_id}", data={
                "pay_rate": pay_rate,
                "updated_at": datetime.utcnow().isoformat(),
            })
        else:
            await sb_request("POST", "user_pay_rates", data={
                "user_id": user_id,
                "rate_type_id": rt_id,
                "pay_rate": pay_rate,
            })
        saved += 1

    return {"status": "saved", "count": saved}


# ── Pay Periods ────────────────────────────────────────────────────

@app.get("/api/payroll/pay-periods")
async def get_pay_periods(admin=Depends(require_admin)):
    """Admin: list all pay periods with recipient counts."""
    periods = await sb_request("GET", "pay_periods", params={
        "select": "*",
        "order": "start_date.asc",
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


class GenerateYearRequest(BaseModel):
    year: int


@app.post("/api/payroll/pay-periods/generate-year")
async def generate_year_pay_periods(req: GenerateYearRequest, admin=Depends(require_admin)):
    """Admin: generate all semi-monthly pay periods for a given year."""
    year = req.year
    if year < 2020 or year > 2100:
        raise HTTPException(status_code=400, detail="Year must be between 2020 and 2100")

    # Fetch existing periods for this year to avoid duplicates
    existing = await sb_request("GET", "pay_periods", params={
        "start_date": f"gte.{year}-01-01",
        "end_date": f"lte.{year}-12-31",
        "select": "start_date,end_date",
    }) or []
    existing_ranges = {(p["start_date"], p["end_date"]) for p in existing}

    created = []
    skipped = 0
    for month in range(1, 13):
        _, last_day = calendar.monthrange(year, month)
        periods = [
            (date(year, month, 1), date(year, month, 15), "first_half"),
            (date(year, month, 16), date(year, month, last_day), "second_half"),
        ]
        for start, end, ptype in periods:
            if (start.isoformat(), end.isoformat()) in existing_ranges:
                skipped += 1
                continue
            label = f"{start.strftime('%b %d')} – {end.strftime('%b %d, %Y')}"
            result = await sb_request("POST", "pay_periods", data={
                "period_type": ptype,
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "due_date": end.isoformat(),
                "status": "draft",
                "label": label,
                "created_by": admin["id"],
            })
            created.append(result)

    return {"created": len(created), "skipped": skipped, "total": len(created) + skipped}


class BulkTimeEntryRow(BaseModel):
    user_name: str
    iic: Optional[float] = 0
    iic_ba: Optional[float] = 0
    op: Optional[float] = 0
    sbys: Optional[float] = 0
    ados: Optional[float] = 0
    apn: Optional[float] = 0
    admin_hours: Optional[float] = 0
    supervision: Optional[float] = 0
    sick: Optional[float] = 0
    pto: Optional[float] = 0


class BulkImportRequest(BaseModel):
    rows: List[BulkTimeEntryRow]


def build_invoice_data(row):
    """Build invoice_data JSON from a bulk import row (matches the format approve_recipient expects)."""
    data = {}
    # IIC — regular hours as IIC-LC, BA hours as BA code
    iic_entries = {}
    if (row.iic or 0) > 0:
        iic_entries["IICLC-H0036TJU1"] = [{"hours": row.iic, "cyber_initials": "BULK"}]
    if (row.iic_ba or 0) > 0:
        iic_entries["BA-H2014TJ"] = [{"hours": row.iic_ba, "cyber_initials": "BULK"}]
    if iic_entries:
        data["iic"] = iic_entries
    # OP — each entry = 1 session
    if (row.op or 0) > 0:
        data["op"] = {"sessions": [{"client_initials": "BULK"} for _ in range(max(1, round(row.op)))]}
    # SBYS
    if (row.sbys or 0) > 0:
        data["sbys"] = [{"hours": row.sbys}]
    # ADOS (each assessment = 1 entry → 3 hours)
    if (row.ados or 0) > 0:
        data["ados"] = [{"client_initials": "BULK", "location": "home"} for _ in range(max(1, round(row.ados)))]
    # APN (default to 30-min sessions)
    if (row.apn or 0) > 0:
        data["apn"] = [{"duration_minutes": 30, "hours": row.apn}]
    # Admin
    if (row.admin_hours or 0) > 0:
        data["admin"] = [{"hours": row.admin_hours}]
    # Supervision
    if (row.supervision or 0) > 0:
        data["supervision"] = {"individual": [{"supervisor_name": "BULK"} for _ in range(max(1, round(row.supervision)))]}
    # Sick leave
    if (row.sick or 0) > 0:
        data["sick_leave"] = {"hours": row.sick, "reason": "Bulk import"}
    # PTO
    if (row.pto or 0) > 0:
        data["pto"] = {"hours": row.pto}
    return data


@app.post("/api/payroll/pay-periods/{period_id}/bulk-import")
async def bulk_import_time_entries(period_id: str, req: BulkImportRequest, admin=Depends(require_admin)):
    """Admin: bulk-import from spreadsheet. Creates recipients with invoice_data (status=received) for review."""
    # Verify the period exists
    periods = await sb_request("GET", "pay_periods", params={"id": f"eq.{period_id}", "select": "*"})
    if not periods:
        raise HTTPException(status_code=404, detail="Pay period not found")
    period = periods[0]

    # ── Clean up any previous import for this period (makes re-import safe) ──
    await sb_request("DELETE", f"time_entries?pay_period_id=eq.{period_id}")
    await sb_request("DELETE", f"rollup_pay_period?pay_period_id=eq.{period_id}")
    await sb_request("DELETE", f"pay_period_recipients?pay_period_id=eq.{period_id}")

    # ── Build name→user maps for flexible matching ──
    all_users = await sb_request("GET", "users", params={
        "is_active": "eq.true",
        "select": "id,first_name,last_name,role",
    }) or []
    user_by_full = {}
    user_by_reverse = {}
    user_by_first_li = {}
    user_by_first = {}
    for u in all_users:
        first = (u.get("first_name") or "").strip()
        last = (u.get("last_name") or "").strip()
        full = f"{first} {last}".strip().lower()
        user_by_full[full] = u
        reverse = f"{last}, {first}".strip().lower()
        user_by_reverse[reverse] = u
        fl = first.lower()
        if fl not in user_by_first:
            user_by_first[fl] = []
        user_by_first[fl].append(u)
        if last:
            fi_li = f"{first} {last[0]}".lower()
            user_by_first_li[fi_li] = u

    def find_user(name_str):
        key = name_str.strip().lower()
        if key in user_by_full:
            return user_by_full[key], None
        if key in user_by_reverse:
            return user_by_reverse[key], None
        if key in user_by_first_li:
            return user_by_first_li[key], None
        if key in user_by_first:
            matches = user_by_first[key]
            if len(matches) == 1:
                return matches[0], None
            names = [f"{m.get('first_name','')} {m.get('last_name','')}" for m in matches]
            return None, f"Ambiguous name '{name_str}' — matches: {', '.join(names)}"
        return None, f"User not found: {name_str}"

    # ── Merge rows by user (same person may appear multiple times, e.g. IIC + BA rows) ──
    merged = {}   # uid → { "user_name": str, "row_data": accumulated BulkTimeEntryRow fields }
    errors = []

    for row in req.rows:
        user, err = find_user(row.user_name)
        if not user:
            errors.append(err)
            continue
        uid = user["id"]
        if uid not in merged:
            merged[uid] = {"user_name": row.user_name, "iic": 0, "iic_ba": 0, "op": 0,
                           "sbys": 0, "ados": 0, "apn": 0, "admin_hours": 0,
                           "supervision": 0, "sick": 0, "pto": 0}
        m = merged[uid]
        m["iic"] += row.iic or 0
        m["iic_ba"] += row.iic_ba or 0
        m["op"] += row.op or 0
        m["sbys"] += row.sbys or 0
        m["ados"] += row.ados or 0
        m["apn"] += row.apn or 0
        m["admin_hours"] += row.admin_hours or 0
        m["supervision"] += row.supervision or 0
        m["sick"] += row.sick or 0
        m["pto"] += row.pto or 0

    # ── Create one recipient per user with merged invoice_data ──
    imported = 0
    for uid, m in merged.items():
        row_obj = BulkTimeEntryRow(user_name=m["user_name"], iic=m["iic"], iic_ba=m["iic_ba"],
                                    op=m["op"], sbys=m["sbys"], ados=m["ados"], apn=m["apn"],
                                    admin_hours=m["admin_hours"], supervision=m["supervision"],
                                    sick=m["sick"], pto=m["pto"])
        invoice_data = build_invoice_data(row_obj)
        if not invoice_data:
            errors.append(f"No hours for {m['user_name']}")
            continue

        # Create recipient with invoice_data — admin will review and approve manually
        await sb_request("POST", "pay_period_recipients", data={
            "pay_period_id": period_id,
            "user_id": uid,
            "status": "received",
            "invoice_data": invoice_data,
            "submitted_at": datetime.utcnow().isoformat(),
        })
        imported += 1

    # Open the period if still draft
    if period["status"] == "draft":
        await sb_request("PATCH", f"pay_periods?id=eq.{period_id}", data={"status": "open"})

    return {"imported_entries": imported, "users_processed": imported, "errors": errors}


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

    payroll_roles = {"therapist", "clinical_leader", "apn", "ba", "supervisor"}
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


@app.post("/api/payroll/pay-periods/{period_id}/reopen")
async def reopen_pay_period(period_id: str, admin=Depends(require_admin)):
    """Admin: reopen a closed pay period (undo close)."""
    periods = await sb_request("GET", "pay_periods", params={
        "id": f"eq.{period_id}", "select": "id,status",
    })
    if not periods:
        raise HTTPException(status_code=404, detail="Pay period not found")
    if periods[0]["status"] != "closed":
        raise HTTPException(status_code=400, detail="Only closed periods can be reopened")
    await sb_request("PATCH", f"pay_periods?id=eq.{period_id}", data={
        "status": "open",
        "closed_at": None,
    })
    return {"status": "reopened"}


@app.delete("/api/payroll/pay-periods/{period_id}")
async def delete_pay_period(period_id: str, admin=Depends(require_admin)):
    """Admin: permanently delete a pay period and all associated data."""
    periods = await sb_request("GET", "pay_periods", params={
        "id": f"eq.{period_id}", "select": "id,status",
    })
    if not periods:
        raise HTTPException(status_code=404, detail="Pay period not found")
    # Delete time_entries first (FK to pay_period_recipients)
    await sb_request("DELETE", f"time_entries?pay_period_id=eq.{period_id}")
    # Delete rollup data
    await sb_request("DELETE", f"rollup_pay_period?pay_period_id=eq.{period_id}")
    # Delete recipients (FK to pay_periods)
    await sb_request("DELETE", f"pay_period_recipients?pay_period_id=eq.{period_id}")
    # Delete the period itself
    await sb_request("DELETE", f"pay_periods?id=eq.{period_id}")

    # Audit log
    await sb_request("POST", "audit_log", data={
        "action": "pay_period_deleted",
        "entity_type": "pay_period",
        "entity_id": period_id,
        "user_id": admin["id"],
        "details": {"status": periods[0].get("status")},
    })

    return {"status": "deleted"}


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
        "select": "*, users!user_id(first_name, last_name, role), pay_periods(start_date, end_date, label)",
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
        rname = rt.get("name", "")
        pay_rate_map[rname] = {
            "rate_type_id": pr["rate_type_id"],
            "pay_rate": float(pr["pay_rate"]),
            "unit": rt.get("unit", "hourly"),
        }

    # Fallback: fetch all rate types so time entries can always be written
    # even when a user has no pay rate configured for a given service type
    all_rate_types = await sb_request("GET", "rate_types", params={"select": "id,name,unit"})
    rate_type_fallback = {rt["name"]: rt for rt in (all_rate_types or [])}

    # Get bill rate defaults
    bill_defaults = await sb_request("GET", "bill_rate_defaults", params={
        "select": "*, rate_types(name)",
    })
    bill_rate_map = {}
    for bd in (bill_defaults or []):
        rt = bd.get("rate_types") or {}
        bill_rate_map[rt.get("name", "")] = float(bd["default_bill_rate"])

    # ── Parse structured invoice_data ──
    # Format: { iic: { CODE: [{cyber_initials, date, hours},...] }, op: { sessions: [{client_initials, date, cancel_fee?},...] },
    #   sbys: [{date, hours},...], ados: [{client_initials, location, id_number, date},...],
    #   admin: [{date, hours},...], supervision: { individual: [...], group: [...] },
    #   sick_leave: { date, hours, reason }, pto: { hours }, notes: "..." }
    total_bill = 0.0
    total_pay = 0.0
    total_hours = 0.0
    total_sessions = 0

    # Helper: write a time entry and accumulate totals
    async def write_entry(rate_name, qty, initials=None, duration=None, notes=None):
        nonlocal total_bill, total_pay, total_hours, total_sessions
        if qty == 0:
            return
        # Resolve rate_name through aliases — the names used in invoice parsing
        # (e.g. "IIC LPC/LCSW") may not match actual DB rate_type names ("IIC-LC")
        candidates = RATE_NAME_ALIASES.get(rate_name, [rate_name])
        rate_info = {}
        fallback = {}
        resolved_name = rate_name
        # Try each candidate in order against the user's pay rates first
        for candidate in candidates:
            if candidate in pay_rate_map:
                rate_info = pay_rate_map[candidate]
                resolved_name = candidate
                break
        # If no pay rate found, try the rate_types catalog (fallback)
        if not rate_info.get("rate_type_id"):
            for candidate in candidates:
                if candidate in rate_type_fallback:
                    fallback = rate_type_fallback[candidate]
                    resolved_name = candidate
                    break
        # Final fallback: try original name directly
        if not rate_info and not fallback:
            rate_info = pay_rate_map.get(rate_name, {})
            fallback = rate_type_fallback.get(rate_name, {})
        rate_type_id = rate_info.get("rate_type_id") or fallback.get("id")
        # Auto-create rate type if it doesn't exist (e.g. supervision types)
        if not rate_type_id:
            new_name = resolved_name or rate_name
            created = await sb_request("POST", "rate_types", data={
                "name": new_name, "unit": "hourly",
            })
            if created:
                new_rt = created[0] if isinstance(created, list) else created
                rate_type_id = new_rt.get("id")
                # Cache so subsequent calls in this approval don't re-create
                rate_type_fallback[new_name] = {"id": rate_type_id, "name": new_name, "unit": "hourly"}
        pay_rate = rate_info.get("pay_rate", 0)
        bill_rate = bill_rate_map.get(resolved_name, 0) or bill_rate_map.get(rate_name, 0)
        # ADOS assessments are flat rate per assessment (not rate × hours).
        # qty=3.0 for ADOS is hours toward requirement, but pay/bill is per assessment.
        # Check by name since the unit field in rate_types is unreliable
        # (APN has unit='session' but is actually billed hourly).
        is_ados = "ADOS" in rate_name or "ADOS" in resolved_name
        if is_ados:
            est_bill = bill_rate
            est_pay = pay_rate
            total_hours += qty
            total_sessions += 1
        else:
            est_bill = bill_rate * qty
            est_pay = pay_rate * qty
            total_hours += qty
        if rate_type_id:
            await sb_request("POST", "time_entries", data={
                "recipient_id": recipient_id, "user_id": user_id, "pay_period_id": period_id,
                "rate_type_id": rate_type_id, "quantity": qty,
                "duration_minutes": duration, "client_initials": initials,
                "est_bill_amount": round(est_bill, 2), "est_pay_amount": round(est_pay, 2),
                "notes": notes, "locked": True,
            })
        total_bill += est_bill
        total_pay += est_pay

    # IIC sessions
    iic = invoice_data.get("iic") or {}
    for code, entries in iic.items():
        if not isinstance(entries, list):
            continue
        # Map IIC code to rate type name
        iic_rate_names = {
            "IICLC-H0036TJU1": "IIC LPC/LCSW",
            "IICMA-H0036TJU2": "IIC LAC/LSW",
            "BA-H2014TJ": "Behavioral Assistant",
        }
        rate_name = iic_rate_names.get(code, code)
        for entry in entries:
            hrs = float(entry.get("hours") or 0)
            await write_entry(rate_name, hrs, initials=entry.get("cyber_initials"))

    # OP sessions (each session = 1 hour, cancellations also = 1 hour)
    op = invoice_data.get("op") or {}
    op_sessions = op.get("sessions") or []
    for entry in op_sessions:
        is_cancel = entry.get("cancel_fee")
        rate_name = "OP Cancellation" if is_cancel else "OP Session"
        await write_entry(rate_name, 1.0, initials=entry.get("client_initials"))

    # SBYS
    sbys = invoice_data.get("sbys") or []
    for entry in sbys:
        hrs = float(entry.get("hours") or 0)
        await write_entry("SBYS", hrs)

    # ADOS (each assessment = 3 hours toward time worked)
    ados = invoice_data.get("ados") or []
    for entry in ados:
        loc = (entry.get("location") or "").lower()
        if "office" in loc:
            ados_rate = "ADOS Assessment - At Office"
        else:
            ados_rate = "ADOS Assessment - In Home"
        await write_entry(ados_rate, 3.0, initials=entry.get("client_initials"),
                          notes=f"{entry.get('location','')} ID:{entry.get('id_number','')}")

    # APN
    apn_entries = invoice_data.get("apn") or []
    for entry in apn_entries:
        hrs = float(entry.get("hours") or 0)
        apn_type = entry.get("type", "30min")
        rate_name = "APN Intake" if apn_type == "intake" else "APN 30 Min"
        await write_entry(rate_name, hrs)

    # Admin
    admin_entries = invoice_data.get("admin") or []
    for entry in admin_entries:
        hrs = float(entry.get("hours") or 0)
        await write_entry("Administration", hrs)

    # Supervision (individual + group, each session = 1 hour)
    sup = invoice_data.get("supervision") or {}
    for s in (sup.get("individual") or []):
        await write_entry("Individual Supervision", 1.0, notes=f"Supervisor: {s.get('supervisor_name','')}")
    for s in (sup.get("group") or []):
        await write_entry("Group Supervision", 1.0, notes=f"Supervisees: {','.join(s.get('supervisee_names',[]))}")

    # Sick Leave (only if admin approved)
    sick = invoice_data.get("sick_leave") or {}
    sick_hrs = float(sick.get("hours") or 0)
    if sick_hrs > 0:
        await write_entry("Sick Leave", sick_hrs, notes=sick.get("reason"))

    # PTO
    pto = invoice_data.get("pto") or {}
    pto_hrs = float(pto.get("hours") or 0)
    if pto_hrs > 0:
        await write_entry("PTO", pto_hrs)

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


@app.post("/api/payroll/recipients/{recipient_id}/unapprove")
async def unapprove_recipient(recipient_id: str, admin=Depends(require_admin)):
    """
    Admin: revert an approved submission back to 'received' so it can be re-edited.
    Deletes the time_entries created during approval and recalculates rollups.
    """
    recipients = await sb_request("GET", "pay_period_recipients", params={
        "id": f"eq.{recipient_id}",
        "select": "id, user_id, pay_period_id, status",
    })
    if not recipients:
        raise HTTPException(status_code=404, detail="Recipient not found")
    recipient = recipients[0]
    if recipient["status"] != "approved":
        raise HTTPException(status_code=400, detail="Can only unapprove approved submissions")

    user_id = recipient["user_id"]
    period_id = recipient["pay_period_id"]

    # 1. Delete time_entries created by this approval
    await sb_request("DELETE", f"time_entries?recipient_id=eq.{recipient_id}")

    # 2. Reset recipient status back to received
    await sb_request("PATCH", f"pay_period_recipients?id=eq.{recipient_id}", data={
        "status": "received",
        "approved_at": None,
        "approved_by": None,
        "admin_override_data": None,
        "updated_at": datetime.utcnow().isoformat(),
    })

    # 3. Recalculate rollup_pay_period from remaining time_entries for this user+period
    remaining = await sb_request("GET", "time_entries", params={
        "user_id": f"eq.{user_id}",
        "pay_period_id": f"eq.{period_id}",
        "select": "quantity, est_bill_amount, est_pay_amount, rate_types(unit)",
    })
    if remaining:
        total_hours = 0.0
        total_sessions = 0
        total_bill = 0.0
        total_pay = 0.0
        for te in remaining:
            total_bill += float(te.get("est_bill_amount") or 0)
            total_pay += float(te.get("est_pay_amount") or 0)
            unit = (te.get("rate_types") or {}).get("unit", "hourly")
            if unit == "hourly":
                total_hours += float(te.get("quantity") or 0)
            else:
                total_sessions += int(te.get("quantity") or 0)
        await sb_request("PATCH", f"rollup_pay_period?pay_period_id=eq.{period_id}&user_id=eq.{user_id}", data={
            "total_hours": round(total_hours, 2),
            "total_sessions": total_sessions,
            "est_bill_total": round(total_bill, 2),
            "est_pay_total": round(total_pay, 2),
            "margin": round(total_bill - total_pay, 2),
            "updated_at": datetime.utcnow().isoformat(),
        })
    else:
        # No remaining entries — delete the rollup
        await sb_request("DELETE", f"rollup_pay_period?pay_period_id=eq.{period_id}&user_id=eq.{user_id}")

    # 4. Recalculate rollup_monthly
    period_data = await sb_request("GET", "pay_periods", params={"id": f"eq.{period_id}", "select": "start_date"})
    if period_data:
        month_year = period_data[0]["start_date"][:7]
        # Sum all rollup_pay_period entries for this user in this month
        all_rollups = await sb_request("GET", "rollup_pay_period", params={
            "user_id": f"eq.{user_id}",
            "select": "total_hours, total_sessions, est_bill_total, est_pay_total, pay_periods!inner(start_date)",
        })
        month_hours = 0.0
        month_sessions = 0
        month_bill = 0.0
        month_pay = 0.0
        for r in (all_rollups or []):
            pp = r.get("pay_periods") or {}
            if (pp.get("start_date") or "")[:7] == month_year:
                month_hours += float(r.get("total_hours") or 0)
                month_sessions += int(r.get("total_sessions") or 0)
                month_bill += float(r.get("est_bill_total") or 0)
                month_pay += float(r.get("est_pay_total") or 0)

        existing_monthly = await sb_request("GET", "rollup_monthly", params={
            "user_id": f"eq.{user_id}",
            "month_year": f"eq.{month_year}",
        })
        if month_hours > 0 or month_sessions > 0:
            monthly_data = {
                "user_id": user_id,
                "month_year": month_year,
                "total_hours": round(month_hours, 2),
                "total_sessions": month_sessions,
                "est_bill_total": round(month_bill, 2),
                "est_pay_total": round(month_pay, 2),
                "margin": round(month_bill - month_pay, 2),
                "updated_at": datetime.utcnow().isoformat(),
            }
            if existing_monthly:
                await sb_request("PATCH", f"rollup_monthly?user_id=eq.{user_id}&month_year=eq.{month_year}", data=monthly_data)
            else:
                await sb_request("POST", "rollup_monthly", data=monthly_data)
        elif existing_monthly:
            await sb_request("DELETE", f"rollup_monthly?user_id=eq.{user_id}&month_year=eq.{month_year}")

    # 5. Audit log
    await sb_request("POST", "audit_log", data={
        "action": "recipient_unapproved",
        "entity_type": "pay_period_recipient",
        "entity_id": recipient_id,
        "user_id": admin["id"],
    })

    return {"status": "received"}


class AdminNoteRequest(BaseModel):
    note: str


@app.post("/api/payroll/recipients/{recipient_id}/admin-note")
async def add_admin_note(recipient_id: str, req: AdminNoteRequest, admin=Depends(require_admin)):
    """Admin: add a note/question to a recipient's submission."""
    recipients = await sb_request("GET", "pay_period_recipients", params={
        "id": f"eq.{recipient_id}", "select": "id,admin_notes",
    })
    if not recipients:
        raise HTTPException(status_code=404, detail="Recipient not found")

    existing_notes = recipients[0].get("admin_notes") or []
    new_note = {
        "text": req.note,
        "by": f"{admin['first_name']} {admin['last_name']}",
        "by_id": admin["id"],
        "at": datetime.utcnow().isoformat(),
    }
    existing_notes.append(new_note)

    await sb_request("PATCH", f"pay_period_recipients?id=eq.{recipient_id}", data={
        "admin_notes": existing_notes,
        "updated_at": datetime.utcnow().isoformat(),
    })
    return {"status": "note_added", "notes": existing_notes}


class UpdateLineItemsRequest(BaseModel):
    invoice_data: dict


@app.patch("/api/payroll/recipients/{recipient_id}/invoice-data")
async def update_invoice_data(recipient_id: str, req: UpdateLineItemsRequest, admin=Depends(require_admin)):
    """Admin: edit line items on a submitted invoice before approval."""
    recipients = await sb_request("GET", "pay_period_recipients", params={
        "id": f"eq.{recipient_id}", "select": "id,status",
    })
    if not recipients:
        raise HTTPException(status_code=404, detail="Recipient not found")
    if recipients[0]["status"] not in ("received",):
        raise HTTPException(status_code=400, detail="Can only edit received (pending) submissions")

    await sb_request("PATCH", f"pay_period_recipients?id=eq.{recipient_id}", data={
        "invoice_data": req.invoice_data,
        "updated_at": datetime.utcnow().isoformat(),
    })

    await sb_request("POST", "audit_log", data={
        "action": "invoice_data_edited",
        "entity_type": "pay_period_recipient",
        "entity_id": recipient_id,
        "user_id": admin["id"],
    })

    return {"status": "updated"}


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


# ── Billing Summary (new) ──────────────────────────────────────────

# Revenue-generating service types (split by license/location)
REVENUE_TYPES = ["IIC-LC", "IIC-MA", "IIC-BA", "OP", "OP Cancellation", "SBYS", "ADOS In Home", "ADOS At Office", "APN 30 Min", "APN Intake"]
# Non-revenue (still tracked for hours)
NON_REVENUE_TYPES = ["PTO", "Sick Leave"]
SERVICE_TYPES = REVENUE_TYPES + NON_REVENUE_TYPES

# Map IIC billing codes to split categories
IIC_CODE_MAP = {
    "IICLC-H0036TJU1": "IIC-LC",
    "IICMA-H0036TJU2": "IIC-MA",
    "BA-H2014TJ": "IIC-BA",
}

# Map service type keys → rate_types.name in the DB (for bill rate lookup/save)
SERVICE_TO_RATE_NAME = {
    "IIC-LC": "IIC-LC",
    "IIC-MA": "IIC-MA",
    "IIC-BA": "IIC-BA",
    "OP": "OP-LC Session",
    "OP Cancellation": "OP Cancellation",
    "SBYS": "SBYS",
    "ADOS In Home": "ADOS Assessment - In Home",
    "ADOS At Office": "ADOS Assessment - At Office",
    "APN 30 Min": "APN Session (30)",
    "APN Intake": "APN Intake (60)",
}
# Reverse map (forward only — bill rate names → service keys)
RATE_NAME_TO_SERVICE = {v: k for k, v in SERVICE_TO_RATE_NAME.items()}

# Comprehensive reverse map: rate_types.name → billing summary service key.
# Covers all possible rate_type names that can appear on time_entries (including
# pay-rate aliases, bill-rate names, and legacy names). Used by the snapshot-based
# billing summary to map time_entries back to service categories.
RATE_TYPE_TO_BILLING_SERVICE = {
    # IIC
    "IIC-LC": "IIC-LC",
    "IIC LPC/LCSW": "IIC-LC",
    "IIC-MA": "IIC-MA",
    "IIC LAC/LSW": "IIC-MA",
    "IIC-BA": "IIC-BA",
    "Behavioral Assistant": "IIC-BA",
    "IIC": "IIC-LC",  # legacy fallback
    # OP
    "OP-LC Session": "OP",
    "OP-MA Session": "OP",
    "OP Session": "OP",
    # OP Cancellation
    "OP Cancellation": "OP Cancellation",
    # SBYS
    "SBYS": "SBYS",
    # ADOS
    "ADOS Assessment - In Home": "ADOS In Home",
    "ADOS Assessment (In Home)": "ADOS In Home",
    "ADOS Assessment - At Office": "ADOS At Office",
    "ADOS Assessment (In Office)": "ADOS At Office",
    "ADOS": "ADOS In Home",  # legacy fallback
    # APN
    "APN Session (30)": "APN 30 Min",
    "APN 30 Min": "APN 30 Min",
    "APN Intake (60)": "APN Intake",
    "APN Intake": "APN Intake",
    # Time off
    "PTO": "PTO",
    "Sick Leave": "Sick Leave",
    # Non-billing types — these are tracked as time entries but do not appear
    # in the billing summary service categories. They will be silently skipped.
    # "Administration", "Individual Supervision", "Group Supervision"
}

# Map service types → pay rate name candidates (try in order until one matches)
# Some services have LC/MA variants — e.g. OP-LC Session vs OP-MA Session
SERVICE_TO_PAY_RATE_NAMES = {
    "IIC-LC": ["IIC LPC/LCSW", "IIC-LC"],
    "IIC-MA": ["IIC LAC/LSW", "IIC-MA"],
    "IIC-BA": ["Behavioral Assistant", "IIC-BA"],
    "OP": ["OP-LC Session", "OP-MA Session", "OP Session"],
    "OP Cancellation": ["OP Cancellation"],
    "SBYS": ["SBYS"],
    "ADOS In Home": ["ADOS", "ADOS Assessment - In Home"],
    "ADOS At Office": ["ADOS", "ADOS Assessment - At Office"],
    "APN 30 Min": ["APN 30 Min", "APN Session (30)"],
    "APN Intake": ["APN Intake", "APN Intake (60)"],
    "PTO": ["PTO"],
    "Sick Leave": ["Sick Leave"],
}

# Aliases: names used in approve_recipient → candidates to try in DB rate_types table.
# approve_recipient writes time entries with these names, but the DB rate_types
# table uses different naming conventions.
RATE_NAME_ALIASES = {
    "IIC LPC/LCSW": ["IIC-LC", "IIC LPC/LCSW"],
    "IIC LAC/LSW": ["IIC-MA", "IIC LAC/LSW"],
    "Behavioral Assistant": ["IIC-BA", "Behavioral Assistant"],
    "OP Session": ["OP-LC Session", "OP-MA Session", "OP Session"],
    "OP Cancellation": ["OP Cancellation"],
    "SBYS": ["SBYS"],
    "ADOS Assessment - In Home": ["ADOS Assessment - In Home", "ADOS Assessment (In Home)", "ADOS"],
    "ADOS Assessment - At Office": ["ADOS Assessment - At Office", "ADOS Assessment (In Office)", "ADOS"],
    "APN 30 Min": ["APN Session (30)", "APN 30 Min"],
    "APN Intake": ["APN Intake (60)", "APN Intake"],
    "Administration": ["Administration"],
    "Individual Supervision": ["Individual Supervision"],
    "Group Supervision": ["Group Supervision"],
    "Sick Leave": ["Sick Leave"],
    "PTO": ["PTO"],
}

def _extract_service_hours(invoice_data: dict) -> dict:
    """Extract hours per service type from structured invoice_data."""
    hours = {st: 0.0 for st in SERVICE_TYPES}
    # Also track ADOS count (assessments, not hours)
    counts = {"ADOS In Home": 0, "ADOS At Office": 0}
    if not invoice_data:
        return hours, counts

    # IIC — split by license code
    iic = invoice_data.get("iic") or {}
    for code, entries in iic.items():
        if isinstance(entries, list):
            stype = IIC_CODE_MAP.get(code, "IIC-LC")  # default to LC
            for e in entries:
                hours[stype] += float(e.get("hours") or 0)

    # OP — split regular sessions vs cancellations (each = 1 hour)
    op = invoice_data.get("op") or {}
    for s in (op.get("sessions") or []):
        if s.get("cancel_fee"):
            hours["OP Cancellation"] += 1.0
        else:
            hours["OP"] += 1.0

    # SBYS
    for e in (invoice_data.get("sbys") or []):
        hours["SBYS"] += float(e.get("hours") or 0)

    # ADOS — split by location (each assessment = 3 hours toward time worked)
    for e in (invoice_data.get("ados") or []):
        loc = (e.get("location") or "").lower()
        if "office" in loc:
            hours["ADOS At Office"] += 3.0
            counts["ADOS At Office"] += 1
        else:
            hours["ADOS In Home"] += 3.0
            counts["ADOS In Home"] += 1

    # APN — split by type field or duration_minutes
    for e in (invoice_data.get("apn") or []):
        apn_type = e.get("type", "")
        mins = float(e.get("duration_minutes") or e.get("minutes") or 30)
        hrs_val = float(e.get("hours") or (mins / 60))
        if apn_type == "intake" or mins >= 50:  # intake (60 min)
            hours["APN Intake"] += hrs_val
        else:
            hours["APN 30 Min"] += hrs_val

    # PTO
    pto = invoice_data.get("pto") or {}
    hours["PTO"] += float(pto.get("hours") or 0)

    # Sick Leave
    sick = invoice_data.get("sick_leave") or {}
    hours["Sick Leave"] += float(sick.get("hours") or 0)

    return hours, counts


@app.get("/api/analytics/billing-summary")
async def billing_summary(admin=Depends(require_admin)):
    """
    Billing Summary: returns closed pay periods with per-service-type breakdowns.
    Uses immutable time_entries snapshots (est_pay_amount, est_bill_amount) written
    at approval time — changing pay rates will NOT alter historical summaries.
    Also returns any open/pending periods so the frontend can warn the user to close them.
    """
    # Get all closed pay periods (most recent first)
    periods = await sb_request("GET", "pay_periods", params={
        "select": "id, label, start_date, end_date, status",
        "status": "eq.closed",
        "order": "start_date.asc",
    })
    if not periods:
        periods = []

    # Fetch truly open periods (not drafts) so frontend can show a reminder
    open_periods_raw = await sb_request("GET", "pay_periods", params={
        "select": "id, label, start_date, end_date, status",
        "status": "eq.open",
        "order": "start_date.asc",
    }) or []

    # Get bill rate config for projected revenue
    bill_rates = await sb_request("GET", "bill_rate_defaults", params={
        "select": "*, rate_types(name)",
    })
    bill_rate_map = {}
    for br in (bill_rates or []):
        rt = br.get("rate_types") or {}
        name = rt.get("name", "")
        bill_rate_map[name] = float(br.get("default_bill_rate", 0))

    # Build service→bill_rate map using explicit name mapping
    service_bill_rates = {}
    for st in REVENUE_TYPES:
        rate_name = SERVICE_TO_RATE_NAME.get(st, st)
        rate = bill_rate_map.get(rate_name, 0)
        if not rate:
            # Fallback: try exact match on service key itself
            rate = bill_rate_map.get(st, 0)
        service_bill_rates[st] = rate

    # NOTE: Pay and revenue are now calculated from time_entries snapshots
    # (est_pay_amount, est_bill_amount) written at approval time, NOT from
    # live user_pay_rates. This ensures changing a staff member's rate does
    # not retroactively alter historical billing summaries.

    period_summaries = []

    for period in periods:
        pid = period["id"]
        # Get approved + exported recipients (exported must still appear in summary)
        recipients = await sb_request("GET", "pay_period_recipients", params={
            "pay_period_id": f"eq.{pid}",
            "status": "in.(approved,exported)",
            "select": "user_id",
        })
        valid_user_ids = {r["user_id"] for r in (recipients or [])}

        # Query time_entries with rate_type name for this period
        time_entries_list = await sb_request("GET", "time_entries", params={
            "pay_period_id": f"eq.{pid}",
            "select": "user_id, rate_type_id, quantity, est_pay_amount, est_bill_amount, rate_types(name)",
        })

        # Aggregate by billing service type from snapshot data
        service_totals = {st: 0.0 for st in SERVICE_TYPES}
        service_pay = {st: 0.0 for st in SERVICE_TYPES}
        ados_counts = {"ADOS In Home": 0, "ADOS At Office": 0}
        for te in (time_entries_list or []):
            if te["user_id"] not in valid_user_ids:
                continue
            rt = te.get("rate_types") or {}
            rate_name = rt.get("name", "")
            service_key = RATE_TYPE_TO_BILLING_SERVICE.get(rate_name)
            if not service_key or service_key not in service_totals:
                continue  # Skip non-billing types (Administration, Supervision, etc.)
            qty = float(te.get("quantity", 0))
            pay_amt = float(te.get("est_pay_amount", 0))
            service_totals[service_key] += qty
            service_pay[service_key] += pay_amt
            # ADOS: each time_entry = 1 assessment (with quantity=3 hours)
            if service_key in ados_counts:
                ados_counts[service_key] += 1

        # Build service breakdown: PAY from snapshots, REVENUE from current bill rates
        service_breakdown = []
        grand_hours = 0.0
        grand_revenue = 0.0
        grand_pay = 0.0
        for st in SERVICE_TYPES:
            hrs = service_totals[st]
            if hrs == 0:
                continue
            bill_rate = service_bill_rates.get(st, 0)
            # Revenue: calculated dynamically from current bill_rate_defaults
            # (bill rates may be adjusted for business reasons)
            if st.startswith("ADOS") and st in REVENUE_TYPES:
                num_assessments = ados_counts.get(st, 0)
                revenue = num_assessments * bill_rate
            elif st in REVENUE_TYPES:
                revenue = hrs * bill_rate
            else:
                revenue = 0
            pay = service_pay[st]  # from est_pay_amount snapshots (immutable)
            # PTO and Sick Leave don't count toward total hours of impact
            if st not in NON_REVENUE_TYPES:
                grand_hours += hrs
            grand_revenue += revenue
            grand_pay += pay
            entry = {
                "service": st,
                "hours": round(hrs, 2),
                "revenue": round(revenue, 2),
                "pay": round(pay, 2),
                "bill_rate": bill_rate,
            }
            # Add assessment count for ADOS
            if st.startswith("ADOS"):
                entry["assessments"] = ados_counts.get(st, 0)
            service_breakdown.append(entry)

        period_summaries.append({
            "id": pid,
            "label": period.get("label", ""),
            "start_date": period["start_date"],
            "end_date": period["end_date"],
            "services": service_breakdown,
            "total_hours": round(grand_hours, 2),
            "total_revenue": round(grand_revenue, 2),
            "total_pay": round(grand_pay, 2),
            "total_profit": round(grand_revenue - grand_pay, 2),
            "margin_pct": round((grand_revenue - grand_pay) / grand_revenue * 100, 1) if grand_revenue > 0 else 0,
        })

    # Merge period summaries that share the same date range
    merged_map = {}
    for ps in period_summaries:
        key = (ps["start_date"], ps["end_date"])
        if key not in merged_map:
            merged_map[key] = {
                "id": ps["id"],
                "label": ps["label"],
                "start_date": ps["start_date"],
                "end_date": ps["end_date"],
                "services_map": {},
                "total_hours": 0.0,
                "total_revenue": 0.0,
                "total_pay": 0.0,
            }
        m = merged_map[key]
        m["total_hours"] += ps["total_hours"]
        m["total_revenue"] += ps["total_revenue"]
        m["total_pay"] += ps["total_pay"]
        for svc in ps["services"]:
            sname = svc["service"]
            if sname not in m["services_map"]:
                m["services_map"][sname] = {"service": sname, "hours": 0.0, "revenue": 0.0, "pay": 0.0, "bill_rate": svc.get("bill_rate", 0), "assessments": 0}
            m["services_map"][sname]["hours"] += svc["hours"]
            m["services_map"][sname]["revenue"] += svc.get("revenue", 0)
            m["services_map"][sname]["pay"] += svc.get("pay", 0)
            m["services_map"][sname]["assessments"] += svc.get("assessments", 0)

    period_summaries = []
    for key in sorted(merged_map.keys()):
        m = merged_map[key]
        svc_list = []
        for st in SERVICE_TYPES:
            sd = m["services_map"].get(st)
            if not sd or sd["hours"] == 0:
                continue
            entry = {"service": st, "hours": round(sd["hours"], 2), "revenue": round(sd["revenue"], 2), "pay": round(sd["pay"], 2), "bill_rate": sd["bill_rate"]}
            if st.startswith("ADOS"):
                entry["assessments"] = sd["assessments"]
            svc_list.append(entry)
        profit = m["total_revenue"] - m["total_pay"]
        period_summaries.append({
            "id": m["id"],
            "label": m["label"],
            "start_date": m["start_date"],
            "end_date": m["end_date"],
            "services": svc_list,
            "total_hours": round(m["total_hours"], 2),
            "total_revenue": round(m["total_revenue"], 2),
            "total_pay": round(m["total_pay"], 2),
            "total_profit": round(profit, 2),
            "margin_pct": round(profit / m["total_revenue"] * 100, 1) if m["total_revenue"] > 0 else 0,
        })

    # Build monthly summaries (group periods by month)
    monthly = {}
    for ps in period_summaries:
        month_key = ps["start_date"][:7]  # YYYY-MM
        if month_key not in monthly:
            monthly[month_key] = {
                "month": month_key,
                "services": {st: {"hours": 0.0, "revenue": 0.0, "pay": 0.0, "assessments": 0} for st in SERVICE_TYPES},
                "total_hours": 0, "total_revenue": 0, "total_pay": 0,
            }
        for svc in ps["services"]:
            monthly[month_key]["services"][svc["service"]]["hours"] += svc["hours"]
            monthly[month_key]["services"][svc["service"]]["revenue"] += svc.get("revenue", 0)
            monthly[month_key]["services"][svc["service"]]["pay"] += svc.get("pay", 0)
            monthly[month_key]["services"][svc["service"]]["assessments"] += svc.get("assessments", 0)
        monthly[month_key]["total_hours"] += ps["total_hours"]
        monthly[month_key]["total_revenue"] += ps["total_revenue"]
        monthly[month_key]["total_pay"] += ps["total_pay"]

    monthly_list = []
    for mk, mv in sorted(monthly.items()):
        svc_list = []
        for st in SERVICE_TYPES:
            sd = mv["services"][st]
            hrs = sd["hours"]
            if hrs == 0:
                continue
            entry = {
                "service": st,
                "hours": round(hrs, 2),
                "revenue": round(sd["revenue"], 2),
                "pay": round(sd["pay"], 2),
            }
            if st.startswith("ADOS"):
                entry["assessments"] = sd["assessments"]
            svc_list.append(entry)
        profit = mv["total_revenue"] - mv["total_pay"]
        monthly_list.append({
            "month": mk,
            "services": svc_list,
            "total_hours": round(mv["total_hours"], 2),
            "total_revenue": round(mv["total_revenue"], 2),
            "total_pay": round(mv["total_pay"], 2),
            "total_profit": round(profit, 2),
            "margin_pct": round(profit / mv["total_revenue"] * 100, 1) if mv["total_revenue"] > 0 else 0,
        })

    return {
        "periods": period_summaries,
        "monthly": monthly_list,
        "bill_rates": service_bill_rates,
        "open_periods": [
            {"id": p["id"], "label": p.get("label", ""), "start_date": p["start_date"], "end_date": p["end_date"]}
            for p in open_periods_raw
        ],
    }


@app.get("/api/analytics/billing-summary/{period_id}")
async def billing_summary_detail(period_id: str, admin=Depends(require_admin)):
    """
    Detail view for a single pay period: per-therapist breakdown by service type,
    mirroring the billing master sheet layout.
    """
    # Get the period
    periods = await sb_request("GET", "pay_periods", params={
        "id": f"eq.{period_id}", "select": "id, label, start_date, end_date",
    })
    if not periods:
        raise HTTPException(status_code=404, detail="Pay period not found")
    period = periods[0]

    # Get approved + exported recipients (exported must still appear)
    recipients = await sb_request("GET", "pay_period_recipients", params={
        "pay_period_id": f"eq.{period_id}",
        "status": "in.(approved,exported)",
        "select": "id, user_id, users!user_id(first_name, last_name)",
    })
    valid_user_ids = {r["user_id"] for r in (recipients or [])}
    user_names = {}
    for r in (recipients or []):
        u = r.get("users") or {}
        user_names[r["user_id"]] = f"{u.get('first_name', '')} {u.get('last_name', '')}".strip()

    # Get bill rates for display reference only (not used in calculations)
    bill_rates = await sb_request("GET", "bill_rate_defaults", params={
        "select": "*, rate_types(name)",
    })
    bill_rate_map = {}
    for br in (bill_rates or []):
        rt = br.get("rate_types") or {}
        bill_rate_map[rt.get("name", "")] = float(br.get("default_bill_rate", 0))

    service_bill_rates = {}
    for st in REVENUE_TYPES:
        rate_name = SERVICE_TO_RATE_NAME.get(st, st)
        rate = bill_rate_map.get(rate_name, 0)
        if not rate:
            rate = bill_rate_map.get(st, 0)
        service_bill_rates[st] = rate

    # NOTE: Pay and revenue now come from time_entries snapshots (est_pay_amount,
    # est_bill_amount), NOT from live user_pay_rates. This ensures changing a
    # staff member's rate does not alter historical billing summaries.

    # Query all time_entries for this period with rate_type names
    time_entries_list = await sb_request("GET", "time_entries", params={
        "pay_period_id": f"eq.{period_id}",
        "select": "user_id, rate_type_id, quantity, est_pay_amount, est_bill_amount, rate_types(name)",
    })

    # Build per-user per-service breakdown: PAY from snapshots, hours for revenue calc
    # user_id → service_key → {hours, pay, ados_count}
    user_service_data = {}
    for te in (time_entries_list or []):
        uid = te["user_id"]
        if uid not in valid_user_ids:
            continue
        rt = te.get("rate_types") or {}
        rate_name = rt.get("name", "")
        service_key = RATE_TYPE_TO_BILLING_SERVICE.get(rate_name)
        if not service_key or service_key not in {s for s in SERVICE_TYPES}:
            continue  # Skip non-billing types
        if uid not in user_service_data:
            user_service_data[uid] = {}
        if service_key not in user_service_data[uid]:
            user_service_data[uid][service_key] = {"hours": 0, "pay": 0, "ados_count": 0}
        user_service_data[uid][service_key]["hours"] += float(te.get("quantity", 0))
        user_service_data[uid][service_key]["pay"] += float(te.get("est_pay_amount", 0))
        # ADOS: each time_entry = 1 assessment
        if service_key.startswith("ADOS"):
            user_service_data[uid][service_key]["ados_count"] += 1

    # Build per-service-type per-therapist detail
    service_detail = {st: [] for st in SERVICE_TYPES}
    service_totals_map = {st: {"hours": 0, "revenue": 0, "pay": 0} for st in SERVICE_TYPES}

    for uid, svc_map in user_service_data.items():
        name = user_names.get(uid, "Unknown")
        for st, data in svc_map.items():
            hrs = data["hours"]
            bill_rate = service_bill_rates.get(st, 0)
            # Revenue: calculated dynamically from current bill_rate_defaults
            if st.startswith("ADOS") and st in REVENUE_TYPES:
                revenue = data["ados_count"] * bill_rate
            elif st in REVENUE_TYPES:
                revenue = hrs * bill_rate
            else:
                revenue = 0
            pay = data["pay"]  # from est_pay_amount snapshots (immutable)
            profit = revenue - pay
            margin = (profit / revenue * 100) if revenue > 0 else 0

            service_detail[st].append({
                "name": name,
                "hours": round(hrs, 2),
                "revenue": round(revenue, 2),
                "pay": round(pay, 2),
                "profit": round(profit, 2),
                "margin": round(margin, 1),
            })
            service_totals_map[st]["hours"] += hrs
            service_totals_map[st]["revenue"] += revenue
            service_totals_map[st]["pay"] += pay

    # Build response
    sections = []
    for st in SERVICE_TYPES:
        if not service_detail[st]:
            continue
        t = service_totals_map[st]
        profit = t["revenue"] - t["pay"]
        sections.append({
            "service": st,
            "rows": service_detail[st],
            "total_hours": round(t["hours"], 2),
            "total_revenue": round(t["revenue"], 2),
            "total_pay": round(t["pay"], 2),
            "total_profit": round(profit, 2),
            "total_margin": round(profit / t["revenue"] * 100, 1) if t["revenue"] > 0 else 0,
        })

    # Grand totals (exclude PTO/Sick from hours — they're not hours of impact)
    gh = sum(s["total_hours"] for s in sections if s["service"] not in NON_REVENUE_TYPES)
    gr = sum(s["total_revenue"] for s in sections)
    gp = sum(s["total_pay"] for s in sections)

    return {
        "period": period,
        "sections": sections,
        "grand_total": {
            "hours": round(gh, 2),
            "revenue": round(gr, 2),
            "pay": round(gp, 2),
            "profit": round(gr - gp, 2),
            "margin": round((gr - gp) / gr * 100, 1) if gr > 0 else 0,
        },
        "bill_rates": service_bill_rates,
    }


@app.patch("/api/analytics/billing-rates")
async def update_billing_rates(req: dict = Body(...), admin=Depends(require_admin)):
    """Admin: update projected revenue rates per service type."""
    # req format: { "IIC-LC": 123.45, "OP": 115, ... }
    rate_types_list = await sb_request("GET", "rate_types", params={"select": "id, name"})
    rt_map = {rt["name"]: rt["id"] for rt in (rate_types_list or [])}

    for service_key, rate_value in req.items():
        # Map service key to DB rate_type name
        db_name = SERVICE_TO_RATE_NAME.get(service_key, service_key)
        rt_id = rt_map.get(db_name)
        if not rt_id:
            # Also try the service key directly
            rt_id = rt_map.get(service_key)
        if not rt_id:
            # Create the rate type
            result = await sb_request("POST", "rate_types", data={
                "name": db_name, "unit": "session" if "ADOS" in service_key else "hourly",
            })
            if result:
                rt_id = result[0]["id"] if isinstance(result, list) else result["id"]
                rt_map[db_name] = rt_id

        if rt_id:
            existing = await sb_request("GET", "bill_rate_defaults", params={
                "rate_type_id": f"eq.{rt_id}",
            })
            if existing:
                await sb_request("PATCH", f"bill_rate_defaults?rate_type_id=eq.{rt_id}", data={
                    "default_bill_rate": float(rate_value),
                })
            else:
                await sb_request("POST", "bill_rate_defaults", data={
                    "rate_type_id": rt_id,
                    "default_bill_rate": float(rate_value),
                })

    return {"status": "updated"}


@app.post("/api/admin/migrate-rate-types")
async def migrate_rate_types(admin=Depends(require_admin)):
    """One-time migration: update rate_types for v5 schema changes.
    Deactivates old types, adds IIC-LC/MA/BA, splits OP, renames ADOS."""

    # Step 1: Deactivate types to remove
    deactivate_names = [
        "IIC", "APN 30 Min", "ADOS Assessment (In Home)", "ADOS Assessment (In Office)",
        "ADOS In Home", "ADOS At Office",
        "Other (Hourly)", "Other (Day)", "APN Other (Custom)",
    ]
    for name in deactivate_names:
        await sb_request("PATCH", f"rate_types?name=eq.{name}", data={"is_active": False})

    # Step 2: Add new IIC split types
    new_types = [
        {"name": "IIC-LC", "unit": "hourly", "sort_order": 1},
        {"name": "IIC-MA", "unit": "hourly", "sort_order": 2},
        {"name": "IIC-BA", "unit": "hourly", "sort_order": 3},
    ]
    for nt in new_types:
        existing = await sb_request("GET", "rate_types", params={"name": f"eq.{nt['name']}"})
        if existing:
            await sb_request("PATCH", f"rate_types?name=eq.{nt['name']}", data={"sort_order": nt["sort_order"], "is_active": True})
        else:
            await sb_request("POST", "rate_types", data=nt)

    # Step 3: Rename OP Session → OP-LC Session, add OP-MA Session
    existing_op = await sb_request("GET", "rate_types", params={"name": "eq.OP Session"})
    if existing_op:
        await sb_request("PATCH", f"rate_types?name=eq.OP Session", data={"name": "OP-LC Session", "sort_order": 4})

    existing_op_ma = await sb_request("GET", "rate_types", params={"name": "eq.OP-MA Session"})
    if not existing_op_ma:
        await sb_request("POST", "rate_types", data={
            "name": "OP-MA Session", "unit": "hourly", "default_duration_minutes": 60, "sort_order": 5,
        })
    else:
        await sb_request("PATCH", f"rate_types?name=eq.OP-MA Session", data={"sort_order": 5, "is_active": True})

    # Step 4: Add new ADOS types (session-based)
    ados_types = [
        {"name": "ADOS Assessment - In Home", "unit": "session", "sort_order": 8},
        {"name": "ADOS Assessment - At Office", "unit": "session", "sort_order": 9},
    ]
    for at in ados_types:
        existing = await sb_request("GET", "rate_types", params={"name": f"eq.{at['name']}"})
        if existing:
            await sb_request("PATCH", f"rate_types?name=eq.{at['name']}", data={"sort_order": at["sort_order"], "is_active": True})
        else:
            await sb_request("POST", "rate_types", data=at)

    # Step 5: Reorder remaining types
    reorder = {
        "SBYS": 6, "Administration": 7, "APN Session (30)": 10, "APN Intake (60)": 11,
        "PTO": 12, "Sick Leave": 13, "Community Event (Day)": 14, "OP Cancellation": 15,
    }
    for name, order in reorder.items():
        await sb_request("PATCH", f"rate_types?name=eq.{name}", data={"sort_order": order})

    return {"status": "migration_complete", "message": "Rate types updated successfully"}


# ── Shared: service-hours column initializer ──
# Used by billing summary, performance tracking, and performance detail.
PERF_COLUMNS = ("iic", "op", "op_cancel", "sbys", "ados", "apn", "sup", "sick", "pto", "admin", "total")

def _new_service_hours() -> dict:
    """Return a zeroed-out service-hours dict (one key per performance column)."""
    return {c: 0.0 for c in PERF_COLUMNS}


# ── Performance Tracking Thresholds ──
PERF_THRESHOLDS = {
    "full_time": {"monthly": 80, "per_period": 40},
    "part_time": {"monthly": 40, "per_period": 20},
    "1099": {"monthly": 20, "per_period": 10},
}

# Rate type names → display column mapping for performance grid
# Must cover ALL possible names (pre-migration, post-migration, and invoice-submitted names)
RATE_TO_PERF_COL = {
    # IIC (all variants)
    "IIC": "iic", "IIC-LC": "iic", "IIC-MA": "iic", "IIC-BA": "iic",
    "IIC LPC/LCSW": "iic", "IIC LAC/LSW": "iic", "Behavioral Assistant": "iic",
    # OP (all variants)
    "OP Session": "op", "OP-LC Session": "op", "OP-MA Session": "op",
    # OP Cancellation (separate column)
    "OP Cancellation": "op_cancel",
    # SBYS
    "SBYS": "sbys",
    # ADOS (all variants)
    "ADOS": "ados",
    "ADOS Assessment (In Home)": "ados", "ADOS Assessment (In Office)": "ados",
    "ADOS Assessment - In Home": "ados", "ADOS Assessment - At Office": "ados",
    "ADOS In Home": "ados", "ADOS At Office": "ados",
    # Time off
    "PTO": "pto", "Sick Leave": "sick",
    # Admin
    "Administration": "admin", "Community Event (Day)": "admin",
    # APN
    "APN Session (30)": "apn", "APN Intake (60)": "apn",
    "APN 30 Min": "apn", "APN Intake": "apn",
    # Supervision
    "Individual Supervision": "sup", "Group Supervision": "sup",
}


def _quarter_for_month(month_str: str):
    """Given 'YYYY-MM', return ('YYYY-Q1', ['YYYY-01','YYYY-02','YYYY-03'])."""
    y, m = int(month_str[:4]), int(month_str[5:7])
    q = (m - 1) // 3 + 1
    start_m = (q - 1) * 3 + 1
    months = [f"{y}-{start_m + i:02d}" for i in range(3)]
    return f"{y}-Q{q}", months


@app.get("/api/analytics/performance")
async def analytics_performance(
    timeframe: str = "monthly",
    period: str = "",
    user=Depends(verify_token),
):
    """Performance tracking: per-service hours, thresholds, status badges, grouped by leader."""
    profile = user
    caller_role = profile.get("role", "therapist")
    caller_id = profile.get("id")

    today = date.today()

    # ── 1. Determine date range + period info ──
    if timeframe == "pay_period" and period:
        # Specific pay period by ID
        pp = await sb_request("GET", "pay_periods", params={"id": f"eq.{period}", "select": "id,start_date,end_date,label"})
        if not pp:
            raise HTTPException(status_code=404, detail="Pay period not found")
        start_date = pp[0]["start_date"]
        end_date = pp[0]["end_date"]
        period_label = pp[0].get("label", f"{start_date} – {end_date}")
    elif timeframe == "quarterly":
        # period = "YYYY-QN"
        if period and "-Q" in period:
            y = int(period[:4])
            q = int(period[-1])
        else:
            y, q = today.year, (today.month - 1) // 3 + 1
        sm = (q - 1) * 3 + 1
        start_date = f"{y}-{sm:02d}-01"
        em = sm + 2
        last_day = calendar.monthrange(y, em)[1]
        end_date = f"{y}-{em:02d}-{last_day}"
        period_label = f"Q{q} {y}"
        period = f"{y}-Q{q}"
    elif timeframe == "yearly":
        y = int(period) if period and period.isdigit() else today.year
        start_date = f"{y}-01-01"
        end_date = f"{y}-12-31"
        period_label = str(y)
        period = str(y)
    else:
        # monthly (default) — default to last complete month with closed periods
        timeframe = "monthly"
        if period and len(period) == 7:
            y, m = int(period[:4]), int(period[5:7])
        else:
            # Find last month with closed pay periods
            closed_pp = await sb_request("GET", "pay_periods", params={
                "select": "start_date", "status": "eq.closed", "order": "start_date.desc", "limit": "1",
            }) or []
            if closed_pp:
                last_closed = closed_pp[0]["start_date"][:7]
                y, m = int(last_closed[:4]), int(last_closed[5:7])
            else:
                y, m = today.year, today.month
            period = f"{y}-{m:02d}"
        start_date = f"{y}-{m:02d}-01"
        last_day = calendar.monthrange(y, m)[1]
        end_date = f"{y}-{m:02d}-{last_day}"
        months_names = ['January','February','March','April','May','June','July','August','September','October','November','December']
        period_label = f"{months_names[m-1]} {y}"

    # ── 2. Build available periods for dropdown ──
    all_periods = await sb_request("GET", "pay_periods", params={
        "select": "id,label,start_date,end_date,status",
        "status": "eq.closed",
        "order": "start_date.desc",
    }) or []

    available_periods = []
    if timeframe == "pay_period":
        for p in all_periods:
            available_periods.append({"value": p["id"], "label": p.get("label", p["start_date"])})
        if not period and available_periods:
            period = available_periods[0]["value"]
            pp = await sb_request("GET", "pay_periods", params={"id": f"eq.{period}", "select": "id,start_date,end_date,label"})
            if pp:
                start_date = pp[0]["start_date"]
                end_date = pp[0]["end_date"]
                period_label = pp[0].get("label", start_date)
    elif timeframe == "monthly":
        seen = set()
        for p in all_periods:
            mk = p["start_date"][:7]
            if mk not in seen:
                seen.add(mk)
                y2, m2 = int(mk[:4]), int(mk[5:7])
                months_names = ['January','February','March','April','May','June','July','August','September','October','November','December']
                available_periods.append({"value": mk, "label": f"{months_names[m2-1]} {y2}"})
    elif timeframe == "quarterly":
        seen = set()
        for p in all_periods:
            y2, m2 = int(p["start_date"][:4]), int(p["start_date"][5:7])
            qk = f"{y2}-Q{(m2-1)//3+1}"
            if qk not in seen:
                seen.add(qk)
                available_periods.append({"value": qk, "label": qk.replace("-", " ")})
    elif timeframe == "yearly":
        seen = set()
        for p in all_periods:
            yk = p["start_date"][:4]
            if yk not in seen:
                seen.add(yk)
                available_periods.append({"value": yk, "label": yk})

    # ── 3. Fetch users (trackable roles only) ──
    trackable_roles = ["therapist", "clinical_leader", "apn", "ba"]
    all_users = await sb_request("GET", "users", params={
        "is_active": "eq.true",
        "select": "id,first_name,last_name,role,employment_status,clinical_supervisor_id",
    }) or []
    # Filter to trackable roles
    all_users = [u for u in all_users if u.get("role") in trackable_roles]

    # Role-based visibility
    if caller_role == "admin":
        visible_users = all_users
    elif caller_role == "clinical_leader":
        visible_users = [u for u in all_users if u["id"] == caller_id or u.get("clinical_supervisor_id") == caller_id]
    else:
        visible_users = [u for u in all_users if u["id"] == caller_id]

    user_map = {u["id"]: u for u in visible_users}

    # ── 4. Find pay periods that overlap the date range ──
    range_periods = await sb_request("GET", "pay_periods", params={
        "select": "id,start_date,end_date",
        "start_date": f"lte.{end_date}",
        "end_date": f"gte.{start_date}",
        "status": "eq.closed",
    }) or []
    period_ids = [p["id"] for p in range_periods]
    num_periods = max(len(period_ids), 1)

    # ── 5. Fetch time_entries for those periods, joined to rate_types ──
    user_service_hours = {uid: _new_service_hours() for uid in user_map}

    if period_ids:
        for pid in period_ids:
            entries = await sb_request("GET", "time_entries", params={
                "pay_period_id": f"eq.{pid}",
                "select": "user_id,quantity,client_initials,rate_types(name)",
            }) or []
            for e in entries:
                uid = e["user_id"]
                if uid not in user_service_hours:
                    continue
                rt = e.get("rate_types") or {}
                rname = rt.get("name", "")
                qty = float(e.get("quantity", 0))
                col = RATE_TO_PERF_COL.get(rname, None)
                # time_entries already store qty in hours (ADOS entries stored as 3.0 per assessment)
                hrs = qty
                if col and col in user_service_hours[uid]:
                    user_service_hours[uid][col] += hrs
                user_service_hours[uid]["total"] += hrs

    # ── 6. Fetch therapist_capacity ──
    caps = await sb_request("GET", "therapist_capacity", params={"select": "user_id,iic_capacity,op_capacity"}) or []
    cap_map = {c["user_id"]: c for c in caps}

    # ── 7. Compute status badges (quarterly accountability) ──
    # For monthly view: determine which quarter this month belongs to
    # Then check each month in the quarter for compliance
    if timeframe == "monthly":
        current_month = period  # "YYYY-MM"
    elif timeframe == "pay_period" and period_ids:
        current_month = start_date[:7]
    else:
        current_month = f"{today.year}-{today.month:02d}"

    _, quarter_months = _quarter_for_month(current_month)

    # Get total hours per user per month in this quarter (from rollup_monthly)
    quarter_compliance = {uid: {} for uid in user_map}  # uid → {month: total_hours}
    for qm in quarter_months:
        rollups = await sb_request("GET", "rollup_monthly", params={
            "month_year": f"eq.{qm}",
            "select": "user_id,total_hours",
        }) or []
        for r in rollups:
            uid = r["user_id"]
            if uid in quarter_compliance:
                quarter_compliance[uid][qm] = float(r.get("total_hours", 0))

    def compute_status(uid, emp_status):
        threshold = PERF_THRESHOLDS.get(emp_status, PERF_THRESHOLDS["full_time"])["monthly"]
        trend = []
        months_below = 0
        for qm in quarter_months:
            hrs = quarter_compliance.get(uid, {}).get(qm, 0)
            met = hrs >= threshold
            trend.append(met)
            if not met and qm <= current_month:
                months_below += 1
        # Current month compliance
        current_hrs = quarter_compliance.get(uid, {}).get(current_month, 0)
        current_met = current_hrs >= threshold
        if current_met:
            status = "on_track"
        elif months_below >= 2:
            status = "action_required"
        else:
            status = "warning"
        return status, trend

    # ── 8. Group by clinical_supervisor_id ──
    # Clinical leaders are always their own group header (never unassigned)
    groups_map = {}  # leader_id → list of therapist dicts
    for uid, u in user_map.items():
        leader_id = u.get("clinical_supervisor_id")
        # Clinical leaders group under themselves (they ARE the leader)
        if u.get("role") == "clinical_leader":
            leader_id = uid
        emp = u.get("employment_status", "full_time")
        hrs = user_service_hours.get(uid, {})
        cap = cap_map.get(uid, {})
        status, trend = compute_status(uid, emp)

        # Direct compliance check from actual time_entries hours
        emp_thresh = PERF_THRESHOLDS.get(emp, PERF_THRESHOLDS["full_time"])
        total_hrs = hrs.get("total", 0)
        if timeframe == "monthly":
            on_track = total_hrs >= emp_thresh["monthly"]
        elif timeframe == "quarterly":
            on_track = total_hrs >= emp_thresh["monthly"] * 3
        elif timeframe == "yearly":
            on_track = total_hrs >= emp_thresh["monthly"] * 12
        else:
            on_track = total_hrs >= emp_thresh["per_period"]
        direct_status = "on_track" if on_track else "off_track"

        iic_cap = int(cap.get("iic_capacity", 0) or 0)
        op_cap = int(cap.get("op_capacity", 0) or 0)
        total_cap = iic_cap + op_cap
        util_pct = None  # Placeholder — caseload not implemented yet

        therapist_row = {
            "user_id": uid,
            "name": f"{u.get('first_name', '')} {u.get('last_name', '')}".strip(),
            "role": u.get("role", ""),
            "is_leader": u.get("role") == "clinical_leader",
            "employment_status": emp,
            "status": direct_status,
            "quarter_trend": trend,
            "iic": round(hrs.get("iic", 0), 1),
            "op": round(hrs.get("op", 0), 1),
            "op_cancel": round(hrs.get("op_cancel", 0), 1),
            "sbys": round(hrs.get("sbys", 0), 1),
            "ados": round(hrs.get("ados", 0), 1),
            "apn": round(hrs.get("apn", 0), 1),
            "sup": round(hrs.get("sup", 0), 1),
            "sick": round(hrs.get("sick", 0), 1),
            "pto": round(hrs.get("pto", 0), 1),
            "admin_hours": round(hrs.get("admin", 0), 1),
            "total_hours": round(total_hrs, 1),
            "avg_per_period": round(total_hrs / num_periods, 1),
            "caseload_iic": None,  # Placeholder
            "caseload_op": None,   # Placeholder
            "iic_capacity": iic_cap,
            "op_capacity": op_cap,
            "utilization_pct": util_pct,
        }

        if leader_id not in groups_map:
            groups_map[leader_id] = []
        groups_map[leader_id].append(therapist_row)

    # Build response groups
    # Fetch leader names
    leader_ids = [lid for lid in groups_map if lid]
    leader_names = {}
    leader_emp = {}
    if leader_ids:
        leaders = await sb_request("GET", "users", params={
            "id": f"in.({','.join(leader_ids)})",
            "select": "id,first_name,last_name,employment_status",
        }) or []
        for l in leaders:
            leader_names[l["id"]] = f"{l.get('first_name', '')} {l.get('last_name', '')}".strip()
            leader_emp[l["id"]] = l.get("employment_status", "full_time")

    groups = []
    for lid, therapists in groups_map.items():
        if lid is None:
            continue
        # Sum team totals
        team = {
            "iic": sum(t["iic"] for t in therapists),
            "op": sum(t["op"] for t in therapists),
            "op_cancel": sum(t["op_cancel"] for t in therapists),
            "sbys": sum(t["sbys"] for t in therapists),
            "ados": sum(t["ados"] for t in therapists),
            "apn": sum(t["apn"] for t in therapists),
            "sup": sum(t["sup"] for t in therapists),
            "sick": sum(t["sick"] for t in therapists),
            "pto": sum(t["pto"] for t in therapists),
            "total_hours": sum(t["total_hours"] for t in therapists),
            "avg_per_period": round(sum(t["total_hours"] for t in therapists) / num_periods, 1),
        }
        # % meeting threshold
        meeting = sum(1 for t in therapists if t["status"] == "on_track")
        pct = round(meeting / max(len(therapists), 1) * 100, 0)

        groups.append({
            "leader_id": lid,
            "leader_name": leader_names.get(lid, "Unknown"),
            "leader_employment_status": leader_emp.get(lid, "full_time"),
            "team_totals": team,
            "pct_meeting_threshold": pct,
            "therapists": sorted(therapists, key=lambda t: (0 if t.get("role") == "clinical_leader" else 1 if t.get("role") == "therapist" else 2 if t.get("role") == "apn" else 3, t["name"])),
        })

    # Add unassigned group at the end
    unassigned = groups_map.get(None, [])
    if unassigned:
        team = {
            "iic": sum(t["iic"] for t in unassigned),
            "op": sum(t["op"] for t in unassigned),
            "op_cancel": sum(t["op_cancel"] for t in unassigned),
            "sbys": sum(t["sbys"] for t in unassigned),
            "ados": sum(t["ados"] for t in unassigned),
            "apn": sum(t["apn"] for t in unassigned),
            "sup": sum(t["sup"] for t in unassigned),
            "sick": sum(t["sick"] for t in unassigned),
            "pto": sum(t["pto"] for t in unassigned),
            "total_hours": sum(t["total_hours"] for t in unassigned),
            "avg_per_period": round(sum(t["total_hours"] for t in unassigned) / num_periods, 1),
        }
        meeting = sum(1 for t in unassigned if t["status"] == "on_track")
        pct = round(meeting / max(len(unassigned), 1) * 100, 0)
        groups.append({
            "leader_id": None,
            "leader_name": "Unassigned",
            "leader_employment_status": None,
            "team_totals": team,
            "pct_meeting_threshold": pct,
            "therapists": sorted(unassigned, key=lambda t: t["name"]),
        })

    # Sort groups: named leaders first (alphabetical), then unassigned
    groups.sort(key=lambda g: (g["leader_id"] is None, g["leader_name"]))

    return {
        "timeframe": timeframe,
        "period": period,
        "period_label": period_label,
        "available_periods": available_periods,
        "thresholds": {k: v["monthly"] for k, v in PERF_THRESHOLDS.items()},
        "groups": groups,
    }


@app.get("/api/analytics/performance/{user_id}")
async def analytics_performance_detail(user_id: str, user=Depends(verify_token)):
    """Performance detail for a single user: month-by-month breakdown."""
    profile = user
    caller_role = profile.get("role", "therapist")
    caller_id = profile.get("id")

    # Visibility check
    if caller_role not in ("admin",):
        if caller_role == "clinical_leader":
            # Can see self + supervisees
            target = await sb_request("GET", "users", params={"id": f"eq.{user_id}", "select": "id,clinical_supervisor_id"})
            if target and target[0].get("clinical_supervisor_id") != caller_id and target[0]["id"] != caller_id:
                raise HTTPException(status_code=403, detail="Not authorized")
        elif caller_id != user_id:
            raise HTTPException(status_code=403, detail="Not authorized")

    # Get user info
    target_user = await sb_request("GET", "users", params={
        "id": f"eq.{user_id}",
        "select": "id,first_name,last_name,role,employment_status",
    })
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    tu = target_user[0]
    emp_status = tu.get("employment_status", "full_time")
    threshold = PERF_THRESHOLDS.get(emp_status, PERF_THRESHOLDS["full_time"])["monthly"]

    # Get all closed pay periods, ordered by start_date
    all_periods = await sb_request("GET", "pay_periods", params={
        "select": "id,start_date,end_date,label,status",
        "status": "eq.closed",
        "order": "start_date.asc",
    }) or []

    # Group pay periods by month
    months_data = OrderedDict()
    for pp in all_periods:
        mk = pp["start_date"][:7]  # YYYY-MM
        if mk not in months_data:
            months_data[mk] = {"period_ids": [], "month_key": mk}
        months_data[mk]["period_ids"].append(pp["id"])

    # For each month, get time_entries for this user
    monthly_rows = []
    months_names = ['January','February','March','April','May','June','July','August','September','October','November','December']

    for mk, minfo in months_data.items():
        hrs = _new_service_hours()
        for pid in minfo["period_ids"]:
            entries = await sb_request("GET", "time_entries", params={
                "pay_period_id": f"eq.{pid}",
                "user_id": f"eq.{user_id}",
                "select": "quantity,rate_types(name)",
            }) or []
            for e in entries:
                rt = e.get("rate_types") or {}
                rname = rt.get("name", "")
                qty = float(e.get("quantity", 0))
                col = RATE_TO_PERF_COL.get(rname, None)
                if col and col in hrs:
                    hrs[col] += qty
                hrs["total"] += qty

        y2, m2 = int(mk[:4]), int(mk[5:7])
        on_track = hrs["total"] >= threshold
        monthly_rows.append({
            "month": mk,
            "label": f"{months_names[m2-1]} {y2}",
            "iic": round(hrs["iic"], 1),
            "op": round(hrs["op"], 1),
            "op_cancel": round(hrs["op_cancel"], 1),
            "sbys": round(hrs["sbys"], 1),
            "ados": round(hrs["ados"], 1),
            "apn": round(hrs["apn"], 1),
            "sup": round(hrs["sup"], 1),
            "sick": round(hrs["sick"], 1),
            "pto": round(hrs["pto"], 1),
            "admin_hours": round(hrs["admin"], 1),
            "total_hours": round(hrs["total"], 1),
            "on_track": on_track,
        })

    # Build quarterly summaries
    quarters = OrderedDict()
    for row in monthly_rows:
        y2, m2 = int(row["month"][:4]), int(row["month"][5:7])
        qk = f"{y2}-Q{(m2-1)//3+1}"
        if qk not in quarters:
            quarters[qk] = {"quarter": qk, "months": [], "total_hours": 0}
        quarters[qk]["months"].append(row)
        quarters[qk]["total_hours"] += row["total_hours"]
    for qk, qdata in quarters.items():
        qdata["total_hours"] = round(qdata["total_hours"], 1)
        qdata["avg_per_month"] = round(qdata["total_hours"] / max(len(qdata["months"]), 1), 1)
        qdata["on_track"] = qdata["avg_per_month"] >= threshold

    return {
        "user": {
            "id": tu["id"],
            "name": f"{tu.get('first_name', '')} {tu.get('last_name', '')}".strip(),
            "role": tu.get("role", ""),
            "employment_status": emp_status,
        },
        "threshold": threshold,
        "months": list(reversed(monthly_rows)),  # Most recent first
        "quarters": list(reversed(list(quarters.values()))),
    }

# ── Static File Serving (Production) ────────────────────────────

# Mount the built frontend in production
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(frontend_dist):
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        file_path = os.path.join(frontend_dist, full_path)
        if os.path.isfile(file_path):
            # Hashed assets (JS/CSS) can be cached forever; index.html must not be cached
            if "/assets/" in full_path:
                return FileResponse(file_path, headers={"Cache-Control": "public, max-age=31536000, immutable"})
            return FileResponse(file_path, headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            })
        # SPA fallback — never cache index.html
        return FileResponse(
            os.path.join(frontend_dist, "index.html"),
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )

