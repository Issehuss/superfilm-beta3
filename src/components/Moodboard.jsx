// src/components/Moodboard.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "lib/supabaseClient";
import Cropper from "react-easy-crop";
import { X, Plus, ArrowUpRight, Search, Upload, Trash2, Type, Palette, Crop as CropIcon } from "lucide-react";
import { searchMovies } from "../lib/tmdbClient"; // ✅ shared TMDB helper
import { toast } from "react-hot-toast";
import useEntitlements from "../hooks/useEntitlements";
import { trackEvent } from "../lib/analytics";
import {
  GRID_COLUMNS,
  GRID_GAP,
  PREVIEW_GRID_COLUMNS,
  PREVIEW_GRID_GAP,
  ROW_HEIGHTS,
  getAvailablePresets,
  getPresetByKey,
  estimateGridRows,
  computeGridHeight,
} from "./moodboardLayout";

/**
 * Moodboard item types:
 *  - { type: "image", url, source?: "tmdb"|"upload"|"url", title?: string, size?: "s"|"m"|"w"|"t" }
 *  - { type: "quote", text, attribution?: string, size?: ... }
 *  - { type: "color", hex, size?: ... }
 *  - { type: "keyword", text, size?: ... }
 */

const CORS_PROXY_HOSTS = new Set(["image.tmdb.org"]);
const CORS_PROXY_BASE = "https://images.weserv.nl/?url=";
const CORS_PROXY_PARAMS = "&output=jpeg&il=1";

function needsCorsProxy(url) {
  try {
    const host = new URL(url).host;
    return CORS_PROXY_HOSTS.has(host);
  } catch {
    return false;
  }
}

