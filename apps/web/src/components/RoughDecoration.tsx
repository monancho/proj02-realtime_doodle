import { useEffect, useRef } from "react";
import rough from "roughjs";
import type { Options } from "roughjs/bin/core";

type RoughDecorationVariant = "badge" | "frame" | "result" | "underline";

interface RoughDecorationProps {
  className?: string;
  seed?: number;
  variant: RoughDecorationVariant;
}

const commonOptions: Options = {
  bowing: 1.6,
  roughness: 1.8,
  stroke: "#222222",
  strokeWidth: 2
};

export function RoughDecoration({
  className,
  seed = 12,
  variant
}: RoughDecorationProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = svgRef.current;

    if (!svg) {
      return;
    }

    svg.replaceChildren();

    const roughSvg = rough.svg(svg);
    const options = { ...commonOptions, seed };

    switch (variant) {
      case "badge":
        svg.append(
          roughSvg.rectangle(7, 8, 186, 54, {
            ...options,
            fill: "#f4c542",
            fillStyle: "hachure",
            hachureGap: 7
          })
        );
        svg.append(
          roughSvg.line(18, 61, 182, 58, {
            ...options,
            stroke: "rgba(34, 34, 34, 0.34)",
            strokeWidth: 1.4
          })
        );
        break;
      case "frame":
        svg.append(
          roughSvg.rectangle(6, 6, 188, 88, {
            ...options,
            fill: "rgba(255, 254, 250, 0.2)",
            fillStyle: "zigzag",
            hachureGap: 11
          })
        );
        break;
      case "result":
        svg.append(
          roughSvg.rectangle(8, 8, 184, 104, {
            ...options,
            fill: "rgba(110, 168, 216, 0.24)",
            fillStyle: "hachure",
            hachureAngle: -35
          })
        );
        svg.append(
          roughSvg.ellipse(102, 60, 68, 38, {
            ...options,
            stroke: "#5b4636",
            strokeWidth: 1.5
          })
        );
        break;
      case "underline":
        svg.append(
          roughSvg.path("M8 24 C80 12, 176 32, 256 17 C300 10, 332 14, 354 18", {
            ...options,
            stroke: "#f4c542",
            strokeWidth: 10
          })
        );
        svg.append(
          roughSvg.path("M12 27 C86 18, 174 35, 266 21 C308 15, 334 17, 352 22", {
            ...options,
            stroke: "rgba(34, 34, 34, 0.38)",
            strokeWidth: 1.2
          })
        );
        break;
    }

    return () => {
      svg.replaceChildren();
    };
  }, [seed, variant]);

  return (
    <svg
      ref={svgRef}
      aria-hidden="true"
      className={className}
      focusable="false"
      viewBox={variant === "underline" ? "0 0 360 44" : "0 0 200 120"}
    />
  );
}
