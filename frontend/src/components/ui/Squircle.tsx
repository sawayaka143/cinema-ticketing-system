import {
  type CSSProperties,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
  forwardRef,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { getSquircleSvgPath } from "./squircle-path";

export interface SquircleProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  radius?: number;
  smoothing?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  shadow?: "none" | "subtle" | "elevated";
  clipContent?: boolean;
  innerClassName?: string;
  innerStyle?: CSSProperties;
  children?: ReactNode;
  to?: string;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
}

export const Squircle = forwardRef<HTMLElement, SquircleProps>(function Squircle(
  {
    as: Component = "div",
    radius = 16,
    smoothing = 0.6,
    fill,
    stroke,
    strokeWidth = 1,
    shadow = "none",
    clipContent = false,
    innerClassName = "",
    innerStyle,
    className = "",
    style,
    children,
    ...props
  },
  forwardedRef,
) {
  const localRef = useRef<HTMLElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const clipId = useId().replace(/:/g, "-");

  useLayoutEffect(() => {
    const el = localRef.current;
    if (!el) return;

    const measure = () => {
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      if (width > 0 && height > 0) {
        setSize((prev) =>
          prev.width === width && prev.height === height ? prev : { width, height },
        );
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el, { box: "border-box" });
    return () => observer.disconnect();
  }, []);

  const path =
    size.width > 0 && size.height > 0
      ? getSquircleSvgPath({ width: size.width, height: size.height, radius, smoothing })
      : "";

  const shadowStyle =
    shadow === "elevated"
      ? "0 10px 24px rgba(0, 0, 0, 0.55)"
      : shadow === "subtle"
        ? "0 4px 12px rgba(0, 0, 0, 0.35)"
        : undefined;

  return (
    <Component
      ref={(node: HTMLElement | null) => {
        localRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      className={`squircle-container ${className}`.trim()}
      style={{
        position: "relative",
        boxShadow: shadowStyle,
        borderRadius: `${radius}px`,
        ...style,
      }}
      {...props}
    >
      {size.width > 0 && size.height > 0 && path && (
        <svg
          className="squircle-svg"
          aria-hidden="true"
          width={size.width}
          height={size.height}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            overflow: "visible",
            zIndex: 0,
          }}
        >
          {clipContent && (
            <defs>
              <clipPath id={clipId}>
                <path d={path} />
              </clipPath>
            </defs>
          )}
          {(fill || stroke) && (
            <path
              d={path}
              fill={fill ?? "none"}
              stroke={stroke ?? "none"}
              strokeWidth={stroke ? strokeWidth : 0}
            />
          )}
        </svg>
      )}

      <span
        className={`squircle-inner ${innerClassName}`.trim()}
        style={{
          position: "relative",
          zIndex: 1,
          display: "block",
          width: "100%",
          height: "100%",
          clipPath: clipContent && path ? `url(#${clipId})` : undefined,
          borderRadius: `${radius}px`,
          ...innerStyle,
        }}
      >
        {children}
      </span>
    </Component>
  );
});
