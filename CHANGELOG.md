# Changelog

## 2026-03-13 — Invoice notification incident & fixes

### What happened
Invoice notifications for the **Mar 01–15 pay period** were scheduled for 9:00 AM ET but failed to send. Required three rounds of re-sends to fully resolve.

### Root causes & fixes

**`EMAIL_WHITELIST=none` silently blocked all emails**
- `_get_email_whitelist()` parsed `"none"` as a whitelist containing the literal string `"none"` — no recipients matched, all emails silently skipped
- `_auto_open_period()` marked the period `"open"` even though zero emails sent
- Fix: deleted `EMAIL_WHITELIST` env var from Railway

**`APP_URL` missing `https://` protocol**
- Links in emails rendered without a protocol — email clients didn't recognize them as clickable URLs
- Fix: changed `APP_URL` to `https://bestlife-dashboard-production-bf81.up.railway.app`

**`due_date` set to period end date instead of submission deadline**
- Emails said "submit by March 15" instead of "submit by March 19"
- All existing periods had wrong `due_date` values
- Fix: `UPDATE pay_periods SET due_date = end_date + INTERVAL '4 days' WHERE due_date = end_date;`

**Railway env var changes require redeploy**
- Deleting an env var doesn't affect the running process — `os.environ` is only set at startup

### Outstanding issues
- [ ] `_get_email_whitelist()` should treat `"none"` / `"null"` / `"false"` as no whitelist
- [ ] `_auto_open_period()` should not mark period `"open"` if zero notifications sent
- [ ] `_run_daily_logic()` ignores per-period `window_open`/`deadline` DB overrides — always recalculates from global cadence
- [ ] "Open & Send" button in Pay Periods UI sends SMS only, not emails
- [ ] No way to resend open notifications for an already-opened period
- [ ] SMS via Twilio failed — needs investigation