function buildProxyUrl(url) {
  const trimmed = url.replace(/^https?:\/\//i, "");
  return `${CORS_PROXY_BASE}${encodeURIComponent(trimmed)}${CORS_PROXY_PARAMS}`;
}

export default function Moodboard({
  profileId,
  isOwner = false,
  className = "",
  maxPreview = 6,
  usePremiumTheme = false,
  disableAutoRefresh = false,
  refreshKey = 0,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [replaceIndex, setReplaceIndex] = useState(null);
  const [error, setError] = useState("");
  const [cropOpen, setCropOpen] = useState(false);
  const [cropIdx, setCropIdx] = useState(null);
  const [cropSrc, setCropSrc] = useState("");
  const [cropAspect, setCropAspect] = useState(1.35);
  const [cropZoom, setCropZoom] = useState(1.05);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [cropPixels, setCropPixels] = useState(null);
  const [cropBusy, setCropBusy] = useState(false);
  const [cropError, setCropError] = useState("");
  const slotRefs = useRef({});

  const getSlotRef = (slotKey) => {
    if (!slotKey) return null;
    if (!slotRefs.current[slotKey]) {
      slotRefs.current[slotKey] = { current: null };
    }
    return slotRefs.current[slotKey];
  };

  const measureSlotAspect = (slotKey) => {
    const node = slotRefs.current[slotKey]?.current;
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return rect.width / rect.height;
  };

  // Entitlements (limits with safe fallback)
  const { limits: rawLimits } = useEntitlements();
  const limits = {
    moodboardTiles: rawLimits?.moodboardTiles ?? 6, // default 6 for free
  };
  const isPremium = rawLimits?.isPremium === true;
  const limitHitOnceRef = useRef(false);

  // allow external triggers (from EditProfilePanel) to force a reload
  const [refreshTick, setRefreshTick] = useState(0);
  useEffect(() => {
    function onUpdated(e) {
      if (!profileId || e?.detail?.profileId === profileId) {
        setRefreshTick((t) => t + 1);
      }
    }
    window.addEventListener("sf:moodboard:updated", onUpdated);
    return () => window.removeEventListener("sf:moodboard:updated", onUpdated);
  }, [profileId]);

  const cacheKey = profileId ? `sf.moodboard.cache.v1:${profileId}` : null;
  const lastRefreshRef = useRef({ key: refreshKey, tick: refreshTick });

  // Load from DB (profiles.moodboard jsonb) or fallback to localStorage
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const shouldForceRefresh =
          refreshKey !== lastRefreshRef.current.key ||
          refreshTick !== lastRefreshRef.current.tick;
        if (disableAutoRefresh && cacheKey && !shouldForceRefresh) {
          try {
            const raw = sessionStorage.getItem(cacheKey);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed?.data && !cancelled) {
                setItems(parsed.data);
                setLoading(false);
                return;
              }
            }
          } catch {}
        }
        if (!profileId) {
          const ls = localStorage.getItem("sf_moodboard_preview");
          if (!cancelled) setItems(ls ? JSON.parse(ls) : []);
          setLoading(false);
          return;
        }
        const { data, error: dbErr } = await supabase
          .from("profiles")
          .select("moodboard")
          .eq("id", profileId)
          .maybeSingle();

        if (dbErr) {
          const ls = localStorage.getItem("sf_moodboard_preview");
          if (!cancelled) {
            setItems(ls ? JSON.parse(ls) : []);
            setLoading(false);
          }
          return;
        }

        const arr = Array.isArray(data?.moodboard) ? data.moodboard : [];
        if (!cancelled) {
          setItems(arr);
          setLoading(false);
        }
        if (cacheKey) {
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: arr }));
          } catch {}
        }
      } catch {
        const ls = localStorage.getItem("sf_moodboard_preview");
        if (!cancelled) {
          setItems(ls ? JSON.parse(ls) : []);
          setLoading(false);
        }
      } finally {
        lastRefreshRef.current = { key: refreshKey, tick: refreshTick };
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [profileId, refreshTick, disableAutoRefresh, cacheKey, refreshKey]);

  // Persist to DB (if available) + localStorage as backup
  function safeStorageSet(storage, key, value) {
    try {
      storage?.setItem(key, value);
    } catch (err) {
      if (err?.name !== "QuotaExceededError") {
        console.warn("[Moodboard] cache write failed:", err);
      }
    }
  }

  async function persist(next) {
    setItems(next);
    const serialized = JSON.stringify(next);
    safeStorageSet(localStorage, "sf_moodboard_preview", serialized);
    if (cacheKey) {
      safeStorageSet(
        sessionStorage,
        cacheKey,
        JSON.stringify({ ts: Date.now(), data: next })
      );
    }
    if (!profileId) {
      return { error: null };
    }
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ moodboard: next })
        .eq("id", profileId);
      if (!error && typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("sf:moodboard:updated", { detail: { profileId } })
        );
      }
      return { error };
    } catch (err) {
      return { error: err };
    }
  }

  function removeAt(idx) {
    const next = items.filter((_, i) => i !== idx);
    persist(next);
  }

  function openAddDialog({ replaceAt = null } = {}) {
    setReplaceIndex(replaceAt);
    setAdding(true);
  }

  function closeAddDialog() {
    setAdding(false);
    setReplaceIndex(null);
  }

  // Premium gating: free users capped at N tiles
  function handleAddTileRequest() {
    // Block only when adding a brand-new tile (not replacing)
    if (replaceIndex == null && items.length >= limits.moodboardTiles) {
      const limitCount = limits.moodboardTiles;
      if (!limitHitOnceRef.current) {
        trackEvent("limit_hit", {
          feature: "moodboard",
          plan: rawLimits?.plan || (isPremium ? "directors_cut" : "free"),
        });
        limitHitOnceRef.current = true;
      }
      const copy = isPremium
        ? `Moodboard limit reached (${limitCount} stills).`
        : `You’ve reached the free Moodboard limit (${limitCount} stills). Director’s Cut unlocks unlimited stills — try it free for 14 days.`;
      const showUpsell = !isPremium;

      toast((t) => (
        <div className="text-sm text-left space-y-3 text-white">
          <div className="font-semibold">{copy}</div>
          {showUpsell ? (
            <button
              type="button"
              onClick={() => {
                window.location.href = "/premium";
                toast.dismiss(t.id);
                trackEvent("trial_started", { source: "moodboard_limit" });
              }}
              className="inline-flex items-center justify-center rounded-full px-4 py-2 font-semibold text-black bg-white hover:bg-white/90 text-sm transition shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
            >
              Start 14-day free trial
            </button>
          ) : null}
        </div>
      ), {
        duration: 7000,
        style: {
          background: "rgba(10,10,10,0.92)",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
        },
      });
      return;
    }
    openAddDialog({ replaceAt: null });
  }

  function addItem(newItem) {
    const normalized = normalizeItem(newItem);
    const idx = replaceIndex != null ? replaceIndex : items.length;
    const seed = ["w", "t", "b", "m", "s", "m"];
    const seeded = { ...normalized, size: normalized.size || seed[idx % seed.length] || "m" };

    // Safety: enforce limit in case something bypassed the button guard
    if (replaceIndex == null && items.length >= limits.moodboardTiles) {
      const limitCopy = isPremium
        ? "Moodboard limit reached."
        : `You’ve reached the free Moodboard limit (${limits.moodboardTiles} stills). Director’s Cut unlocks unlimited stills — try it free for 14 days.`;
      toast(limitCopy, {
        duration: 6000,
        style: {
          background: "rgba(10,10,10,0.92)",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
        },
      });
      return;
    }

    const next = [...items];
    if (replaceIndex != null) next[replaceIndex] = seeded;
    else next.push(seeded);

    persist(next);
    closeAddDialog();
  }

  function openCropperForTile(idx, slotKey) {
    const tile = items[idx];
    if (!tile || tile.type !== "image" || !tile.url) return;
    setCropIdx(idx);
    setCropSrc(needsCorsProxy(tile.url) ? buildProxyUrl(tile.url) : tile.url);
    const measured = slotKey ? measureSlotAspect(slotKey) : null;
    setCropAspect(measured || 1.35);
    setCropPosition({ x: 0, y: 0 });
    setCropZoom(1.05);
    setCropPixels(null);
    setCropError("");
    setCropOpen(true);
  }

  function closeCropper() {
    setCropOpen(false);
    setCropIdx(null);
    setCropSrc("");
    setCropAspect(1.35);
    setCropPosition({ x: 0, y: 0 });
    setCropZoom(1.05);
    setCropPixels(null);
    setCropError("");
  }

  function handleCropComplete(_, areaPixels) {
    setCropPixels(areaPixels);
  }

  async function handleCropSave() {
    if (cropIdx == null || !cropSrc || !cropPixels) return;
    setCropBusy(true);
    setCropError("");
    try {
      const dataUrl = await getCroppedDataUrl(cropSrc, cropPixels);
      const next = items.map((it, index) =>
        index === cropIdx ? { ...it, url: dataUrl } : it
      );
      const { error: persistErr } = await persist(next);
      if (persistErr) {
        throw persistErr;
      }
      toast.success("Moodboard tile updated");
      closeCropper();
    } catch (err) {
      console.error("[Moodboard] crop failed:", err);
      const message = err?.message || "Couldn’t crop the image.";
      setCropError(message);
      toast.error(message);
    } finally {
      setCropBusy(false);
    }
  }

  const previewItems = useMemo(() => items.slice(0, maxPreview), [items, maxPreview]);
  const previewRows = estimateGridRows(previewItems, PREVIEW_GRID_COLUMNS);
  const previewHeight = Math.max(
    computeGridHeight(previewRows, ROW_HEIGHTS.compact, PREVIEW_GRID_GAP),
    previewRows ? previewRows * ROW_HEIGHTS.compact : ROW_HEIGHTS.compact
  );
  const extraItems = isPremium && items.length > maxPreview ? items.slice(maxPreview) : [];
  const expandedRows = estimateGridRows(items);
  const expandedHeight = Math.max(
    computeGridHeight(expandedRows, ROW_HEIGHTS.expanded),
    ROW_HEIGHTS.expanded
  );
  const premiumExtraRows = estimateGridRows(extraItems);
  const premiumExtraHeight = Math.max(
    computeGridHeight(premiumExtraRows, ROW_HEIGHTS.expanded),
    ROW_HEIGHTS.expanded
  );

  const themed = usePremiumTheme || isPremium;

  if (loading) {
    return (
    <div
      className={
        themed
          ? `themed-card themed-outline forge rounded-2xl p-3 sm:p-4 ${className}`
          : `rounded-2xl border border-zinc-800 bg-black/40 p-3 sm:p-4 ${className}`
      }
    >
        <div className="h-40 animate-pulse rounded-xl bg-zinc-900" />
      </div>
    );
  }

  return (
    <div
      className={
        themed
          ? `themed-card themed-outline forge rounded-2xl p-3 sm:p-4 ${className}`
          : `rounded-2xl border border-zinc-800 bg-black/40 p-3 sm:p-4 ${className}`
      }
    >
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="text-base sm:text-lg font-semibold text-white">Moodboard</h3>
          <div className="text-[11px] sm:text-xs text-zinc-500">
            If you have more than {maxPreview} tiles, use Expand to see everything.
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isOwner && (
            <button
              type="button"
              onClick={handleAddTileRequest}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-2.5 sm:px-3 py-1 text-xs sm:text-sm text-white hover:bg-zinc-900"
              title="Add item"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-2.5 sm:px-3 py-1 text-xs sm:text-sm text-white hover:bg-zinc-900"
            title="Expand"
          >
            <ArrowUpRight className="h-4 w-4" />
            Expand
          </button>
        </div>
      </div>
      {/* helper text intentionally removed per request */}

      {/* Collage preview: structured puzzle grid */}
      <div
        className="relative overflow-hidden rounded-xl border border-zinc-800 bg-black/30"
        style={{ width: "100%", height: previewHeight }}
      >
        <div
          className="grid h-full"
          style={{
            gridTemplateColumns: `repeat(${PREVIEW_GRID_COLUMNS}, minmax(0, 1fr))`,
            gridAutoRows: `${ROW_HEIGHTS.compact}px`,
            gap: `${PREVIEW_GRID_GAP}px`,
            padding: "0",
            height: "100%",
            gridAutoFlow: "dense",
          }}
        >
          {previewItems.map((item, index) => {
            const slotKey = `preview-${index}`;
            const slotRef = getSlotRef(slotKey);
            const sizeInfo = getPresetByKey(item.size);
            return (
              <Tile
                key={`preview-${index}`}
                item={item}
                sizeInfo={sizeInfo}
                canEdit={isOwner}
                slotRef={slotRef}
                onReplace={() => openAddDialog({ replaceAt: index })}
                onRemove={() => removeAt(index)}
                onRequestCrop={
                  isOwner ? () => openCropperForTile(index, slotKey) : undefined
                }
              />
            );
          })}
        </div>
        {!items.length && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
            No moodboard items yet. Add some from your profile page.
          </div>
        )}
      </div>

      {extraItems.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.45em] text-zinc-500">
            <span>Director’s Cut canvas</span>
            <span className="text-[10px] text-yellow-300">
              {extraItems.length} additional tile
              {extraItems.length === 1 ? "" : "s"}
            </span>
          </div>
          <div
            className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-black/20"
            style={{ width: "100%", height: premiumExtraHeight }}
          >
            <div
              className="grid h-full"
              style={{
                gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
                gridAutoRows: `${ROW_HEIGHTS.expanded}px`,
                gap: `${GRID_GAP}px`,
                padding: `${GRID_GAP / 2}px`,
                height: "100%",
                gridAutoFlow: "dense",
              }}
            >
              {extraItems.map((item, index) => {
                const slotKey = `premium-${index}`;
                const slotRef = getSlotRef(slotKey);
                const sizeInfo = getPresetByKey(item.size);
                return (
                  <Tile
                    key={`premium-${index}`}
                    item={item}
                    sizeInfo={sizeInfo}
                    canEdit={isOwner}
                    slotRef={slotRef}
                    onReplace={() =>
                      openAddDialog({ replaceAt: maxPreview + index })
                    }
                    onRemove={() => removeAt(maxPreview + index)}
                    onRequestCrop={
                      isOwner ? () => openCropperForTile(maxPreview + index, slotKey) : undefined
                    }
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen modal */}
      {open && (
        <FullscreenModal onClose={() => setOpen(false)}>
          <div className="mx-auto max-w-6xl p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-white">Moodboard</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-white hover:bg-zinc-900"
              >
                Close
              </button>
            </div>

            {/* Collage fullscreen: puzzle layout expanded */}
            <div
              className="grid h-full"
              style={{
                gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
                gridAutoRows: `${ROW_HEIGHTS.expanded}px`,
                gap: `${GRID_GAP}px`,
                height: expandedHeight,
                gridAutoFlow: "dense",
              }}
            >
              {items.length ? (
                items.map((item, index) => {
                  const slotKey = `expanded-${index}`;
                  const slotRef = getSlotRef(slotKey);
                  const sizeInfo = getPresetByKey(item.size);
                  return (
                    <Tile
                      key={`full-${index}`}
                      item={item}
                      sizeInfo={sizeInfo}
                      canEdit={isOwner}
                      slotRef={slotRef}
                      onReplace={() => openAddDialog({ replaceAt: index })}
                      onRemove={() => removeAt(index)}
                      onRequestCrop={
                        isOwner ? () => openCropperForTile(index, slotKey) : undefined
                      }
                    />
                  );
                })
              ) : (
                <div
                  className="flex items-center justify-center text-sm text-zinc-500"
                  style={{ gridColumn: "1 / -1" }}
                >
                  No moodboard items yet. Add one to see them here.
                </div>
              )}
            </div>
            {isOwner && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={handleAddTileRequest}
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-1 text-xs font-semibold text-white hover:bg-zinc-900"
                >
                  <Plus className="h-4 w-4" />
                  Add tile
                </button>
              </div>
            )}
          </div>
        </FullscreenModal>
      )}

      {/* Add/Replace dialog */}
      {adding && (
        <AddReplaceDialog
          initialType="image"
          onCancel={closeAddDialog}
          onConfirm={addItem}
          isPremium={isPremium}
        />
      )}

      {cropOpen && cropSrc && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 px-4 py-8"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative w-full max-w-4xl overflow-hidden rounded-[32px] border border-zinc-800 bg-zinc-950 shadow-[0_20px_60px_rgba(0,0,0,0.9)]"
            onClick={(e) => e.stopPropagation()}
          >
              <div className="relative h-[70vh] bg-black">
                <Cropper
                  image={cropSrc}
                  crop={cropPosition}
                  zoom={cropZoom}
                  aspect={cropAspect}
                  onCropChange={setCropPosition}
                  onZoomChange={setCropZoom}
                  onCropComplete={handleCropComplete}
                  restrictPosition={false}
                  showGrid
                  crossOrigin="anonymous"
                />
              </div>
            <div className="flex flex-col gap-3 border-t border-zinc-900 px-4 py-4">
              <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-zinc-400">
                <span>Adjust the crop to fit the tile</span>
                <span className="ml-auto text-[11px] text-yellow-300">
                  Aspect {cropAspect ? cropAspect.toFixed(2) : "auto"}
                </span>
              </div>
              <input
                type="range"
                min="0.7"
                max="4"
                step="0.01"
                value={cropZoom}
                onChange={(e) => setCropZoom(Number(e.target.value))}
                className="h-2 rounded-full bg-zinc-800 accent-yellow-400"
              />
              {cropError ? (
                <p className="text-xs text-red-400">{cropError}</p>
              ) : null}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeCropper}
                  className="inline-flex items-center gap-2 rounded-full border border-zinc-800 px-3 py-1 text-xs font-semibold text-white hover:border-zinc-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCropSave}
                  disabled={!cropPixels || cropBusy}
                  className="inline-flex items-center gap-2 rounded-full bg-yellow-400 px-3 py-1 text-xs font-semibold text-black transition hover:bg-yellow-300 disabled:opacity-50"
                >
                  {cropBusy ? "Saving…" : "Save crop"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
    </div>
  );
}

/* ---------- Helpers & Subcomponents ---------- */

function normalizeItem(it) {
  if (!it) return null;
  const size = it.size && ["s", "m", "w", "t", "b"].includes(it.size) ? it.size : "m";
  if (it.type === "image") {
    return { type: "image", url: it.url, source: it.source || "tmdb", title: it.title || "", size };
  }
  if (it.type === "quote") {
    return { type: "quote", text: it.text || "", attribution: it.attribution || "", size };
  }
  if (it.type === "color") {
    return { type: "color", hex: cleanHex(it.hex || "#888888"), size };
  }
  if (it.type === "keyword") {
    return { type: "keyword", text: (it.text || "").slice(0, 24), size };
  }
  return { ...it, size };
}

function cleanHex(hex) {
  const s = String(hex).trim();
  if (s.startsWith("#")) return s;
  return `#${s}`;
}

async function getCroppedDataUrl(imageSrc, pixelCrop) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = pixelCrop.width;
      canvas.height = pixelCrop.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height
      );
      try {
        const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
        resolve(dataUrl);
      } catch (err) {
        reject(err);
      }
    };
    image.onerror = reject;
    image.src = imageSrc;
  });
}


