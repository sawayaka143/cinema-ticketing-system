"""users and catalog tables

Creates customer, staff, movie, genre, movie_genre, hall, seat, screening
exactly as in docs/schema-decisions.md sections 1-2, plus view hall_capacity
and index screening (start_time).

Revision ID: 0001
Revises:
Create Date: 2026-11-05
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = ["customer", "staff", "movie", "genre", "movie_genre", "hall", "seat", "screening"]


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")

    op.execute(r"""
        CREATE TABLE customer (
            customer_id  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE RESTRICT,
            full_name    varchar(100) NOT NULL,
            email        varchar(100) NOT NULL UNIQUE,
            phone        varchar(20) CHECK (phone ~ '^\+7[0-9]{10}$'),
            created_at   timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("""
        CREATE TABLE staff (
            staff_id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE RESTRICT,
            full_name    varchar(100) NOT NULL,
            role         text NOT NULL CHECK (role IN ('cashier', 'manager', 'admin')),
            is_active    boolean NOT NULL DEFAULT true,
            created_at   timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("""
        CREATE TABLE movie (
            movie_id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            title        varchar(150) NOT NULL,
            description  text,
            poster_url   text,
            duration_min int NOT NULL CHECK (duration_min BETWEEN 40 AND 300),
            min_age      int NOT NULL CHECK (min_age IN (0, 6, 12, 16, 18)),
            release_year int CHECK (release_year BETWEEN 1900 AND 2100),
            is_active    boolean NOT NULL DEFAULT true,
            created_at   timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("""
        CREATE TABLE genre (
            genre_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            name     varchar(30) NOT NULL UNIQUE
        )
    """)
    op.execute("""
        CREATE TABLE movie_genre (
            movie_id bigint NOT NULL REFERENCES movie (movie_id) ON DELETE CASCADE,
            genre_id bigint NOT NULL REFERENCES genre (genre_id) ON DELETE RESTRICT,
            PRIMARY KEY (movie_id, genre_id)
        )
    """)
    op.execute("""
        CREATE TABLE hall (
            hall_id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            name      varchar(30) NOT NULL UNIQUE,
            hall_type varchar(10) NOT NULL CHECK (hall_type IN ('2D', '3D', 'IMAX'))
        )
    """)
    op.execute("""
        CREATE TABLE seat (
            seat_id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            hall_id     bigint NOT NULL REFERENCES hall (hall_id) ON DELETE RESTRICT,
            row_label   varchar(2) NOT NULL,
            seat_number int NOT NULL CHECK (seat_number > 0),
            seat_type   text NOT NULL DEFAULT 'standard'
                        CHECK (seat_type IN ('standard', 'vip', 'wheelchair')),
            grid_row    int NOT NULL CHECK (grid_row >= 1),
            grid_col    int NOT NULL CHECK (grid_col >= 1),
            UNIQUE (hall_id, row_label, seat_number),
            UNIQUE (hall_id, grid_row, grid_col)
        )
    """)
    op.execute("""
        CREATE TABLE screening (
            screening_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            movie_id     bigint NOT NULL REFERENCES movie (movie_id) ON DELETE RESTRICT,
            hall_id      bigint NOT NULL REFERENCES hall (hall_id) ON DELETE RESTRICT,
            start_time   timestamptz NOT NULL,
            end_time     timestamptz NOT NULL,
            base_price   numeric(8, 2) NOT NULL CHECK (base_price > 0),
            created_at   timestamptz NOT NULL DEFAULT now(),
            CHECK (end_time > start_time),
            CONSTRAINT screening_no_overlap
                EXCLUDE USING gist (hall_id WITH =, tstzrange(start_time, end_time) WITH &&)
        )
    """)
    op.execute("CREATE INDEX screening_start_time_idx ON screening (start_time)")
    op.execute("""
        CREATE VIEW hall_capacity AS
        SELECT h.hall_id, COUNT(s.seat_id) AS capacity
        FROM hall h
        LEFT JOIN seat s ON s.hall_id = h.hall_id
        GROUP BY h.hall_id
    """)

    # RLS on, no policies: the browser's anon key reads nothing; FastAPI (the owner) still can.
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.execute("DROP VIEW hall_capacity")
    for table in reversed(TABLES):
        op.execute(f"DROP TABLE {table}")
