"""Email service using SendGrid API via httpx."""
import base64
import logging
import os

import httpx

logger = logging.getLogger("bestlife")

SENDGRID_API_KEY = os.environ.get("SENDGRID_API_KEY", "")
FROM_EMAIL = os.environ.get("FROM_EMAIL", "frontdesk@bestlifenj.com")
FROM_NAME = os.environ.get("FROM_NAME", "BestLife Behavioral Health")

SENDGRID_API_URL = "https://api.sendgrid.com/v3/mail/send"


async def send_invoice_email(
    to_email: str,
    user_name: str,
    period_label: str,
    pdf_bytes: bytes,
    is_update: bool = False,
) -> bool:
    """Send an invoice confirmation email with the PDF attached.

    Returns True on success, False on failure. Never raises.
    """
    if not SENDGRID_API_KEY:
        logger.info("Email skipped — no SENDGRID_API_KEY configured")
        return False

    if not to_email:
        logger.info("Email skipped — no recipient email address")
        return False

    action = "Updated" if is_update else "Submitted"
    subject = f"Your BestLife Invoice {action} - {period_label}"

    html_body = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; padding-bottom: 16px; border-bottom: 2px solid #0082b4;">
            <h2 style="color: #0082b4; margin: 0;">BestLife Behavioral Health</h2>
        </div>
        <div style="padding: 24px 0;">
            <p style="font-size: 16px; color: #333;">Hi {user_name},</p>
            <p style="font-size: 15px; color: #444; line-height: 1.6;">
                Your invoice for <strong>{period_label}</strong> has been {action.lower()} successfully.
                A PDF summary is attached for your records.
            </p>
            <p style="font-size: 14px; color: #666; line-height: 1.5;">
                You can make changes within 24 hours of submission by revisiting the original invoice link.
                After 24 hours, please contact your admin for any corrections.
            </p>
        </div>
        <div style="text-align: center; padding: 16px; background: #f0f9ff; border-radius: 8px; margin-top: 8px;">
            <p style="font-size: 13px; color: #888; margin: 0;">
                This is an automated message from BestLife Hub.
            </p>
        </div>
    </div>
    """

    filename = f"Invoice-{period_label.replace(' ', '-')}.pdf" if period_label else "Invoice.pdf"

    # SendGrid v3 mail/send format
    payload = {
        "personalizations": [
            {"to": [{"email": to_email}]}
        ],
        "from": {"email": FROM_EMAIL, "name": FROM_NAME},
        "subject": subject,
        "content": [{"type": "text/html", "value": html_body}],
        "attachments": [
            {
                "content": base64.b64encode(pdf_bytes).decode("utf-8"),
                "filename": filename,
                "type": "application/pdf",
                "disposition": "attachment",
            }
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                SENDGRID_API_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {SENDGRID_API_KEY}",
                    "Content-Type": "application/json",
                },
            )
        # SendGrid returns 202 Accepted on success
        if resp.status_code == 202:
            logger.info(f"Invoice email sent to {to_email} ({subject})")
            return True
        else:
            logger.error(f"SendGrid API error {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        logger.error(f"Email send failed: {e}")
        return False
