// src/pages/UserProfile.jsx
import React, { useCallback, useState, useEffect, useMemo, useRef, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import supabase from "lib/supabaseClient";
import { fetchActiveScheme } from "../lib/ratingSchemes";
import RatingSchemeView from "../components/RatingSchemeView";
import DirectorsCutBadge from "../components/DirectorsCutBadge";
import { useUser } from "../context/UserContext";
import StatsAndWatchlist from "../components/StatsAndWatchlist";
import FollowButton from "../components/FollowButton.jsx";
import AvatarCropper from "../components/AvatarCropper";
import EditProfilePanel from "../components/EditProfilePanel";
import { getThemeVars } from "../theme/profileThemes";
import ProfileTasteCards from "../components/ProfileTasteCards";
import FilmTakeCard from "../components/FilmTakeCard.jsx";
import uploadAvatar from "../lib/uploadAvatar";
import { PROFILE_SELECT } from "../lib/profileSelect";
import ProfileSkeleton from "../components/ProfileSkeleton";
import useAppResume from "../hooks/useAppResume";
import useHydratedSupabaseFetch from "../hooks/useHydratedSupabaseFetch";
import isAbortError from "lib/isAbortError";



const PROFILE_CACHE_TTL = 1000 * 60 * 5; // 5 minutes
const SECTION_CACHE_TTL = 1000 * 60 * 10; // 10 minutes
const profileCacheKey = (id) => `sf.profile.cache.v1:${id}`;
const sectionCacheKey = (id, section) => `sf.profile.section.v1:${id}:${section}`;
const FILM_TAKES_SELECT = [
  "id",
  "user_id",
  "club_id",
  "film_id",
  "film_title",
  "take",
  "rating_5",
  "rating",
  "aspect_key",
  "poster_path",
  "created_at",
  "updated_at",
  "screening_id",
].join(", ");

const readProfileCache = (id) => {
  if (!id) return null;
  try {
    const raw = localStorage.getItem(profileCacheKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || !parsed?.data) return null;
    if (Date.now() - parsed.ts > PROFILE_CACHE_TTL) return null;
    return parsed.data;
  } catch {
    return null;
  }
};

const writeProfileCache = (id, data) => {
  if (!id || !data) return;
  try {
    localStorage.setItem(
      profileCacheKey(id),
      JSON.stringify({ ts: Date.now(), data })
    );
  } catch {
    // ignore storage errors (e.g., private mode)
  }
};

const readSectionCache = (key) => {
  if (!key) return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || !parsed?.data) return null;
    if (Date.now() - parsed.ts > SECTION_CACHE_TTL) return null;
    return parsed.data;
  } catch {
    return null;
  }
};

const writeSectionCache = (key, data) => {
  if (!key || data == null) return;
  try {
    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // ignore storage errors (e.g., private mode)
  }
};

// --- Local profile loader (slug or UUID) ---
const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Moodboard = lazy(() => import("../components/Moodboard.jsx"));

async function loadAnyProfileLocal(identifier) {
  if (!identifier) return null;

  try {
    if (UUID_RX.test(String(identifier))) {
      const { data, error } = await supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .eq("id", identifier)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    }

    // Try slug first (legacy), then username as a fallback
    const { data: bySlug, error: slugErr } = await supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("slug", String(identifier))
      .maybeSingle();

    if (bySlug) return bySlug;
    if (slugErr) console.warn("[loadAnyProfileLocal] slug lookup failed:", slugErr.message);

    const { data: byUsername, error: usernameErr } = await supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("username", String(identifier))
      .maybeSingle();
    if (usernameErr) throw usernameErr;
    return byUsername || null;
  } catch (e) {
    if (isAbortError(e)) return null;
    console.error("[loadAnyProfileLocal] failed:", e);
    return null;
  }
}


/* ---------------- small helpers ---------------- */
function timeAgo(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return d.toLocaleDateString();
}

function Stars5({ value = 0, size = 14 }) {
  const full = Math.floor(value);
  const half = value - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;

  const Star = ({ filled }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={filled ? "text-yellow-400" : "text-zinc-600"}
    >
      <path
        fill="currentColor"
        d="M12 17.3l-6.16 3.6 1.64-6.98L2 8.9l7.04-.6L12 1.8l2.96 6.5 7.04.6-5.48 5.02 1.64 6.98z"
      />
    </svg>
  );

  const Half = () => (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <defs>
        <linearGradient id="half">
          <stop offset="50%" stopColor="rgb(250 204 21)" />
          <stop offset="50%" stopColor="rgb(82 82 91)" />
        </linearGradient>
      </defs>
      <path
        fill="url(#half)"
        d="M12 17.3l-6.16 3.6 1.64-6.98L2 8.9l7.04-.6L12 1.8l2.96 6.5 7.04.6-5.48 5.02 1.64 6.98z"
      />
    </svg>
  );

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: full }).map((_, i) => (
        <Star key={`f${i}`} filled />
      ))}
      {half ? <Half key="h" /> : null}
      {Array.from({ length: empty }).map((_, i) => (
        <Star key={`e${i}`} filled={false} />
      ))}
    </div>
  );
}

