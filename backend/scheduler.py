"""Pay period scheduling logic — federal holidays, date math, cadence.

All date calculations use Eastern Time since BestLife is in NJ.
"""
import calendar
from datetime import date, datetime, timedelta
from typing import Dict, List, Set
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")


# ── Federal Holidays ──────────────────────────────────────────────


def federal_holidays(year: int) -> Set[date]:
    """Calculate US federal holiday observed dates for a given year.

    Observed: Saturday holidays → Friday, Sunday holidays → Monday.
    """
    holidays: Set[date] = set()

    def observed(d: date) -> date:
        if d.weekday() == 5:  # Saturday → Friday
            return d - timedelta(days=1)
        if d.weekday() == 6:  # Sunday → Monday
            return d + timedelta(days=1)
        return d

    def nth_weekday(yr: int, month: int, weekday: int, n: int) -> date:
        """Find the nth occurrence of a weekday in a month (1-indexed)."""
        first = date(yr, month, 1)
        days_ahead = (weekday - first.weekday()) % 7
        return first + timedelta(days=days_ahead) + timedelta(weeks=n - 1)

    def last_weekday_of(yr: int, month: int, weekday: int) -> date:
        """Find the last occurrence of a weekday in a month."""
        last = date(yr, month, calendar.monthrange(yr, month)[1])
        days_back = (last.weekday() - weekday) % 7
        return last - timedelta(days=days_back)

    # Fixed-date holidays (observed)
    holidays.add(observed(date(year, 1, 1)))    # New Year's Day
    holidays.add(observed(date(year, 6, 19)))   # Juneteenth
    holidays.add(observed(date(year, 7, 4)))    # Independence Day
    holidays.add(observed(date(year, 11, 11)))  # Veterans Day
    holidays.add(observed(date(year, 12, 25)))  # Christmas Day

    # Floating holidays
    holidays.add(nth_weekday(year, 1, 0, 3))    # MLK Day: 3rd Monday of Jan
    holidays.add(nth_weekday(year, 2, 0, 3))    # Presidents' Day: 3rd Monday of Feb
    holidays.add(last_weekday_of(year, 5, 0))   # Memorial Day: last Monday of May
    holidays.add(nth_weekday(year, 9, 0, 1))    # Labor Day: 1st Monday of Sep
    holidays.add(nth_weekday(year, 10, 0, 2))   # Columbus Day: 2nd Monday of Oct
    holidays.add(nth_weekday(year, 11, 3, 4))   # Thanksgiving: 4th Thursday of Nov

    return holidays


def is_business_day(d: date) -> bool:
    """Check if a date is a business day (not weekend, not federal holiday)."""
    if d.weekday() >= 5:
        return False
    return d not in federal_holidays(d.year)


def prev_business_day(d: date) -> date:
    """Walk back to the most recent business day (may return same day)."""
    while not is_business_day(d):
        d -= timedelta(days=1)
    return d


# ── Date Helpers ──────────────────────────────────────────────────


def last_day_of_month(year: int, month: int) -> date:
    """Get the last calendar day of a month."""
    return date(year, month, calendar.monthrange(year, month)[1])


def today_et() -> date:
    """Current date in Eastern Time."""
    return datetime.now(ET).date()


# ── Pay Period Calculation ────────────────────────────────────────


def calculate_period_info(start: date, end: date) -> Dict:
    """Derive all key dates for a pay period.

    Returns:
        start_date:  period start
        end_date:    period end
        window_open: 3 days before end (inclusive) — providers can start submitting
        deadline:    end + 4 days — submission deadline (7-day window)
        pay_date:    nominal pay date (15th or last day of next half-month)
        effective_pay_date: adjusted for weekends/holidays
    """
    # Determine nominal pay date
    # Second-half period (16th–end) → paid on 15th of next month
    # First-half period (1st–15th) → paid on last day of same month
    if start.day == 16:
        # Second half → next month's 15th
        if end.month == 12:
            pay = date(end.year + 1, 1, 15)
        else:
            pay = date(end.year, end.month + 1, 15)
    else:
        # First half → last day of same month
        pay = last_day_of_month(end.year, end.month)

    return {
        "start_date": start,
        "end_date": end,
        "window_open": end - timedelta(days=2),
        "deadline": end + timedelta(days=4),
        "pay_date": pay,
        "effective_pay_date": prev_business_day(pay),
    }


def upcoming_periods(from_date: date, days_ahead: int = 45) -> List[Dict]:
    """Generate all pay periods that should exist from from_date looking ahead.

    Returns a list of dicts, each with:
        period_type, start_date, end_date, due_date (=deadline), label,
        window_open, deadline
    """
    periods = []
    target = from_date + timedelta(days=days_ahead)

    # Walk month by month
    d = date(from_date.year, from_date.month, 1)
    while d <= target:
        yr, mo = d.year, d.month
        eom = last_day_of_month(yr, mo)

        for ptype, start, end in [
            ("first_half", date(yr, mo, 1), date(yr, mo, 15)),
            ("second_half", date(yr, mo, 16), eom),
        ]:
            info = calculate_period_info(start, end)
            # Only include periods whose window_open is in the future or recent past
            if info["deadline"] >= from_date:
                label = f"{start.strftime('%b %d')} - {end.strftime('%b %d, %Y')}"
                periods.append({
                    "period_type": ptype,
                    "start_date": start,
                    "end_date": end,
                    "due_date": info["deadline"],  # submission deadline
                    "label": label,
                    "window_open": info["window_open"],
                    "deadline": info["deadline"],
                })

        # Next month
        if mo == 12:
            d = date(yr + 1, 1, 1)
        else:
            d = date(yr, mo + 1, 1)

    return periods


def get_reminder_actions(today: date, window_open: date, deadline: date) -> List[str]:
    """Determine what actions should fire today for a given period.

    Returns list of action strings:
        'open'           window opens today — create recipients, send initial notification
        'remind_3'       3 days before deadline — text reminder
        'remind_1'       1 day before deadline — email + text
        'due_today'      deadline day — final text
        'admin_summary'  day after deadline — email admin with non-submitter list
    """
    actions = []

    if today == window_open:
        actions.append("open")
    if today == deadline - timedelta(days=3):
        actions.append("remind_3")
    if today == deadline - timedelta(days=1):
        actions.append("remind_1")
    if today == deadline:
        actions.append("due_today")
    if today == deadline + timedelta(days=1):
        actions.append("admin_summary")

    return actions
