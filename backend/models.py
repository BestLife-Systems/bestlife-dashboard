"""
Pydantic request models for BestLife Hub API.
"""
from typing import Optional, List
from pydantic import BaseModel


# ── Auth / User Management ──
class InviteUserRequest(BaseModel):
    email: str
    first_name: str
    last_name: str
    role: str
    employment_status: Optional[str] = "full_time"
    phone_number: Optional[str] = None
    sms_enabled: bool = True
    supervision_required: bool = False
    clinical_supervisor_id: Optional[str] = None


# ── AI ──
class AIChatRequest(BaseModel):
    prompt: str
    context: Optional[str] = None
    system_hint: Optional[str] = None
    max_tokens: int = 1024


# ── Tasks ──
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


# ── Meetings ──
class MeetingTemplateRequest(BaseModel):
    title: str
    cadence: str = "weekly"
    schedule_rule: Optional[dict] = {}
    audience_roles: Optional[List[str]] = []
    meeting_time: Optional[str] = None
    active: bool = True


class MeetingInstanceRequest(BaseModel):
    title: str
    meeting_date: str
    template_id: Optional[str] = None


# ── Announcements ──
class AnnouncementRequest(BaseModel):
    title: str
    body: Optional[str] = None
    category: str = "general"
    audience_roles: Optional[List[str]] = []
    effective_date: str
    expiration_date: Optional[str] = None


# ── Payroll ──
class RateTypeRequest(BaseModel):
    name: str
    unit: str = "hourly"
    default_duration_minutes: Optional[int] = None
    default_bill_rate: Optional[float] = None


class UserPayRatesRequest(BaseModel):
    rates: List[dict]


class PayPeriodCreateRequest(BaseModel):
    period_type: str  # 'first_half' or 'second_half'


class GenerateYearRequest(BaseModel):
    year: int


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


class ApproveRequest(BaseModel):
    overrides: Optional[dict] = None


class RejectRequest(BaseModel):
    reason: str


class ZeroHoursRequest(BaseModel):
    reason: str


class AdminNoteRequest(BaseModel):
    note: str


class UpdateLineItemsRequest(BaseModel):
    invoice_data: dict


# ── Public Invoice ──
class DraftSaveRequest(BaseModel):
    invoice_data: dict


class SubmitRequest(BaseModel):
    submit_token: str
    invoice_data: dict
