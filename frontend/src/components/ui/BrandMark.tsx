import type { HTMLAttributes } from "react";
import { Squircle } from "./Squircle";

export interface BrandMarkProps extends HTMLAttributes<HTMLSpanElement> {
  size?: "sm" | "md" | "lg" | number;
  withText?: boolean;
  className?: string;
}

export function BrandMark({
  size = "md",
  withText = false,
  className = "",
  ...props
}: BrandMarkProps) {
  const pixelSize =
    typeof size === "number"
      ? size
      : size === "sm"
        ? 20
        : size === "lg"
          ? 36
          : 28;

  const radius = Math.max(6, Math.round(pixelSize * 0.32));

  const emblem = (
    <Squircle
      as="span"
      radius={radius}
      smoothing={0.7}
      fill="var(--surface-2)"
      stroke="var(--accent)"
      strokeWidth={1.5}
      shadow="none"
      style={{
        width: pixelSize,
        height: pixelSize,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
      innerStyle={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      aria-hidden="true"
    >
      <svg
        width={Math.round(pixelSize * 0.65)}
        height={Math.round(pixelSize * 0.65)}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block" }}
      >
        <path
          d="M2.5 19L9.5 8L14.5 15.5L17.5 11L21.5 19H2.5Z"
          fill="var(--accent)"
          fillOpacity="0.25"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="9.5" cy="5.5" r="1.5" fill="var(--accent)" />
      </svg>
    </Squircle>
  );

  if (!withText) {
    return (
      <span className={`brand-mark ${className}`.trim()} {...props}>
        {emblem}
      </span>
    );
  }

  return (
    <span className={`brand-lockup ${className}`.trim()} {...props}>
      {emblem}
      <span className="brand-name">Alatau Cinema</span>
    </span>
  );
}
