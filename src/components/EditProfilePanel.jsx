// src/components/EditProfilePanel.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import supabase from "lib/supabaseClient";
import {
  X, Plus, ArrowUpRight, Search, Upload, Trash2,
  Type, Palette, Crop as CropIcon, Image as ImageIcon, User as UserIcon,
  BookmarkMinus
} from "lucide-react";
import { useUser } from "../context/UserContext";
import TasteCardPicker from "./TasteCardPicker"; // your existing picker
import { fetchActiveScheme } from "../lib/ratingSchemes";
import RatingSchemeView from "./RatingSchemeView.jsx";
import useSaveFeedback from "../hooks/useSaveFeedback"
import { searchStills } from "../lib/stills";
import { toast } from "react-hot-toast";
import AvatarCropper from "./AvatarCropper";
import BannerCropper from "./BannerCropper";
import useEntitlements from "../hooks/useEntitlements";
import {
  computeGridHeight,
  estimateGridRows,
  getPresetByKey,
  GRID_COLUMNS,
  GRID_GAP,
  ROW_HEIGHTS,
} from "./moodboardLayout";
import { PROFILE_THEMES } from "../theme/profileThemes";
import uploadAvatar from "../lib/uploadAvatar";
// --- PREMIUM FLAGS (define early!) ---









/* ─────────────────────────────── Env helpers (Vite + CRA) ─────────────────────────────── */
function _env(k) {
  try { if (typeof import.meta !== "undefined" && import.meta.env && k in import.meta.env) return import.meta.env[k]; } catch {}
  try { if (typeof process !== "undefined" && process.env && k in process.env) return process.env[k]; } catch {}
  return "";
}
function getTmdbCreds() {
  const v4 = (
    _env("VITE_TMDB_V4_READ_TOKEN") ||
    _env("VITE_TMDB_READ_TOKEN") ||
    _env("VITE_APP_TMDB_READ_TOKEN") ||
    _env("REACT_APP_TMDB_READ_TOKEN") ||
    ""
  ).trim();
  const v3 = (
    _env("VITE_TMDB_V3_API_KEY") ||
    _env("VITE_TMDB_API_KEY") ||
    _env("VITE_APP_TMDB_KEY") ||
    _env("REACT_APP_TMDB_API_KEY") ||
    ""
  ).trim();
  const fnBase = (
    _env("VITE_SUPABASE_FUNCTIONS_URL") ||
    _env("REACT_APP_SUPABASE_FUNCTIONS_URL") ||
    ""
  ).trim();
  return { v4, v3, fnBase };
}

/* ───────────────────────────────────── Component ───────────────────────────────────── */
export default function EditProfilePanel({
  open,
  onClose,
  onUpdated,
  profile,
  profileId = null,
  isOwner = false,
  initialCropRequest = null,
  onCropHandled,
}) {

  


  // Lock body scroll + close on Esc
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && handlePanelClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // When panel closes (backdrop or button), also broadcast a request to exit edit mode
  function handlePanelClose() {
    try {
      window.dispatchEvent(
        new CustomEvent("sf:editpanel:close", { detail: { exitEditMode: true } })
      );
    } catch {}
    if (typeof onClose === "function") onClose();
  }

  // Sidebar
  const sections = [
    { id: "profile",  label: "Profile",  icon: UserIcon },
    { id: "avatar",   label: "Avatar",   icon: ImageIcon },
    { id: "banner",   label: "Banner & Gradient", icon: Palette },
    { id: "theme",    label: "Profile Theme", icon: Palette },
    { id: "mood",     label: "Moodboard", icon: Type },
    { id: "watchlist", label: "Watchlist", icon: BookmarkMinus },
  ];
  const [active, setActive] = useState(sections[0].id);
  useEffect(() => { if (open) setActive("profile"); }, [open]);
  const panelRef = useRef(null);
  
// Pull context early so Moodboard can use the same id as view mode
const { user, profile: ctxProfile, saveProfilePatch, refreshProfile } = useUser();
const effectiveProfile = useMemo(() => {
  if (profile?.id && user?.id && profile.id === user.id && ctxProfile) {
    return { ...profile, ...ctxProfile };
  }
  return profile || ctxProfile;
}, [profile, ctxProfile, user?.id]);
const moodProfileId = profileId || effectiveProfile?.id || user?.id || null;
// --- PREMIUM FLAGS (must be inside the component) ---
const { limits } = useEntitlements(); // ✅ safe: inside component

// Decide premium from profile + server entitlements
const plan = String(effectiveProfile?.plan || "").toLowerCase();
const limitsPlan = String(limits?.plan || "").toLowerCase();
const isPremium =
  plan === "directors_cut" ||
  plan === "premium" ||
  effectiveProfile?.is_premium === true ||
  limitsPlan === "directors_cut" ||
  limitsPlan === "premium" ||
  limits?.isPremium === true;

const premiumFlag = !!isPremium;






function getProfileViewPath() {
  if (effectiveProfile?.slug) return `/u/${effectiveProfile.slug}`;
  if (profileId) return `/profile/${profileId}`;
  if (user?.id) return `/profile/${user.id}`;
  return `/myprofile`;
}





  /* ───────────────────────────────── Profile ───────────────────────────────── */
  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [slug, setSlug] = useState(profile?.slug || "");
  const [bio, setBio] = useState(profile?.bio || "");
  useEffect(() => {
    if (!open) return;
    setDisplayName(profile?.display_name || "");
    setSlug(profile?.slug || "");
    setBio(profile?.bio || "");
  }, [open, profile?.display_name, profile?.slug, profile?.bio]);

  /* ───────────────────────────────── Avatar ───────────────────────────────── */
const avatarUrl = profile?.avatar_url || "/default-avatar.svg";
const fileInputRef = useRef(null);
const [showAvatarCropper, setShowAvatarCropper] = useState(false);
const [rawAvatarImage, setRawAvatarImage] = useState(null);
const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) {
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setRawAvatarImage(reader.result);
      setShowAvatarCropper(true);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

/* ───────────────────────────── Banner (+TMDB) ───────────────────────────── */
  
  const [tmdbQuery, setTmdbQuery] = useState("");
  const [tmdbSearching, setTmdbSearching] = useState(false);
  const [themePreset, setThemePreset] = useState(profile?.theme_preset ?? null);
  useEffect(() => {
    if (!open) return;
    // Non-premium users should default to no theme
    if (!isPremium) {
      setThemePreset(null);
      return;
    }
    setThemePreset(profile?.theme_preset ?? null);
  }, [open, profile?.theme_preset, isPremium]);
// Premium Deep Stills
const [deepQ, setDeepQ] = useState("");
const [deepSearching, setDeepSearching] = useState(false);
const [deepTitles, setDeepTitles] = useState([]);       // [{id, kind, title, year, poster, backdrop}]
const [deepPicked, setDeepPicked] = useState(null);     // { id, kind, title }
const [deepLoadingImgs, setDeepLoadingImgs] = useState(false);
  const [deepImages, setDeepImages] = useState([]);       // [{url, w, h, aspect}]

// helper: premium flag from existing limits/isPremium you already compute:
 // or whatever you derived earlier
async function getAccessToken() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || "";
  } catch {
    return "";
  }
}


