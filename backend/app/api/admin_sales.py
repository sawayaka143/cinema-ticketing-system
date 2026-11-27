"""Admin dashboard: ticket sales over a period (total, per day, per movie) and an Excel export.

Managers and admins only. A sale is a paid booking, counted on the day its payment succeeded
(Almaty time). Refunded bookings are cancelled, so they drop out. Revenue is the sum of the
ticket prices, as in the occupancy report. Read-only, so nothing is audited.
"""

import io
import zipfile
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Annotated
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from app.api.catalog import ALMATY
from app.db import get_session
from app.models import Booking, Movie, Payment, Screening, Staff, Ticket
from app.staff import require_staff

router = APIRouter(prefix="/admin", tags=["admin"])

SessionDep = Annotated[Session, Depends(get_session)]
ManagerDep = Annotated[Staff, Depends(require_staff("manager", "admin"))]

MAX_DAYS = 366
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

FromQuery = Annotated[
    date | None,
    Query(alias="from", description="First day (Almaty time). Default: 29 days before `to`."),
]
ToQuery = Annotated[
    date | None, Query(alias="to", description="Last day, included. Default: today.")
]


class SalesTotals(BaseModel):
    bookings: int
    tickets: int
    revenue: Decimal


class SalesDay(SalesTotals):
    day: date


class SalesMovie(SalesTotals):
    movie_id: int
    title: str


class SalesReport(BaseModel):
    date_from: date
    date_to: date
    total: SalesTotals
    by_day: list[SalesDay]
    by_movie: list[SalesMovie]


def _period(date_from: date | None, date_to: date | None) -> tuple[date, date]:
    """The period asked for, with defaults; 400 when it's backwards or longer than a year."""
    last = date_to or datetime.now(ALMATY).date()
    first = date_from or last - timedelta(days=29)
    if first > last:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "`from` is after `to`")
    if (last - first).days + 1 > MAX_DAYS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"The period is longer than {MAX_DAYS} days"
        )
    return first, last


def _sales(db: Session, first: date, last: date) -> SalesReport:
    start = datetime.combine(first, time.min, ALMATY).astimezone(UTC)
    end = datetime.combine(last + timedelta(days=1), time.min, ALMATY).astimezone(UTC)
    day = func.date(func.timezone(str(ALMATY), Payment.paid_at)).label("day")
    rows = db.execute(
        select(
            day,
            Movie.movie_id,
            Movie.title,
            func.count(distinct(Booking.booking_id)),
            func.count(Ticket.ticket_id),
            func.coalesce(func.sum(Ticket.price), 0),
        )
        .select_from(Booking)
        .join(Payment, (Payment.booking_id == Booking.booking_id) & (Payment.status == "success"))
        .join(Ticket, Ticket.booking_id == Booking.booking_id)
        .join(Screening, Screening.screening_id == Ticket.screening_id)
        .join(Movie, Movie.movie_id == Screening.movie_id)
        .where(Booking.status == "paid", Payment.paid_at >= start, Payment.paid_at < end)
        .group_by(day, Movie.movie_id, Movie.title)
    ).all()

    days = {first + timedelta(days=i): [0, 0, Decimal(0)] for i in range((last - first).days + 1)}
    movies: dict[int, list] = {}
    for d, movie_id, title, bookings, tickets, revenue in rows:
        on_day = days.setdefault(d, [0, 0, Decimal(0)])
        on_day[0] += bookings
        on_day[1] += tickets
        on_day[2] += revenue
        of_movie = movies.setdefault(movie_id, [title, 0, 0, Decimal(0)])
        of_movie[1] += bookings
        of_movie[2] += tickets
        of_movie[3] += revenue

    by_day = [
        SalesDay(day=d, bookings=b, tickets=t, revenue=r) for d, (b, t, r) in sorted(days.items())
    ]
    by_movie = sorted(
        (
            SalesMovie(movie_id=mid, title=title, bookings=b, tickets=t, revenue=r)
            for mid, (title, b, t, r) in movies.items()
        ),
        key=lambda m: (-m.revenue, m.title),
    )
    total = SalesTotals(
        bookings=sum(d.bookings for d in by_day),
        tickets=sum(d.tickets for d in by_day),
        revenue=sum((d.revenue for d in by_day), Decimal(0)),
    )
    return SalesReport(date_from=first, date_to=last, total=total, by_day=by_day, by_movie=by_movie)


@router.get("/sales", response_model=SalesReport)
def sales_report(
    staff: ManagerDep, db: SessionDep, date_from: FromQuery = None, date_to: ToQuery = None
) -> SalesReport:
    """Paid bookings, tickets and revenue in the period: in total, per day and per movie."""
    return _sales(db, *_period(date_from, date_to))


