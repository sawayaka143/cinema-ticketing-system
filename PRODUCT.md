# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Customer** (primary for the MVP): a moviegoer picking a film, a showtime and seats, then paying. Wants to see quickly what's on, when, and which seats are free.
- **Manager** (MVP): maintains movies, halls and screenings and reads the weekly occupancy/revenue report to decide which shows to move, cancel or duplicate.
- **Cashier, Admin**: stretch goals, only after the MVP works.
- **Evaluators**: the course teacher and classmates watching the week-15 demo on a laptop/projector. They judge whether the booking flow is clear and complete.

## Product Purpose

Book cinema tickets online: movie → screening → free seats on a real hall map → seats held for 10 minutes → (fake) payment → tickets. Success: a customer goes from the movie list to tickets without confusion, never double-books a seat, and always knows how long the hold lasts.

## Positioning

A single fictional cinema in Almaty, **Alatau Cinema** (name chosen by Claude on the owner's request to invent one; changeable). One venue, three halls (2D, 3D, IMAX), its own program, not an aggregator.

## Operating Context

- University project (KBTU, Basics of Information Systems), 5 people, weeks 10–14, demo in week 15.
- Judged mainly on a laptop/projector during the demo; phones must work but are secondary.
- Times shown in Almaty time; prices in tenge (₸).

## Capabilities and Constraints

- React + Vite + TypeScript SPA on Vercel; all data through the FastAPI backend, API types generated from `backend/openapi.json`. Supabase only for login.
- Seat map drawn from `grid_row`/`grid_col`; empty cells are aisles. Seat types: standard, VIP (1.5× price), wheelchair.
- Ticket types with discounts (adult, student, child, staff); child tickets hidden for movies above the child age limit.
- Age ratings 0+/6+/12+/16+/18+.
- Payment is fake (card / Kaspi / cash); card numbers are never collected beyond a fake form.
- Undecided: exact discount values, VIP multiplier and cleaning buffer (see `docs/schema-decisions.md` §9).

## Brand Commitments

- UI language: English only.
- Name: Alatau Cinema (fictional).

## Evidence on Hand

No real posters, photos, logos or reviews. Movie posters come from `poster_url` in seed data. Do not invent ratings, reviews, press quotes or partner logos.

## Product Principles

1. The booking flow is the product: every screen moves the customer one step closer to tickets.
2. Seat availability and the hold countdown are always unambiguous.
3. Readable from the back of a lecture room: the demo is the main audience moment.
4. Honest states: loading, empty, error and "seat just taken" are designed, not afterthoughts.

## Accessibility & Inclusion

Wheelchair seats are a first-class seat type on the map. Seat states must not rely on color alone. WCAG AA contrast.
