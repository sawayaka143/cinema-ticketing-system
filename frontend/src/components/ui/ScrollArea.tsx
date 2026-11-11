import type { HTMLAttributes, ReactNode } from "react";

export interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  orientation?: "vertical" | "horizontal" | "both";
}

export function ScrollArea({
  children,
  orientation = "vertical",
  className = "",
  ...props
}: ScrollAreaProps) {
  const orientationClass =
    orientation === "horizontal"
      ? "scroll-area-horizontal"
      : orientation === "both"
        ? "scroll-area-both"
        : "scroll-area-vertical";

  return (
    <div className={`scroll-area ${orientationClass} ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}