@router.get(
    "/sales/export",
    response_class=Response,
    responses={200: {"content": {XLSX: {}}, "description": "An Excel workbook (.xlsx)"}},
)
def export_sales(
    staff: ManagerDep, db: SessionDep, date_from: FromQuery = None, date_to: ToQuery = None
) -> Response:
    """The period's sales as an Excel file: one row per day and a total. Not split by movie."""
    report = _sales(db, *_period(date_from, date_to))
    name = f"sales_{report.date_from}_{report.date_to}.xlsx"
    return Response(
        content=_workbook(report),
        media_type=XLSX,
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


# --- a minimal .xlsx writer (a zip of a few XML files), so no extra dependency is needed ------

XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_TYPES = "http://schemas.openxmlformats.org/package/2006/content-types"
NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
NS_DOC_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
CT_RELS = "application/vnd.openxmlformats-package.relationships+xml"
CT_SHEET = "application/vnd.openxmlformats-officedocument.spreadsheetml"

# Cell styles: 0 plain, 1 bold, 2 date, 3 money, 4 bold money.
STYLES = (
    f'{XML}<styleSheet xmlns="{NS_MAIN}">'
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd.mm.yyyy"/></numFmts>'
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>'
    '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
    '<fills count="2"><fill><patternFill patternType="none"/></fill>'
    '<fill><patternFill patternType="gray125"/></fill></fills>'
    '<borders count="1"><border/></borders>'
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    '<cellXfs count="5">'
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    '<xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" '
    'applyFont="1"/></cellXfs>'
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    "</styleSheet>"
)

PACKAGE = {
    "[Content_Types].xml": (
        f'{XML}<Types xmlns="{NS_TYPES}">'
        f'<Default Extension="rels" ContentType="{CT_RELS}"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        f'<Override PartName="/xl/workbook.xml" ContentType="{CT_SHEET}.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" '
        f'ContentType="{CT_SHEET}.worksheet+xml"/>'
        f'<Override PartName="/xl/styles.xml" ContentType="{CT_SHEET}.styles+xml"/>'
        "</Types>"
    ),
    "_rels/.rels": (
        f'{XML}<Relationships xmlns="{NS_PKG_REL}">'
        f'<Relationship Id="rId1" Type="{NS_DOC_REL}/officeDocument" Target="xl/workbook.xml"/>'
        "</Relationships>"
    ),
    "xl/workbook.xml": (
        f'{XML}<workbook xmlns="{NS_MAIN}" xmlns:r="{NS_DOC_REL}">'
        '<sheets><sheet name="Sales" sheetId="1" r:id="rId1"/></sheets></workbook>'
    ),
    "xl/_rels/workbook.xml.rels": (
        f'{XML}<Relationships xmlns="{NS_PKG_REL}">'
        f'<Relationship Id="rId1" Type="{NS_DOC_REL}/worksheet" Target="worksheets/sheet1.xml"/>'
        f'<Relationship Id="rId2" Type="{NS_DOC_REL}/styles" Target="styles.xml"/>'
        "</Relationships>"
    ),
    "xl/styles.xml": STYLES,
}


def _cell(ref: str, value: object, style: int = 0) -> str:
    s = f' s="{style}"' if style else ""
    if isinstance(value, str):
        return f'<c r="{ref}" t="inlineStr"{s}><is><t>{escape(value)}</t></is></c>'
    return f'<c r="{ref}"{s}><v>{value}</v></c>'


def _excel_day(d: date) -> int:
    return (d - date(1899, 12, 30)).days  # Excel stores dates as days since 1899-12-30


def _workbook(report: SalesReport) -> bytes:
    """One sheet: title, period, then Date / Bookings / Tickets / Revenue per day, and a total."""
    rows: list[list[tuple[object, int]]] = [
        [("Ticket sales", 1)],
        [(f"{report.date_from:%d.%m.%Y} – {report.date_to:%d.%m.%Y}", 0)],
        [],
        [("Date", 1), ("Bookings", 1), ("Tickets", 1), ("Revenue, ₸", 1)],
    ]
    for d in report.by_day:
        rows.append([(_excel_day(d.day), 2), (d.bookings, 0), (d.tickets, 0), (d.revenue, 3)])
    t = report.total
    rows.append([("Total", 1), (t.bookings, 1), (t.tickets, 1), (t.revenue, 4)])

    sheet_rows = []
    for i, row in enumerate(rows, start=1):
        cells = "".join(_cell(f"{'ABCD'[j]}{i}", v, s) for j, (v, s) in enumerate(row))
        sheet_rows.append(f'<row r="{i}">{cells}</row>')
    sheet = (
        f'{XML}<worksheet xmlns="{NS_MAIN}">'
        '<cols><col min="1" max="1" width="14" customWidth="1"/>'
        '<col min="2" max="3" width="11" customWidth="1"/>'
        '<col min="4" max="4" width="16" customWidth="1"/></cols>'
        f"<sheetData>{''.join(sheet_rows)}</sheetData></worksheet>"
    )

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for path, content in {**PACKAGE, "xl/worksheets/sheet1.xml": sheet}.items():
            zf.writestr(path, content)
    return buffer.getvalue()
