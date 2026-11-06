"""Manager panel: halls and their seat layouts. Managers and admins only, audited."""

import re
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field
from sqlalchemy import delete, exists, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_session
from app.models import Hall, Screening, Seat, Staff, Ticket
from app.staff import audit, require_staff

router = APIRouter(prefix="/admin", tags=["admin"])

SessionDep = Annotated[Session, Depends(get_session)]
ManagerDep = Annotated[Staff, Depends(require_staff("manager", "admin"))]

SEAT_REF = re.compile(r"^([A-Z])([0-9]{1,2})$")
SeatType = Literal["standard", "vip", "wheelchair"]


class LayoutIn(BaseModel):
    rows: int = Field(ge=1, le=26, description="Rows are labelled A, B, C, …")
    seats_per_row: int = Field(ge=1, le=40)
    aisle_after: int | None = Field(
        default=None, ge=1, description="An empty grid column after this seat number"
    )
    vip_rows: list[int] = Field(default=[], description="1-based row numbers")
    wheelchair_seats: list[str] = Field(default=[], examples=[["A1", "A12"]])


class HallIn(LayoutIn):
    name: str = Field(min_length=1, max_length=30)
    hall_type: Literal["2D", "3D", "IMAX"]


class HallUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=30)
    hall_type: Literal["2D", "3D", "IMAX"] | None = None


class SeatUpdate(BaseModel):
    seat_type: SeatType


class AdminHallOut(BaseModel):
    hall_id: int
    name: str
    hall_type: str
    capacity: int
    screenings: int


class AdminSeatOut(BaseModel):
    seat_id: int
    hall_id: int
    row_label: str
    seat_number: int
    seat_type: str
    grid_row: int
    grid_col: int


def _bad(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, detail)


def _layout(hall_id: int, plan: LayoutIn) -> list[Seat]:
    """Seats for a rectangular hall. Raises 400 when the layout doesn't fit."""
    if plan.aisle_after is not None and plan.aisle_after >= plan.seats_per_row:
        raise _bad("aisle_after must be smaller than seats_per_row")
    if any(not 1 <= r <= plan.rows for r in plan.vip_rows):
        raise _bad("A VIP row is outside the hall")
    wheelchair: set[tuple[str, int]] = set()
    for ref in plan.wheelchair_seats:
        m = SEAT_REF.match(ref.strip().upper())
        if not m or ord(m[1]) - ord("A") >= plan.rows or not 1 <= int(m[2]) <= plan.seats_per_row:
            raise _bad(f"Wheelchair seat {ref!r} is not in the hall")
        wheelchair.add((m[1], int(m[2])))

    seats = []
    for r in range(1, plan.rows + 1):
        label = chr(ord("A") + r - 1)
        for n in range(1, plan.seats_per_row + 1):
            aisle = plan.aisle_after is not None and n > plan.aisle_after
            if (label, n) in wheelchair:
                seat_type = "wheelchair"
            elif r in plan.vip_rows:
                seat_type = "vip"
            else:
                seat_type = "standard"
            seats.append(
                Seat(
                    hall_id=hall_id,
                    row_label=label,
                    seat_number=n,
                    seat_type=seat_type,
                    grid_row=r,
                    grid_col=n + 1 if aisle else n,
                )
            )
    return seats


def _hall(db: Session, hall_id: int) -> Hall:
    hall = db.get(Hall, hall_id)
    if hall is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hall not found")
    return hall


def _hall_out(db: Session, hall: Hall) -> AdminHallOut:
    capacity = db.scalar(select(func.count()).select_from(Seat).where(Seat.hall_id == hall.hall_id))
    screenings = db.scalar(
        select(func.count()).select_from(Screening).where(Screening.hall_id == hall.hall_id)
    )
    return AdminHallOut(
        hall_id=hall.hall_id,
        name=hall.name,
        hall_type=hall.hall_type,
        capacity=capacity,
        screenings=screenings,
    )


def _save(db: Session, *, commit: bool = True) -> None:
    """Flush or commit; a duplicate hall name becomes a 409."""
    try:
        db.commit() if commit else db.flush()
    except IntegrityError as exc:
        db.rollback()
        if "hall_name_key" in str(exc.orig):
            raise HTTPException(status.HTTP_409_CONFLICT, "A hall with this name exists") from exc
        raise


