import type { CSSProperties, HTMLAttributes } from "react";
import { Card } from "./Card";
import { Squircle } from "./Squircle";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "text" | "rectangular" | "circular" | "squircle";
  width?: number | string;
  height?: number | string;
  radius?: number;
  className?: string;
  style?: CSSProperties;
}

export function Skeleton({
  variant = "squircle",
  width,
  height,
  radius = 12,
  className = "",
  style,
  ...props
}: SkeletonProps) {
  const customStyle: CSSProperties = {
    width: width ?? (variant === "text" ? "100%" : undefined),
    height: height ?? (variant === "text" ? "1.2em" : undefined),
    ...style,
  };

  if (variant === "squircle") {
    return (
      <Squircle
        radius={radius}
        smoothing={0.65}
        fill="var(--surface-2)"
        stroke="var(--border-subtle)"
        strokeWidth={1}
        className={`skeleton skeleton-squircle ${className}`}
        style={customStyle}
        aria-hidden="true"
        {...props}
      />
    );
  }

  return (
    <div
      className={`skeleton skeleton-${variant} ${className}`}
      style={customStyle}
      aria-hidden="true"
      {...props}
    />
  );
}

/** Pre-composed skeleton for a movie row in the daily program list. */
export function MovieRowSkeleton() {
  return (
    <Card className="film-card skeleton-film-card" aria-hidden="true">
      <div className="film-layout">
        <Skeleton width={104} height={150} radius={14} className="skeleton-poster" />
        <div className="film-details" style={{ flex: 1 }}>
          <div className="title" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <Skeleton width="45%" height="1.6rem" radius={8} />
            <Skeleton width="2.5rem" height="1.4rem" radius={6} />
          </div>
          <div style={{ marginTop: "0.5rem" }}>
            <Skeleton width="30%" height="1rem" radius={6} />
          </div>
          <div className="times" style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
            <Skeleton width="6.5rem" height="2.25rem" radius={10} />
            <Skeleton width="6.5rem" height="2.25rem" radius={10} />
            <Skeleton width="6.5rem" height="2.25rem" radius={10} />
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Pre-composed skeleton stack representing program loading. */
export function ProgramSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      className="films-stack"
      role="status"
      aria-busy="true"
      aria-label="Loading cinema program…"
    >
      {Array.from({ length: count }).map((_, i) => (
        <MovieRowSkeleton key={i} />
      ))}
    </div>
  );
}
