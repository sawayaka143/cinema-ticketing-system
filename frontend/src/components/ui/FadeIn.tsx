import type { ElementType, HTMLAttributes, ReactNode } from "react";

export interface FadeInProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  delay?: number; // milliseconds
  duration?: number; // milliseconds
  direction?: "up" | "down" | "none";
  children: ReactNode;
}

export function FadeIn({
  as: Component = "div",
  delay = 0,
  duration = 400,
  direction = "up",
  className = "",
  style,
  children,
  ...props
}: FadeInProps) {
  const directionClass =
    direction === "up"
      ? "fade-in-up"
      : direction === "down"
        ? "fade-in-down"
        : "fade-in-only";

  return (
    <Component
      className={`fade-in-wrapper ${directionClass} ${className}`.trim()}
      style={{
        animationDelay: `${delay}ms`,
        animationDuration: `${duration}ms`,
        ...style,
      }}
      {...props}
    >
      {children}
    </Component>
  );
}