def _layout_summary(plan: LayoutIn) -> dict:
    return jsonable_encoder(plan, include=set(LayoutIn.model_fields))


@router.get("/halls", response_model=list[AdminHallOut])
def list_halls(staff: ManagerDep, db: SessionDep) -> list[AdminHallOut]:
    return [_hall_out(db, h) for h in db.scalars(select(Hall).order_by(Hall.name))]


@router.get("/halls/{hall_id}/seats", response_model=list[AdminSeatOut])
def list_hall_seats(hall_id: int, staff: ManagerDep, db: SessionDep) -> list[AdminSeatOut]:
    _hall(db, hall_id)
    seats = db.scalars(
        select(Seat).where(Seat.hall_id == hall_id).order_by(Seat.grid_row, Seat.grid_col)
    )
    return [AdminSeatOut.model_validate(s, from_attributes=True) for s in seats]


@router.post("/halls", response_model=AdminHallOut, status_code=status.HTTP_201_CREATED)
def create_hall(body: HallIn, staff: ManagerDep, db: SessionDep) -> AdminHallOut:
    """A new hall with its seats generated from the layout."""
    hall = Hall(name=body.name.strip(), hall_type=body.hall_type)
    seats = _layout(0, body)  # validate the layout before touching the database
    db.add(hall)
    _save(db, commit=False)
    for seat in seats:
        seat.hall_id = hall.hall_id
    db.add_all(seats)
    audit(db, staff, "create", "hall", hall.hall_id, name=hall.name, **_layout_summary(body))
    db.commit()
    return _hall_out(db, hall)


@router.patch("/halls/{hall_id}", response_model=AdminHallOut)
def update_hall(hall_id: int, body: HallUpdate, staff: ManagerDep, db: SessionDep):
    hall = _hall(db, hall_id)
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    for field, value in changes.items():
        setattr(hall, field, value.strip() if field == "name" else value)
    audit(db, staff, "update", "hall", hall_id, **changes)
    _save(db)
    return _hall_out(db, hall)


@router.put("/halls/{hall_id}/layout", response_model=AdminHallOut)
def replace_layout(hall_id: int, body: LayoutIn, staff: ManagerDep, db: SessionDep):
    """Regenerate all seats. Only while no ticket has ever been sold for this hall's seats."""
    hall = _hall(db, hall_id)
    sold = db.scalar(
        select(exists().where(Ticket.seat_id == Seat.seat_id, Seat.hall_id == hall_id))
    )
    if sold:
        raise HTTPException(status.HTTP_409_CONFLICT, "Tickets exist for this hall's seats")
    seats = _layout(hall_id, body)
    db.execute(delete(Seat).where(Seat.hall_id == hall_id))
    db.add_all(seats)
    audit(db, staff, "replace_layout", "hall", hall_id, **_layout_summary(body))
    db.commit()
    return _hall_out(db, hall)


@router.delete("/halls/{hall_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_hall(hall_id: int, staff: ManagerDep, db: SessionDep) -> None:
    hall = _hall(db, hall_id)
    if db.scalar(select(exists().where(Screening.hall_id == hall_id))):
        raise HTTPException(status.HTTP_409_CONFLICT, "The hall has screenings")
    db.execute(delete(Seat).where(Seat.hall_id == hall_id))
    db.delete(hall)
    audit(db, staff, "delete", "hall", hall_id, name=hall.name)
    db.commit()


@router.patch("/seats/{seat_id}", response_model=AdminSeatOut)
def update_seat(seat_id: int, body: SeatUpdate, staff: ManagerDep, db: SessionDep):
    """Change a seat's type. Prices of tickets already sold stay as they were."""
    seat = db.get(Seat, seat_id)
    if seat is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Seat not found")
    audit(db, staff, "update", "seat", seat_id, seat_type=body.seat_type, was=seat.seat_type)
    seat.seat_type = body.seat_type
    db.commit()
    return AdminSeatOut.model_validate(seat, from_attributes=True)
