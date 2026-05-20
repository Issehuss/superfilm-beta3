// src/components/GlowColorPicker.jsx
import React, { useMemo, useState } from "react";
import { Lock, Droplets, SlidersHorizontal, Sparkles } from "lucide-react";

// New system exports
import { CORE_PALETTE, GLOW_TOKENS } from "../constants/glowOptions";

// Legacy palette (kept for backwards compatibility)
import { glowColors } from "../constants/glowColours";

/**
 * Props (backwards-compatible):
 * - selected: string (legacy)      -> selected className (e.g., "glow-blue")
 * - onChange: (className)          -> legacy callback
 *
 * Advanced (premium-aware):
 * - value: { variantId, color, secondary?, intensity?, blend? }
 * - onChangeTokens: (tokens)       -> callback for token changes
 * - plan: 'free' | 'directors_cut'
 * - mode: 'global' | 'per-card'    (copy/gating hints only)
 */
export default function GlowColorPicker({
  selected,
  onChange,
  value,                // token mode
  onChangeTokens,       // token mode
  plan = "free",
  mode = "global",
  className = "",
}) {
  const advanced = !!value && typeof onChangeTokens === "function";
  const isPremium = plan === "directors_cut";
  const [tab, setTab] = useState("All"); // All | Glows | Outlines | Patterns | Duotones

  // -----------------------------
  // Normalize tokens ONCE (no conditional hooks)
  // -----------------------------
  const tokensAll = useMemo(() => {
    // GLOW_TOKENS might be an array or an object of arrays; normalize to a flat array.
    const rawArray = Array.isArray(GLOW_TOKENS)
      ? GLOW_TOKENS
      : Object.values(GLOW_TOKENS || {}).flat();

    // Map to a consistent shape used by this component
    return (rawArray || []).map((t, i) => ({
      id: t.id || t.className || `token-${i}`,
      label: t.label || t.name || t.className || "Style",
      className: t.className || null,  // when you have CSS glow classes
      hex: t.hex || t.color || "#FACC15",
      kind: t.kind || t.type || "glow", // "glow" | "outline" | "pattern" | "duotone"
      pack: t.pack || (t.premium ? "pro" : "core"), // "pro" locks for non-premium
      color: t.color || t.hex || "#FACC15",
      secondary: t.secondary,          // for duotone styles
      intensity: t.intensity || "medium",
    }));
  }, []);

  const tokensByTab = useMemo(() => {
    if (tab === "All") return tokensAll;
    const key =
      tab.toLowerCase() === "duotones"
        ? "duotone"
        : tab.toLowerCase().slice(0, -1); // Glows→glow, Patterns→pattern, Outlines→outline
    return tokensAll.filter((t) => t.kind === key);
  }, [tab, tokensAll]);

  // -----------------------------
  // Legacy mode (drop-in)
  // -----------------------------
  if (!advanced) {
    return (
      <div className={`flex items-center gap-2 mt-2 ${className}`}>
        {(glowColors || []).map((glow) => (
          <button
            key={glow.className}
            onClick={() => onChange?.(glow.className)}
            className={`w-6 h-6 rounded-full border-2 transition ${
              selected === glow.className ? "border-white scale-110" : "border-zinc-600 hover:scale-105"
            } ${glow.className || ""}`}
            style={{ backgroundColor: glow.hex }}
            title={glow.name || glow.className}
            aria-label={glow.name || glow.className}
            type="button"
          />
        ))}
      </div>
    );
  }

  // -----------------------------
  // Advanced mode (premium-aware)
  // -----------------------------
  function pickVariant(t) {
    if (!isPremium && t.pack === "pro") {
      // Soft gate: your app can catch this to open an upgrade modal.
      try {
        window.dispatchEvent(new CustomEvent("sf:open-upgrade", { detail: { reason: "glow-pro" } }));
      } catch {}
      return;
    }
    onChangeTokens({
      ...value,
      variantId: t.id,
      color: value?.color || t.color || "#FACC15",
      secondary: value?.secondary || t.secondary || undefined,
      intensity: value?.intensity || t.intensity || "medium",
      blend: value?.blend || "normal",
    });
  }

  function update(patch) {
    onChangeTokens({ ...value, ...patch });
  }

  return (
    <div className={`rounded-2xl border border-zinc-800 bg-black/40 p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <Sparkles className="h-4 w-4" />
          <h3 className="text-lg font-semibold">
            {mode === "global" ? "Global Card Style" : "Card Style"}
          </h3>
        </div>

        <div className="flex gap-2 text-xs">
          {["All", "Glows", "Outlines", "Patterns", "Duotones"].map((t) => (
            <button
              key={t}
              className={`px-2 py-1 rounded-md border ${
                tab === t
                  ? "bg-white/10 text-white border-white/20"
                  : "text-zinc-400 border-transparent hover:text-white"
              }`}
              onClick={() => setTab(t)}
              type="button"
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Swatch grid of variants */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {tokensByTab.map((t) => {
          const isActive = value?.variantId === t.id;
          const locked = t.pack === "pro" && !isPremium;
          const edgeColor = (isActive ? value?.color : t.color) || "#FACC15";
          const edgeSecondary = (isActive ? value?.secondary : t.secondary) || "transparent";

          return (
            <button
              key={t.id}
              onClick={() => pickVariant(t)}
              className={`group relative rounded-xl p-3 border ${
                isActive ? "border-white/40" : "border-white/10 hover:border-white/20"
              } bg-black/50`}
              title={t.label}
              type="button"
            >
              <div
                data-variant={t.id}
                className={`h-16 rounded-lg flex items-center justify-center text-xs text-zinc-300 ${
                  t.className ? t.className : "bg-zinc-900"
                }`}
                style={{
                  // Minimal live preview via CSS vars (your CSS can read these)
                  "--sf-edge-color": edgeColor,
                  "--sf-edge-secondary": edgeSecondary,
                  "--sf-glow-strength":
                    value?.intensity === "high" ? 1 : value?.intensity === "low" ? 0.45 : 0.7,
                }}
              >
                {t.label}
              </div>
              {locked && (
                <div className="absolute right-2 top-2 text-zinc-400">
                  <Lock className="h-4 w-4" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Controls */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Primary colour */}
        <div className="rounded-xl border border-white/10 p-3">
          <div className="flex items-center gap-2 mb-2 text-white">
            <Droplets className="h-4 w-4" />
            <span className="text-sm font-medium">Colour</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(CORE_PALETTE || []).map(({ name, hex }) => (
              <button
                key={`color-${hex.toLowerCase()}`}
                onClick={() => update({ color: hex })}
                title={name}
                className={`h-7 w-7 rounded-md border ${
                  value?.color === hex ? "border-white/60" : "border-white/10"
                }`}
                style={{ background: hex }}
                type="button"
              />
            ))}
            {/* custom input */}
            <label className="ml-2 inline-flex items-center gap-2 text-xs text-zinc-300">
              <span>Custom</span>
              <input
                type="color"
                value={value?.color || "#FACC15"}
                onChange={(e) => update({ color: e.target.value })}
                className="h-7 w-10 bg-transparent"
              />
            </label>
          </div>
        </div>

        {/* Secondary / Duotone */}
        <div className="rounded-xl border border-white/10 p-3">
          <div className="flex items-center gap-2 mb-2 text-white">
            <SlidersHorizontal className="h-4 w-4" />
            <span className="text-sm font-medium">Secondary / Duotone</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(CORE_PALETTE || []).map(({ name, hex }) => (
              <button
                key={`secondary-${hex.toLowerCase()}`}
                onClick={() => update({ secondary: hex })}
                title={name}
                className={`h-7 w-7 rounded-md border ${
                  value?.secondary === hex ? "border-white/60" : "border-white/10"
                }`}
                style={{ background: hex }}
                type="button"
              />
            ))}
            {/* custom input */}
            <label className="ml-2 inline-flex items-center gap-2 text-xs text-zinc-300">
              <span>Custom</span>
              <input
                type="color"
                value={value?.secondary || "#FF3CF6"}
                onChange={(e) => update({ secondary: e.target.value })}
                className="h-7 w-10 bg-transparent"
              />
            </label>
          </div>
          <div className="mt-2 text-xs text-zinc-400">
            Only used by duotone variants (e.g., Duotone Aura, Chromatic Fringe).
          </div>
        </div>

        {/* Intensity & Blend */}
        <div className="rounded-xl border border-white/10 p-3">
          <div className="flex items-center gap-2 mb-2 text-white">
            <SlidersHorizontal className="h-4 w-4" />
            <span className="text-sm font-medium">Intensity & Blend</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {["low", "medium", "high"].map((k) => (
              <button
                key={`int-${k}`}
                onClick={() => update({ intensity: k })}
                className={`px-2 py-1 rounded-md border ${
                  value?.intensity === k
                    ? "border-white/40 text-white"
                    : "border-white/10 text-zinc-300"
                }`}
                type="button"
              >
                {k}
              </button>
            ))}
            <span className="opacity-50">|</span>
            {["normal", "soft", "screen"].map((k) => (
              <button
                key={`blend-${k}`}
                onClick={() => update({ blend: k })}
                className={`px-2 py-1 rounded-md border ${
                  value?.blend === k
                    ? "border-white/40 text-white"
                    : "border-white/10 text-zinc-300"
                }`}
                type="button"
              >
                {k}
              </button>
            ))}
          </div>

          {mode === "per-card" && !isPremium && (
            <div className="mt-3 text-xs text-zinc-300">
              Per-card styling is a Director’s Cut feature. Your selection will apply globally.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
