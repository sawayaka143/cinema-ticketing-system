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
        className={`skeleton skeleton-squircle ${className}`.trim()}
        style={customStyle}
        aria-hidden="true"
        {...props}
      />
    );
  }

  return (
    <div
      className={`skeleton skeleton-${variant} ${className}`.trim()}
      style={customStyle}
      aria-hidden="true"
      {...props}
    />
  );
}

/** Pre-composed skeleton for a movie card in the daily program grid. */
export function MovieRowSkeleton() {
  return (
    <Card className="film-card skeleton-film-card" aria-hidden="true">
      <div className="film-layout">
        <Skeleton height={216} radius={4} className="poster-squircle" />
        <div className="film-details">
          <div className="film-head">
            <div className="title">
              <Skeleton width="68%" height="1.5rem" radius={4} />
              <Skeleton width="2.25rem" height="1.35rem" radius={4} />
            </div>
            <Skeleton width="52%" height="0.95rem" radius={4} style={{ marginTop: "0.45rem" }} />
            <Skeleton width="92%" height="0.95rem" radius={4} style={{ marginTop: "0.75rem" }} />
            <Skeleton width="76%" height="0.95rem" radius={4} style={{ marginTop: "0.35rem" }} />
          </div>
          <div className="times">
            <Skeleton width="8.5rem" height="3.25rem" radius={6} />
            <Skeleton width="8.5rem" height="3.25rem" radius={6} />
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Skeleton for a poster tile in the 2-column phone storefront. */
export function MovieTileSkeleton() {
  return (
    <div className="movie-tile" aria-hidden="true">
      <Skeleton radius={4} className="poster-squircle" />
      <Skeleton width="80%" height="1rem" radius={4} />
      <Skeleton width="55%" height="0.8rem" radius={4} />
    </div>
  );
}

/** Pre-composed skeleton grid representing program loading. */
export function ProgramSkeleton({ count = 4, tiles = false }: { count?: number; tiles?: boolean }) {
  return (
    <div
      className={tiles ? "tiles-grid" : "films-grid"}
      role="status"
      aria-busy="true"
      aria-label="Loading cinema program…"
    >
      {Array.from({ length: count }).map((_, i) =>
        tiles ? <MovieTileSkeleton key={i} /> : <MovieRowSkeleton key={i} />,
      )}
    </div>
  );
}
