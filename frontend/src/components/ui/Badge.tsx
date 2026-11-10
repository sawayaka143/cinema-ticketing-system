import type { HTMLAttributes, ReactNode } from "react";

export type BadgeTone = "neutral" | "accent" | "warning" | "error" | "success";
export type BadgeVariant = "outline" | "solid" | "subtle";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  variant?: BadgeVariant;
  children: ReactNode;
}

export function Badge({
  tone = "neutral",
  variant = "outline",
  className = "",
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={`badge badge-${tone} badge-${variant} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