function Tile({ item, sizeInfo, canEdit, onReplace, onRemove, onRequestCrop, slotRef }) {
  if (!item) return null;
  const radius =
    !sizeInfo || sizeInfo.rows > 1 ? "28px" : "20px";
  const wrapperStyle = {
    gridColumn: `span ${sizeInfo?.cols || 1}`,
    gridRow: `span ${sizeInfo?.rows || 1}`,
    borderRadius: radius,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "rgba(0,0,0,0.02)",
    boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
    border: "1px solid rgba(255,255,255,0.04)",
  };
  const wrapperCls =
    "group relative select-none overflow-hidden transition-all duration-200 hover:shadow-[0_26px_50px_rgba(0,0,0,0.55)]";

  const content = (() => {
    if (item.type === "image") {
      return (
        <img
          src={item.url}
          alt={item.title || "Moodboard image"}
          className="h-full w-full object-cover bg-black"
          loading="lazy"
          style={{ display: "block" }}
        />
      );
    }
    if (item.type === "quote") {
      return (
        <div className="flex h-full w-full items-center justify-center text-center bg-black/35 backdrop-blur-[1px] px-3 py-2">
          <blockquote className="text-sm sm:text-base italic text-zinc-100 drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">
            “{item.text}”
            {item.attribution ? (
              <span className="mt-1 block text-xs not-italic text-zinc-200">— {item.attribution}</span>
            ) : null}
          </blockquote>
        </div>
      );
    }
    if (item.type === "color") {
      return (
        <div className="absolute inset-0" style={{ backgroundColor: item.hex || "#888888" }}>
          <div className="absolute bottom-1 right-1 rounded bg-black/50 px-2 py-0.5 text-[10px] leading-none text-white">
            {item.hex}
          </div>
        </div>
      );
    }
    if (item.type === "keyword") {
      return (
        <div className="flex h-full w-full items-center justify-center">
          <span className="bg-black/60 px-3 py-1 text-sm font-semibold uppercase tracking-wide text-white">
            {item.text}
          </span>
        </div>
      );
    }
    return null;
  })();

  return (
    <div className={wrapperCls} style={wrapperStyle} ref={slotRef}>
      {content}
      {canEdit && (
        <TileControls
          onRequestCrop={onRequestCrop}
          onReplace={onReplace}
          onRemove={onRemove}
        />
      )}
    </div>
  );
}

