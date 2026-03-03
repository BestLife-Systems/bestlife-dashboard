"""Generate a printable PDF summary of a submitted invoice."""
from datetime import datetime
from io import BytesIO
from typing import Optional

from fpdf import FPDF


class InvoicePDF(FPDF):
    """Custom PDF with BestLife branding."""

    def header(self):
        self.set_font("Helvetica", "B", 18)
        self.set_text_color(0, 130, 180)
        self.cell(0, 10, "BestLife Counseling Services", align="C", new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "", 12)
        self.set_text_color(80, 80, 80)
        self.cell(0, 7, "Invoice Summary", align="C", new_x="LMARGIN", new_y="NEXT")
        self.line(self.l_margin, self.get_y() + 2, self.w - self.r_margin, self.get_y() + 2)
        self.ln(6)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 7)
        self.set_text_color(140, 140, 140)
        self.cell(0, 10, f"Generated {datetime.utcnow().strftime('%m/%d/%Y %I:%M %p')} UTC  -  BestLife Hub", align="C")

    # ── Table helpers ──
    def section_heading(self, title: str):
        self.set_font("Helvetica", "B", 11)
        self.set_fill_color(235, 245, 250)
        self.set_text_color(0, 100, 140)
        self.cell(0, 8, f"  {title}", fill=True, new_x="LMARGIN", new_y="NEXT")
        self.ln(1)

    def table_header(self, cols: list[tuple[str, int]]):
        """cols = [(label, width), ...]"""
        self.set_font("Helvetica", "B", 8)
        self.set_text_color(80, 80, 80)
        self.set_fill_color(245, 245, 245)
        for label, w in cols:
            self.cell(w, 6, label, border="B", fill=True)
        self.ln()

    def table_row(self, cols: list[tuple[str, int]], bold: bool = False):
        self.set_font("Helvetica", "B" if bold else "", 8)
        self.set_text_color(40, 40, 40)
        for val, w in cols:
            self.cell(w, 5.5, str(val))
        self.ln()


