# Alatau Cinema UI Component System

All frontend UI in this repository uses the standardized primitives located in `frontend/src/components/ui/`.

Every agent and human working on frontend pages **must use these components** rather than hand-crafting ad-hoc HTML buttons or custom containers.

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
