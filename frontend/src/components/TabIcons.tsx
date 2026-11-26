import type { ReactNode } from "react";

// Outline icons (24px grid, 1.75 stroke) for the phone tab bar. Decorative: the label carries the name.
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Clapperboard: what's on. */
export function FilmIcon() {
  return (
    <Icon>
      <path d="M3 10h18v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19z" />
      <path d="m3 10 1.6-5 14.2-1.6.2 1.7" />
      <path d="m7.5 8.6 2.2 1.4M12.5 7.9l2.2 2.1M17.5 6.7l2.2 3.3" />
    </Icon>
  );
}

/** Ticket stub: bookings. */
export function TicketIcon() {
  return (
    <Icon>
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h15A1.5 1.5 0 0 1 21 8.5v2a1.75 1.75 0 0 0 0 3.5v2a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16v-2a1.75 1.75 0 0 0 0-3.5z" />
      <path d="M14.5 7v10" strokeDasharray="1.5 2.5" />
    </Icon>
  );
}

/** Person: profile. */
export function UserIcon() {
  return (
    <Icon>
      <circle cx="12" cy="8" r="3.75" />
      <path d="M4.5 20c.6-3.7 3.5-5.75 7.5-5.75s6.9 2.05 7.5 5.75" />
    </Icon>
  );
}

/** Dashboard grid: manager / box office. */
export function DashboardIcon() {
  return (
    <Icon>
      <rect x="3.5" y="3.5" width="7" height="8" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" />
      <rect x="3.5" y="14.5" width="7" height="6" rx="1.5" />
    </Icon>
  );
}

/** Globe: language picker. */
export function GlobeIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5S9.6 5.9 12 3.5z" />
    </Icon>
  );
}

/** Bell: notifications. */
export function BellIcon() {
  return (
    <Icon>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </Icon>
  );
}

/** Gear: settings. */
export function SettingsIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Icon>
  );
}

/** Sun: light theme. */
export function SunIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  );
}

/** Moon: dark theme. */
export function MoonIcon() {
  return (
    <Icon>
      <path d="M20.2 14.5A8.2 8.2 0 1 1 9.5 3.8a6.5 6.5 0 0 0 10.7 10.7z" />
    </Icon>
  );
}

/** Eye: show password. */
export function EyeIcon() {
  return (
    <Icon>
      <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.75" />
    </Icon>
  );
}

/** Eye-off: hide password. */
export function EyeOffIcon() {
  return (
    <Icon>
      <path d="M10.6 5.7A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.3 4.2" />
      <path d="M14.1 14.1a2.75 2.75 0 0 1-4.2-4.2" />
      <path d="M6.4 7.7A17 17 0 0 0 2.5 12s3.5 6.5 9.5 6.5a9.7 9.7 0 0 0 3.7-.7" />
      <path d="m3 3 18 18" />
    </Icon>
  );
}
