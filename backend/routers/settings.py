"""Settings / VTO / Impact-hours / Supervision-compliance endpoints."""
import json
from datetime import datetime

from fastapi import APIRouter, Body, Depends

from backend.deps import sb_request, verify_token, require_admin, logger

router = APIRouter(prefix="/api")


# ── Last Upload ──

@router.get("/settings/last-upload")
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


# ── Therapist Capacity ──

@router.patch("/analytics/therapist-capacity/{user_id}")
async def update_therapist_capacity(user_id: str, req: dict = Body(...), admin=Depends(require_admin)):
    """Admin: set or update capacity targets for a therapist."""
    existing = await sb_request("GET", "therapist_capacity", params={
        "user_id": f"eq.{user_id}", "select": "id",
    })
    data = {
        "user_id": user_id,
        "iic_capacity": int(req.get("iic_capacity", 0) or 0),
        "op_capacity": int(req.get("op_capacity", 0) or 0),
        "updated_at": datetime.utcnow().isoformat(),
    }
    if existing:
        await sb_request("PATCH", f"therapist_capacity?user_id=eq.{user_id}", data=data)
    else:
        await sb_request("POST", "therapist_capacity", data=data)
    return {"status": "updated"}


# ── VTO (Vision/Traction Organizer) ──

@router.get("/vto")
async def get_vto(user=Depends(verify_token)):
    """Get VTO data stored in app_settings."""
    rows = await sb_request("GET", "app_settings", params={
        "key": "eq.vto_data",
        "select": "value",
    })
    if rows and rows[0].get("value"):
        try:
            return json.loads(rows[0]["value"])
        except Exception:
            return rows[0]["value"]
    # Return default VTO structure
    return {
        "org_name": "BestLife Counseling Services",
        "vision": {
            "core_values": [
                "Teamwork makes the dream work",
                "Support providers in any stage of their career",
                "Remove barriers and ensure continuity of care",
                "Identify an issue, propose a solution",
            ],
            "core_focus": {"passion": "Change the Game", "niche": "Empowering providers every step of the way"},
            "ten_year_target": "Impact 10,000 lives",
            "marketing_strategy": {
                "target_market": [
                    "Create a relationship with community agencies and supports that will give us referrals",
                    "Direct to consumer via social media",
                ],
                "three_uniques": [
                    "Technology forward solutions",
                    "Quick and accurate communication",
                    "Well connected in the community",
                ],
                "proven_process": "The BestLife Difference",
            },
            "three_year_picture": {
                "future_date": "December 31, 2027",
                "revenue": "$1.2 million",
                "profit": "$120,000",
                "measurables": "10% net margin",
                "what_does_it_look_like": [
                    "Best culture ever",
                    "Expanded benefits (401K, Holiday Pay)",
                    "Expanded benefits (Clinical Leaders)",
                    "Group therapy initiatives",
                    "10 full time clinicians",
                    "Cumberland County office",
                    "BestLife virtual hub",
                    "Fractional admin (marketing, finance, HR)",
                    "Expand APN services (2 new providers)",
                    "Med management",
                    "Intern/BA \u2192 Supervisor program",
                    "Better BestLife office",
                ],
            },
        },
        "traction": {
            "one_year_plan": {
                "future_date": "12/31/26",
                "revenue": "$1,029,000",
                "profit": "$26,600",
                "measurables": "2.59% net margin",
                "goals": [
                    "Run therapy groups",
                    "BestLife Virtual Hub",
                    "45% room utilization rate",
                    "Clinical Leader flow dialed in",
                    "Intake process streamlined",
                    "Website upgrade",
                    "RCM on a cadence",
                ],
            },
            "rocks": [
                {"title": "Initial group research complete", "who": "Adge"},
                {"title": "Intake process testing", "who": "Dave"},
                {"title": "Portal upgrades", "who": "Tim"},
            ],
            "issues": [],
        },
    }


@router.patch("/vto")
async def update_vto(req: dict = Body(...), admin=Depends(require_admin)):
    """Admin: Update VTO data in app_settings."""
    value_str = json.dumps(req)
    existing = await sb_request("GET", "app_settings", params={
        "key": "eq.vto_data", "select": "key",
    })
    if existing:
        await sb_request("PATCH", "app_settings?key=eq.vto_data", data={"value": value_str})
    else:
        await sb_request("POST", "app_settings", data={"key": "vto_data", "value": value_str})
    return {"status": "updated"}


# ── Impact Hours ──

@router.get("/impact-hours")
async def get_impact_hours(user=Depends(verify_token)):
    """Get total hours of impact (baseline + all time_entries)."""
    rows = await sb_request("GET", "app_settings", params={
        "key": "eq.impact_hours_baseline",
        "select": "value",
    })
    baseline = 0
    if rows and rows[0].get("value"):
        try:
            baseline = float(rows[0]["value"])
        except Exception as e:
            logger.debug(f"Impact hours baseline parse failed: {e}")

    all_entries = await sb_request("GET", "time_entries", params={
        "select": "quantity",
    }) or []
    total_from_entries = sum(float(e.get("quantity", 0)) for e in all_entries)

    return {"baseline": baseline, "from_entries": round(total_from_entries, 1), "total": round(baseline + total_from_entries, 1)}


@router.patch("/impact-hours")
async def update_impact_hours_baseline(req: dict = Body(...), admin=Depends(require_admin)):
    """Admin: Set the baseline impact hours."""
    baseline = float(req.get("baseline", 0))
    existing = await sb_request("GET", "app_settings", params={
        "key": "eq.impact_hours_baseline", "select": "key",
    })
    if existing:
        await sb_request("PATCH", "app_settings?key=eq.impact_hours_baseline", data={"value": str(baseline)})
    else:
        await sb_request("POST", "app_settings", data={"key": "impact_hours_baseline", "value": str(baseline)})
    return {"status": "updated", "baseline": baseline}


# ── Supervision Compliance ──

@router.get("/analytics/supervision-compliance")
async def analytics_supervision(user=Depends(verify_token)):
    """Analytics: Supervision compliance for clinical leaders."""
    profile = user
    role = profile.get("role")

    params = {
        "supervision_required": "eq.true",
        "select": "id, first_name, last_name, clinical_supervisor_id",
    }

    if role == "clinical_leader":
        params["clinical_supervisor_id"] = f"eq.{profile['id']}"
    elif role != "admin":
        params["id"] = f"eq.{profile['id']}"

    supervisees = await sb_request("GET", "users", params=params)

    result = []
    for s in (supervisees or []):
        sup_name = "\u2014"
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
