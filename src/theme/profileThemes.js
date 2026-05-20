// src/theme/profileThemes.js
export const PROFILE_THEMES = [
    {
      id: "classic",
      name: "Classic",
      premium: true,
      vars: {
        "--sf-accent": "#FACC15",
        "--sf-card-bg": "rgba(24,24,27,0.6)",
        "--sf-outline": "rgba(255,255,255,0.06)",
        "--sf-glow-from": "rgba(250,204,21,0.18)",
        "--sf-glow-to": "rgba(250,204,21,0.02)",
      },
    },
    {
      id: "neon-nights",
      name: "Neon Nights",
      premium: true,
      vars: {
        "--sf-accent": "#22d3ee",
        "--sf-card-bg": "rgba(2,6,23,0.6)",
        "--sf-outline": "rgba(34,211,238,0.18)",
        "--sf-glow-from": "rgba(34,211,238,0.16)",
        "--sf-glow-to": "rgba(168,85,247,0.06)",
      },
    },
    {
      id: "soft-focus-pastel",
      name: "Soft Focus Pastel",
      premium: true,
      vars: {
        "--sf-accent": "#c084fc",
        "--sf-card-bg": "rgba(24,24,27,0.5)",
        "--sf-outline": "rgba(192,132,252,0.18)",
        "--sf-glow-from": "rgba(192,132,252,0.14)",
        "--sf-glow-to": "rgba(34,197,94,0.05)",
      },
    },
    {
      id: "golden-noir",
      name: "Golden Noir",
      premium: true,
      vars: {
        "--sf-accent": "#FACC15",
        "--sf-card-bg": "rgba(12,12,12,0.7)",
        "--sf-outline": "rgba(245,158,11,0.18)",
        "--sf-glow-from": "rgba(245,158,11,0.14)",
        "--sf-glow-to": "rgba(0,0,0,0.06)",
      },
    },
    {
      id: "technicolor",
      name: "Technicolor",
      premium: true,
      vars: {
        "--sf-accent": "#34d399",
        "--sf-card-bg": "rgba(17,24,39,0.55)",
        "--sf-outline": "rgba(52,211,153,0.18)",
        "--sf-glow-from": "rgba(52,211,153,0.14)",
        "--sf-glow-to": "rgba(59,130,246,0.06)",
      },
    },
    {
      id: "silver-screen",
      name: "Silver Screen",
      premium: true,
      vars: {
        "--sf-accent": "#a1a1aa",
        "--sf-card-bg": "rgba(39,39,42,0.55)",
        "--sf-outline": "rgba(209,213,219,0.14)",
        "--sf-glow-from": "rgba(209,213,219,0.12)",
        "--sf-glow-to": "rgba(63,63,70,0.05)",
      },
    },
  ];
  
  // Turn a theme id into an inline style map of CSS vars
  export function getThemeVars(id) {
    if (!id) return {}; // no theme → base/default look
    const found = PROFILE_THEMES.find(t => t.id === id);
    return found?.vars || {};
  }
  
  