import {
  type ButtonHTMLAttributes,
  type ElementType,
  type MouseEventHandler,
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
    onClick,
    tabIndex,
    ...props
  },
  ref,
) {
  const isLinkVariant = variant === "link";
  const isButtonTag = Component === "button";
  const isDisabled = disabled || loading;

  const handleClick: MouseEventHandler<HTMLButtonElement> = (event) => {
    if (isDisabled) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onClick?.(event);
  };

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

  if (isLinkVariant) {
    return (
      <Component
        ref={ref}
        type={isButtonTag ? type : undefined}
        disabled={isButtonTag ? isDisabled : undefined}
        aria-disabled={!isButtonTag && isDisabled ? true : undefined}
        tabIndex={!isButtonTag && isDisabled ? -1 : tabIndex}
        onClick={handleClick}
        className={`btn btn-link ${isDisabled ? "btn-disabled" : ""} ${className}`.trim()}
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

  const stroke = variant === "solid" ? "transparent" : "var(--border)";

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
      className={`btn btn-${variant} ${sizeClasses[size]} ${isDisabled ? "btn-disabled" : ""} ${className}`.trim()}
      disabled={isButtonTag ? isDisabled : undefined}
      aria-disabled={!isButtonTag && isDisabled ? true : undefined}
      tabIndex={!isButtonTag && isDisabled ? -1 : tabIndex}
      type={isButtonTag ? type : undefined}
      onClick={handleClick}
      {...props}
    >
      <span className="btn-content">
        {loading && <span className="spinner" aria-hidden="true" />}
        {!loading && icon && <span className="btn-icon">{icon}</span>}
        <span className="btn-label">{children}</span>
      </span>
    </Squircle>
  );
});
