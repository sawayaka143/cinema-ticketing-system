/**
 * Squircle & continuous curvature SVG path generator.
 *
 * Implements the Apple iOS / Figma corner-smoothing algorithm (G2 continuity):
 * Instead of stitching flat lines directly to circular arcs (which causes an
 * abrupt jump in curvature), this blends curvature continuously across the
 * corner using cubic Bézier segments and circular arcs.
 */

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export interface SquircleParams {
  width: number;
  height: number;
  radius?: number;
  smoothing?: number; // 0 (standard rounded rect) to 1 (full smoothing). Apple iOS = ~0.6
}

export function getSquircleSvgPath({
  width: w,
  height: h,
  radius: r = 16,
  smoothing: s = 0.6,
}: SquircleParams): string {
  if (w <= 0 || h <= 0) return "";

  const maxRadius = Math.min(w / 2, h / 2);
  const clampedRadius = Math.min(r, maxRadius);
  const budget = maxRadius;
  const p = Math.min((1 + s) * clampedRadius, budget);
  const maxS = clampedRadius > 0 ? budget / clampedRadius - 1 : 0;
  const smooth = Math.max(0, Math.min(maxS, s));

  if (smooth <= 0 || clampedRadius <= 0) {
    return [
      `M ${clampedRadius} 0`,
      `L ${w - clampedRadius} 0`,
      `A ${clampedRadius} ${clampedRadius} 0 0 1 ${w} ${clampedRadius}`,
      `L ${w} ${h - clampedRadius}`,
      `A ${clampedRadius} ${clampedRadius} 0 0 1 ${w - clampedRadius} ${h}`,
      `L ${clampedRadius} ${h}`,
      `A ${clampedRadius} ${clampedRadius} 0 0 1 0 ${h - clampedRadius}`,
      `L 0 ${clampedRadius}`,
      `A ${clampedRadius} ${clampedRadius} 0 0 1 ${clampedRadius} 0`,
      "Z",
    ].join(" ");
  }

  const arcMeasure = 90 * (1 - smooth);
  const alpha = (90 - arcMeasure) / 2;
  const p3p4 = clampedRadius * Math.tan(toRad(alpha / 2));
  const beta = 45 * smooth;
  const c = p3p4 * Math.cos(toRad(beta));
  const d = c * Math.tan(toRad(beta));
  const arcLength = Math.sin(toRad(arcMeasure / 2)) * clampedRadius * Math.SQRT2;
  const b = (p - arcLength - c - d) / 3;
  const a = 2 * b;

  const f = (n: number) => Number(n.toFixed(3));

  return [
    `M ${f(p)} 0`,
    `L ${f(w - p)} 0`,
    `C ${f(w - p + a)} 0, ${f(w - p + a + b)} 0, ${f(w - p + a + b + c)} ${f(d)}`,
    `A ${f(clampedRadius)} ${f(clampedRadius)} 0 0 1 ${f(w - d)} ${f(p - a - b - c)}`,
    `C ${f(w)} ${f(p - a - b)}, ${f(w)} ${f(p - a)}, ${f(w)} ${f(p)}`,

    `L ${f(w)} ${f(h - p)}`,
    `C ${f(w)} ${f(h - p + a)}, ${f(w)} ${f(h - p + a + b)}, ${f(w - d)} ${f(h - p + a + b + c)}`,
    `A ${f(clampedRadius)} ${f(clampedRadius)} 0 0 1 ${f(w - p + a + b + c)} ${f(h - d)}`,
    `C ${f(w - p + a + b)} ${f(h)}, ${f(w - p + a)} ${f(h)}, ${f(w - p)} ${f(h)}`,

    `L ${f(p)} ${f(h)}`,
    `C ${f(p - a)} ${f(h)}, ${f(p - a - b)} ${f(h)}, ${f(p - a - b - c)} ${f(h - d)}`,
    `A ${f(clampedRadius)} ${f(clampedRadius)} 0 0 1 ${f(d)} ${f(h - p + a + b + c)}`,
    `C 0 ${f(h - p + a + b)}, 0 ${f(h - p + a)}, 0 ${f(h - p)}`,

    `L 0 ${f(p)}`,
    `C 0 ${f(p - a)}, 0 ${f(p - a - b)}, ${f(d)} ${f(p - a - b - c)}`,
    `A ${f(clampedRadius)} ${f(clampedRadius)} 0 0 1 ${f(p - a - b - c)} ${f(d)}`,
    `C ${f(p - a - b)} 0, ${f(p - a)} 0, ${f(p)} 0`,
    "Z",
  ].join(" ");
}
