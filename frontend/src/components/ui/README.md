# Alatau Cinema UI Component System

All frontend UI in this repository uses the standardized primitives located in `frontend/src/components/ui/`.

Every agent and human working on frontend pages **must use these components** rather than hand-crafting ad-hoc HTML buttons, empty paragraphs, or custom loading strings.

---

## Component Catalog

### 1. Geometry & Layout

#### `<Squircle>`
The core geometric foundation. Delivers continuous curvature with superellipse corner smoothing (`smoothing={0.65}`) sized to the element's border box.

```tsx
import { Squircle } from "../components/ui/Squircle";

<Squircle
  as="div"
  radius={14}
  smoothing={0.65}
  fill="var(--surface)"
  stroke="var(--border)"
  shadow="subtle" // "none" | "subtle" | "elevated"
>
  Content
</Squircle>
```

#### `<Card>`
Standard elevated or flat squircle surface for movie cards, information panels, and form containers.

```tsx
import { Card } from "../components/ui/Card";

<Card as="article" elevated hoverable className="my-card">
  <h3>Title</h3>
  <p>Body</p>
</Card>
```

#### `<FadeIn>`
Accessible entrance animation with physics-based spring curves. Automatically disables when the user prefers reduced motion.

```tsx
import { FadeIn } from "../components/ui/FadeIn";

<FadeIn direction="up" delay={50}>
  <Card>Smooth enter</Card>
</FadeIn>
```

---

### 2. Actions & Navigation

#### `<Button>`
Universal button component supporting `solid`, `ghost`, `outline`, and `link` styles, with built-in loading spinners, squircle curvature, and full keyboard focus ring support.

```tsx
import { Button } from "../components/ui/Button";

// Primary action
<Button variant="solid" size="md" onClick={handleSave}>
  Confirm booking
</Button>

// As router link
<Button as={Link} to="/login" variant="ghost" size="sm">
  Log in
</Button>

// Loading state
<Button loading={isSubmitting} variant="solid">
  Processing…
</Button>
```

#### `<ShowtimeChip>`
Standardized showtime capsule displaying start time, end time, and hall format (`IMAX`, `3D`, `2D`) using tabular numerals.

```tsx
import { ShowtimeChip } from "../components/ui/ShowtimeChip";

<ShowtimeChip screening={screening} />
```

#### `<Badge>`
Compact pill for age ratings (e.g., `16+`), ticket categories, or status badges.

```tsx
import { Badge } from "../components/ui/Badge";

<Badge tone="neutral" variant="outline">16+</Badge>
<Badge tone="accent">VIP</Badge>
```

---

### 3. States & Feedback

#### `<Skeleton>` & `<ProgramSkeleton>`
Shimmering placeholder loaders that prevent layout shifts during async data fetching. **Never use raw `<p>Loading…</p>` text.**

```tsx
import { Skeleton, ProgramSkeleton } from "../components/ui/Skeleton";

// Full cinema program loading
{program.state === "loading" && <ProgramSkeleton count={3} />}

// Custom block loading
<Skeleton width="60%" height="2rem" radius={8} />
```

#### `<EmptyState>`
Honest, friendly zero-state presentation for dates without screenings, empty bookings, or search results.

```tsx
import { EmptyState } from "../components/ui/EmptyState";

<EmptyState
  title="No screenings remaining today"
  description="All screenings for this date have concluded. Please select another day above."
  action={<Button onClick={goToTomorrow}>View tomorrow</Button>}
/>
```

#### `<ErrorState>`
Domain-aware error presentation with an in-app "Try again" recovery action and collapsible technical details. **Never show unhandled raw exception strings to users.**

```tsx
import { ErrorState } from "../components/ui/ErrorState";

<ErrorState
  title="Couldn't load schedule"
  message="We had trouble reaching the ticketing box office. Please check your connection."
  details={error.message}
  onRetry={program.reload}
/>
```

---

### 4. Brand & Identity

#### `<BrandMark>`
Official geometric emblem of Alatau Cinema (Alatau mountain peaks + projector light) in a squircle container.

```tsx
import { BrandMark } from "../components/ui/BrandMark";

// Header icon
<BrandMark size="md" />

// Lockup with text
<BrandMark size="md" withText />
```

---

## Golden Rules for Agents

1. **Import from UI barrel**: Always import from `../components/ui` or `../components/ui/index`.
2. **Always offer recovery**: Any `ErrorState` must include `onRetry` whenever data fetching can be re-attempted.
3. **No raw loading text**: Use `<Skeleton>` or pre-composed skeleton layouts (`<ProgramSkeleton>`).
4. **No raw exception leaks**: Use `<ErrorState details={err.message}>` so errors are courteous to users and helpful to developers.
5. **Continuous corners**: Always use `<Squircle>` or `<Card>` for cards, buttons, badges, and image frames.
