"""Email service using SendGrid API via httpx."""
import base64
import logging
import os
from typing import List, Optional

import httpx

logger = logging.getLogger("bestlife")

SENDGRID_API_URL = "https://api.sendgrid.com/v3/mail/send"


def _get_sendgrid_key():
    return os.environ.get("SENDGRID_API_KEY", "")


def _get_from_email():
    return os.environ.get("FROM_EMAIL", "frontdesk@bestlifenj.com")


def _get_from_name():
    return os.environ.get("FROM_NAME", "BestLife Counseling Services")


def _get_email_whitelist() -> Optional[set]:
    """Return a set of whitelisted email addresses, or None if unrestricted.

    Set EMAIL_WHITELIST env var to a comma-separated list of emails to restrict
    all outbound emails to only those addresses (useful during testing).
    Example: EMAIL_WHITELIST=adrienne@bestlifenj.com,dave@bestlifenj.com
    """
    raw = os.environ.get("EMAIL_WHITELIST", "").strip()
    if not raw:
        return None
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


# ── Shared SendGrid sender ───────────────────────────────────────


async def _send_via_sendgrid(
    to_email: str,
    subject: str,
    html_body: str,
    attachments: Optional[List[dict]] = None,
) -> tuple[bool, str]:
    """Low-level SendGrid v3 mail/send. Returns (True, '') on 202, (False, reason) otherwise."""

    # ── Master kill switch — emails are OFF unless explicitly enabled ──
    # Set EMAILS_ENABLED=true in Railway when you're ready to go live.
    # Until then, ZERO emails leave the system.
    if os.environ.get("EMAILS_ENABLED", "false").lower() != "true":
        logger.info(f"Email blocked — EMAILS_ENABLED is not 'true' (to: {to_email}, subject: {subject})")
        return False, "EMAILS_ENABLED is not true — all outbound email is disabled"

    api_key = _get_sendgrid_key()
    if not api_key:
        logger.info("Email skipped - no SENDGRID_API_KEY configured")
        return False, "SENDGRID_API_KEY not configured"
    if not to_email:
        logger.info("Email skipped - no recipient email address")
        return False, "No recipient email address"

    # Whitelist gate — optional additional filter during rollout
    whitelist = _get_email_whitelist()
    if whitelist and to_email.strip().lower() not in whitelist:
        logger.info(f"Email blocked by whitelist - {to_email} not in EMAIL_WHITELIST")
        return False, f"Recipient {to_email} not in EMAIL_WHITELIST"

    payload: dict = {
        "personalizations": [{"to": [{"email": to_email}]}],
        "from": {"email": _get_from_email(), "name": _get_from_name()},
        "subject": subject,
        "content": [{"type": "text/html", "value": html_body}],
    }
    if attachments:
        payload["attachments"] = attachments

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                SENDGRID_API_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
            )
        if resp.status_code == 202:
            logger.info(f"Email sent to {to_email} ({subject})")
            return True, ""
        else:
            reason = f"SendGrid {resp.status_code}: {resp.text}"
            logger.error(f"SendGrid API error {resp.status_code}: {resp.text}")
            return False, reason
    except Exception as e:
        logger.error(f"Email send failed: {e}")
        return False, str(e)


# ── HTML wrapper ──────────────────────────────────────────────────


def _wrap_html(body_content: str) -> str:
    """Wrap email body in a consistent BestLife branded template (light mode enforced)."""
    return f"""<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<style>
  :root {{ color-scheme: light only; }}
  body, .email-wrapper {{ background-color: #ffffff !important; }}
</style>
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; color: #333333;">
    <div class="email-wrapper" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
        <div style="text-align: center; padding-bottom: 16px; border-bottom: 2px solid #0082b4;">
            <h2 style="color: #0082b4; margin: 0;">BestLife Counseling Services</h2>
        </div>
        <div style="padding: 24px 0;">
            {body_content}
        </div>
        <div style="text-align: center; padding: 16px; background: #f0f9ff; border-radius: 8px; margin-top: 8px;">
            <p style="font-size: 13px; color: #888; margin: 0;">
                This is an automated message from BestLife Hub.
            </p>
        </div>
    </div>
</body>
</html>"""


