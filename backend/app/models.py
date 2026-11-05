"""ORM models. Import every model here so Alembic sees it.

The tables come from docs/schema-decisions.md. The migrations in migrations/versions/ are the
source of truth for constraints; these models mirror them for queries.
"""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Customer(Base):
    __tablename__ = "customer"

    customer_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    auth_user_id: Mapped[UUID] = mapped_column(unique=True)
    full_name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(100), unique=True)
    phone: Mapped[str | None] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Staff(Base):
    __tablename__ = "staff"

    staff_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    auth_user_id: Mapped[UUID] = mapped_column(unique=True)
    full_name: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Genre(Base):
    __tablename__ = "genre"

    genre_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(30), unique=True)


class MovieGenre(Base):
    __tablename__ = "movie_genre"

    movie_id: Mapped[int] = mapped_column(
        ForeignKey("movie.movie_id", ondelete="CASCADE"), primary_key=True
    )
    genre_id: Mapped[int] = mapped_column(ForeignKey("genre.genre_id"), primary_key=True)


class Movie(Base):
    __tablename__ = "movie"

    movie_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    title: Mapped[str] = mapped_column(String(150))
    description: Mapped[str | None] = mapped_column(Text)
    poster_url: Mapped[str | None] = mapped_column(Text)
    duration_min: Mapped[int] = mapped_column(Integer)
    min_age: Mapped[int] = mapped_column(Integer)
    release_year: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    genres: Mapped[list[Genre]] = relationship(secondary="movie_genre", order_by=Genre.name)


class Hall(Base):
    __tablename__ = "hall"

    hall_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(30), unique=True)
    hall_type: Mapped[str] = mapped_column(String(10))


class Seat(Base):
    __tablename__ = "seat"

    seat_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    hall_id: Mapped[int] = mapped_column(ForeignKey("hall.hall_id"))
    row_label: Mapped[str] = mapped_column(String(2))
    seat_number: Mapped[int] = mapped_column(Integer)
    seat_type: Mapped[str] = mapped_column(Text, server_default="standard")
    grid_row: Mapped[int] = mapped_column(Integer)
    grid_col: Mapped[int] = mapped_column(Integer)


class Screening(Base):
    __tablename__ = "screening"

    screening_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    movie_id: Mapped[int] = mapped_column(ForeignKey("movie.movie_id"))
    hall_id: Mapped[int] = mapped_column(ForeignKey("hall.hall_id"))
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    base_price: Mapped[Decimal] = mapped_column(Numeric(8, 2))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    movie: Mapped[Movie] = relationship()
    hall: Mapped[Hall] = relationship()


class TicketType(Base):
    __tablename__ = "ticket_type"

    ticket_type_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(30), unique=True)
    discount_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), server_default="0")
    max_age: Mapped[int | None] = mapped_column(Integer)
    staff_only: Mapped[bool] = mapped_column(Boolean, server_default="false")


class Booking(Base):
    __tablename__ = "booking"

    booking_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customer.customer_id"))
    sold_by_staff_id: Mapped[int | None] = mapped_column(ForeignKey("staff.staff_id"))
    booking_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    status: Mapped[str] = mapped_column(Text, server_default="pending")
    hold_expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now() + interval '10 minutes'")
    )

    tickets: Mapped[list["Ticket"]] = relationship(back_populates="booking")


class Ticket(Base):
    __tablename__ = "ticket"

    ticket_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    booking_id: Mapped[int] = mapped_column(ForeignKey("booking.booking_id", ondelete="CASCADE"))
    screening_id: Mapped[int] = mapped_column(ForeignKey("screening.screening_id"))
    seat_id: Mapped[int] = mapped_column(ForeignKey("seat.seat_id"))
    ticket_type_id: Mapped[int] = mapped_column(ForeignKey("ticket_type.ticket_type_id"))
    price: Mapped[Decimal] = mapped_column(Numeric(8, 2))

    booking: Mapped[Booking] = relationship(back_populates="tickets")


class Payment(Base):
    __tablename__ = "payment"

    payment_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    booking_id: Mapped[int] = mapped_column(ForeignKey("booking.booking_id"))
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    method: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text)
    provider_ref: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditLog(Base):
    __tablename__ = "audit_log"

    audit_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    staff_id: Mapped[int] = mapped_column(ForeignKey("staff.staff_id"))
    action: Mapped[str] = mapped_column(Text)
    table_name: Mapped[str] = mapped_column(Text)
    row_id: Mapped[int | None] = mapped_column(BigInteger)
    details: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


__all__ = [
    "AuditLog",
    "Base",
    "Booking",
    "Customer",
    "Genre",
    "Hall",
    "Movie",
    "MovieGenre",
    "Payment",
    "Screening",
    "Seat",
    "Staff",
    "Ticket",
    "TicketType",
]
