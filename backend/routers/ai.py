"""AI / Betty chat — 3 endpoints + build_betty_context()."""
import os

from fastapi import APIRouter, Depends, HTTPException

import backend.deps as deps
from backend.deps import sb_request, verify_token, require_admin, logger
from backend.models import AIChatRequest

router = APIRouter(prefix="/api")


BETTY_SYSTEM_PROMPT = """You are Betty, the AI assistant built into the BestLife Hub — the internal operations \
platform for BestLife Counseling Services, an ABA therapy practice in Cape May Court House, NJ. \
You are an expert on every feature of the Hub. Be concise, friendly, and professional.

## HUB NAVIGATION & FEATURES
**Home Page**: Dashboard with greeting, Total Hours of Impact counter, weather widget, \
Wins feed (staff share business/personal wins), My Tasks (next 7 days, checkable), \
Upcoming Meetings, and Announcements (categorized: general, policy, celebration, outing). \
Admins can add/edit/remove wins, meetings, and announcements.

**VTO (Vision/Traction Organizer)**: EOS tool with two columns — Vision (Core Values, \
Core Focus, 10-Year Target, Marketing Strategy, 3-Year Picture) and Traction (1-Year Plan, \
Rocks with assigned owners). Admins can edit all fields.

**Knowledge Base**: Internal wiki for policies, procedures, clinical guides. AI-assisted \
article creation available.

**Analytics** (Admin):
- Billing Summary: Revenue & pay breakdown per pay period, per-service-type detail, margin analysis. Shows 'Paid to Staff' breakdown by service type.
- Performance Tracking: Per-therapist hours by service type (IIC, OP, SBYS, ADOS, Sick, PTO). Thresholds: Full-time = 80hrs/mo, Part-time = 40hrs/mo, 1099 = 20hrs/mo. Grouped by clinical leader teams. Avg/Pd shown in green (on track) or red (off track). Click a name to see month-over-month and quarter-over-quarter history.
- Supervision Compliance: Track clinical supervision hours.
- Therapist Capacity: Caseload utilization tracking (coming soon).
- Scorecard: EOS scorecard (coming soon).

**Payroll** (Admin):
- Pay Periods: Create/manage bi-weekly pay periods, open/close them.
- Approval Queue: Review submitted therapist invoices before finalizing.
- Export Batches: Export payroll data.
- Rate Catalog: Manage rate types (IIC-LC, IIC-MA, IIC-BA, OP-LC, OP-MA, SBYS, ADOS Assessment In Home/At Office, Administration, PTO, Sick Leave, etc.).

**Users** (Admin): Manage all staff — roles (admin, clinical_leader, therapist, ba, apn, front_desk), employment status (full_time, part_time, 1099), pay rates, clinical leader assignments.

**Therapist Invoice Flow**: Therapists submit bi-weekly invoices with IIC sessions (coded IICLC/IICMA/BA), OP sessions, SBYS hours, ADOS assessments (each = 3 work hours), admin hours, supervision, sick leave, and PTO. Invoices go to approval queue, admin approves, time entries created, pay period closed.

**Ask Betty** (this feature): Available on every page via the bottom bar. Staff can ask questions about any Hub feature, policies, workflows, or get help.

## CLINICAL CONTEXT
BestLife provides ABA (Applied Behavior Analysis) therapy. Service types:
- IIC (Intensive In-Community): In-home therapy sessions (LC = licensed clinician, MA = master's level, BA = bachelor's level)
- OP (Outpatient): Office-based therapy sessions
- SBYS (Step by Your Side): Community-based support
- ADOS: Autism Diagnostic Observation Schedule assessments (each = 3 hours of work)
- APN: Advanced Practice Nurse sessions

## ROLES
- Admin: Full access to all features
- Clinical Leader: Sees own team's performance, supervisees
- Therapist: Sees own performance, submits invoices
- Behavioral Assistant (BA): Same access as Therapist — sees own performance, submits invoices
- APN: Similar to therapist
- Front Desk: Home, VTO, Knowledge Base only

## USING LIVE DATA
You have access to live Hub data provided in a separate section below. When a user asks about \
counts, names, staff members, pay periods, or other current data — answer directly using the \
live data rather than redirecting them to a page. Be specific with numbers and names. \
If the live data section is not present or says "unavailable", let the user know you can't \
access live data right now and suggest they check the relevant page.

Always answer based on the Hub's actual features. If something doesn't exist yet, say so. \
If you're unsure about a specific BestLife policy, recommend they check the Knowledge Base \
or ask their clinical leader/admin."""