def generate_invoice_pdf(
    invoice_data: dict,
    user_name: str,
    period_label: str,
    submitted_at: Optional[str] = None,
) -> bytes:
    """Build a clean, printable PDF from invoice_data and return raw bytes."""
    pdf = InvoicePDF(orientation="P", unit="mm", format="Letter")
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # ── Meta info ──
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(40, 40, 40)
    pdf.cell(0, 6, f"Provider:  {user_name}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"Pay Period:  {period_label}", new_x="LMARGIN", new_y="NEXT")
    if submitted_at:
        try:
            dt = datetime.fromisoformat(submitted_at.replace("Z", "+00:00"))
            fmt = dt.strftime("%m/%d/%Y %I:%M %p")
        except Exception:
            fmt = submitted_at
        pdf.cell(0, 6, f"Submitted:  {fmt}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    d = invoice_data or {}
    w_full = pdf.w - pdf.l_margin - pdf.r_margin  # usable width

    # ── IIC ──
    iic = d.get("iic", {})
    iic_labels = {
        "IICLC-H0036TJU1": "IIC - LPC/LCSW",
        "IICMA-H0036TJU2": "IIC - LAC/LSW",
        "BA-H2014TJ": "IIC - Behavioral Assistant",
    }
    for code, entries in iic.items():
        if not entries:
            continue
        label = iic_labels.get(code, code)
        total = sum(float(e.get("hours", 0) or 0) for e in entries)
        pdf.section_heading(f"{label}  ({total} hrs)")
        c1, c2, c3 = 60, 50, 30
        pdf.table_header([("Cyber # / Initials", c1), ("Date", c2), ("Hours", c3)])
        for e in entries:
            pdf.table_row([
                (e.get("cyber_initials", ""), c1),
                (_fmt_date(e.get("date", "")), c2),
                (str(e.get("hours", "")), c3),
            ])
        pdf.ln(3)

    # ── OP ──
    op_sessions = (d.get("op") or {}).get("sessions", [])
    if op_sessions:
        regular = [s for s in op_sessions if not s.get("cancel_fee")]
        cancels = [s for s in op_sessions if s.get("cancel_fee")]
        pdf.section_heading(f"OP Sessions  ({len(regular)} sessions, {len(cancels)} cancellations)")
        c1, c2, c3 = 50, 50, 40
        pdf.table_header([("Client Initials", c1), ("Date", c2), ("Cancel Fee", c3)])
        for s in op_sessions:
            pdf.table_row([
                (s.get("client_initials", ""), c1),
                (_fmt_date(s.get("date", "")), c2),
                ("Yes" if s.get("cancel_fee") else "", c3),
            ])
        pdf.ln(3)

    # ── SBYS ──
    sbys = [e for e in d.get("sbys", []) if e.get("date") or (e.get("hours") and float(e.get("hours", 0) or 0) > 0)]
    if sbys:
        total = sum(float(e.get("hours", 0) or 0) for e in sbys)
        pdf.section_heading(f"School Based Youth Services  ({total} hrs)")
        c1, c2 = 70, 40
        pdf.table_header([("Date", c1), ("Hours", c2)])
        for e in sbys:
            pdf.table_row([(_fmt_date(e.get("date", "")), c1), (str(e.get("hours", "")), c2)])
        pdf.ln(3)

    # ── ADOS ──
    ados_entries = [e for e in d.get("ados", []) if e.get("client_initials", "").strip() or e.get("date")]
    if ados_entries:
        total_assessments = len(ados_entries)
        total_hours = total_assessments * 3
        pdf.section_heading(f"ADOS Assessments  ({total_assessments} assessments, {total_hours} hrs)")
        c1, c2, c3, c4 = 40, 40, 30, 40
        pdf.table_header([("Client", c1), ("Location", c2), ("ID #", c3), ("Date", c4)])
        for e in ados_entries:
            pdf.table_row([
                (e.get("client_initials", ""), c1),
                (e.get("location", ""), c2),
                (e.get("id_number", ""), c3),
                (_fmt_date(e.get("date", "")), c4),
            ])
        pdf.ln(3)

    # ── Admin ──
    admin = [e for e in d.get("admin", []) if e.get("date") or (e.get("hours") and float(e.get("hours", 0) or 0) > 0)]
    if admin:
        total = sum(float(e.get("hours", 0) or 0) for e in admin)
        pdf.section_heading(f"Administration  ({total} hrs)")
        c1, c2 = 70, 40
        pdf.table_header([("Date", c1), ("Hours", c2)])
        for e in admin:
            pdf.table_row([(_fmt_date(e.get("date", "")), c1), (str(e.get("hours", "")), c2)])
        pdf.ln(3)

    # ── Supervision ──
    sup = d.get("supervision", {})
    indiv = sup.get("individual", [])
    group = [g for g in sup.get("group", []) if g.get("date") or (g.get("supervisee_ids") and len(g.get("supervisee_ids", [])) > 0)]
    if indiv or group:
        total = len(indiv) + len(group)
        pdf.section_heading(f"Clinical Supervision  ({total} hrs)")
        if indiv:
            pdf.set_font("Helvetica", "B", 8)
            pdf.set_text_color(80, 80, 80)
            pdf.cell(0, 5.5, "Individual Sessions", new_x="LMARGIN", new_y="NEXT")
            c1, c2 = 60, 80
            pdf.table_header([("Date", c1), ("Supervisee", c2)])
            for e in indiv:
                pdf.table_row([(_fmt_date(e.get("date", "")), c1), (e.get("supervisee_name", ""), c2)])
            pdf.ln(2)
        if group:
            pdf.set_font("Helvetica", "B", 8)
            pdf.set_text_color(80, 80, 80)
            pdf.cell(0, 5.5, "Group Sessions", new_x="LMARGIN", new_y="NEXT")
            c1, c2 = 60, 80
            pdf.table_header([("Date", c1), ("Attendees", c2)])
            for e in group:
                names = ", ".join(e.get("supervisee_names", []))
                pdf.table_row([(_fmt_date(e.get("date", "")), c1), (names[:60], c2)])
            pdf.ln(2)
        pdf.ln(1)

    # ── Sick Leave ──
    sick = d.get("sick_leave", {})
    sick_hours = float(sick.get("hours", 0) or 0)
    if sick_hours > 0:
        pdf.section_heading(f"Sick Leave  ({sick_hours} hrs)")
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(40, 40, 40)
        pdf.cell(0, 5.5, f"Date: {_fmt_date(sick.get('date', ''))}    Hours: {sick.get('hours', '')}", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

    # ── PTO ──
    pto = d.get("pto", {})
    pto_hours = float(pto.get("hours", 0) or 0)
    if pto_hours > 0:
        pdf.section_heading(f"Paid Time Off  ({pto_hours} hrs)")
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(40, 40, 40)
        pdf.cell(0, 5.5, f"Hours requested: {pto.get('hours', '')}", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

    # ── Notes ──
    notes = d.get("notes", "").strip()
    if notes:
        pdf.section_heading("Notes")
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(60, 60, 60)
        pdf.multi_cell(0, 4.5, notes)
        pdf.ln(3)

    # ── Grand Total ──
    pdf.ln(2)
    pdf.set_draw_color(0, 130, 180)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(2)

    iic_total = sum(float(e.get("hours", 0) or 0) for entries in iic.values() for e in entries)
    op_count = len(op_sessions)
    sbys_total = sum(float(e.get("hours", 0) or 0) for e in sbys)
    ados_hrs = len(ados_entries) * 3
    admin_total = sum(float(e.get("hours", 0) or 0) for e in admin)
    sup_total = len(indiv) + len(group)
    grand = iic_total + sbys_total + ados_hrs + admin_total + sup_total + sick_hours + pto_hours

    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(0, 100, 140)
    pdf.cell(0, 7, "Summary", new_x="LMARGIN", new_y="NEXT")

    rows = []
    if iic_total > 0:
        rows.append(("IIC Sessions", f"{iic_total} hrs"))
    if op_count > 0:
        rows.append(("OP Sessions", f"{op_count}"))
    if sbys_total > 0:
        rows.append(("SBYS", f"{sbys_total} hrs"))
    if len(ados_entries) > 0:
        rows.append(("ADOS", f"{len(ados_entries)} ({ados_hrs} hrs)"))
    if admin_total > 0:
        rows.append(("Administration", f"{admin_total} hrs"))
    if sup_total > 0:
        rows.append(("Supervision", f"{sup_total} hrs"))
    if sick_hours > 0:
        rows.append(("Sick Leave", f"{sick_hours} hrs"))
    if pto_hours > 0:
        rows.append(("PTO", f"{pto_hours} hrs"))

    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(60, 60, 60)
    for label, val in rows:
        pdf.cell(80, 5.5, label)
        pdf.cell(40, 5.5, val)
        pdf.ln()

    pdf.ln(1)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(0, 130, 180)
    pdf.cell(80, 7, "Total Hours")
    pdf.cell(40, 7, str(grand))
    pdf.ln()

    # Return bytes
    buf = BytesIO()
    pdf.output(buf)
    return buf.getvalue()


def _fmt_date(d: str) -> str:
    """Format YYYY-MM-DD → MM/DD/YYYY, pass through anything else."""
    if not d:
        return ""
    try:
        return datetime.strptime(d, "%Y-%m-%d").strftime("%m/%d/%Y")
    except Exception:
        return d
