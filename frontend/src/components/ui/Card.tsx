import {
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
  forwardRef,
} from "react";
import { Squircle } from "./Squircle";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  radius?: number;
  hoverable?: boolean;
  elevated?: boolean;
  children?: ReactNode;
}

export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  {
    as: Component = "article",
    radius = 6,
    hoverable = false,
    elevated = true,
    className = "",
    children,
    ...props
  },
  ref,
) {
  return (
    <Squircle
      as={Component}
      ref={ref}
      radius={radius}
      smoothing={0.5}
      fill="var(--surface)"
      stroke="var(--border)"
      strokeWidth={1}
      shadow={elevated ? "subtle" : "none"}
      className={`card ${hoverable ? "card-hoverable" : ""} ${className}`.trim()}
      {...props}
    >
      <div className="card-body">{children}</div>
    </Squircle>
  );
});