function TileControls({ onRequestCrop, onReplace, onRemove }) {
  return (
    <div className="absolute inset-x-2 top-2 flex items-center justify-between gap-2 opacity-0 transition group-hover:opacity-100">
        <button
          type="button"
          onClick={onRequestCrop}
          className="flex items-center gap-1 rounded-full bg-yellow-400/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-black shadow"
        >
          <CropIcon className="h-3 w-3" />
          Crop
        </button>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onReplace}
          className="rounded-full bg-black/60 px-2 py-1 text-[10px] text-white hover:bg-black/80"
        >
          Replace
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full bg-red-500/90 px-2 py-1 text-[10px] text-white hover:bg-red-600"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function FullscreenModal({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm">
      <div className="absolute right-4 top-4">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-white hover:bg-zinc-900"
        >
          <X className="h-4 w-4" />
          Close
        </button>
      </div>
      <div className="h-full w-full overflow-auto">{children}</div>
    </div>
  );
}

/* ---------------- Add/Replace Dialog ---------------- */
function AddReplaceDialog({ onCancel, onConfirm, initialType = "image", isPremium = false }) {
  const [tab, setTab] = useState(initialType);

  // Quote / Color / Keyword
  const [qText, setQText] = useState("");
  const [qAttr, setQAttr] = useState("");
  const [hex, setHex] = useState("#86efac");
  const [kw, setKw] = useState("");

  // TMDB search (shared helper)
  const [q, setQ] = useState("");

  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [tmdbErr, setTmdbErr] = useState("");
  const presets = getAvailablePresets(isPremium);
  const [selectedSize, setSelectedSize] = useState(presets[0]?.key || "m");
  const [pendingImage, setPendingImage] = useState(null);
  const resetImageSelection = () => {
    setPendingImage(null);
    setSelectedSize(presets[0]?.key || "m");
  };

  const handleDialogCancel = () => {
    resetImageSelection();
    onCancel();
  };

  useEffect(() => {
    if (!presets.length) return;
    setSelectedSize((prev) =>
      presets.some((p) => p.key === prev) ? prev : presets[0].key
    );
  }, [presets]);

  async function searchTMDBLocal() {
    setTmdbErr("");
    setResults([]);
    const text = q.trim();
    if (!text) return;
    setSearching(true);
    try {
      const list = await searchMovies(text);
      setResults(list);
    } catch (e) {
      console.error("TMDB fetch failed:", e);
      setTmdbErr("Network error.");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function handleImageConfirm() {
    if (!pendingImage) return;
    onConfirm({
      type: "image",
      url: pendingImage.url,
      title: pendingImage.title,
      source: pendingImage.source,
      size: selectedSize,
    });
    resetImageSelection();
    onCancel();
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
    // Image flow handled via the size picker UI
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6"
      onClick={handleDialogCancel}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            <button
              type="button"
              onClick={() => setTab("image")}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${tab === "image" ? "bg-zinc-800 text-white" : "hover:bg-zinc-900"}`}
              title="Image"
            >
              <Upload className="h-4 w-4" /> Image
            </button>
            <button
              type="button"
              onClick={() => setTab("quote")}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${tab === "quote" ? "bg-zinc-800 text-white" : "hover:bg-zinc-900"}`}
              title="Quote"
            >
              <Type className="h-4 w-4" /> Quote
            </button>
            <button
              type="button"
              onClick={() => setTab("color")}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${tab === "color" ? "bg-zinc-800 text-white" : "hover:bg-zinc-900"}`}
              title="Color"
            >
              <Palette className="h-4 w-4" /> Color
            </button>
            <button
              type="button"
              onClick={() => setTab("keyword")}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${tab === "keyword" ? "bg-zinc-800 text-white" : "hover:bg-zinc-900"}`}
              title="Keyword"
            >
              <Search className="h-4 w-4" /> Keyword
            </button>
          </div>

          <button
            type="button"
            onClick={handleDialogCancel}
            className="rounded-md border border-zinc-700 px-2 py-1 text-sm text-white hover:bg-zinc-900"
          >
            Cancel
          </button>
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

                <div className="max-h-64 overflow-y-auto pr-1">
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
                              setPendingImage({
                                url: poster,
                                title: m.title || "",
                                source: "tmdb",
                              });
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
                </div>

                {tmdbErr ? <p className="mt-2 text-xs text-red-400">{tmdbErr}</p> : null}
                {pendingImage ? (
                  <div className="rounded-2xl border border-zinc-800 bg-black/60 p-3 text-sm text-white shadow-lg">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <img
                        src={pendingImage.url}
                        alt="Selected still"
                        className="h-20 w-32 rounded-md border border-zinc-700 object-contain"
                      />
                      <div className="flex-1 text-xs text-zinc-300">
                        <p className="font-semibold text-white">
                          {pendingImage.title || "Untitled film"}
                        </p>
                        <p>Choose a tile size for this image.</p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {presets.map((preset) => (
                        <button
                          type="button"
                          key={preset.key}
                          onClick={() => setSelectedSize(preset.key)}
                          className={`rounded-2xl border px-3 py-2 text-left text-xs font-semibold transition ${
                            selectedSize === preset.key
                              ? "border-yellow-400 bg-yellow-400/10 text-white shadow-[0_0_20px_rgba(250,204,21,0.35)]"
                              : "border-zinc-800 text-zinc-300 hover:border-zinc-500"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span>{preset.label}</span>
                            <span className="text-[10px] text-zinc-400">
                              {preset.cols}×{preset.rows}
                            </span>
                          </div>
                          <p className="text-[10px] text-zinc-500">{preset.description}</p>
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleImageConfirm}
                        className="flex-1 rounded-full bg-yellow-500 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-400"
                      >
                        Add tile
                      </button>
                      <button
                        type="button"
                        onClick={resetImageSelection}
                        className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-white hover:border-zinc-500"
                      >
                        Choose another
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-zinc-500">
                    Select an image to choose a tile size.
                  </p>
                )}
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
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-white hover:bg-zinc-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={tab === "image"}
            className="rounded-md bg-yellow-500 px-3 py-1.5 text-sm font-medium text-black hover:bg-yellow-400 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