/* ============================ PAGE ============================ */
const UserProfile = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { slug: routeSlug, id: routeId } = useParams();
  const {
    user,
    profile,
    setAvatar,
    saveProfilePatch,
    loading,
    sessionLoaded,
  } = useUser();
  const { appResumeTick, ready: resumeReady } = useAppResume();

  const identifier = routeSlug || routeId || null;
  const hasWindow = typeof window !== "undefined";
  const cachedProfileFromStorage =
    hasWindow && identifier ? readProfileCache(identifier) : null;
  const resolvedProfileId = identifier || profile?.id;
  const statsCache = useMemo(() => {
    if (!hasWindow || !resolvedProfileId) return null;
    return readSectionCache(sectionCacheKey(resolvedProfileId, "stats"));
  }, [hasWindow, resolvedProfileId]);
  const filmTakesCache = useMemo(() => {
    if (!hasWindow || !resolvedProfileId) return null;
    return readSectionCache(sectionCacheKey(resolvedProfileId, "film_takes"));
  }, [hasWindow, resolvedProfileId]);
  const profileWatchlistCache = useMemo(() => {
    if (!hasWindow || !resolvedProfileId) return null;
    return readSectionCache(sectionCacheKey(resolvedProfileId, "profile_watchlist"));
  }, [hasWindow, resolvedProfileId]);
  const tasteCardsCache = useMemo(() => {
    if (!hasWindow || !resolvedProfileId) return null;
    return readSectionCache(sectionCacheKey(resolvedProfileId, "taste_cards"));
  }, [hasWindow, resolvedProfileId]);
  const [profileRefreshEpoch, setProfileRefreshEpoch] = useState(0);
  const triggerProfileRefresh = useCallback(() => {
    setProfileRefreshEpoch((prev) => prev + 1);
  }, []);
  const {
    data: hydratedProfile,
  } = useHydratedSupabaseFetch(
    async () => {
      if (!identifier) return profile || null;
      const loaded = await loadAnyProfileLocal(identifier);
      return loaded || null;
    },
    [identifier, profileRefreshEpoch],
    {
      sessionLoaded,
      userId: user?.id || null,
      initialData:
        cachedProfileFromStorage ||
        (!identifier ? profile || null : null),
      timeoutMs: 8000,
      enabled: Boolean(sessionLoaded),
    }
  );

  // this is the profile we actually render (could be me, could be someone else)
  const [viewProfile, setViewProfile] = useState(() => {
    if (cachedProfileFromStorage) return cachedProfileFromStorage;
    if (!identifier) return profile || null;
    return null;
  });
  const [profileWatchlist, setProfileWatchlist] = useState(() => profileWatchlistCache ?? []);
  const isOwnProfile = Boolean(user?.id && viewProfile?.id && user.id === viewProfile.id);
  const [displayProfile, setDisplayProfile] = useState(null);
  const [viewLoading, setViewLoading] = useState(() => {
    if (!identifier) return false;
    return !Boolean(cachedProfileFromStorage);
  });
  const defaultStatsState = {
    roleBadge: null,
    roleClub: null,
    counts: { followers: 0, following: 0 },
  };
  const [shownStats, setShownStats] = useState(statsCache ?? defaultStatsState);
  const counts = shownStats?.counts ?? defaultStatsState.counts;
  const roleBadge = shownStats?.roleBadge ?? defaultStatsState.roleBadge;
  const roleClub = shownStats?.roleClub ?? defaultStatsState.roleClub;
  const latestRefreshRef = useRef(profileRefreshEpoch);
  const lastProfileRefreshRef = useRef(0);
  const displayHydrationIdleRef = useRef(null);
  const schemeIdleRef = useRef(null);
  const userProfileInitialRef = useRef(null);
  const cancelQueuedIdle = useCallback((handle) => {
    if (!handle) return;
    if (typeof window !== "undefined" && "cancelIdleCallback" in window) {
      window.cancelIdleCallback(handle);
    } else {
      clearTimeout(handle);
    }
  }, []);
  const scheduleDisplayHydration = useCallback(
    (profileId, fallbackAvatar, requestId) => {
      if (!profileId) return;
      cancelQueuedIdle(displayHydrationIdleRef.current);
      const run = async () => {
        displayHydrationIdleRef.current = null;
        try {
          const { data: displayData, error: displayError } = await supabase.rpc(
            "get_profile_display",
            {
              p_user_id: profileId,
            }
          );
          if (requestId !== latestRefreshRef.current) return;
          if (!displayError && displayData) {
            const displaySource = {
              ...displayData,
            };
            if (!displaySource.avatar_url && fallbackAvatar) {
              displaySource.avatar_url = fallbackAvatar;
            }
            setDisplayProfile(displaySource);
          }
        } catch (error) {
        console.error("[UserProfile] display hydration failed:", error);
        }
      };

      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        displayHydrationIdleRef.current = window.requestIdleCallback(run, { timeout: 2000 });
      } else {
        displayHydrationIdleRef.current = setTimeout(run, 0);
      }
    },
    [cancelQueuedIdle]
  );

  useEffect(() => {
    return () => {
      cancelQueuedIdle(displayHydrationIdleRef.current);
      cancelQueuedIdle(schemeIdleRef.current);
    };
  }, [cancelQueuedIdle]);
  const {
    data: statsResult,
  } = useHydratedSupabaseFetch(
    async () => {
      if (!viewProfile?.id) return null;
      const profileId = viewProfile.id;
      const { data: rolesRow, error: rolesError } = await supabase
        .from("profile_roles")
        .select("roles")
        .eq("user_id", profileId)
        .maybeSingle();
      if (rolesError) throw rolesError;
      const roles = rolesRow?.roles || [];
      const top = roles[0] || null;
      const nextRoleClub = top
        ? {
            club_slug: top.club_slug,
            club_name: top.club_name,
            club_id: top.club_id,
          }
        : null;
      const { data: fc, error: countsError } = await supabase
        .from("follow_counts")
        .select("followers, following")
        .eq("user_id", profileId)
        .maybeSingle();
      if (countsError) throw countsError;
      return {
        roleBadge: top?.role || null,
        roleClub: nextRoleClub,
        counts: fc || { followers: 0, following: 0 },
      };
    },
    [viewProfile?.id, profileRefreshEpoch],
    {
      sessionLoaded,
      userId: user?.id || null,
      initialData: statsCache || null,
      timeoutMs: 8000,
      enabled: Boolean(sessionLoaded && viewProfile?.id),
    }
  );

  useEffect(() => {
    if (!statsResult) return;
    setShownStats(statsResult);
    if (viewProfile?.id) {
      writeSectionCache(sectionCacheKey(viewProfile.id, "stats"), statsResult);
    }
  }, [statsResult, viewProfile?.id]);

  const {
    data: filmTakesResult,
    loading: filmTakesLoading,
  } = useHydratedSupabaseFetch(
    async () => {
      if (!viewProfile?.id) return [];
      const { data, error } = await supabase
        .from("club_film_takes")
        .select(FILM_TAKES_SELECT)
        .eq("is_archived", false)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return Array.isArray(data)
        ? data.map((t) => ({
            id: t.id,
            user_id: t.user_id,
            club_id: t.club_id,
            film_id: t.film_id,
            film_title: t.film_title,
            title: t.film_title,
            text: t.take || t.text || "",
            rating_5:
              typeof t.rating_5 === "number" ? t.rating_5 : t.rating || null,
            aspect_key: t.aspect_key,
            poster_path: t.poster_path,
            created_at: t.created_at,
            updated_at: t.updated_at,
            screening_id: t.screening_id,
          }))
        : [];
    },
    [viewProfile?.id, profileRefreshEpoch],
    {
      sessionLoaded,
      userId: user?.id || null,
      initialData: filmTakesCache || [],
      timeoutMs: 8000,
      enabled: Boolean(sessionLoaded && viewProfile?.id),
    }
  );

  useEffect(() => {
    if (!Array.isArray(filmTakesResult)) return;
    setFilmTakes(filmTakesResult);
    setFilmTakesHasContent((prev) => prev || filmTakesResult.length > 0);
    if (viewProfile?.id) {
      writeSectionCache(
        sectionCacheKey(viewProfile.id, "film_takes"),
        filmTakesResult
      );
    }
  }, [filmTakesResult, viewProfile?.id]);

  const {
    data: profileWatchlistResult,
    showSkeleton: profileWatchlistSkeleton,
  } = useHydratedSupabaseFetch(
    async () => {
      if (!isOwnProfile || !viewProfile?.id) return [];
      const { data, error } = await supabase
        .from("user_watchlist")
        .select("id, movie_id, title, poster_path")
        .eq("user_id", viewProfile.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return Array.isArray(data)
        ? data.map((item) => ({
            id: item.id,
            movie_id: item.movie_id,
            title: item.title,
            poster_path: item.poster_path,
          }))
        : [];
    },
    [viewProfile?.id, isOwnProfile, profileRefreshEpoch],
    {
      sessionLoaded,
      userId: user?.id || null,
      initialData: profileWatchlistCache || [],
      timeoutMs: 8000,
      enabled: Boolean(sessionLoaded && isOwnProfile && user?.id && viewProfile?.id),
    }
  );

  useEffect(() => {
    if (!Array.isArray(profileWatchlistResult)) return;
    setProfileWatchlist(profileWatchlistResult);
    if (viewProfile?.id) {
      writeSectionCache(
        sectionCacheKey(viewProfile.id, "profile_watchlist"),
        profileWatchlistResult
      );
    }
  }, [profileWatchlistResult, viewProfile?.id]);

  useEffect(() => {
    if (isOwnProfile) return;
    setProfileWatchlist([]);
  }, [isOwnProfile]);

  const {
    data: tasteCardsResult,
    showSkeleton: tasteCardsSkeleton,
  } = useHydratedSupabaseFetch(
    async () => {
      if (!viewProfile?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("taste_cards, taste_card_style_global")
        .eq("id", viewProfile.id)
        .maybeSingle();
      if (error) throw error;
      return {
        cards: Array.isArray(data?.taste_cards) ? data.taste_cards : [],
        glow: data?.taste_card_style_global ?? null,
      };
    },
    [viewProfile?.id, profileRefreshEpoch],
    {
      sessionLoaded,
      userId: user?.id || null,
      initialData: tasteCardsCache ?? { cards: [], glow: null },
      timeoutMs: 8000,
      enabled: Boolean(sessionLoaded && viewProfile?.id),
    }
  );

  useEffect(() => {
    if (!tasteCardsResult) return;
    setLiveTasteCards(tasteCardsResult.cards ?? []);
    setLiveGlobalGlow(tasteCardsResult.glow ?? null);
    tasteCardsHydratedRef.current = true;
    if (viewProfile?.id) {
      writeSectionCache(
        sectionCacheKey(viewProfile.id, "taste_cards"),
        tasteCardsResult
      );
    }
  }, [tasteCardsResult, viewProfile?.id]);

  useEffect(() => {
    profileWatchlistHydratedRef.current = Boolean(profileWatchlistCache);
    setProfileWatchlist(profileWatchlistCache ?? []);
  }, [profileWatchlistCache]);

  useEffect(() => {
    tasteCardsHydratedRef.current = Boolean(tasteCardsCache);
    if (tasteCardsCache) {
      setLiveTasteCards(tasteCardsCache.cards ?? []);
      setLiveGlobalGlow(tasteCardsCache.glow ?? null);
    } else {
      setLiveTasteCards(
        Array.isArray(profile?.taste_cards) ? profile.taste_cards : []
      );
      setLiveGlobalGlow(profile?.taste_card_style_global ?? null);
    }
  }, [tasteCardsCache, profile?.taste_cards, profile?.taste_card_style_global]);
  const schemeRequestRef = useRef(0);
  const bumpWatchlistRefresh = useCallback(() => {
    triggerProfileRefresh();
  }, [triggerProfileRefresh]);

  useEffect(() => {
    if (!sessionLoaded || !identifier) return;
    if (userProfileInitialRef.current === identifier) return;
    userProfileInitialRef.current = identifier;
    triggerProfileRefresh();
  }, [sessionLoaded, identifier, triggerProfileRefresh]);

  useEffect(() => {
    if (!resumeReady || !sessionLoaded) return;
    if (appResumeTick === 0) return;
    triggerProfileRefresh();
  }, [appResumeTick, resumeReady, sessionLoaded, triggerProfileRefresh]);

  useEffect(() => {
    if (!sessionLoaded || identifier) return;
    setProfileRefreshEpoch((epoch) => epoch + 1);
  }, [sessionLoaded, identifier]);

  // View vs edit
  const [editMode, setEditMode] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Avatar editing
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Banner overrides (local only)
  const [bannerOverride, setBannerOverride] = useState(null);
  const [bannerGradientOverride, setBannerGradientOverride] = useState(null);

  // Taste cards live state
  const [liveTasteCards, setLiveTasteCards] = useState(() =>
    tasteCardsCache?.cards ??
    (Array.isArray(profile?.taste_cards) ? profile.taste_cards : [])
  );
  const [liveGlobalGlow, setLiveGlobalGlow] = useState(
    tasteCardsCache?.glow ?? profile?.taste_card_style_global ?? null
  );
  const tasteCardsHydratedRef = useRef(Boolean(tasteCardsCache));
  const profileWatchlistHydratedRef = useRef(Boolean(profileWatchlistCache));

  // Premium rating scheme (view mode)
  const [viewScheme, setViewScheme] = useState(null);

  // Editing buffer
  // Film takes (from Supabase table)
  const hasFilmCache = Array.isArray(filmTakesCache);
  const [filmTakes, setFilmTakes] = useState(() =>
    hasFilmCache ? filmTakesCache : []
  );
  const [filmTakesHasContent, setFilmTakesHasContent] = useState(hasFilmCache);
  const filmTakesHasContentRef = useRef(hasFilmCache);

  useEffect(() => {
    filmTakesHasContentRef.current = filmTakesHasContent;
  }, [filmTakesHasContent]);

    // Editing a single take (owner only)
  const [editingTake, setEditingTake] = useState(null);
  const [editingTakeDraft, setEditingTakeDraft] = useState({
    rating_5: 0,
    take: "",
  });
  const [editingTakeSaving, setEditingTakeSaving] = useState(false);
  const [removingTakeId, setRemovingTakeId] = useState(null);

  // Avatar cropper state
  const [showAvatarCropper, setShowAvatarCropper] = useState(false);
  const [rawAvatarImage, setRawAvatarImage] = useState(null);
  


  

  const canFetchPrivateScheme = Boolean(sessionLoaded && user?.id && isOwnProfile);
  // anchor for Moodboard
  const moodboardAnchorRef = useRef(null);
  useEffect(() => {
    if (hydratedProfile === undefined) return;
    if (hydratedProfile) {
      const key = identifier || hydratedProfile.id;
      const requestId = profileRefreshEpoch;
      latestRefreshRef.current = requestId;
      if (key && hasWindow) {
        writeProfileCache(key, hydratedProfile);
      }
      setViewProfile(hydratedProfile);
      setDisplayProfile(hydratedProfile);
      setViewLoading(false);
      lastProfileRefreshRef.current = Date.now();
      const profileId = hydratedProfile.id;
      if (profileId) {
        scheduleDisplayHydration(profileId, hydratedProfile?.avatar_url, requestId);
      }
      return;
    }

    if (!identifier) {
      setViewProfile(profile || null);
      setDisplayProfile(profile || null);
    } else {
      setViewProfile(null);
      setDisplayProfile(null);
    }
    setViewLoading(false);
  }, [
    hydratedProfile,
    identifier,
    profile,
    hasWindow,
    scheduleDisplayHydration,
    profileRefreshEpoch,
  ]);

  useEffect(() => {
    if (!viewProfile?.id) {
      setDisplayProfile(null);
    }
  }, [viewProfile?.id]);

  /* =========================================================
     2. Keep live taste cards in sync when actual profile changes
     ========================================================= */
  useEffect(() => {
    setLiveTasteCards(
      Array.isArray(viewProfile?.taste_cards) ? viewProfile.taste_cards : []
    );
  }, [viewProfile?.taste_cards]);

  useEffect(() => {
    setLiveGlobalGlow(viewProfile?.taste_card_style_global ?? null);
  }, [viewProfile?.taste_card_style_global]);

  useEffect(() => {
    if (!viewProfile?.id || !canFetchPrivateScheme) {
      setViewScheme(null);
      return;
    }
    const requestId = ++schemeRequestRef.current;
    cancelQueuedIdle(schemeIdleRef.current);

    const run = async () => {
      schemeIdleRef.current = null;
      try {
        const scheme = await fetchActiveScheme(viewProfile.id);
        if (requestId !== schemeRequestRef.current) return;
        setViewScheme(scheme);
      } catch (error) {
        if (isAbortError(error) || error?.message === "Load failed") return;
        console.error("[UserProfile] rating scheme fetch failed:", error);
      }
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      schemeIdleRef.current = window.requestIdleCallback(run, { timeout: 2000 });
    } else {
      schemeIdleRef.current = setTimeout(run, 0);
    }

    return () => {
      cancelQueuedIdle(schemeIdleRef.current);
    };
  }, [viewProfile?.id, canFetchPrivateScheme, profileRefreshEpoch, cancelQueuedIdle]);

  useEffect(() => {
    function onTasteCardsUpdated(e) {
      if (Array.isArray(e?.detail?.cards)) {
        setLiveTasteCards(e.detail.cards);
      }
    }
    window.addEventListener("sf:tastecards:updated", onTasteCardsUpdated);
    return () => window.removeEventListener("sf:tastecards:updated", onTasteCardsUpdated);
  }, []);

  /* =========================================================
     3. Premium rating scheme for viewed profile
     ========================================================= */
  useEffect(() => {
    if (!viewProfile?.id) {
      setViewScheme(null);
    }
  }, [viewProfile?.id]);

  useEffect(() => {
    function handleSchemeUpdate() {
      triggerProfileRefresh();
    }
    window.addEventListener("sf:ratingscheme:updated", handleSchemeUpdate);
    return () =>
      window.removeEventListener("sf:ratingscheme:updated", handleSchemeUpdate);
  }, [triggerProfileRefresh]);

  useEffect(() => {
    function handleProfileRefresh() {
      triggerProfileRefresh();
    }
    window.addEventListener("sf:profile:refresh", handleProfileRefresh);
    return () =>
      window.removeEventListener("sf:profile:refresh", handleProfileRefresh);
  }, [triggerProfileRefresh]);

  /* =========================================================
     4. Respect ?edit=true (open once, then clean URL)
     ========================================================= */
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("edit") === "true") {
      setEditMode(true);
      setEditOpen(true);
      params.delete("edit");
      navigate({ search: params.toString() }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, viewProfile?.taste_cards]);

  /* =========================================================
     5. Restore banner from localStorage (for own profile only)
     ========================================================= */
  useEffect(() => {
    if (!isOwnProfile) {
      setBannerOverride(null);
      setBannerGradientOverride(null);
      return;
    }

    try {
      const key = `sf.userBanner:${user.id}`;
      let ls = localStorage.getItem(key);
      if (!ls) {
        // Fallback from legacy key (pre per-user storage)
        ls = localStorage.getItem("userBanner");
        if (ls) localStorage.setItem(key, ls);
      }
      if (ls && !bannerOverride) setBannerOverride(ls);
    } catch {}
  }, [bannerOverride, user?.id, viewProfile?.id, isOwnProfile]);

  /* =========================================================
     6. Exit edit mode when panel broadcasts close
     ========================================================= */
  useEffect(() => {
    function handleExitEdit() {
      setEditOpen(false);
      setEditMode(false);
    }
    window.addEventListener("sf:editpanel:close", handleExitEdit);
    return () => window.removeEventListener("sf:editpanel:close", handleExitEdit);
  }, []);

  /* =========================================================
     8. Navigate back to this profile after save
     ========================================================= */
  useEffect(() => {
    function onProfileSaved() {
      const path =
        (viewProfile?.slug && `/u/${viewProfile.slug}`) ||
        (viewProfile?.id && `/profile/${viewProfile.id}`) ||
        "/myprofile";

      navigate(path, { replace: true });
      setEditOpen(false);
      setEditMode(false);
    }

    window.addEventListener("sf:profile:saved", onProfileSaved);
    return () => window.removeEventListener("sf:profile:saved", onProfileSaved);
  }, [navigate, viewProfile?.slug, viewProfile?.id]);

  /* ---------------- handlers ---------------- */
  const viewingOwn =
    user?.id && viewProfile?.id ? user.id === viewProfile.id : true;

  const handleUsernameChange = async (newUsername) => {
    const lastChange = localStorage.getItem("usernameLastChanged");
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    if (!lastChange || now - Number(lastChange) > ninetyDays) {
      try {
        await saveProfilePatch({ slug: newUsername });
        localStorage.setItem("usernameLastChanged", String(now));
      } catch (e) {
        console.error("Failed to update username:", e);
      }
    } else {
      alert("You can only change your username once every 90 days.");
    }
  };

  const handleAvatarUpload = async (e) => {
    if (uploadingAvatar) return;
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

  const handlePanelUpdated = async (patch) => {
    if (!patch) return;

    // Handle avatar uploads coming back from EditProfilePanel as data/blob URLs
    if (typeof patch.avatar_url === "string") {
      const src = patch.avatar_url;
      if ((src.startsWith("data:") || src.startsWith("blob:")) && user?.id) {
        try {
          const res = await fetch(src);
          const blob = await res.blob();
          const publicUrl = await uploadAvatar(blob, user.id, {
            prevUrl: viewProfile?.avatar_url || undefined,
          });
          patch = { ...patch, avatar_url: publicUrl };
          setAvatar(publicUrl);
          setViewProfile((prev) => (prev ? { ...prev, avatar_url: publicUrl } : prev));
        } catch (e) {
          console.error("Failed to persist avatar upload:", e);
          // If upload fails, drop the avatar change so we don't store a blob: URL in DB
          const { avatar_url, ...restPatch } = patch;
          patch = restPatch;
        }
      } else if (src.startsWith("data:") || src.startsWith("blob:")) {
        // Can't safely save a data/blob URL without a signed-in user
        const { avatar_url, ...restPatch } = patch;
        patch = restPatch;
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, "display_name") && typeof patch.display_name === "string") {
      setDisplayProfile((prev) =>
        prev ? { ...prev, display_name: patch.display_name } : { display_name: patch.display_name }
      );
      setViewProfile((prev) =>
        prev ? { ...prev, display_name: patch.display_name } : prev
      );
    }

    if (Object.prototype.hasOwnProperty.call(patch, "avatar_url")) {
      const nextAvatar = patch.avatar_url || null;
      setAvatar(nextAvatar || "/default-avatar.svg");
      setViewProfile((prev) => (prev ? { ...prev, avatar_url: nextAvatar } : prev));
    }

    if (typeof patch.banner_url === "string" && patch.banner_url) {
      setBannerOverride(patch.banner_url);
      try {
        if (isOwnProfile) {
          localStorage.setItem(`sf.userBanner:${user.id}`, patch.banner_url);
        }
      } catch {}
    } else if (typeof patch.banner_image === "string" && patch.banner_image) {
      setBannerOverride(patch.banner_image);
      try {
        if (isOwnProfile) {
          localStorage.setItem(`sf.userBanner:${user.id}`, patch.banner_image);
        }
      } catch {}
    }
    if (typeof patch.banner_gradient === "string") {
      setBannerGradientOverride(patch.banner_gradient);
    }

    if (isOwnProfile) {
      const bannerPatch = {};
      const bannerUrl =
        typeof patch.banner_url === "string" ? patch.banner_url : null;
      const bannerImage =
        typeof patch.banner_image === "string" ? patch.banner_image : null;
      if (bannerUrl && !/^data:|^blob:/i.test(bannerUrl)) {
        bannerPatch.banner_url = bannerUrl;
      }
      if (bannerImage && !/^data:|^blob:/i.test(bannerImage)) {
        bannerPatch.banner_image = bannerImage;
      }
      if (typeof patch.banner_gradient === "string") {
        bannerPatch.banner_gradient = patch.banner_gradient;
      }
      if (Object.keys(bannerPatch).length) {
        try {
          await saveProfilePatch(bannerPatch);
        } catch (e) {
          console.error("Failed to persist banner update:", e);
        }
      }
    }

    if (Array.isArray(patch.taste_cards)) {
      setLiveTasteCards(patch.taste_cards);
      try {
        window.dispatchEvent(
          new CustomEvent("sf:tastecards:updated", { detail: { cards: patch.taste_cards } })
        );
      } catch {}
    }

    if (Object.prototype.hasOwnProperty.call(patch, "taste_card_style_global")) {
      setLiveGlobalGlow(patch.taste_card_style_global ?? null);
    }

    const premiumChanged =
      Object.prototype.hasOwnProperty.call(patch, "theme_preset") ||
      Object.prototype.hasOwnProperty.call(patch, "banner_gradient") ||
      Object.prototype.hasOwnProperty.call(patch, "taste_card_style_global") ||
      Object.prototype.hasOwnProperty.call(patch, "taste_cards");
    if (premiumChanged) {
      try {
        window.dispatchEvent(new CustomEvent("sf:profile:refresh"));
      } catch {}
    }

    const { banner_url, banner_image, banner_gradient, taste_cards, ...rest } = patch;
    if (Object.keys(rest).length) {
      try {
        await saveProfilePatch(rest);
      } catch (e) {
        console.error("Failed to apply profile patch:", e);
      }
    }
  };

  const handleRemoveTake = async (id) => {
    if (!id || removingTakeId) return;
    if (typeof window !== "undefined" && !window.confirm("Remove this take?")) return;

    try {
      setRemovingTakeId(id);
      const { error } = await supabase
      .from("club_film_takes")
        .delete()
        .eq("id", id)
        .eq("user_id", viewProfile?.id);

      if (error) throw error;

      // Update local state
      setFilmTakes((prev) => prev.filter((t) => t.id !== id));
      setEditingTake(null);
      bumpWatchlistRefresh();
      toast.success("Take removed.");
    } catch (e) {
      console.error("Failed to remove take:", e);
      toast.error(e?.message || "Could not remove that take.");
    } finally {
      setRemovingTakeId(null);
    }
  };

  const handleOpenEditTake = (take) => {
    if (!take) return;
    setEditingTake(take);
    setEditingTakeDraft({
      rating_5:
        typeof take.rating_5 === "number" ? take.rating_5 : 0,
      take: take.take || "",
    });
  };

  const handleCloseEditTake = () => {
    if (editingTakeSaving) return;
    setEditingTake(null);
  };

  const handleSaveEditTake = async () => {
    if (!editingTake || !viewProfile?.id) return;

    setEditingTakeSaving(true);
    try {
      const newRating = Number(editingTakeDraft.rating_5) || null;
      const newText =
        editingTakeDraft.take && editingTakeDraft.take.trim()
          ? editingTakeDraft.take.trim()
          : null;

      const { data, error } = await supabase
      .from("club_film_takes")
        .update({
          rating_5: newRating,
          take: newText,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingTake.id)
        .eq("user_id", viewProfile.id)
        .select(FILM_TAKES_SELECT)
        .maybeSingle();

      if (error) throw error;

      // Update local state with fresh row
      setFilmTakes((prev) =>
        prev.map((t) =>
          t.id === editingTake.id ? { ...t, ...data } : t
        )
      );

      setEditingTake(null);
      bumpWatchlistRefresh();
    } catch (e) {
      console.error("Failed to save edited take:", e);
      alert("Couldn't save that take. Please try again.");
    } finally {
      setEditingTakeSaving(false);
    }
  };


  /* ---------------- derived display from viewed profile ---------------- */
  const displayName =
    displayProfile?.display_name || viewProfile?.display_name || "Member";
  const isPremiumProfile = viewProfile?.plan === "directors_cut";

  const username = viewProfile?.slug || viewProfile?.username || "username";
  const bio = viewProfile?.bio || "";
  const avatarUrl =
    displayProfile?.avatar_url || viewProfile?.avatar_url || "/default-avatar.svg";

  const bannerUrl =
    bannerOverride ?? viewProfile?.banner_url ?? viewProfile?.banner_image ?? "";
  const bannerGradient =
    isPremiumProfile ? (bannerGradientOverride ?? viewProfile?.banner_gradient ?? "") : "";

 // allow null (default/base look) when no theme is selected
const themeId = isPremiumProfile ? (viewProfile?.theme_preset ?? null) : null;
const themeStyle = useMemo(() => getThemeVars(themeId), [themeId]);

  const showTasteCardsSkeleton =
    tasteCardsSkeleton && !tasteCardsHydratedRef.current && liveTasteCards.length === 0;

  const showRefreshHint = Boolean(
    viewProfile && (loading || viewLoading)
  );

  

  /* ---------------- banner component ---------------- */
  const Banner = () => {
    const style = bannerUrl
      ? {
          backgroundImage: `${bannerGradient ? bannerGradient + "," : ""}url(${bannerUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : {};
    return (
      <div className="relative w-full h-[300px] sm:h-[500px] group rounded-2xl sm:rounded-2xl overflow-hidden bg-top sm:bg-center" style={style}>
        {!bannerUrl && (
          <div className="absolute inset-0 grid place-items-center bg-zinc-800 text-zinc-400">
            No banner selected yet
          </div>
        )}
        <div className="absolute inset-0 bg-black/30 group-hover:bg-black/50 transition" />
        <div className="absolute bottom-0 left-0 w-full h-40 bg-gradient-to-b from-transparent via-black/60 to-black pointer-events-none" />

        <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20">
          {viewingOwn ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setEditOpen(true);
                setEditMode(true);
              }}
              className="bg-black/70 text-white text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-full hover:bg-black/90 transition border border-white/10"
            >
              Edit Profile
            </button>
          ) : (
            <FollowButton profileId={viewProfile?.id} />
          )}
        </div>

        <div className="absolute bottom-0 left-0 w-full px-4 sm:px-6 pb-4 sm:pb-6 z-10 flex items-end">
          <div className="flex items-end space-x-3 sm:space-x-4 max-w-3xl w-full">
            <div className="relative w-16 h-16 sm:w-24 sm:h-24 shrink-0">
              <div
                className={
                  isPremiumProfile
                    ? "absolute inset-0 rounded-full themed-outline forge opacity-90 border border-transparent shadow-none"
                    : "absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_20%,rgba(250,204,21,0.28),rgba(0,0,0,0.9))] opacity-70 pointer-events-none"
                }
              />
              <img
                src={avatarUrl}
                alt="Avatar"
                className={
                  isPremiumProfile
                    ? "w-full h-full rounded-full border border-white/15 object-cover shadow-[0_10px_24px_rgba(0,0,0,0.35)]"
                    : "w-full h-full rounded-full border border-white/20 object-cover shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_14px_30px_rgba(0,0,0,0.45)]"
                }
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = "/default-avatar.svg";
                }}
              />
             {editMode && viewingOwn && (
                <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 hover:opacity-100 transition">
                  <label
                    htmlFor="avatar-upload"
                    className={`cursor-pointer text-white text-sm px-3 py-1 rounded-full bg-black/60 border border-white/10 ${
                      uploadingAvatar ? "opacity-60 cursor-not-allowed" : ""
                    }`}
                  >
                    {uploadingAvatar ? "Uploading…" : "Change"}
                  </label>
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                    disabled={uploadingAvatar}
                  />
                </div>
              )}
            </div>
            <div className="w-full">
              {editMode && viewingOwn ? (
                <input
                  type="text"
                  defaultValue={displayName}
                  onBlur={(e) => {
                    const v = (e.target.value || "").trim();
                    if (v && v !== displayName) saveProfilePatch({ display_name: v });
                  }}
                  className="text-lg sm:text-xl font-bold bg-zinc-800/40 p-1 rounded w-full"
                />
              ) : (
                <h2 className="text-lg sm:text-xl font-bold">{displayName}</h2>
              )}
              {editMode && viewingOwn ? (
                <input
                  type="text"
                  defaultValue={username}
                  onBlur={(e) => {
                    const v = (e.target.value || "").trim();
                    if (v && v !== username) handleUsernameChange(v);
                  }}
                  className="text-xs sm:text-sm text-gray-300 bg-zinc-800/40 p-1 rounded w-full mt-1"
                />
              ) : (
                <p className="text-xs sm:text-sm text-gray-300 mt-1 flex items-center">
                  <span>@{username}</span>
                  {isPremiumProfile && <DirectorsCutBadge className="ml-2" size="xs" active />}
                </p>
              )}

              {editMode && viewingOwn ? (
                <textarea
                  defaultValue={bio}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v !== bio) saveProfilePatch({ bio: v });
                  }}
                  rows={2}
                  className="mt-1 text-xs sm:text-sm text-white bg-zinc-800/40 p-2 rounded w-full resize-none"
                />
              ) : (
                <p className="mt-1 text-xs sm:text-sm text-gray-200">{bio}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  /* ---------------- loading ---------------- */
  if (!viewProfile && !viewLoading) {
    return <ProfileSkeleton />;
  }
  if (!viewProfile && (loading || viewLoading)) {
    return <ProfileSkeleton />;
  }

  /* ---------------- render ---------------- */
  return (
    <div
      className="sf-theme w-full text-white py-4 sm:py-8 px-3 sm:px-0 bg-black"
      style={themeStyle}
      data-theme={themeId}
    >
      <div className="w-full max-w-none mx-0 bg-black overflow-hidden sm:max-w-6xl sm:mx-auto sm:rounded-2xl sm:shadow-lg">
        <Banner />

        <StatsAndWatchlist
          statsData={{
            followers: counts.followers,
            following: counts.following,
            role: roleBadge,
            roleClub,
            isPremium: isPremiumProfile,
          }}
          profileWatchlist={profileWatchlist}
          watchlistSkeleton={profileWatchlistSkeleton}
          userId={viewProfile?.id}
          skipWatchlist={!isOwnProfile}
          movieRoute="/movie"
          onFollowersClick={() => {
            const handle = viewProfile?.slug || viewProfile?.id;
            if (handle) navigate(`/u/${handle}/followers`);
          }}
          onFollowingClick={() => {
            const handle = viewProfile?.slug || viewProfile?.id;
            if (handle) navigate(`/u/${handle}/following`);
          }}
        />
        {showRefreshHint && (
          <div className="flex items-center gap-2 px-3 sm:px-6 pt-2 text-xs text-zinc-400">
            <img
              src="/superfilm-logo.png"
              alt="SuperFilm"
              className="h-4 w-auto opacity-80"
              loading="lazy"
            />
            <span className="text-xs uppercase tracking-[0.3em]">Refreshing profile…</span>
          </div>
        )}

        {/* Avatar cropper removed; direct file upload handles images now */}

        <div className="px-3 sm:px-6 pt-6">
          <div ref={moodboardAnchorRef} id="moodboard">
          <Suspense
            fallback={
              <div className="h-40 rounded-2xl border border-zinc-800 bg-zinc-900/60 animate-pulse" />
            }
          >
              <Moodboard
                profileId={viewProfile?.id}
                isOwner={viewingOwn}
                className="w-full"
                usePremiumTheme={isPremiumProfile}
                disableAutoRefresh
                refreshKey={profileRefreshEpoch}
              />
          </Suspense>
          </div>
        </div>

        {/* Taste Cards — view */}
        {showTasteCardsSkeleton ? (
          <section className="mt-6 px-0 sm:px-6">
            <div
              className={
                isPremiumProfile
                  ? "themed-card themed-outline forge rounded-2xl border border-zinc-800 bg-black/40"
                  : "rounded-2xl border border-zinc-800 bg-black/40"
              }
            >
              <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-zinc-900 sm:border-zinc-800">
                <h3 className="text-sm font-semibold text-white">Taste Cards</h3>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-4 md:gap-5 p-4">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-24 rounded-2xl border border-zinc-800 bg-zinc-900/60 animate-pulse"
                  />
                ))}
              </div>
            </div>
          </section>
        ) : (
          !editMode &&
          liveTasteCards.length > 0 && (
            <section className="mt-6 px-0 sm:px-6">
              <div
                className={
                  isPremiumProfile
                    ? "themed-card themed-outline forge rounded-2xl border border-zinc-800 bg-black/40"
                    : "rounded-2xl border border-zinc-800 bg-black/40"
                }
              >
                <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-zinc-900 sm:border-zinc-800">
                  <h3 className="text-sm font-semibold text-white">Taste Cards</h3>
                </div>
                <ProfileTasteCards cards={liveTasteCards} globalGlow={liveGlobalGlow} />
              </div>
            </section>
          )
        )}

        {/* Rating language — view (premium users' phrase groups) */}
        {!editMode && viewScheme?.tags?.length > 0 && (
          <section className="mt-6 px-0 sm:px-6">
            <div className={
              isPremiumProfile
                ? "themed-card themed-outline forge rounded-2xl border border-zinc-800 bg-black/40"
                : "rounded-2xl border border-zinc-800 bg-black/40"
            }>
              <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-zinc-900 sm:border-zinc-800">
                <h3 className="text-sm font-semibold text-white">Rating Language</h3>
              </div>
              <RatingSchemeView scheme={viewScheme} />
            </div>
          </section>
        )}

        {/* FILM TAKES — Preview (first 3 only) */}
        <section className="mt-4 sm:mt-8 px-0 sm:px-6">
          <div className={
            isPremiumProfile
              ? "themed-card themed-outline forge rounded-2xl border border-zinc-800 bg-black/30 p-3 sm:p-4"
              : "rounded-2xl border border-zinc-800 bg-black/30 p-3 sm:p-4"
          }>
            <div className="flex items-center justify-between mb-3 px-1 sm:px-0">
              <h3 className="text-sm font-semibold text-white">Film Takes</h3>
              <Link
                to={
                  viewProfile?.slug
                    ? `/u/${viewProfile.slug}/takes`
                    : viewProfile?.id
                    ? `/profile/${viewProfile.id}/takes`
                    : "/"
                }
                className="text-xs text-zinc-400 hover:text-white transition"
              >
                See all
              </Link>
            </div>

            {filmTakesLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-20 rounded-xl border border-zinc-800 bg-zinc-900 animate-pulse"
                  />
                ))}
              </div>
            ) : filmTakes.length === 0 ? (
              <p className="text-xs text-zinc-500">No takes yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
                {filmTakes.slice(0, 3).map((take) => (
                  <div
                    key={take.id}
                    className={viewingOwn ? "cursor-pointer" : ""}
                    onClick={
                      viewingOwn ? () => handleOpenEditTake(take) : undefined
                    }
                  >
                    <FilmTakeCard take={take} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>


                {/* Edit Film Take modal (owner only) */}
                {viewingOwn && editingTake && (
          <div className="fixed inset-0 z-40 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/60"
            onClick={handleCloseEditTake}
          />
          <div className="relative z-50 w-full max-w-md rounded-2xl border border-zinc-800 bg-black/90 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">
                  Edit Film Take
                </h3>
                <button
                  type="button"
                  onClick={handleCloseEditTake}
                  className="text-xs text-zinc-400 hover:text-zinc-200"
                  disabled={editingTakeSaving}
                >
                  Close
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="text-xs text-zinc-400 mb-1">
                    Rating (out of 5)
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="5"
                    step="0.5"
                    value={editingTakeDraft.rating_5}
                    onChange={(e) =>
                      setEditingTakeDraft((prev) => ({
                        ...prev,
                        rating_5: e.target.value,
                      }))
                    }
                    className="w-24 rounded-lg border border-zinc-700 bg-black/70 px-2 py-1 text-sm text-white"
                  />
                </div>

                <div>
                  <div className="text-xs text-zinc-400 mb-1">
                    Your take
                  </div>
                  <textarea
                    rows={5}
                    value={editingTakeDraft.take}
                    onChange={(e) =>
                      setEditingTakeDraft((prev) => ({
                        ...prev,
                        take: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-zinc-700 bg-black/70 p-2 text-sm text-white"
                    placeholder="Rewrite or polish your thoughts…"
                  />
                </div>

                <div className="flex justify-between items-center pt-1">
                  <button
                    type="button"
                    onClick={() => handleRemoveTake(editingTake.id)}
                    className="text-xs text-red-400 hover:text-red-300"
                    disabled={editingTakeSaving || removingTakeId === editingTake.id}
                  >
                    {removingTakeId === editingTake.id ? "Deleting…" : "Delete take"}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEditTake}
                    disabled={editingTakeSaving}
                    className="rounded-lg bg-yellow-500 px-4 py-1.5 text-xs font-medium text-black hover:bg-yellow-400 disabled:opacity-60"
                  >
                    {editingTakeSaving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}




        {/* Edit panel in a PORTAL — mount only when open */}
        {editOpen &&
          typeof document !== "undefined" &&
          createPortal(
            <EditProfilePanel
              open={true}
              onClose={() => {
                setEditOpen(false);
                setEditMode(false);
              }}
              onUpdated={handlePanelUpdated}
              profile={viewProfile}
              profileId={viewProfile?.id}
              isOwner={viewingOwn}
              disablePremiumTheme={!isPremiumProfile}
            />,
            document.body
          )}

        {/* Avatar cropper modal */}
        {showAvatarCropper && rawAvatarImage && (
          <AvatarCropper
            imageSrc={rawAvatarImage}
            variant="avatar"
            onCancel={() => {
              setShowAvatarCropper(false);
              setRawAvatarImage(null);
            }}
            onCropComplete={async (blob, previewUrl) => {
              try {
                setUploadingAvatar(true);
                const publicUrl = await uploadAvatar(blob, user.id, {
                  prevUrl: viewProfile?.avatar_url || undefined,
                });
                await saveProfilePatch({ avatar_url: publicUrl });
                setAvatar(publicUrl);
                setViewProfile((prev) => (prev ? { ...prev, avatar_url: publicUrl } : prev));
              } catch (err) {
                console.error("Failed to save avatar:", err);
              } finally {
                setUploadingAvatar(false);
                setShowAvatarCropper(false);
                setRawAvatarImage(null);
              }
            }}
          />
        )}
      </div>
    </div>
  );
};

export default UserProfile;