# ── Invoice confirmation (existing) ──────────────────────────────


async def send_invoice_email(
    to_email: str,
    user_name: str,
    period_label: str,
    pdf_bytes: bytes,
    is_update: bool = False,
) -> bool:
    """Send an invoice confirmation email with the PDF attached."""
    action = "Updated" if is_update else "Submitted"
    subject = f"Your BestLife Invoice {action} - {period_label}"

    body = f"""
        <p style="font-size: 16px; color: #333;">Hi {user_name},</p>
        <p style="font-size: 15px; color: #444; line-height: 1.6;">
            Your invoice for <strong>{period_label}</strong> has been {action.lower()} successfully.
            A PDF summary is attached for your records.
        </p>
        <p style="font-size: 14px; color: #666; line-height: 1.5;">
            You can make changes within 24 hours of submission by revisiting the original invoice link.
            After 24 hours, please contact your admin for any corrections.
        </p>
    """

    filename = f"Invoice-{period_label.replace(' ', '-')}.pdf" if period_label else "Invoice.pdf"

    ok, _ = await _send_via_sendgrid(
        to_email=to_email,
        subject=subject,
        html_body=_wrap_html(body),
        attachments=[{
            "content": base64.b64encode(pdf_bytes).decode("utf-8"),
            "filename": filename,
            "type": "application/pdf",
            "disposition": "attachment",
        }],
    )
    return ok


# ── Reminder emails (new) ────────────────────────────────────────

_REMINDER_SUBJECTS = {
    "open": "Your BestLife Invoice for {period} Is Now Open",
    "remind_3": "Reminder: BestLife Invoice Due in 3 Days - {period}",
    "remind_1": "Due Tomorrow: BestLife Invoice - {period}",
    "due_today": "Last Chance: BestLife Invoice Due Today - {period}",
}

_REMINDER_BODIES = {
    "open": """
        <p style="font-size: 16px; color: #333;">Hi {name},</p>
        <p style="font-size: 15px; color: #444; line-height: 1.6;">
            Your invoice for <strong>{period}</strong> is now open and ready for submission.
        </p>
        <p style="font-size: 15px; color: #444; line-height: 1.6;">
            Please submit by <strong>{deadline}</strong>.
        </p>
        <div style="text-align: center; margin: 24px 0;">
            <a href="{url}" style="display: inline-block; padding: 12px 32px; background: #0082b4; color: #fff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">
                Open Your Invoice
            </a>
        </div>
    """,
    "remind_3": """
        <p style="font-size: 16px; color: #333;">Hi {name},</p>
        <p style="font-size: 15px; color: #444; line-height: 1.6;">
            Friendly reminder - your invoice for <strong>{period}</strong> is due in <strong>3 days</strong>
            (by {deadline}).
        </p>
        <div style="text-align: center; margin: 24px 0;">
            <a href="{url}" style="display: inline-block; padding: 12px 32px; background: #0082b4; color: #fff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">
                Submit Invoice
            </a>
        </div>
    """,
    "remind_1": """
        <p style="font-size: 16px; color: #333;">Hi {name},</p>
        <p style="font-size: 15px; color: #444; line-height: 1.6;">
            Your invoice for <strong>{period}</strong> is due <strong>tomorrow</strong> ({deadline}).
            Please submit as soon as possible.
        </p>
        <div style="text-align: center; margin: 24px 0;">
            <a href="{url}" style="display: inline-block; padding: 12px 32px; background: #e67e22; color: #fff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">
                Submit Now
            </a>
        </div>
    """,
    "due_today": """
        <p style="font-size: 16px; color: #333;">Hi {name},</p>
        <p style="font-size: 15px; color: #444; line-height: 1.6;">
            <strong>Last chance</strong> - your invoice for <strong>{period}</strong> is due <strong>today</strong>.
        </p>
        <div style="text-align: center; margin: 24px 0;">
            <a href="{url}" style="display: inline-block; padding: 12px 32px; background: #e74c3c; color: #fff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">
                Submit Now
            </a>
        </div>
    """,
}


