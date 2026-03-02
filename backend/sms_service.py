"""SMS service using Twilio — extracted for shared use across routers.

Set SMS_ENABLED=true in Railway once Twilio approval comes through.
Until then, all SMS calls are silently skipped.
"""
import logging
import os

logger = logging.getLogger("bestlife")

# Master toggle — set to "true" in Railway when Twilio is approved
SMS_ENABLED = os.environ.get("SMS_ENABLED", "false").lower() == "true"

# Twilio config
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_MESSAGING_SERVICE_SID = os.environ.get("TWILIO_MESSAGING_SERVICE_SID", "")

_twilio_client = None


def init_twilio():
    """Initialize Twilio client. Call once at app startup."""
    global _twilio_client
    if not SMS_ENABLED:
        logger.info("SMS disabled (SMS_ENABLED != true) — Twilio not initialized")
        return
    if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
        try:
            from twilio.rest import Client
            _twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
            logger.info("Twilio client initialized — SMS enabled")
        except ImportError:
            logger.warning("twilio package not installed — SMS disabled")
        except Exception as e:
            logger.warning(f"Twilio init failed: {e}")
    else:
        logger.info("Twilio credentials not configured — SMS disabled")


def send_sms(to_number: str, body: str):
    """Send SMS via Twilio Messaging Service. Returns SID on success, None on failure.

    Silently skipped when SMS_ENABLED is false.
    """
    if not SMS_ENABLED:
        logger.debug(f"SMS skipped (disabled): {to_number}")
        return None
    if not _twilio_client or not TWILIO_MESSAGING_SERVICE_SID:
        logger.info(f"SMS skipped (no Twilio client): {to_number}")
        return None
    try:
        msg = _twilio_client.messages.create(
            messaging_service_sid=TWILIO_MESSAGING_SERVICE_SID,
            to=to_number,
            body=body,
        )
        logger.info(f"SMS sent to {to_number}: {msg.sid}")
        return msg.sid
    except Exception as e:
        logger.error(f"SMS send failed: {e}")
        return None
