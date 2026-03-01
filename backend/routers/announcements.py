"""Announcements CRUD — 4 endpoints."""
from fastapi import APIRouter, Depends

from backend.deps import sb_request, require_admin
from backend.models import AnnouncementRequest

router = APIRouter(prefix="/api")


@router.get("/announcements")
async def get_announcements(admin=Depends(require_admin)):
    """Admin: list all announcements (including expired)."""
    results = await sb_request("GET", "announcements", params={
        "select": "*",
        "order": "effective_date.desc",
    })
    return results or []


@router.post("/announcements")
async def create_announcement(req: AnnouncementRequest, admin=Depends(require_admin)):
    """Admin: create an announcement."""
    data = req.dict()
    data["created_by_user_id"] = admin["id"]
    result = await sb_request("POST", "announcements", data=data)
    return result


@router.patch("/announcements/{announcement_id}")
async def update_announcement(announcement_id: str, req: AnnouncementRequest, admin=Depends(require_admin)):
    """Admin: update an announcement."""
    data = req.dict()
    result = await sb_request("PATCH", f"announcements?id=eq.{announcement_id}", data=data)
    return result


@router.delete("/announcements/{announcement_id}")
async def delete_announcement(announcement_id: str, admin=Depends(require_admin)):
    """Admin: delete an announcement."""
    await sb_request("DELETE", f"announcements?id=eq.{announcement_id}")
    return {"status": "deleted", "id": announcement_id}
