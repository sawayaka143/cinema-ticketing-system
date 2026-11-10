import {
  type ButtonHTMLAttributes,
  type ElementType,
  type ReactNode,
  forwardRef,
} from "react";
import { Squircle } from "./Squircle";

export type ButtonVariant = "solid" | "ghost" | "outline" | "link";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  as?: ElementType;
  to?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLElement, ButtonProps>(function Button(
  {
    as: Component = "button",
    variant = "solid",
    size = "md",
    loading = false,
    disabled = false,
    icon,
    className = "",
    children,
    type = "button",
    ...props
  },
  ref,
) {
  const isLink = variant === "link";
  const isDisabled = disabled || loading;

  const sizeClasses: Record<ButtonSize, string> = {
    sm: "btn-sm",
    md: "btn-md",
    lg: "btn-lg",
  };

  const radiusMap: Record<ButtonSize, number> = {
    sm: 10,
    md: 14,
    lg: 16,
  };

  if (isLink) {
    return (
      <Component
        ref={ref}
        type={Component === "button" ? type : undefined}
        disabled={isDisabled}
        className={`btn btn-link ${className}`}
        {...props}
      >
        {icon && <span className="btn-icon">{icon}</span>}
        {children}
      </Component>
    );
  }

  const fill =
    variant === "solid"
      ? "var(--accent)"
      : variant === "ghost"
      ? "var(--surface)"
      : "transparent";

  const stroke =
    variant === "solid"
      ? "transparent"
      : variant === "ghost"
      ? "var(--border)"
      : "var(--border)";

  return (
    <Squircle
      as={Component}
      ref={ref}
      radius={radiusMap[size]}
      smoothing={0.7}
      fill={fill}
      stroke={stroke}
      strokeWidth={1.5}
      shadow="none"
      className={`btn btn-${variant} ${sizeClasses[size]} ${isDisabled ? "btn-disabled" : ""} ${className}`}
      disabled={isDisabled}
      type={Component === "button" ? type : undefined}
      {...(props as any)}
    >
      <span className="btn-content">
        {loading && <span className="spinner" aria-hidden="true" />}
        {!loading && icon && <span className="btn-icon">{icon}</span>}
        <span className="btn-label">{children}</span>
      </span>
    </Squircle>
  );
});
