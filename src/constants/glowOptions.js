// src/constants/glowOptions.js
// Backwards-compatible + new token system

/** ===============================
 *  NEW TOKEN SYSTEM (for selector)
 *  =============================== */

export const CORE_PALETTE = {
  yellow: '#FACC15',
  white: '#FFFFFF',
  grey: '#B5B5B5',
};

export const GLOW_TOKENS = [
  // ----- FREE (mapped from your current file) -----
  {
    id: 'glow-blue',
    label: 'Electric Blue',
    pack: 'core',             // free
    kind: 'glow',
    color: '#00FFFF',
    intensity: 'medium',
    supports: { color: true, intensity: true, blend: true },
    _legacy: { border: '3px solid #00FFFF', glow: '0 0 12px #00FFFF' },
  },
  {
    id: 'glow-green',
    label: 'Neon Green',
    pack: 'core',
    kind: 'glow',
    color: '#39FF14',
    intensity: 'medium',
    supports: { color: true, intensity: true, blend: true },
    _legacy: { border: '3px solid #39FF14', glow: '0 0 12px #39FF14' },
  },
  {
    id: 'glow-pink',
    label: 'Hot Pink',
    pack: 'core',
    kind: 'glow',
    color: '#FF69B4',
    intensity: 'medium',
    supports: { color: true, intensity: true, blend: true },
    _legacy: { border: '3px solid #FF69B4', glow: '0 0 12px #FF69B4' },
  },
  {
    id: 'glow-orange',
    label: 'Sunset Orange',
    pack: 'core',
    kind: 'glow',
    color: '#FF4500',
    intensity: 'medium',
    supports: { color: true, intensity: true, blend: true },
    _legacy: { border: '3px solid #FF4500', glow: '0 0 12px #FF4500' },
  },
  {
    id: 'glow-violet',
    label: 'Cool Violet',
    pack: 'core',
    kind: 'glow',
    color: '#8A2BE2',
    intensity: 'medium',
    supports: { color: true, intensity: true, blend: true },
    _legacy: { border: '3px solid #8A2BE2', glow: '0 0 12px #8A2BE2' },
  },

  // ----- PREMIUM (mapped from your current file) -----
  {
    id: 'glow-gold',
    label: 'Starlight Gold',
    pack: 'pro',              // premium
    kind: 'glow',
    color: '#FACC15',
    intensity: 'high',
    supports: { color: true, intensity: true, blend: true, animated: true },
    _legacy: { border: '3px solid #FACC15', glow: '0 0 16px #FACC15' },
  },
  {
    id: 'glow-red',
    label: 'Cyber Red',
    pack: 'pro',
    kind: 'glow',
    color: '#FF0055',
    intensity: 'high',
    supports: { color: true, intensity: true, blend: true, animated: true },
    _legacy: { border: '3px solid #FF0055', glow: '0 0 16px #FF0055' },
  },
  {
    id: 'glow-mint',
    label: 'Aurora Mint',
    pack: 'pro',
    kind: 'glow',
    color: '#00FFAA',
    intensity: 'high',
    supports: { color: true, intensity: true, blend: true, animated: true },
    _legacy: { border: '3px solid #00FFAA', glow: '0 0 16px #00FFAA' },
  },
];

export const DEFAULT_GLOBAL_STYLE = {
  variantId: 'glow-gold',     // pick your preferred default; can be 'glow-blue' if you want free default
  color: '#FACC15',
  intensity: 'medium',
  blend: 'normal',            // 'normal' | 'soft' | 'screen'
};

/** Optional tiny helper to resolve a token by id */
export function findGlowToken(id) {
  return GLOW_TOKENS.find(t => t.id === id) || null;
}

/** ========================================
 *  LEGACY EXPORT (kept for compatibility)
 *  ======================================== 
 *  This reproduces your old shape exactly:
 *  {
 *    free: [{ name, class, color, border, glow }, ...],
 *    premium: [...]
 *  }
 */
export const glowOptions = {
  free: GLOW_TOKENS
    .filter(t => t.pack === 'core')
    .map(t => ({
      name: t.label,
      class: t.id,                    // uses the same class/id string
      color: t.color,
      border: t._legacy?.border || `3px solid ${t.color}`,
      glow: t._legacy?.glow || `0 0 12px ${t.color}`,
    })),
  premium: GLOW_TOKENS
    .filter(t => t.pack === 'pro')
    .map(t => ({
      name: t.label,
      class: t.id,
      color: t.color,
      border: t._legacy?.border || `3px solid ${t.color}`,
      glow: t._legacy?.glow || `0 0 16px ${t.color}`,
    })),
};
