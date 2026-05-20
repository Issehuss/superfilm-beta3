// src/components/TasteCard.jsx
import React, { useMemo } from "react";

/**
 * Props
 * - question: string
 * - answer: string
 * - style?: { mode: 'glow'|'outline', glow: string, outline: string }
 * - fallbackColor?: string  (e.g., profile?.taste_card_style_global)
 *
 * Back-compat props (legacy):
 * - glowClass?: string
 * - glowColor?: string
 * - glowStyle?: 'none' | any
 * - useGlowStyle?: boolean
 */
const DEFAULT_COLOR = "#FACC15"; // amber

export default function TasteCard({
  question,
  answer,
  style,
  fallbackColor,
  // legacy (kept so old data doesn’t break)
  glowClass,
  glowColor,
  glowStyle = "none",
  useGlowStyle = true,
  className = "",
}) {
  // Resolve a color priority:
  // 1) style.glow/outline depending on mode
  // 2) fallbackColor (global)
  // 3) legacy glowColor
  // 4) default
  const mode = style?.mode === "outline" ? "outline" : "glow";
  const colorFromStyle = mode === "outline" ? style?.outline : style?.glow;

  const color = useMemo(() => {
    return (
      colorFromStyle ||
      fallbackColor ||
      glowColor ||
      DEFAULT_COLOR
    );
  }, [colorFromStyle, fallbackColor, glowColor]);

  // Visual treatment
  const cardStyle =
    mode === "outline"
      ? {
          outline: `2px solid ${color}`,
          outlineOffset: "2px",
        }
      : useGlowStyle
      ? {
          boxShadow: `0 0 0 2px ${color}22, 0 0 22px ${color}66, 0 0 48px ${color}33`,
        }
      : undefined;

  return (
    <div className={`rounded-2xl border border-white/10 p-2.5 sm:p-4 bg-black/30 ${className}`}>
      <div
        className="relative rounded-xl p-3 sm:p-5 min-h-[108px] sm:h-32 grid place-items-center text-center"
        style={cardStyle}
      >
        <div className="text-[9px] sm:text-[10px] uppercase tracking-wide text-zinc-400 mb-1 leading-snug">
          {question}
        </div>
        <div className="text-xs sm:text-sm text-white/90 sm:line-clamp-3 max-w-[95%] leading-snug">
          {answer}
        </div>
      </div>
    </div>
  );
}