// ——— Helpers used below ———
function getFnBase() {
  const raw = _env("VITE_SUPABASE_FUNCTIONS_URL") || "";
  return raw.replace(/\/+$/, ""); // strip trailing slash
}
async function authHeader() {
  // uses your getAccessToken() helper you added earlier
  const tok = (await getAccessToken()) || "";
  return { Authorization: `Bearer ${tok}` };
}

// ============== REPLACE YOUR deepSearchTitles WITH THIS ==============
async function deepSearchTitles() {
  if (!premiumFlag) return;
  const q = (deepQ || "").trim();
  if (!q) return;

  setDeepSearching(true);
  setDeepTitles([]);

  const base = getFnBase();
  const url = `${base}/search-titles`;

  // 12s timeout guard
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);

  try {
    const resp = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        ...(await authHeader()),
      },
      body: JSON.stringify({ query: q }),
    });

    // CORS/proxy issues can return non-OK or empty (204). Make it explicit:
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`search-titles failed (${resp.status}): ${txt || "No body"}`);
    }

    const data = await resp.json().catch(() => []);
    const arr = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);

    setDeepTitles(arr);
  } catch (e) {
    console.error("[deep titles] error:", e);
    setDeepTitles([]); // fail safe
  } finally {
    clearTimeout(t);
    setDeepSearching(false);
  }
}

// ============== REPLACE YOUR deepFetchImages WITH THIS ==============
async function deepFetchImages(pick) {
  if (!premiumFlag || !pick?.id || !pick?.kind) return;

  setDeepLoadingImgs(true);
  setDeepImages([]);

  const base = getFnBase();
  const url = `${base}/title-stills`;

  // 15s timeout guard (image lists can be larger)
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);

  try {
    const resp = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        ...(await authHeader()),
      },
      body: JSON.stringify({ id: pick.id, kind: pick.kind }),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`title-stills failed (${resp.status}): ${txt || "No body"}`);
    }

    const data = await resp.json().catch(() => []);
    // Normalize: expect an array of { url, width?, height?, source? }
    const arr = Array.isArray(data) ? data : (Array.isArray(data?.images) ? data.images : []);
    setDeepImages(arr);
  } catch (e) {
    console.error("[deep images] error:", e);
    setDeepImages([]); // fail safe
  } finally {
    clearTimeout(t);
    setDeepLoadingImgs(false);
  }
}


  const savingRef = useRef(false);


  const [tmdbResults, setTmdbResults] = useState([]);
  async function searchTMDB() {
    setTmdbResults([]);
    const q = (tmdbQuery || "").trim();
    if (!q) return;
  
    setTmdbSearching(true);
    try {
      // call your Supabase Edge Function through the helper
      const { data, error } = await searchStills(q);
      if (error) throw error;
  
      // normalize array or { results: [...] }
      const items = Array.isArray(data) ? data : (data?.results || []);
      setTmdbResults(items); // items should expose .backdropUrl / .posterUrl
    } catch (e) {
      console.error("[Banner TMDB search] error:", e);
      setTmdbResults([]);
    } finally {
      setTmdbSearching(false);
    }
  }


 

  

  // Only allow TMDB-hosted images for banners