async def build_betty_context(user_profile: dict) -> str:
    """Build a live data snapshot for Betty based on the requesting user's role."""
    role = user_profile.get("role", "therapist")
    sections = []

    try:
        all_users = await sb_request("GET", "users", params={
            "is_active": "eq.true",
            "select": "id,first_name,last_name,role",
        }) or []

        role_counts = {}
        role_names = {}
        for u in all_users:
            r = u.get("role", "unknown")
            role_counts[r] = role_counts.get(r, 0) + 1
            if r not in role_names:
                role_names[r] = []
            role_names[r].append(f"{u.get('first_name', '')} {u.get('last_name', '')}".strip())

        role_label_map = {
            "admin": "Admin", "clinical_leader": "Clinical Leader",
            "therapist": "Therapist", "ba": "Behavioral Assistant",
            "apn": "APN", "front_desk": "Front Desk",
            "medical_biller": "Medical Biller", "intern": "Intern",
        }

        counts_text = ", ".join(
            f"{count} {role_label_map.get(r, r)}{'s' if count != 1 else ''}"
            for r, count in sorted(role_counts.items())
        )
        sections.append(f"Active staff: {len(all_users)} total — {counts_text}")

        if role in ("admin", "clinical_leader"):
            for r, names in sorted(role_names.items()):
                label = role_label_map.get(r, r)
                sections.append(f"{label}s: {', '.join(sorted(names))}")

        try:
            open_periods = await sb_request("GET", "pay_periods", params={
                "status": "eq.open",
                "select": "label,start_date,end_date,due_date",
            }) or []
            if open_periods:
                for p in open_periods:
                    sections.append(f"Open pay period: {p['label']} ({p['start_date']} to {p['end_date']}), due {p.get('due_date', 'N/A')}")
            else:
                sections.append("No pay periods currently open.")
        except Exception as e:
            logger.debug(f"Betty context: pay periods fetch failed: {e}")

        try:
            announcements = await sb_request("GET", "announcements", params={"select": "id"}) or []
            sections.append(f"Current announcements: {len(announcements)}")
        except Exception as e:
            logger.debug(f"Betty context: announcements fetch failed: {e}")

        try:
            kb_articles = await sb_request("GET", "kb_articles", params={
                "status": "eq.published",
                "select": "id,category",
            }) or []
            if kb_articles:
                cat_counts = {}
                for a in kb_articles:
                    cat = a.get("category", "uncategorized")
                    cat_counts[cat] = cat_counts.get(cat, 0) + 1
                kb_summary = ", ".join(f"{c}: {n}" for c, n in sorted(cat_counts.items()))
                sections.append(f"Knowledge Base articles: {len(kb_articles)} published ({kb_summary})")
        except Exception as e:
            logger.debug(f"Betty context: KB articles fetch failed: {e}")

    except Exception as e:
        logger.warning(f"Failed to build Betty context: {e}")
        sections.append("(Live data unavailable)")

    return "\n".join(sections)


@router.get("/ai/status")
async def ai_status(admin=Depends(require_admin)):
    """Check if AI is configured (admin only)."""
    return {
        "configured": bool(deps.ANTHROPIC_API_KEY),
        "key_prefix": deps.ANTHROPIC_API_KEY[:12] + "..." if deps.ANTHROPIC_API_KEY else None,
        "key_length": len(deps.ANTHROPIC_API_KEY) if deps.ANTHROPIC_API_KEY else 0,
        "source": "supabase" if not os.environ.get("ANTHROPIC_API_KEY") else "env",
    }


@router.post("/ai/chat")
async def ai_chat(req: AIChatRequest, user=Depends(verify_token)):
    """Send a prompt to Claude (Sonnet) and return the response."""
    if not deps.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="AI is not configured. Add ANTHROPIC_API_KEY to environment or Supabase app_settings.")

    import anthropic

    system_message = req.system_hint or BETTY_SYSTEM_PROMPT

    try:
        betty_data = await build_betty_context(user)
        if betty_data:
            system_message += f"\n\n## LIVE HUB DATA (current as of this request)\n{betty_data}"
    except Exception as e:
        logger.warning(f"Betty context build failed: {e}")

    if req.context:
        system_message += f"\n\nAdditional context: {req.context}"

    try:
        client = anthropic.Anthropic(api_key=deps.ANTHROPIC_API_KEY)
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=req.max_tokens,
            system=system_message,
            messages=[{"role": "user", "content": req.prompt}],
        )
        text = ""
        for block in message.content:
            if hasattr(block, "text"):
                text += block.text
        return {"response": text, "model": message.model, "usage": {"input_tokens": message.usage.input_tokens, "output_tokens": message.usage.output_tokens}}
    except anthropic.APIError as e:
        logger.error(f"Claude API error: {e}")
        raise HTTPException(status_code=502, detail=f"AI service error: {str(e)}")
    except Exception as e:
        logger.error(f"AI chat error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get AI response")


@router.post("/ai/kb-assist")
async def ai_kb_assist(req: AIChatRequest, user=Depends(verify_token)):
    """AI-assisted content generation for Knowledge Base articles."""
    if not deps.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="AI is not configured. Add ANTHROPIC_API_KEY to environment or Supabase app_settings.")

    import anthropic

    system_message = (
        "You are a content writer for BestLife Counseling Services' internal knowledge base. "
        "Write clear, professional articles for therapists and staff. "
        "Use markdown formatting. Be thorough but concise. "
        "Structure content with headers, bullet points, and numbered lists where appropriate."
    )

    if req.context:
        system_message += f"\n\nArticle context — Category: {req.context}"

    try:
        client = anthropic.Anthropic(api_key=deps.ANTHROPIC_API_KEY)
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=req.max_tokens or 2048,
            system=system_message,
            messages=[{"role": "user", "content": req.prompt}],
        )
        text = ""
        for block in message.content:
            if hasattr(block, "text"):
                text += block.text
        return {"response": text, "model": message.model}
    except anthropic.APIError as e:
        logger.error(f"Claude API error: {e}")
        raise HTTPException(status_code=502, detail=f"AI service error: {str(e)}")
    except Exception as e:
        logger.error(f"AI KB assist error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate content")