async def send_reminder_email(
    to_email: str,
    user_name: str,
    period_label: str,
    deadline: str,
    invoice_url: str,
    reminder_type: str = "open",
) -> bool:
    """Send a reminder email to a provider about their invoice.

    reminder_type: 'open', 'remind_3', 'remind_1', 'due_today'
    """
    subject_tpl = _REMINDER_SUBJECTS.get(reminder_type, _REMINDER_SUBJECTS["open"])
    body_tpl = _REMINDER_BODIES.get(reminder_type, _REMINDER_BODIES["open"])

    subject = subject_tpl.format(period=period_label)
    body = body_tpl.format(
        name=user_name or "there",
        period=period_label,
        deadline=deadline,
        url=invoice_url,
    )

    ok, _ = await _send_via_sendgrid(
        to_email=to_email,
        subject=subject,
        html_body=_wrap_html(body),
    )
    return ok


# ── Welcome / login email ────────────────────────────────────────


async def send_welcome_email(
    to_email: str,
    user_name: str,
    login_url: str,
) -> tuple[bool, str]:
    """Send a welcome email with a link to set their password and log in.
    Returns (success, error_reason)."""
    subject = "Welcome to BestLife Hub — Set Up Your Account"

    body = f"""
        <p style="font-size: 16px; color: #333;">Hi {user_name},</p>
        <p style="font-size: 15px; color: #444; line-height: 1.6;">
            Your BestLife Hub account has been created. Click the button below to
            set your password and log in for the first time.
        </p>
        <div style="text-align: center; margin: 24px 0;">
            <a href="{login_url}" style="display: inline-block; padding: 12px 32px; background: #0082b4; color: #fff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">
                Set Your Password
            </a>
        </div>
        <p style="font-size: 14px; color: #666; line-height: 1.5;">
            This link will expire in 24 hours. If it expires, ask your admin to
            resend the login email.
        </p>
    """

    return await _send_via_sendgrid(
        to_email=to_email,
        subject=subject,
        html_body=_wrap_html(body),
    )


# ── Admin summary email ──────────────────────────────────────────


async def send_admin_summary_email(
    to_email: str,
    admin_name: str,
    period_label: str,
    non_submitters: List[str],
) -> bool:
    """Send admin a list of providers who haven't submitted."""
    count = len(non_submitters)
    names_html = "".join(f"<li style='padding: 4px 0; color: #444;'>{n}</li>" for n in non_submitters)

    subject = f"Invoice Deadline Passed: {count} Outstanding - {period_label}"
    body = f"""
        <p style="font-size: 16px; color: #333;">Hi {admin_name},</p>
        <p style="font-size: 15px; color: #444; line-height: 1.6;">
            The submission deadline for <strong>{period_label}</strong> has passed.
            <strong>{count} provider{"s" if count != 1 else ""}</strong> still
            {"have" if count != 1 else "has"}n't submitted:
        </p>
        <ul style="background: #fff5f5; border: 1px solid #fed7d7; border-radius: 8px; padding: 12px 12px 12px 32px; margin: 16px 0;">
            {names_html}
        </ul>
        <p style="font-size: 14px; color: #666; line-height: 1.5;">
            You can follow up with these providers directly or send individual reminders
            from the Pay Periods page in your dashboard.
        </p>
    """

    ok, _ = await _send_via_sendgrid(
        to_email=to_email,
        subject=subject,
        html_body=_wrap_html(body),
    )
    return ok