function applyBanner(url) {
  const u = String(url || "").trim();
  // accept TMDB image hosts only
  const ok = /^https?:\/\/(image\.tmdb\.org|media\.themoviedb\.org)\//i.test(u);
  if (!ok) return; // silently ignore anything else
  setPendingBannerUrl(u);
  onUpdated?.({ banner_url: u });
}


  /* ───────────────────────────────── Moodboard ───────────────────────────────── */
  const [items, setItems] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [mbLoading, setMbLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [replaceIndex, setReplaceIndex] = useState(null);
  const [cropIdx, setCropIdx] = useState(null);
  const [cropSrc, setCropSrc] = useState(null);
  const [cropAspect, setCropAspect] = useState(16 / 9);
  const [expandedOpen, setExpandedOpen] = useState(false);

  const originalRef = useRef([]);
  const bannerSave = useSaveFeedback();   // reserved
  const avatarSave = useSaveFeedback();   // reserved
  const [pendingBannerUrl, setPendingBannerUrl] = useState(null);
  const [bannerFallbackUrl, setBannerFallbackUrl] = useState(null);

  useEffect(() => {
    if (!open || !user?.id) return;
    try {
      const ls = localStorage.getItem(`sf.userBanner:${user.id}`);
      setBannerFallbackUrl(ls || null);
    } catch {
      setBannerFallbackUrl(null);
    }
  }, [open, user?.id]);

  const bannerHasImage = !!(
    pendingBannerUrl ||
    effectiveProfile?.banner_url ||
    effectiveProfile?.banner_image ||
    bannerFallbackUrl
  );
  const activeGradient =
    typeof effectiveProfile?.banner_gradient === "string"
      ? effectiveProfile.banner_gradient
      : "";
  const gradientPresets = [
    { id: "none", label: "None", value: "" },
    {
      id: "golden",
      label: "Golden Hour",
      value: "linear-gradient(135deg, rgba(255,210,128,0.55), rgba(20,10,0,0.15))",
    },
    {
      id: "noir",
      label: "Noir Smoke",
      value: "linear-gradient(135deg, rgba(0,0,0,0.65), rgba(90,90,90,0.2))",
    },
    {
      id: "midnight",
      label: "Midnight Ink",
      value: "linear-gradient(135deg, rgba(14,16,38,0.6), rgba(0,0,0,0.15))",
    },
    {
      id: "ember",
      label: "Ember",
      value: "linear-gradient(135deg, rgba(255,120,70,0.45), rgba(40,10,5,0.25))",
    },
    {
      id: "cobalt",
      label: "Cobalt",
      value: "linear-gradient(135deg, rgba(60,120,255,0.45), rgba(10,15,40,0.35))",
    },
    {
      id: "forest",
      label: "Forest",
      value: "linear-gradient(135deg, rgba(40,140,90,0.45), rgba(5,20,12,0.35))",
    },
    {
      id: "rose",
      label: "Rose Noir",
      value: "linear-gradient(135deg, rgba(210,90,140,0.45), rgba(25,10,20,0.35))",
    },
    {
      id: "slate",
      label: "Slate",
      value: "linear-gradient(135deg, rgba(120,130,140,0.45), rgba(15,20,24,0.35))",
    },
    {
      id: "amber",
      label: "Amber Dust",
      value: "linear-gradient(135deg, rgba(245,190,90,0.45), rgba(20,15,5,0.35))",
    },
  ];

  const handleGradientPick = (value) => {
    const isClear = !value;
    if (!isClear && !bannerHasImage) {
      toast.error("Add a banner image first to use gradients.");
      return;
    }
    if (!isClear && !isPremium) {
      toast.error("Director’s Cut is required for gradients.");
      return;
    }
    onUpdated?.({ banner_gradient: value });
  };
  


  const moodboardCacheKey = moodProfileId ? `sf.moodboard.cache.v1:${moodProfileId}` : null;
  const readMoodboardCache = () => {
    if (!moodboardCacheKey || typeof sessionStorage === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(moodboardCacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.data)) return parsed.data;
    } catch {}
    return null;
  };
  const writeMoodboardCache = (arr) => {
    if (!moodboardCacheKey || typeof sessionStorage === "undefined") return;
    try {
      sessionStorage.setItem(moodboardCacheKey, JSON.stringify({ ts: Date.now(), data: arr }));
    } catch {}
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const cached = readMoodboardCache();
    if (cached) {
      setItems(cached);
      originalRef.current = cached;
      setDirty(false);
      setMbLoading(false);
    }

    (async () => {
      setMbLoading(true);
      try {
        const arr = await loadMoodboardFromSupabase(moodProfileId);
        if (!cancelled) {
          setItems(arr);
          originalRef.current = arr;
          setDirty(false);
        }
      } finally {
        if (!cancelled) setMbLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, moodProfileId]);

  useEffect(() => {
    if (!open) return;
    if (!initialCropRequest || initialCropRequest.index == null) return;
    openCropFor(initialCropRequest.index, initialCropRequest.slot);
    onCropHandled?.();
  }, [initialCropRequest, open, onCropHandled]);

  async function loadMoodboardFromSupabase(pid) {
    if (!pid) {
      const ls = typeof localStorage !== "undefined" ? localStorage.getItem("sf_moodboard_preview") : null;
      return ls ? JSON.parse(ls) : [];
    }
    const { data, error } = await supabase.from("profiles").select("moodboard").eq("id", pid).maybeSingle();
    if (error) return [];
    const arr = Array.isArray(data?.moodboard) ? data.moodboard : [];
    writeMoodboardCache(arr);
    return arr;
  }
  function cleanHex(hex) { const s = String(hex).trim(); return s.startsWith("#") ? s : `#${s}`; }
  function normalizeItem(it) {
    if (!it) return null;
    const validSizes = ["s", "m", "w", "t"];
    const size = validSizes.includes(it.size) ? it.size : "m";
    if (it.type === "image") return { type: "image", url: it.url, source: it.source || "tmdb", title: it.title || "", size };
    if (it.type === "quote") return { type: "quote", text: it.text || "", attribution: it.attribution || "", size };
    if (it.type === "color") return { type: "color", hex: cleanHex(it.hex || "#888888"), size };
    if (it.type === "keyword") return { type: "keyword", text: (it.text || "").slice(0, 24), size };
    return { ...it, size };
  }
  function markDirty(next) {
    setItems(next);
    setDirty(JSON.stringify(next) !== JSON.stringify(originalRef.current));
  }
  function openAddDialog({ replaceAt = null } = {}) { setReplaceIndex(replaceAt); setAdding(true); }
  function closeAddDialog() { setAdding(false); setReplaceIndex(null); }
  function addItem(newItem) {
    const normalized = normalizeItem(newItem);
    const idx = replaceIndex != null ? replaceIndex : items.length;
    const seed = ["w", "t", "m", "s", "m", "s"];
    const seeded = { ...normalized, size: normalized.size || seed[idx % seed.length] || "m" };
    const next = [...items];
    if (replaceIndex != null) next[replaceIndex] = seeded; else next.push(seeded);
    markDirty(next);
    closeAddDialog();
  }

  function handleAddTileRequest() {
    // limits comes from useEntitlements()
    if (replaceIndex == null && items.length >= limits.moodboardTiles) {
      toast((t) => (
        <div className="text-sm">
          You’ve reached the free moodboard limit of 6 tiles.
          <div className="mt-2">
            <a
              href="/premium"
              onClick={() => toast.dismiss(t.id)}
              className="inline-flex items-center justify-center rounded-2xl px-3 py-1.5 font-semibold text-black bg-gradient-to-br from-yellow-400 to-yellow-400 ring-1 ring-yellow-300/60 transition hover:scale-[1.02]"
            >
              Upgrade to Director’s Cut for unlimited tiles
            </a>
          </div>
        </div>
      ), { duration: 6000 });
      return;
    }
    openAddDialog({ replaceAt: null });
  }
  
  function removeAt(i) { markDirty(items.filter((_, idx) => idx !== i)); }
  function openCropFor(idx, slot) {
    const it = items[idx];
    if (!it || it.type !== "image" || !it.url) return;
    const aspect = slot?.aspect || 1.35;
    setCropAspect(aspect);
    setCropIdx(idx);
    setCropSrc(it.url);
  }
  async function handleCropComplete(croppedDataUrl) {
    const idx = cropIdx; setCropIdx(null); setCropSrc(null);
    if (idx == null || !croppedDataUrl) return;
    try {
      const blob = dataURLtoBlob(croppedDataUrl);
      const file = new File([blob], `mood_${Date.now()}.jpg`, { type: blob.type || "image/jpeg" });
      const path = `user_${moodProfileId || "anon"}/${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from("moodboards").upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const publicUrl = supabase.storage.from("moodboards").getPublicUrl(path).data.publicUrl;
      const next = items.map((it, i) => (i === idx ? { ...it, url: publicUrl } : it));
      markDirty(next);
    } catch {}
  }
  async function saveMoodboard() {
    await moodSave.withFeedback(async () => {
      try {
        if (!dirty) return;
  
        // 🔎 quick visibility before calling Supabase
        console.log("[MB] moodProfileId:", moodProfileId);
        console.log("[MB] items length:", Array.isArray(items) ? items.length : "not array");
        console.log("[MB] first item sample:", items?.[0]);
  
        if (moodProfileId) {
          const payload = Array.isArray(items) ? items : [];
          const { data, error, status } = await supabase
            .from("profiles")
            .update({ moodboard: payload })
            .eq("id", moodProfileId)
            .select("id, moodboard")         // ask Supabase to return the row so we know it worked
            .maybeSingle();
  
          if (error) {
            console.error("[MB] Supabase update error:", {
              status,
              message: error.message,
              details: error.details,
              hint: error.hint,
              code: error.code,
            });
            throw error;
          }
  
          console.log("[MB] update ok; returned id:", data?.id);
        } else if (typeof localStorage !== "undefined") {
          localStorage.setItem("sf_moodboard_preview", JSON.stringify(items));
          console.log("[MB] saved to localStorage (no moodProfileId)");
        }
  
        originalRef.current = items;
        setDirty(false);
  
        // Notify view-mode to refresh (your Moodboard.jsx can listen for this)
        
      } catch (e) {
        console.error("saveMoodboard failed:", e);
        // show the exact message from Supabase if we have it
        const msg = e?.message || e?.error_description || "Couldn’t save moodboard. Please try again.";
        toast.error(msg);
        throw e; // keep the console stack
      }
    });
  }

  useEffect(() => {
    let isCancelled = false;
    let retryTimer;
  
    const loadTasteCards = async () => {
      const { data: auth } = await supabase.auth.getSession();
      const sessionUserId = auth?.session?.user?.id || null;
      const resolvedUserId = user?.id || sessionUserId;
      if (!resolvedUserId) {
        retryTimer = setTimeout(loadTasteCards, 500);
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("taste_cards")
        .eq("id", resolvedUserId)
        .maybeSingle();
  
      if (error) {
        console.error("[taste_cards] load error:", error);
        return;
      }
      if (!isCancelled) {
        setTasteCards(Array.isArray(data?.taste_cards) ? data.taste_cards : []);
      }
    };
  
    loadTasteCards();
    return () => {
      isCancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [user?.id]);
  
  
  
  

// notify public view to refetch moodboard


   
  const PREVIEW_LIMIT = 6;
  const preview = useMemo(() => items.slice(0, PREVIEW_LIMIT), [items]);
  const previewRows = estimateGridRows(preview);
  const previewHeight = computeGridHeight(previewRows, ROW_HEIGHTS.compact);

  function dataURLtoBlob(dataUrl) {
    const arr = dataUrl.split(",");
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]); let n = bstr.length; const u8 = new Uint8Array(n);
    while (n--) u8[n] = bstr.charCodeAt(n);
    return new Blob([u8], { type: mime });
  }

  /* ───────────────────────────────── Watchlist (SYNCED) ───────────────────────────────── */
  const [wlLoading, setWlLoading] = useState(false);
  const [wlItems, setWlItems]   = useState([]);
  const [wlError, setWlError]   = useState("");
  const [wlQuery, setWlQuery]   = useState("");
  const [wlSelected, setWlSelected] = useState(new Set());

  function normalizeWl(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.map(r => ({
      id: r.id,
      tmdb_id: r.movie_id,
      title: r.title || "Untitled",
      poster_path: r.poster_path || null,
    }));
  }
  function posterUrl(row) {
    if (!row?.poster_path) return null;
    return /^https?:\/\//.test(row.poster_path)
      ? row.poster_path
      : `https://image.tmdb.org/t/p/w342${row.poster_path}`;
  }
  const wlFiltered = useMemo(() => {
    const q = wlQuery.trim().toLowerCase();
    if (!q) return wlItems;
    return wlItems.filter(r => (r.title || "").toLowerCase().includes(q));
  }, [wlItems, wlQuery]);

  async function fetchWatchlist() {
    if (!profileId || !user?.id) return;
    setWlLoading(true);
    setWlError("");
    try {
      const { data, error } = await supabase
        .from("user_watchlist")
        .select("id, user_id, movie_id, title, poster_path")
        .eq("user_id", profileId)
        .order("id", { ascending: false });

      if (error) {
        setWlError(error.message || "Failed to load watchlist.");
        setWlItems([]);
      } else {
        setWlItems(normalizeWl(data));
      }
    } catch (e) {
      console.error("Watchlist fetch exception:", e);
      setWlError("Network error loading watchlist.");
      setWlItems([]);
    } finally {
      setWlLoading(false);
    }
  }
  function toggleWlSelect(id) {
    setWlSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  async function wlRemoveOne(item) {

    if (!profileId || !user?.id) return;

    if (!item?.id) return;
    try {
      const { error } = await supabase
        .from("user_watchlist")
        .delete()
        .eq("id", item.id)
        .eq("user_id", profileId);
      if (error) throw error;
      setWlItems(prev => prev.filter(r => r.id !== item.id));
      setWlSelected(prev => { const s = new Set(prev); s.delete(item.id); return s; });
    } catch (e) {
      console.error(e);
      setWlError("Couldn’t remove item.");
    }
  }
  async function wlRemoveSelected() {
    if (!profileId || !user?.id) return;

    const ids = Array.from(wlSelected);
    if (ids.length === 0) return;
    try {
      const { error } = await supabase
        .from("user_watchlist")
        .delete()
        .in("id", ids)
        .eq("user_id", profileId);
      if (error) throw error;
      setWlItems(prev => prev.filter(r => !wlSelected.has(r.id)));
      setWlSelected(new Set());
    } catch (e) {
      console.error(e);
      setWlError("Couldn’t remove selected items.");
    }
  }
  useEffect(() => {
    if (open && active === "watchlist") fetchWatchlist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active, profileId]);

  /* ───────────────────────────────────── Render ───────────────────────────────────── */
  



  const [tasteCards, setTasteCards] = useState(() =>
    Array.isArray(effectiveProfile?.taste_cards)
      ? effectiveProfile.taste_cards.slice(0, 4)
      : []
  );




  useEffect(() => {
    const arr = Array.isArray(effectiveProfile?.taste_cards)
      ? effectiveProfile.taste_cards
      : [];
    setTasteCards(arr.slice(0, 4));
  }, [effectiveProfile?.taste_cards]);


  const basicsSave = useSaveFeedback();
  const moodSave   = useSaveFeedback();

  const [useGlowStyle, setUseGlowStyle] = useState(true);

   // premium plan detection (adjust flags to your app)
   const glowPlan =
     (effectiveProfile?.plan === "directors_cut" || effectiveProfile?.is_premium)
       ? "directors_cut"
       : "free";

// store a single global glow class (e.g., "glow-blue")
const [globalGlow, setGlobalGlow] = useState(
effectiveProfile?.taste_card_style_global || "glow-blue"
);



// keep in sync when the panel opens or profile changes
useEffect(() => {
if (!open) return;
setGlobalGlow(effectiveProfile?.taste_card_style_global || "glow-blue");
}, [open, effectiveProfile?.taste_card_style_global]);


  // SINGLE definition: saveProfileBasics (feedback-wrapped)
  async function saveProfileBasics() {
    await basicsSave.withFeedback(async () => {
      const patch = {};
      if (displayName !== profile?.display_name) patch.display_name = displayName.trim();
      if (slug !== profile?.slug) patch.slug = slug.trim();
      if (bio !== profile?.bio) patch.bio = bio;
      if (Object.keys(patch).length) {
        await onUpdated?.(patch);
      }
    });
  }

  function normalizeCards(cards = [], { isPremium, globalGlow, effectiveProfile }) {
    const limit = isPremium ? 8 : 4; // single source of truth for this helper
    const next = (Array.isArray(cards) ? cards : []).slice(0, limit);
  
    // derive global for free plan if not set
    let derivedGlobal = effectiveProfile?.taste_card_style_global || null;
    const first = next[0];
    const firstColor = first?.style
      ? (first.style.mode === "glow" ? first.style.glow : first.style.outline)
      : null;
    if (!isPremium && firstColor) derivedGlobal = firstColor;
  
    const normalized = next.map((c) => {
      if (!isPremium) {
        const color = derivedGlobal || "#facc15";
        return {
          ...c,
          source: c.source === "custom" ? "preset" : (c.source || "preset"),
          style: { mode: "glow", glow: color, outline: color },
        };
      }
      const style = c?.style || {};
      const hex = style.glow || style.outline || globalGlow || "#FACC15";
      return {
        id: c.id,
        source: c.source || "preset",
        presetId: c.presetId,
        question: c.question || "",
        answer: c.answer || "",
        style: {
          mode: style.mode === "outline" ? "outline" : "glow",
          glow: hex,
          outline: hex,
        },
      };
    });
  
    return { normalized, derivedGlobal };
  }
  
  
  
  
  
  

  
// ✅ All-in-one saver (saves basics, banner, taste cards, moodboard)
// ✅ All-in-one saver (saves basics, banner, taste cards, moodboard)
// ✅ All-in-one saver (basics, banner/theme, taste cards, moodboard)

function emitTasteCardsUpdated(cards) {
  try {
    window.dispatchEvent(new CustomEvent("sf:tastecards:updated", { detail: { cards } }));
  } catch {}
}
const allSave = useSaveFeedback();

async function handleSaveAll() {
  if (savingRef.current) return;        // ✅ re-entry guard
  savingRef.current = true;

  try {
    await allSave.withFeedback(async () => {
      const patch = {};
      let didUpdate = false;

      // --- basics ---
      if ((displayName || "") !== (profile?.display_name || "")) {
        patch.display_name = (displayName || "").trim();
      }
      if ((slug || "") !== (profile?.slug || "")) {
        patch.slug = (slug || "").trim();
      }
      if ((bio || "") !== (profile?.bio || "")) {
        patch.bio = bio || "";
      }

      // --- theme (allow null to mean default) ---
      const prevTheme = profile?.theme_preset ?? null;
      // Non-premium users cannot set a theme; force null
      const nextTheme = isPremium ? (themePreset ?? null) : null;
      if (nextTheme !== prevTheme) {
        patch.theme_preset = nextTheme;
      }

      // --- banner (we removed free-text URL support already) ---
      // (No bannerInput writes here)

      // --- global glow ---
      const currentGlobalGlow = effectiveProfile?.taste_card_style_global || null;
      if (globalGlow && currentGlobalGlow !== globalGlow) {
        patch.taste_card_style_global = globalGlow;
      }

      // --- write once (if needed) ---
      if (Object.keys(patch).length) {
        await onUpdated?.(patch);
        didUpdate = true;
      }

      // --- taste cards (plan-aware) ---
      const limit = isPremium ? 8 : 4;
      const nextTC = (Array.isArray(tasteCards) ? tasteCards : []).slice(0, limit);
      const normalizedTC = nextTC.map((c) => {
        const style = c?.style || {};
        const hex = style.glow || style.outline || globalGlow || "#FACC15";
        return {
          id: c.id,
          source: isPremium ? (c.source || "preset") : "preset",
          presetId: c.presetId,
          question: c.question,
          answer: c.answer,
          style: {
            mode: style.mode === "outline" ? "outline" : "glow",
            glow: hex,
            outline: hex,
          },
        };
      });

      const currentTC = Array.isArray(effectiveProfile?.taste_cards)
        ? effectiveProfile.taste_cards.slice(0, limit)
        : [];

      if (JSON.stringify(normalizedTC) !== JSON.stringify(currentTC)) {
        await saveProfilePatch({ taste_cards: normalizedTC });
        try {
          window.dispatchEvent(
            new CustomEvent("sf:tastecards:updated", { detail: { cards: normalizedTC } })
          );
        } catch {}
        didUpdate = true;
      }

      // --- moodboard only if dirty ---
      if (dirty) {
        if (moodProfileId) {
          await supabase.from("profiles").update({ moodboard: items }).eq("id", moodProfileId);
        } else if (typeof localStorage !== "undefined") {
          localStorage.setItem("sf_moodboard_preview", JSON.stringify(items));
        }
        originalRef.current = items;

        try {
          window.dispatchEvent(
            new CustomEvent("sf:moodboard:updated", { detail: { profileId: moodProfileId } })
          );
        } catch {}
        didUpdate = true;
      }

      if (didUpdate) {
        const refreshed = await refreshProfile?.();
        if (refreshed) toast.success("Profile updated");
      }
    });

    // announce + close once
    try {
      window.dispatchEvent(
        new CustomEvent("sf:profile:saved", {
          detail: { profileId: moodProfileId || user?.id || null },
        })
      );
    } catch {}

    handlePanelClose();
  } finally {
    savingRef.current = false;
  }
}




  return (
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handlePanelClose} />
      {/* Right slide-out */}
      <div
        ref={panelRef}
        className="absolute right-0 top-0 h-full w-full sm:w-[860px] bg-zinc-950 border-l border-zinc-800 shadow-2xl flex"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <aside className="hidden sm:block w-56 border-r border-zinc-800 p-4">
          <h3 className="mb-3 text-sm font-semibold text-zinc-200">Edit</h3>
          <nav className="space-y-1">
            {sections.map((s) => {
              const Icon = s.icon;
              const activeCls = active === s.id ? "bg-zinc-800 text-white" : "hover:bg-zinc-900 text-zinc-300";
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActive(s.id)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm inline-flex items-center gap-2 ${activeCls}`}
                >
                  <Icon className="h-4 w-4" />
                  {s.label}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main */}
        <div className="flex-1 overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/95 px-3 py-2 sm:px-4 sm:py-3">
            <h2 className="text-sm sm:text-base font-semibold text-white">Edit Profile</h2>
            <button
              type="button"
              onClick={handlePanelClose}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-1 text-xs sm:text-sm text-white hover:bg-zinc-900"
            >
              <X className="h-4 w-4" />
              Close
            </button>
          </div>

          {/* Sections */}
          <div className="p-3 sm:p-4 space-y-6 sm:space-y-8">
            {/* PROFILE */}
            {active === "profile" && (
              <section>
                <h3 className="mb-3 text-sm font-semibold text-zinc-300">Profile</h3>
                <div className="grid gap-3">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Display name</label>
                    <input
                      className="w-full rounded-md border border-zinc-700 bg-black/40 p-2 text-sm text-white outline-none"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Username (slug)</label>
                    <input
                      className="w-full rounded-md border border-zinc-700 bg-black/40 p-2 text-sm text-white outline-none"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      placeholder="username"
                    />
                    <p className="mt-1 text-[11px] text-zinc-500">You can change your username once every 90 days.</p>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Bio</label>
                    <textarea
                      rows={3}
                      className="w-full rounded-md border border-zinc-700 bg-black/40 p-2 text-sm text-white outline-none"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Tell people a little about you…"
                    />
                  </div>
                </div>

                
              </section>
            )}

            {/* AVATAR */}
            {active === "avatar" && (
              <section>
                <h3 className="mb-3 text-sm font-semibold text-zinc-300">Avatar</h3>
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full border border-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]" />
                    <img
                      src={avatarUrl}
                      alt="Current avatar"
                      className="h-20 w-20 rounded-full object-cover relative z-10"
                      onError={(e) => { e.currentTarget.src = "/default-avatar.svg"; }}
                    />
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-white hover:bg-zinc-900"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                  >
                    <Upload className="h-4 w-4" />
                    Upload new
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-white hover:bg-zinc-900 disabled:opacity-60"
                    onClick={async () => {
                      if (!avatarUrl || avatarUrl.endsWith("default-avatar.svg")) return;
                      try {
                        const res = await fetch(avatarUrl);
                        const blob = await res.blob();
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          setRawAvatarImage(reader.result);
                          setShowAvatarCropper(true);
                        };
                        reader.readAsDataURL(blob);
                      } catch (e) {
                        toast.error("Couldn't load avatar to crop.");
                      }
                    }}
                    disabled={!profile?.avatar_url || uploadingAvatar}
                  >
                    <CropIcon className="h-4 w-4" />
                    Crop / Adjust
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-red-500/10 hover:border-red-400"
                    onClick={async () => {
                      try {
                        const { error } = await supabase
                          .from("profiles")
                          .update({ avatar_url: null })
                          .eq("id", profileId);
                        if (error) throw error;
                        onUpdated?.({ avatar_url: null });
                        toast.success("Avatar removed");
                      } catch (e) {
                        console.warn("remove avatar failed", e?.message || e);
                        toast.error("Couldn't remove avatar");
                      }
                    }}
                    disabled={!profile?.avatar_url}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove avatar
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                </div>
              </section>
            )}

           {/* BANNER */}
{active === "banner" && (
  <section>
    <h3 className="mb-3 text-sm font-semibold text-zinc-300">Banner</h3>

    <div className="space-y-3">
      <label className="block text-xs text-zinc-400">Find a film still (TMDB)</label>

      <div className="flex gap-2">
        <input
          className="flex-1 rounded-md border border-zinc-700 bg-black/40 p-2 text-sm text-white outline-none"
          placeholder="Search films…"
          value={tmdbQuery}
          onChange={(e) => setTmdbQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              searchTMDB();
            }
          }}
        />
        <button
          type="button"
          onClick={searchTMDB}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-white hover:bg-zinc-900"
          title="Search"
        >
          <Search className="h-4 w-4" />
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto pr-1">
        <div className="grid grid-cols-3 gap-2">
          {tmdbSearching ? (
            <div className="col-span-3 h-24 animate-pulse rounded-md bg-zinc-900" />
          ) : (
            tmdbResults.map((m) => {
              const poster = m?.backdropUrl || m?.posterUrl || "";
              if (!poster) return null;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => applyBanner(poster)}
                  className="aspect-[2/3] overflow-hidden rounded-md border border-zinc-800 hover:ring-2 hover:ring-yellow-500 transition"
                  title="Use this image"
                >
                  <img
                    src={poster}
                    alt="TMDB result"
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              Banner gradients
            </div>
            <div className="text-sm text-zinc-300">
              Director’s Cut only. Applies to your banner image.
            </div>
          </div>
          {!isPremium && (
            <a
              href="/premium"
              className="text-xs text-yellow-400 hover:underline"
            >
              Go Premium
            </a>
          )}
        </div>

        {!bannerHasImage && (
          <div className="mt-2 text-xs text-zinc-500">
            Add a banner image to enable gradients.
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2">
          {gradientPresets.map((g) => {
            const isActive = activeGradient === g.value;
            const isDisabled = (!isPremium && g.id !== "none") || (!bannerHasImage && g.id !== "none");
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => handleGradientPick(g.value)}
                disabled={isDisabled}
                className={[
                  "relative h-16 rounded-lg border transition overflow-hidden",
                  isActive ? "border-yellow-400 ring-1 ring-yellow-400/50" : "border-zinc-800",
                  isDisabled ? "opacity-50 cursor-not-allowed" : "hover:border-yellow-400",
                ].join(" ")}
                title={g.label}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    background: g.value || "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(0,0,0,0.4))",
                  }}
                />
                <div className="absolute inset-0 flex items-end p-2 text-[10px] text-white/80">
                  {g.label}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  </section>
)}

{active === "theme" && (
  <section>
    <h3 className="mb-3 text-sm font-semibold text-zinc-300">Profile Theme</h3>

    {/* top controls */}
    <div className="mb-3 flex items-center justify-between">
      <p className="text-xs text-zinc-500">
        {isPremium
          ? "Pick any theme below, or use the default look."
          : "Director’s Cut required to unlock themes. You can still use the default look."}
      </p>

      {/* ✅ Always enabled: clears theme to NULL */}
      <button
        type="button"
        onClick={() => {
          setThemePreset(null);      // ✅ local only; Save button will persist
        }}
        
        className={[
          "rounded-md px-3 py-1.5 text-sm font-medium transition border",
          themePreset == null
            ? "border-yellow-500 text-yellow-400"
            : "border-zinc-700 text-white hover:bg-zinc-900"
        ].join(" ")}
        title="Use default (no theme)"
      >
        Use default look
      </button>
    </div>

    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {PROFILE_THEMES.map((t) => {
        // ⛔️ LOCK all themes for free users (including “Classic”)
        const locked = !isPremium;
        const isActive = themePreset === t.id;

        return (
          <button
            key={t.id}
            type="button"
            disabled={locked}
            onClick={() => {
              if (locked) return;
              setThemePreset(t.id);      // ✅ local only; Save button will persist
            }}
            
            className={[
              "rounded-md border px-3 py-2 text-left transition relative",
              isActive
                ? "border-yellow-500 ring-1 ring-yellow-500/40"
                : "border-zinc-800 hover:bg-zinc-900",
              locked ? "opacity-50 cursor-not-allowed" : ""
            ].join(" ")}
            title={locked ? "Director’s Cut required" : "Select theme"}
          >
            {/* lock badge */}
            {locked && (
              <span className="absolute right-2 top-2 text-[10px] bg-white/10 px-2 py-[2px] rounded">
                Locked
              </span>
            )}

            <div className="text-sm font-medium text-white">{t.name}</div>
            <div className="mt-2 h-6 w-full rounded" style={t.vars} />
            <div className="mt-2 text-[11px] text-zinc-400">Director’s Cut</div>
          </button>
        );
      })}
    </div>
  </section>
)}




            {/* MOODBOARD (compact) */}
            {active === "mood" && (
  <section>
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-sm font-semibold text-zinc-300">Moodboard</h3>
      <p className="text-xs text-zinc-500">
        The moodboard can now be edited directly from your profile page.
      </p>
    </div>

    <div
      className="relative overflow-hidden rounded-xl border border-zinc-800 bg-black/30"
      style={{ width: "100%", maxWidth: 720, height: previewHeight }}
    >
      {mbLoading ? (
        <div className="h-full w-full animate-pulse bg-zinc-900" />
      ) : items.length > 0 ? (
        <CollageGrid items={preview} rowHeight={ROW_HEIGHTS.compact} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
          No moodboard items yet. Add some from your profile page.
        </div>
      )}
    </div>
  </section>
)}

            

           {/* TASTE CARDS (single, de-duplicated) */}
<div className="mt-6 rounded-2xl border border-zinc-800 bg-black/40 p-4">
<div className="mb-3 flex items-center justify-between">
  <h3 className="text-lg font-semibold text-white">Taste Cards</h3>
  {/* Changes are staged; use the sticky Save at the bottom */}
</div>


  {/* Custom Taste Cards Picker */}
  <TasteCardPicker
  selected={tasteCards}
  setSelected={setTasteCards}
  maxSelected={isPremium ? 8 : 4}
  isPremium={isPremium}
/>


</div>


            {/* WATCHLIST */}
            {active === "watchlist" && (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-300">Watchlist</h3>
                  <div className="flex items-center gap-2">
                    <input
                      className="w-48 rounded-md border border-zinc-700 bg-black/40 p-2 text-sm text-white outline-none"
                      placeholder="Filter by title…"
                      value={wlQuery}
                      onChange={(e) => setWlQuery(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={fetchWatchlist}
                      className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-white hover:bg-zinc-900"
                      disabled={wlLoading}
                    >
                      {wlLoading ? "Refreshing…" : "Refresh"}
                    </button>
                    <button
                      type="button"
                      onClick={wlRemoveSelected}
                      className="rounded-md border border-red-700 px-3 py-1.5 text-sm text-red-200 hover:bg-red-900/20 disabled:opacity-50"
                      disabled={wlSelected.size === 0}
                    >
                      Remove selected
                    </button>
                  </div>
                </div>

                {wlError ? <p className="mb-3 text-sm text-red-400">{wlError}</p> : null}

                {wlLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-36 rounded-md border border-zinc-800 bg-zinc-900 animate-pulse" />
                    ))}
                  </div>
                ) : wlFiltered.length === 0 ? (
                  <div className="rounded-md border border-zinc-800 p-4 text-sm text-zinc-300 bg-white/5">
                    <p>
                      Your watchlist is empty. To add films, head to the{" "}
                      <Link to="/movies" className="text-yellow-400 hover:underline">
                        Movies
                      </Link>{" "}
                      page, search for a title, and tap{" "}
                      <span className="text-white font-medium">Add to Watchlist</span>. Your picks
                      will appear here automatically.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
                    {wlFiltered.map((item) => {
                      const selected = wlSelected.has(item.id);
                      return (
                        <div
                          key={item.id}
                          className={`group relative overflow-hidden rounded-md border ${selected ? "border-yellow-500" : "border-zinc-800"} bg-black/30`}
                        >
                          <button
                            type="button"
                            onClick={() => toggleWlSelect(item.id)}
                            className="absolute left-2 top-2 z-10 rounded bg-black/70 px-2 py-1 text-[11px] text-white hover:bg-black/90"
                          >
                            {selected ? "Selected" : "Select"}
                          </button>

                          {item.poster_url ? (
                            <img
                              src={item.poster_url}
                              alt={item.title || "watchlist item"}
                              className="h-48 w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-48 w-full grid place-items-center text-xs text-zinc-500">
                              No image
                            </div>
                          )}

                          <div className="p-2">
                            <p className="line-clamp-2 text-xs text-zinc-200">
                              {item.title || "Untitled"}
                            </p>
                          </div>

                          <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition">
                            <button
                              type="button"
                              onClick={() => wlRemoveOne(item)}
                              className="rounded-md bg-black/70 px-2 py-1 text-xs text-white hover:bg-black/90 border border-zinc-700"
                              title="Remove from watchlist"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                             </section>
            )}

          </div> {/* end .p-4.space-y-8 */}

          {/* Taste Cards Save Reminder */}
<div className="px-3 sm:px-4 py-3 border-t border-zinc-800 bg-black/50">
  <p className="text-[11px] sm:text-xs text-zinc-400 leading-snug">
    💡 Tip: After editing your <span className="text-yellow-400 font-medium">Taste Cards</span>, 
    press <span className="text-white font-semibold">Save</span> in that section first, 
    then use the final <span className="text-yellow-400 font-medium">Save changes</span> button below 
    to confirm everything.
  </p>
</div>


          {/* Sticky bottom save bar */}
          <div className="sticky bottom-0 z-10 border-t border-zinc-800 bg-zinc-950/95 px-3 py-2 sm:px-4 sm:py-3">
            <div className="flex items-center justify-between gap-2 sm:gap-4">
              <div className="text-xs sm:text-sm">
                {allSave.success ? (
                  <span className="text-emerald-400">All changes saved!</span>
                ) : (
                  <span className="text-zinc-400">Review your edits, then save.</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePanelClose}
                  className="rounded-lg border border-zinc-700 px-3 py-1 text-xs sm:text-sm text-white hover:bg-zinc-900"
                >
                  Cancel
                </button>
                <button
  type="button"
  onClick={handleSaveAll}
  disabled={allSave.saving || savingRef.current}
  aria-busy={(allSave.saving || savingRef.current) ? "true" : "false"}
  className={[
    "rounded-lg px-3 py-1 text-xs sm:text-sm font-semibold",
    (allSave.saving || savingRef.current)
      ? "bg-yellow-500/70 text-black cursor-wait pointer-events-none"
      : "bg-yellow-500 text-black hover:bg-yellow-400"
  ].join(" ")}
>
  {(allSave.saving || savingRef.current) ? "Saving…" : "Save changes"}
</button>
                
              </div>
            </div>
          </div>
        </div> {/* end .flex-1 */}
      </div>   {/* end right panel */}

      {/* Avatar cropper modal */}
      {showAvatarCropper && rawAvatarImage && (
        <AvatarCropper
          imageSrc={rawAvatarImage}
          variant="avatar"
          onCancel={() => {
            setShowAvatarCropper(false);
            setRawAvatarImage(null);
          }}
          onCropComplete={async (blob) => {
            try {
              setUploadingAvatar(true);
              const publicUrl = await uploadAvatar(blob, user.id, {
                prevUrl: profile?.avatar_url || null,
              });
              onUpdated?.({ avatar_url: publicUrl });
              toast.success("Avatar updated");
            } catch (err) {
              console.error("Avatar upload failed:", err);
              toast.error(err?.message || "Could not upload avatar.");
            } finally {
              setUploadingAvatar(false);
              setShowAvatarCropper(false);
              setRawAvatarImage(null);
            }
          }}
        />
      )}
    </div>     
  );
}

/* ================== Moodboard helpers ================== */
function CollageGrid({ items = [], rowHeight = ROW_HEIGHTS.compact }) {
  if (!items.length) return null;
  return (
    <div
      className="grid h-full"
      style={{
        gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
        gridAutoRows: `${rowHeight}px`,
        gap: `${GRID_GAP}px`,
        width: "100%",
        height: "100%",
        gridAutoFlow: "dense",
      }}
    >
      {items.map((item, index) => {
        const sizeInfo = getPresetByKey(item.size);
        const radius = sizeInfo.rows > 1 ? "26px" : "20px";
        return (
          <div
            key={`collage-${index}`}
            style={{
              gridColumn: `span ${sizeInfo.cols}`,
              gridRow: `span ${sizeInfo.rows}`,
              borderRadius: radius,
              overflow: "hidden",
              position: "relative",
              backgroundColor: "rgba(0,0,0,0.02)",
              border: "1px solid rgba(255,255,255,0.04)",
            }}
          >
            {item.type === "image" ? (
              <img
                src={item.url}
                alt={item.title || "Moodboard image"}
                className="h-full w-full object-contain bg-black"
                loading="lazy"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-center px-3">
                {item.type === "quote" && (
                  <blockquote className="text-xs tracking-tight text-zinc-100">
                    “{item.text}”
                    {item.attribution && (
                      <span className="mt-1 block text-[10px] not-italic text-zinc-300">
                        — {item.attribution}
                      </span>
                    )}
                  </blockquote>
                )}
                {item.type === "color" && (
                  <div
                    className="h-full w-full"
                    style={{ backgroundColor: item.hex || "#888888" }}
                  />
                )}
                {item.type === "keyword" && (
                  <span className="rounded-full bg-black/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                    {item.text}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
/* ---------------- Add/Replace Dialog (Moodboard) ---------------- */
function AddReplaceDialog({ onCancel, onConfirm, initialType = "image" }) {
  const [tab, setTab] = useState(initialType);

  // Quote / Color / Keyword
  const [qText, setQText] = useState("");
  const [qAttr, setQAttr] = useState("");
  const [hex, setHex] = useState("#86efac");
  const [kw, setKw] = useState("");

  // TMDB search via backend proxy (/tmdb-search edge function)
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [tmdbErr, setTmdbErr] = useState("");
  const [tasteCards, setTasteCards] = useState([]);

  async function searchTMDBLocal() {
    setTmdbErr("");
    setResults([]);
    const text = q.trim();
    if (!text) return;
    setSearching(true);
    try {
      const { data, error } = await searchStills(text);
      if (error) throw error;
      const items = Array.isArray(data) ? data : (data?.results || []);
      setResults(items);
    } catch (e) {
      console.error("[AddReplace TMDB search] error:", e);
      setTmdbErr("Couldn’t load results.");
    } finally {
      setSearching(false);
    }
  }
  

  function handleConfirm() {
    if (tab === "quote" && qText.trim()) {
      onConfirm({ type: "quote", text: qText.trim(), attribution: qAttr.trim() });
      onCancel();
      return;
    }
    if (tab === "color" && hex.trim()) {
      onConfirm({ type: "color", hex: hex.trim() });
      onCancel();
      return;
    }
    if (tab === "keyword" && kw.trim()) {
      onConfirm({ type: "keyword", text: kw.trim() });
      onCancel();
      return;
    }
    // Image: handled on clicking a TMDB result
    onCancel();
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            <button type="button" onClick={() => setTab("image")} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${tab === "image" ? "bg-zinc-800 text-white" : "hover:bg-zinc-900"}`}><Upload className="h-4 w-4" />Image</button>
            <button type="button" onClick={() => setTab("quote")} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${tab === "quote" ? "bg-zinc-800 text-white" : "hover:bg-zinc-900"}`}><Type className="h-4 w-4" />Quote</button>
            <button type="button" onClick={() => setTab("color")} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${tab === "color" ? "bg-zinc-800 text-white" : "hover:bg-zinc-900"}`}><Palette className="h-4 w-4" />Color</button>
            <button type="button" onClick={() => setTab("keyword")} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${tab === "keyword" ? "bg-zinc-800 text-white" : "hover:bg-zinc-900"}`}><Search className="h-4 w-4" />Keyword</button>
          </div>
          <button type="button" onClick={onCancel} className="rounded-md border border-zinc-700 px-2 py-1 text-sm text-white hover:bg-zinc-900">Cancel</button>
        </div>

        <div className="p-4">
          {tab === "image" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3">
                <div className="text-xs text-zinc-500">
                  Add images via TMDB search below. Expanded TMDB image sets are coming soon!
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-sm text-zinc-300">TMDB Search</label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-lg border border-zinc-700 bg-black/40 p-2 text-sm text-white outline-none"
                    placeholder="Search films…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={searchTMDBLocal}
                    className="rounded-lg border border-zinc-700 px-3 text-sm text-white hover:bg-zinc-900"
                    title="Search"
                  >
                    <Search className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {searching ? (
                    <div className="col-span-3 h-24 animate-pulse rounded-md bg-zinc-900" />
                  ) : (
                    results.map((m) => {
                      const poster = m?.backdropUrl || m?.posterUrl || "";
                      if (!poster) return null;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            onConfirm({
                              type: "image",
                              url: poster,
                              title: m.title || m.name || "",
                              source: "tmdb",
                            });
                            onCancel(); // close after picking
                          }}
                          className="aspect-[2/3] overflow-hidden rounded-md border border-zinc-800 hover:ring-2 hover:ring-yellow-500"
                          title="Use this image"
                        >
                          <img
                            src={poster}
                            alt="TMDB result"
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        </button>
                      );
                    })
                  )}
                </div>

                {tmdbErr ? <p className="mt-2 text-xs text-red-400">{tmdbErr}</p> : null}
              </div>
            </div>
          )}

          {tab === "quote" && (
            <div className="grid gap-4">
              <div>
                <label className="block text-sm text-zinc-300">Quote</label>
                <textarea
                  rows={3}
                  className="w-full rounded-lg border border-zinc-700 bg-black/40 p-2 text-sm text-white outline-none"
                  placeholder="“Cinema is a matter of what's in the frame and what's out.”"
                  value={qText}
                  onChange={(e) => setQText(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-300">Attribution (optional)</label>
                <input
                  className="w-full rounded-lg border border-zinc-700 bg-black/40 p-2 text-sm text-white outline-none"
                  placeholder="Martin Scorsese"
                  value={qAttr}
                  onChange={(e) => setQAttr(e.target.value)}
                />
              </div>
            </div>
          )}

          {tab === "color" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm text-zinc-300">Hex</label>
                <input
                  className="w-full rounded-lg border border-zinc-700 bg-black/40 p-2 text-sm text-white outline-none"
                  placeholder="#FACC15"
                  value={hex}
                  onChange={(e) => setHex(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-center">
                <div
                  className="h-20 w-32 rounded-lg border border-zinc-700"
                  style={{ backgroundColor: hex || "#888888" }}
                />
              </div>
            </div>
          )}

          {tab === "keyword" && (
            <div className="grid gap-4">
              <div>
                <label className="block text-sm text-zinc-300">Keyword</label>
                <input
                  className="w-full rounded-lg border border-zinc-700 bg-black/40 p-2 text-sm text-white outline-none"
                  placeholder="Slow Cinema"
                  value={kw}
                  onChange={(e) => setKw(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-800 px-4 py-3">
          <button type="button" onClick={onCancel} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-white hover:bg-zinc-900">Cancel</button>
          <button type="button" onClick={handleConfirm} className="rounded-md bg-yellow-500 px-3 py-1.5 text-sm font-medium text-black hover:bg-yellow-400">Save</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Fullscreen Modal (Moodboard) ---------------- */
function FullscreenModal({ children, onClose }) {
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div
        className="relative z-[121] w-full max-w-6xl px-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-white hover:bg-zinc-900"
          >
            <X className="h-4 w-4" />
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
