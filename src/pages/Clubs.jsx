// src/pages/Clubs.jsx (redesigned: filter pill + carousel akin to Clubs2)
import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import supabase from "lib/supabaseClient";
import "../App.css";
import "./Clubs.css";
import usePageVisibility from "../hooks/usePageVisibility";
import useHydratedSupabaseFetch from "../hooks/useHydratedSupabaseFetch";
import useAppResume from "../hooks/useAppResume";
import { useUser } from "../context/UserContext";
import { Users, CalendarDays, Trophy, PlusCircle } from "lucide-react";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import "swiper/css/navigation";
import { Navigation, Mousewheel, Keyboard } from "swiper/modules";

/* ---------- Filter metadata ---------- */
const LOCATIONS = [
  // Global cities / markets
  "London",
  "Mogadishu",
  "Warsaw",
  "New York City",
  "Los Angeles",
  "Paris",
  "Berlin",
  "Toronto",
  "Vancouver",
  "Chicago",
  "San Francisco",
  "Mexico City",
  "Sao Paulo",
  "Buenos Aires",
  "Madrid",
  "Barcelona",
  "Lisbon",
  "Rome",
  "Milan",
  "Copenhagen",
  "Stockholm",
  "Oslo",
  "Helsinki",
  "Dublin",
  "Amsterdam",
  "Brussels",
  "Zurich",
  "Geneva",
  "Vienna",
  "Prague",
  "Budapest",
  "Istanbul",
  "Dubai",
  "Abu Dhabi",
  "Riyadh",
  "Doha",
  "Cairo",
  "Nairobi",
  "Lagos",
  "Accra",
  "Johannesburg",
  "Cape Town",
  "Abuja",
  "Addis Ababa",
  "Kigali",
  "Kampala",
  "Tunis",
  "Algiers",
  "Rabat",
  "Dakar",
  "Pretoria",
  "Luanda",
  "Maputo",
  "Harare",
  "Mumbai",
  "Delhi",
  "Bengaluru",
  "Chennai",
  "Kolkata",
  "Dhaka",
  "Karachi",
  "Lahore",
  "Singapore",
  "Hong Kong",
  "Tokyo",
  "Osaka",
  "Seoul",
  "Taipei",
  "Beijing",
  "Shanghai",
  "Manila",
  "Jakarta",
  "Sydney",
  "Melbourne",
  "Auckland",
  "Wellington",
  // Broad regions fallback
  "North America",
  "Europe",
  "Asia",
  "South America",
  "Africa",
  "Oceania",
  "Online",
];
const GENRES = [
  "Drama",
  "Thriller",
  "Horror",
  "Comedy",
  "Sci-Fi",
  "Action",
  "Indie",
  "Documentary",
  "Romance",
  "Animation",
];

/* ---------- Cache + paging ---------- */
const CACHE_KEY = "sf.clubs2.cache.v3";
const CACHE_MAX_AGE = 1000 * 60 * 5; // 5 minutes
const PAGE_SIZE = 20;
const ENABLE_REALTIME = false;
const svgPlaceholder = (w, h, label) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#141414"/><text x="50%" y="50%" fill="#6b7280" font-family="Arial, sans-serif" font-size="16" text-anchor="middle" dominant-baseline="central">${label}</text></svg>`
  )}`;
const CLUB_PLACEHOLDER = svgPlaceholder(300, 480, "Club");
const safeClubImage = (url, fallback = CLUB_PLACEHOLDER) => {
  if (!url || typeof url !== "string") return fallback;
  if (/^https?:\/\//i.test(url)) return url;
  return fallback;
};
const CLUB_ABOUT_UPDATED_EVENT = "sf:club:about-updated";

const readDiscoverCache = () => {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || !parsed?.data) return null;
    if (Date.now() - parsed.ts > CACHE_MAX_AGE) return null;
    return parsed.data;
  } catch {
    return null;
  }
};

const writeDiscoverCache = (data) => {
  if (typeof localStorage === "undefined" || !data) return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
};

function enrichClubs(list) {
  return (list || []).map((c) => {
    const baseMeta = c.meta && typeof c.meta === "object" ? c.meta : {};
    return { ...c, meta: { ...baseMeta } };
  });
}

/* ---------- Swiper config ---------- */
const swiperConfig = {
  modules: [Navigation, Mousewheel, Keyboard],
  slidesPerView: "auto",
  spaceBetween: 14,
  navigation: false,
  loop: true,
  grabCursor: true,
  simulateTouch: true,
  threshold: 5,
  mousewheel: { forceToAxis: true, releaseOnEdges: false, sensitivity: 0.6 },
  keyboard: { enabled: true, onlyInViewport: true },
};

/* ---------- Hover overlay ---------- */
function HoverPreview({ sourceEl, club, scale = 1.06, showTooltip = false, tooltipData }) {
  const ghostRef = useRef(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!sourceEl) return;
    const follow = () => {
      if (!ghostRef.current || !sourceEl) return;
      const r = sourceEl.getBoundingClientRect();
      const g = ghostRef.current;
      g.style.top = `${r.top}px`;
      g.style.left = `${r.left}px`;
      g.style.width = `${r.width}px`;
      g.style.height = `${r.height}px`;
    };
    follow();
    const interval = setInterval(follow, 60);
    const startId = requestAnimationFrame(() => setActive(true));
    return () => {
      clearInterval(interval);
      cancelAnimationFrame(startId);
    };
  }, [sourceEl]);

  if (!sourceEl || !club) return null;

  return createPortal(
    <div
      ref={ghostRef}
      className={`preview-ghost ${active ? "active" : ""}`}
      style={{ "--scale": scale }}
      aria-hidden
    >
      <div className={`club-tooltip ${showTooltip ? "show" : ""}`}>
        <div className="club-tooltip__row">
          <span className="club-dot" /> <strong className="mr-1">Members:</strong>{" "}
          {tooltipData?.members ?? "—"}
        </div>
        <div className="club-tooltip__row">
          <span className="club-dot" /> <strong className="mr-1">Summary:</strong>{" "}
          {tooltipData?.summary ?? "—"}
        </div>
        <div className="club-tooltip__row">
          <span className="club-dot" /> <strong className="mr-1">Fav genres:</strong>{" "}
          {tooltipData?.fav ?? "—"}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ---------- Filters helpers ---------- */
const DEFAULT_FILTERS = {
  location: "any",
  genres: [],
};

function sizeKeyFromMembers(count) {
  const members = Number(count);
  if (!Number.isFinite(members)) return undefined;
  if (members <= 50) return "small";
  if (members <= 150) return "medium";
  return "large";
}

const normalizeKey = (value) => String(value ?? "").trim().toLowerCase();

function coerceStringArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v ?? "").trim())
      .filter(Boolean);
  }

  if (typeof value !== "string") return [];
  const s = value.trim();
  if (!s) return [];

  // JSON array string: ["Comedy","Drama"]
  if (s.startsWith("[") && s.endsWith("]")) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return coerceStringArray(parsed);
    } catch {}
  }

  // Postgres array string: {"Comedy","Drama"} or {Comedy,Drama}
  if (s.startsWith("{") && s.endsWith("}")) {
    const inner = s.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(",")
      .map((part) => part.trim().replace(/^"(.*)"$/, "$1"))
      .filter(Boolean);
  }

  // Comma-separated list: Comedy, Drama
  if (s.includes(",")) {
    return s
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }

  return [s];
}

function coerceMemberCount(value) {
  if (value == null) return undefined;
  if (typeof value === "object") {
    const maybeCount = value?.count ?? value?.member_count ?? value?.members;
    if (maybeCount != null) return coerceMemberCount(maybeCount);
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

const GENRE_ALIASES = {
  "science fiction": "sci-fi",
  "sci fi": "sci-fi",
  scifi: "sci-fi",
  "sci-fi": "sci-fi",
  "rom-com": "romance",
  romcom: "romance",
  "romantic comedy": "romance",
  independent: "indie",
  documentaries: "documentary",
};

function normalizeGenreKey(value) {
  const raw = normalizeKey(value);
  if (!raw) return "";
  return GENRE_ALIASES[raw] || raw;
}

function passesFilters(club, f) {
  const meta = club?.meta || {};

  if (f.location !== "any") {
    const filterLoc = normalizeKey(f.location);
    const clubLoc = normalizeKey(club?.location ?? meta?.location);
    if (!clubLoc) return false;
    const isMatch =
      clubLoc === filterLoc ||
      clubLoc.includes(filterLoc) ||
      filterLoc.includes(clubLoc);
    if (!isMatch) return false;
  }

  if (f.genres.length > 0) {
    const selected = (f.genres || []).map(normalizeGenreKey).filter(Boolean);
    const clubGenres = [
      ...(Array.isArray(club?.genres) ? club.genres : []),
      ...(Array.isArray(meta?.genres) ? meta.genres : []),
      ...(Array.isArray(meta?.genre_focus) ? meta.genre_focus : []),
      ...(Array.isArray(meta?.genreFocus) ? meta.genreFocus : []),
    ].map(normalizeGenreKey).filter(Boolean);
    const hasOverlap = clubGenres.some((g) => selected.includes(g));
    if (!hasOverlap) return false;
  }
  return true;
}

/* Supabase row → UI club mapper */
function mapRowToClub(row) {
  const genreFocus = Array.isArray(row.genre_focus) ? row.genre_focus : undefined;
  const metaFromRow = row.meta && typeof row.meta === "object" ? { ...row.meta } : {};

  const location =
    typeof row.location === "string"
      ? row.location
      : typeof metaFromRow.location === "string"
      ? metaFromRow.location
      : row.location != null
      ? String(row.location)
      : metaFromRow.location != null
      ? String(metaFromRow.location)
      : "";
  if (row.location !== undefined || metaFromRow.location !== undefined) {
    metaFromRow.location = location;
  }

  const genres = coerceStringArray(row.genres ?? metaFromRow.genres ?? genreFocus);
  if (row.genres !== undefined || metaFromRow.genres !== undefined || genreFocus) {
    metaFromRow.genres = genres;
  }

  if (Array.isArray(row.genre_focus)) {
    metaFromRow.genre_focus = row.genre_focus;
    metaFromRow.genreFocus = row.genre_focus;
  } else {
    if (!Array.isArray(metaFromRow.genreFocus) && Array.isArray(metaFromRow.genre_focus)) {
      metaFromRow.genreFocus = metaFromRow.genre_focus;
    }
    if (!Array.isArray(metaFromRow.genreFocus) && genreFocus) metaFromRow.genreFocus = genreFocus;
  }

  const members = coerceMemberCount(
    row.members ??
      metaFromRow.members ??
      metaFromRow.member_count ??
      metaFromRow.memberCount ??
      metaFromRow.members_count
  );
  if (typeof members === "number") metaFromRow.members = members;

  const summary =
    typeof row.summary === "string"
      ? row.summary
      : typeof metaFromRow.summary === "string"
      ? metaFromRow.summary
      : "";
  if (typeof row.summary === "string" || typeof metaFromRow.summary === "string") {
    metaFromRow.summary = summary;
  }

  const tagline =
    typeof row.tagline === "string"
      ? row.tagline
      : typeof metaFromRow.tagline === "string"
      ? metaFromRow.tagline
      : "";
  if (typeof row.tagline === "string" || typeof metaFromRow.tagline === "string") {
    metaFromRow.tagline = tagline;
  }

  if (typeof metaFromRow.isNew !== "boolean" && typeof metaFromRow.is_new === "boolean") {
    metaFromRow.isNew = metaFromRow.is_new;
  }
  if (typeof metaFromRow.activeThisWeek !== "boolean" && typeof metaFromRow.active_this_week === "boolean") {
    metaFromRow.activeThisWeek = metaFromRow.active_this_week;
  }
  if (typeof metaFromRow.liveSoon !== "boolean" && typeof metaFromRow.live_soon === "boolean") {
    metaFromRow.liveSoon = metaFromRow.live_soon;
  }
  if (typeof metaFromRow.isNew !== "boolean" && typeof row.is_new === "boolean") {
    metaFromRow.isNew = row.is_new;
  }
  if (typeof metaFromRow.activeThisWeek !== "boolean" && typeof row.active_this_week === "boolean") {
    metaFromRow.activeThisWeek = row.active_this_week;
  }
  if (typeof metaFromRow.liveSoon !== "boolean" && typeof row.live_soon === "boolean") {
    metaFromRow.liveSoon = row.live_soon;
  }

  if (typeof metaFromRow.size !== "string") {
    const derived = sizeKeyFromMembers(metaFromRow.members);
    if (derived) metaFromRow.size = derived;
  }

  if (typeof row.is_official === "boolean") metaFromRow.is_official = row.is_official;
  if (typeof row.is_superfilm === "boolean") metaFromRow.is_superfilm = row.is_superfilm;
  if (typeof row.is_curated === "boolean") metaFromRow.is_curated = row.is_curated;
  if (typeof row.join_policy === "string") metaFromRow.join_policy = row.join_policy;
  if (typeof row.privacy_mode === "string" && !metaFromRow.join_policy) {
    metaFromRow.join_policy = row.privacy_mode;
  }
  if (typeof row.type === "string") metaFromRow.type = row.type;

  return {
    id: `db-${String(row.id)}`,
    slug: row.slug || null,
    path: row.slug || String(row.id),
    rawId: row.id,
    name: row.name ?? "Untitled Club",
    image: row.profile_image_url || CLUB_PLACEHOLDER,
    location: location || null,
    genres: genres,
    members: typeof members === "number" ? members : null,
    summary: summary || null,
    tagline: tagline || null,
    meta: metaFromRow,
    createdAt: row.created_at ?? null,
  };
}

function ClubCardSkeleton() {
  return (
    <div className="club-card block overflow-hidden">
      <div className="club-thumb bg-zinc-900/70 animate-pulse" />
      <div className="p-3 space-y-2">
        <div className="h-4 w-2/3 rounded bg-zinc-800 animate-pulse" />
        <div className="h-3 w-1/2 rounded bg-zinc-800 animate-pulse" />
      </div>
    </div>
  );
}

export default function Clubs() {
  const navigate = useNavigate();
  const userClubId = null;
  const userHasClub = !!userClubId;

  const [hover, setHover] = useState(null);
  const [showTip, setShowTip] = useState(false);
  const [tipData, setTipData] = useState(null);
  const timerRef = useRef(null);
  const swiperRefs = useRef([]);
  const hoverRef = useRef(null);
  const isPageVisible = usePageVisibility();

  const clearTipTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  const cancelHover = useCallback(() => {
    clearTipTimer();
    setShowTip(false);
    setHover(null);
    hoverRef.current = null;
  }, []);

  useEffect(() => {
    if (!hover) return;
    const onWheel = () => cancelHover();
    const onScroll = () => cancelHover();
    const onKey = (e) => {
      if (["ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", " "].includes(e.key))
        cancelHover();
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("keydown", onKey);

    const detach = [];
    swiperRefs.current.forEach((swiper) => {
      if (swiper && swiper.on && swiper.off) {
        const bind = (evt) => {
          const fn = () => cancelHover();
          swiper.on(evt, fn);
          detach.push(() => swiper.off(evt, fn));
        };
        ["touchStart", "sliderMove", "transitionStart", "slideChange"].forEach(bind);
      }
    });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("keydown", onKey);
      detach.forEach((fn) => fn && fn());
    };
  }, [hover, cancelHover]);

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [openFilter, setOpenFilter] = useState(null);
  const [search, setSearch] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const panelRef = useRef(null);

  const cachedDiscover = useMemo(() => readDiscoverCache(), []);
  const [discoverState, setDiscoverState] = useState({
    clubs: cachedDiscover?.clubs ?? [],
  });
  const [discoverError, setDiscoverError] = useState(null);
  const [realtimeAttached, setRealtimeAttached] = useState(false);
  const [initialFetchDone, setInitialFetchDone] = useState(Boolean(cachedDiscover?.clubs?.length));
  const [fetchEpoch, setFetchEpoch] = useState(0);
  const lastSuccessfulFetchRef = useRef(0);
  const requestedFetchEpochRef = useRef(fetchEpoch);

  const refreshDiscover = useCallback(() => {
    setFetchEpoch((prev) => {
      const next = prev + 1;
      requestedFetchEpochRef.current = next;
      return next;
    });
  }, []);
  const { appResumeTick } = useAppResume();
  const resumeRef = useRef(false);

  useEffect(() => {
    if (!resumeRef.current) {
      resumeRef.current = true;
      return;
    }
    refreshDiscover();
  }, [appResumeTick, refreshDiscover]);

  const { sessionLoaded, myClubIds } = useUser();

  useEffect(() => {
    if (!sessionLoaded || !isPageVisible) return;
    if (cachedDiscover?.clubs?.length) return; // skip if warm cache
    refreshDiscover();
  }, [isPageVisible, sessionLoaded]);

  const saveCache = useCallback(
    (clubs) => {
      writeDiscoverCache({ clubs });
    },
    []
  );

  const fetchClubs = useCallback(async () => {
    const SELECT_PREFERRED = `
      id,
      slug,
      name,
      profile_image_url,
      created_at,
      meta,
      genres,
      genre_focus,
      location,
      members,
      is_new,
      active_this_week,
      live_soon,
      summary,
      tagline,
      join_policy,
      privacy_mode,
      is_private,
      type
    `;

    const SELECT_NO_CREATED_AT = `
      id,
      slug,
      name,
      profile_image_url,
      meta,
      genres,
      genre_focus,
      location,
      members,
      is_new,
      active_this_week,
      live_soon,
      summary,
      tagline,
      join_policy,
      privacy_mode,
      is_private,
      type
    `;

    const tryFetch = async ({ select, orderByCreatedAt }) => {
      let query = supabase.from("clubs_public").select(select).limit(PAGE_SIZE); // fetch only what you render
      if (orderByCreatedAt) {
        query = query.order("created_at", { ascending: false });
      }
      const { data, error } = await query;
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    };

    let rows = [];
    let lastError = null;
    const attempts = [
      { select: SELECT_PREFERRED, orderByCreatedAt: true },
      // Some environments have a slimmer `clubs_public` view (or missing `created_at`).
      // Retry without ordering and without selecting `created_at` so we don't hard-fail with a 400.
      { select: SELECT_NO_CREATED_AT, orderByCreatedAt: false },
      // Final fallback: fetch whatever columns exist in the view.
      { select: "*", orderByCreatedAt: true },
      { select: "*", orderByCreatedAt: false },
    ];

    for (const attempt of attempts) {
      try {
        rows = await tryFetch(attempt);
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (lastError) throw lastError;

    const clubIds = rows.map((row) => row?.id).filter(Boolean);

    // Source of truth for filters/card labels is the Club Profile "About" section (clubs table),
    // not whatever shape `clubs_public` happens to expose in each environment.
    const needsAboutHydration = rows.some((r) => {
      const meta = r?.meta && typeof r.meta === "object" ? r.meta : null;
      const hasLocation = r?.location !== undefined || meta?.location !== undefined;
      const hasGenres = r?.genres !== undefined || meta?.genres !== undefined;
      return !hasLocation || !hasGenres;
    });

    if (clubIds.length && needsAboutHydration) {
      try {
        const { data: aboutRows, error: aboutError } = await supabase
          .from("clubs")
          .select("id, location, genres")
          .in("id", clubIds);
        if (!aboutError && Array.isArray(aboutRows) && aboutRows.length) {
          const byId = new Map(aboutRows.map((r) => [String(r.id), r]));
          rows = rows.map((r) => {
            const extra = byId.get(String(r?.id));
            if (!extra) return r;
            return {
              ...r,
              ...(extra.location !== undefined ? { location: extra.location } : {}),
              ...(extra.genres !== undefined ? { genres: extra.genres } : {}),
            };
          });
        }
      } catch {}
    }

    const memberIds = Array.isArray(myClubIds) ? myClubIds : [];

    const buildPrivacyMapFromRows = () => {
      if (!rows.length) return null;
      const hasPrivacyFields = rows.some(
        (r) => r && ("is_private" in r || "privacy_mode" in r)
      );
      if (!hasPrivacyFields) return null;

      const map = new Map();
      rows.forEach((r) => {
        if (!r?.id) return;
        map.set(String(r.id), r?.is_private === true || r?.privacy_mode === "private");
      });
      return map.size ? map : null;
    };

    const fetchPrivacyMapFromClubs = async () => {
      if (!clubIds.length) return null;
      try {
        const { data: privacyData, error: privacyError } = await supabase
          .from("clubs")
          .select("id, is_private, privacy_mode")
          .in("id", clubIds);
        if (privacyError || !Array.isArray(privacyData)) return null;
        const map = new Map(
          privacyData.map((r) => [
            String(r.id),
            r?.is_private === true || r?.privacy_mode === "private",
          ])
        );
        return map.size ? map : null;
      } catch {
        return null;
      }
    };

    const privacyMap = buildPrivacyMapFromRows();

    // Hide private clubs from Discover unless the viewer is a member.
    const visibleRows = privacyMap
      ? rows.filter((row) => {
          const clubId = String(row.id);
          const isMember = memberIds.includes(clubId);
          const isPrivate = privacyMap.get(clubId) === true;
          return !isPrivate || isMember;
        })
      : rows;

    const mapped = enrichClubs(visibleRows.slice(0, PAGE_SIZE).map(mapRowToClub));
    return { clubs: mapped };
  }, [myClubIds]);

  const {
    data: discoverResult,
    error: hydrateError,
    showSkeleton,
    timedOut,
  } = useHydratedSupabaseFetch(
    fetchClubs,
    [fetchEpoch],
    {
      sessionLoaded,
      userId: null,
      timeoutMs: 3500,
      initialData: cachedDiscover ? { clubs: cachedDiscover.clubs } : null,
      enabled: Boolean(sessionLoaded),
    }
  );

  useEffect(() => {
    if (!discoverResult?.clubs) return;
    lastSuccessfulFetchRef.current = requestedFetchEpochRef.current;
    setDiscoverState({ clubs: discoverResult.clubs });
    saveCache(discoverResult.clubs);
    setDiscoverError(null);
    setInitialFetchDone(true);
  }, [discoverResult, saveCache]);

  useEffect(() => {
    if (!hydrateError) return;
    setDiscoverError(hydrateError.message || "Failed to load clubs. Tap to retry.");
  }, [hydrateError]);

  useEffect(() => {
    if (!ENABLE_REALTIME) return;
    if (!initialFetchDone || realtimeAttached) return;

    const channel = supabase
      .channel("clubs2-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "clubs" }, (payload) => {
        setDiscoverState((prev) => {
          const c = mapRowToClub(payload.new);
          if (prev.clubs.some((x) => x.id === c.id)) return prev;
          const merged = [c, ...prev.clubs].slice(0, 200);
          saveCache(merged);
          return { ...prev, clubs: merged };
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "clubs" }, (payload) => {
        setDiscoverState((prev) => {
          const c = mapRowToClub(payload.new);
          const merged = prev.clubs.map((x) => (x.id === c.id ? c : x));
          saveCache(merged);
          return { ...prev, clubs: merged };
        });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "clubs" }, (payload) => {
        setDiscoverState((prev) => {
          const id = `db-${String(payload.old.id)}`;
          const merged = prev.clubs.filter((x) => x.id !== id);
          saveCache(merged);
          return { ...prev, clubs: merged };
        });
      })
      .subscribe();

    setRealtimeAttached(true);
    return () => supabase.removeChannel(channel);
  }, [initialFetchDone, realtimeAttached, saveCache]);

  const getTooltipData = useCallback(
    (club) => {
      const m = club.meta || {};
      const genreLabel =
        Array.isArray(club.genres) && club.genres.length
          ? club.genres.join(", ")
          : Array.isArray(m.genres) && m.genres.length
          ? m.genres.join(", ")
          : "Any & all genres";
      return {
        members: club.members ?? m.members ?? null,
        summary: club.summary || m.summary || club.tagline || m.tagline || null,
        fav: genreLabel,
      };
    },
    []
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handler = (event) => {
      const detail = event?.detail;
      if (!detail?.clubId || !detail?.metaPatch) return;
      const clubId = String(detail.clubId);
      const metaPatch = detail.metaPatch || {};
      const hasLocation = Object.prototype.hasOwnProperty.call(metaPatch, "location");
      const hasGenres = Object.prototype.hasOwnProperty.call(metaPatch, "genres");
      const hasSummary = Object.prototype.hasOwnProperty.call(metaPatch, "summary");
      const hasTagline = Object.prototype.hasOwnProperty.call(metaPatch, "tagline");
      const nextLocation = hasLocation
        ? typeof metaPatch.location === "string"
          ? metaPatch.location
          : metaPatch.location != null
          ? String(metaPatch.location)
          : ""
        : undefined;
      const nextGenres = hasGenres ? coerceStringArray(metaPatch.genres) : undefined;
      const nextSummary = hasSummary
        ? typeof metaPatch.summary === "string"
          ? metaPatch.summary
          : metaPatch.summary != null
          ? String(metaPatch.summary)
          : ""
        : undefined;
      const nextTagline = hasTagline
        ? typeof metaPatch.tagline === "string"
          ? metaPatch.tagline
          : metaPatch.tagline != null
          ? String(metaPatch.tagline)
          : ""
        : undefined;

      setDiscoverState((prev) => {
        let updated = false;
        const nextClubs = prev.clubs.map((entry) => {
          const matches =
            String(entry.rawId) === clubId || String(entry.id) === `db-${clubId}`;
          if (!matches) return entry;
          updated = true;
          return {
            ...entry,
            ...(hasLocation ? { location: nextLocation } : {}),
            ...(hasGenres ? { genres: nextGenres } : {}),
            ...(hasSummary ? { summary: nextSummary } : {}),
            ...(hasTagline ? { tagline: nextTagline } : {}),
            meta: {
              ...(entry.meta || {}),
              ...metaPatch,
            },
          };
        });
        if (!updated) return prev;
        saveCache(nextClubs);
        return { ...prev, clubs: nextClubs };
      });

      const currentHover = hoverRef.current;
      if (currentHover) {
        const matches =
          String(currentHover.rawId) === clubId ||
          String(currentHover.id) === `db-${clubId}`;
        if (matches) {
          const updatedClub = {
            ...currentHover,
            ...(hasLocation ? { location: nextLocation } : {}),
            ...(hasGenres ? { genres: nextGenres } : {}),
            ...(hasSummary ? { summary: nextSummary } : {}),
            ...(hasTagline ? { tagline: nextTagline } : {}),
            meta: {
              ...(currentHover.meta || {}),
              ...metaPatch,
            },
          };
          hoverRef.current = updatedClub;
          setTipData(getTooltipData(updatedClub));
          setHover((prev) => (prev ? { ...prev, club: updatedClub } : prev));
        }
      }
    };

    window.addEventListener(CLUB_ABOUT_UPDATED_EVENT, handler);
    return () => {
      window.removeEventListener(CLUB_ABOUT_UPDATED_EVENT, handler);
    };
  }, [getTooltipData, saveCache]);

  const handleEnter = useCallback(
    (e, club, idx) => {
      hoverRef.current = club;
      setHover({ el: e.currentTarget, club, idx });
      setShowTip(false);
      clearTipTimer();
      setTipData(getTooltipData(club));
      if (isPageVisible) {
        timerRef.current = setTimeout(() => setShowTip(true), 1000);
      }
    },
    [getTooltipData, isPageVisible]
  );

  const handleLeave = useCallback(() => cancelHover(), [cancelHover]);

  const combined = discoverState.clubs;
  const isOfficialClub = useCallback((club) => {
    const m = club?.meta || {};
    return m.type === "superfilm_curated";
  }, []);

  const activeCount =
    (filters.location !== "any") + (filters.genres.length > 0 ? 1 : 0);

  const matchesSearch = useCallback(
    (club) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      const m = club.meta || {};
      const loc = String(club.location ?? m.location ?? "").toLowerCase();
      const clubGenres =
        Array.isArray(club.genres) && club.genres.length
          ? club.genres
          : Array.isArray(m.genres)
          ? m.genres
          : [];
      return (
        club.name.toLowerCase().includes(q) ||
        (loc && loc.includes(q)) ||
        (Array.isArray(clubGenres) && clubGenres.some((g) => String(g || "").toLowerCase().includes(q)))
      );
    },
    [search]
  );

  const filteredByFilters = useMemo(
    () => combined.filter((c) => passesFilters(c, filters)),
    [combined, filters]
  );
  const filtered = useMemo(
    () => filteredByFilters.filter(matchesSearch),
    [filteredByFilters, matchesSearch]
  );

  const curatedClubs = useMemo(() => combined.filter(isOfficialClub), [combined, isOfficialClub]);
  const communityClubs = useMemo(
    () => combined.filter((c) => !isOfficialClub(c)),
    [combined, isOfficialClub]
  );
  const hasCurated = curatedClubs.length > 0;
  const filteredSet = useMemo(() => new Set(filtered.map((c) => c.id)), [filtered]);
  const filteredCurated = useMemo(
    () => curatedClubs.filter((c) => filteredSet.has(c.id)),
    [curatedClubs, filteredSet]
  );
  const filteredCommunity = useMemo(
    () => communityClubs.filter((c) => filteredSet.has(c.id)),
    [communityClubs, filteredSet]
  );

  const baseCurated = filteredCurated.length > 0 ? filteredCurated : curatedClubs;
  const baseForCarousel = hasCurated
    ? (filteredCommunity.length > 0 ? filteredCommunity : communityClubs)
    : (filtered.length > 0 ? filtered : combined);
  const showInitialLoading = showSkeleton && discoverState.clubs.length === 0;
  const noMatches = !showSkeleton && combined.length > 0 && filtered.length === 0;

  useEffect(() => {
    if (!openFilter) return;
    const onEsc = (e) => {
      if (e.key === "Escape") setOpenFilter(null);
    };
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("keydown", onEsc);
    };
  }, [openFilter]);

  const update = (key, value) =>
    setFilters((f) => ({
      ...f,
      [key]: value,
    }));

  const toggleGenre = (g) =>
    setFilters((f) => {
      const has = f.genres.includes(g);
      return {
        ...f,
        genres: has ? f.genres.filter((x) => x !== g) : [...f.genres, g],
      };
    });

  const clearAll = () => setFilters(DEFAULT_FILTERS);

  const clearCurrentFilter = () => {
    setFilters((f) => {
      if (openFilter === "location") return { ...f, location: "any" };
      if (openFilter === "genre") return { ...f, genres: [] };
      return f;
    });
  };

  const locationLabel = filters.location === "any" ? "Anywhere" : filters.location;

  const genreLabel =
    filters.genres.length === 0
      ? "Any genre"
      : filters.genres.length === 1
      ? filters.genres[0]
      : `${filters.genres[0]} +${filters.genres.length - 1}`;

  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);

  return (
    <div className="clubs2 w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] min-h-screen">
      <Helmet>
        <title>Clubs | SuperFilm</title>
        <meta
          name="description"
          content="Browse and join film clubs on SuperFilm."
        />
        <link rel="canonical" href="https://superfilm.uk/clubs" />
      </Helmet>

      <main className="relative max-w-7xl mx-auto px-3 pt-6 pb-8 sm:px-6 sm:pt-8 sm:pb-10">
        <header className="mb-6 sm:mb-8 flex flex-col gap-2 sm:gap-3">
          <div>
            <p className="text-[0.6rem] tracking-[0.32em] uppercase text-zinc-500">Clubs</p>
            <h1 className="mt-1 sm:mt-2 text-2xl sm:text-4xl font-semibold text-[rgb(var(--brand-yellow))]">
              Discover film communities
            </h1>
          </div>
          <p className="max-w-3xl text-[13px] sm:text-sm text-zinc-400">
            {showInitialLoading
              ? "Loading clubs…"
              : "Join clubs that match your taste in films, genres and watch habits."}
          </p>
        </header>

        <section className="mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 w-full flex justify-center sm:justify-start">
              <div className="clubs-filter-shell" ref={panelRef}>
                <div className="clubs-filter-pill">
                  <div className="clubs-filter-segment clubs-filter-search">
                    <div className="clubs-filter-label">Search clubs</div>
                    <input
                      className="clubs-search-input"
                      placeholder="Titles, locations, genres…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>

                  <button
                    type="button"
                    className={`clubs-filter-segment clubs-filter-button ${
                      openFilter === "location" ? "is-active" : ""
                    }`}
                    onClick={() =>
                      setOpenFilter((cur) => (cur === "location" ? null : "location"))
                    }
                  >
                    <div className="clubs-filter-label">Location</div>
                    <div className="clubs-filter-value">{locationLabel}</div>
                  </button>

                  <button
                    type="button"
                    className={`clubs-filter-segment clubs-filter-button ${
                      openFilter === "genre" ? "is-active" : ""
                    }`}
                    onClick={() => setOpenFilter((cur) => (cur === "genre" ? null : "genre"))}
                  >
                    <div className="clubs-filter-label">Favourite genre</div>
                    <div className="clubs-filter-value">{genreLabel}</div>
                  </button>
                </div>

                {activeCount > 0 && (
                  <div className="clubs-filter-count-pill">
                    {activeCount} filter{activeCount > 1 ? "s" : ""} active
                  </div>
                )}

                {openFilter && (
                  <div
                    className="clubs-filter-popover-backdrop"
                    aria-hidden
                    onMouseDown={() => setOpenFilter(null)}
                    onTouchStart={() => setOpenFilter(null)}
                  />
                )}

                {openFilter && (
                  <div className="clubs-filter-popover" role="dialog">
                    <div className="clubs-filter-popover-card">
                      {openFilter === "location" && (
                        <>
                          <div className="popover-title">Location</div>
                          <div className="popover-subtitle">
                            Explore clubs from anywhere or focus on a region.
                          </div>
                          <div className="popover-options">
                            <button
                              type="button"
                              className={`popover-chip ${
                                filters.location === "any" ? "on" : ""
                              }`}
                              onClick={() => update("location", "any")}
                            >
                              Anywhere
                            </button>
                            {LOCATIONS.map((loc) => (
                              <button
                                key={loc}
                                type="button"
                                className={`popover-chip ${
                                  filters.location === loc ? "on" : ""
                                }`}
                                onClick={() => update("location", loc)}
                              >
                                {loc}
                              </button>
                            ))}
                          </div>
                          <div className="mt-3 flex gap-2 items-center">
                            <input
                              type="text"
                              className="flex-1 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
                              placeholder="Search or add another city"
                              value={locationInput}
                              onChange={(e) => setLocationInput(e.target.value)}
                            />
                            <button
                              type="button"
                              className="btn primary sm"
                              onClick={() => {
                                const val = locationInput.trim();
                                if (val) {
                                  update("location", val);
                                  setLocationInput(val);
                                }
                              }}
                            >
                              Use
                            </button>
                          </div>
                        </>
                      )}

                      {openFilter === "genre" && (
                        <>
                          <div className="popover-title">Favourite genre</div>
                          <div className="popover-subtitle">
                            Pick the kinds of films you want the club to love.
                          </div>
                          <div className="popover-options popover-options-wrap">
                            {GENRES.map((g) => {
                              const on = filters.genres.includes(g);
                              return (
                                <button
                                  key={g}
                                  type="button"
                                  className={`popover-chip ${on ? "on" : ""}`}
                                  onClick={() => toggleGenre(g)}
                                >
                                  {g}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}

                      <div className="popover-footer">
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={clearCurrentFilter}
                        >
                          Clear
                        </button>
                        <div className="popover-footer-right">
                          <button type="button" className="btn ghost sm" onClick={clearAll}>
                            Reset all
                          </button>
                          <button
                            type="button"
                            className="btn primary sm"
                            onClick={() => setOpenFilter(null)}
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="clubs-quick-actions">
              <div className="mobile-actions-trigger">
                <button
                  type="button"
                  className="nav-pill w-full justify-center"
                  onClick={() => setMobileActionsOpen((v) => !v)}
                >
                  <Users className="nav-pill-icon" />
                  <span>Actions</span>
                </button>
                {mobileActionsOpen && (
                  <div className="mobile-actions-menu">
                    <button className="nav-pill" onClick={() => navigate("/myclub")}>
                      <Users className="nav-pill-icon" />
                      <span>My Club</span>
                    </button>
                    <button className="nav-pill" onClick={() => navigate("/events")}>
                      <CalendarDays className="nav-pill-icon" />
                      <span>Events</span>
                    </button>
                    <button className="nav-pill" onClick={() => navigate("/leaderboard")}>
                      <Trophy className="nav-pill-icon" />
                      <span>Leaderboard</span>
                    </button>
                    {!userHasClub && (
                      <button className="nav-pill nav-pill-accent" onClick={() => navigate("/create-club")}>
                        <PlusCircle className="nav-pill-icon" />
                        <span>Create club</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="desktop-actions">
                <button className="nav-pill" onClick={() => navigate("/myclub")}>
                  <Users className="nav-pill-icon" />
                  <span>My Club</span>
                </button>
                <button className="nav-pill" onClick={() => navigate("/events")}>
                  <CalendarDays className="nav-pill-icon" />
                  <span>Events</span>
                </button>
                <button className="nav-pill" onClick={() => navigate("/leaderboard")}>
                  <Trophy className="nav-pill-icon" />
                  <span>Leaderboard</span>
                </button>
                {!userHasClub && (
                  <button className="nav-pill nav-pill-accent" onClick={() => navigate("/create-club")}>
                    <PlusCircle className="nav-pill-icon" />
                    <span>Create club</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {discoverError && (
          <div className="flex items-center justify-between gap-2 px-3 sm:px-6 pt-2 text-xs text-zinc-200 bg-zinc-900/60 rounded-2xl border border-red-400/40">
            <span>{discoverError}</span>
            <button
              type="button"
              className="text-xs uppercase tracking-[0.3em] text-yellow-400 hover:text-yellow-200"
              onClick={() => refreshDiscover()}
            >
              Retry
            </button>
          </div>
        )}

        <section className="mb-10">
          {!showSkeleton && combined.length === 0 && (
            <div className="mb-4 text-sm text-zinc-400">No clubs yet. Create the first one!</div>
          )}
          {noMatches && (
            <div className="mb-4 text-sm text-zinc-400">
              No clubs match your search/filters. Showing all clubs instead.
            </div>
          )}

          {showInitialLoading && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              {Array.from({ length: 8 }).map((_, idx) => (
                <ClubCardSkeleton key={`club-skel-${idx}`} />
              ))}
            </div>
          )}

          {hasCurated && baseCurated.length > 0 && (
            <div className="mb-8">
              <div className="mb-3">
                <h3 className="text-xl font-semibold text-[rgb(var(--brand-yellow))]">
                  SuperFilm Clubs
                </h3>
                <p className="text-sm text-zinc-400">
                  Hand-picked clubs for instant movie community.{" "}
                  <span className="text-zinc-500">Everyone can join — no requests needed.</span>
                </p>
              </div>
              <Swiper {...swiperConfig} onSwiper={(s) => (swiperRefs.current[0] = s)} className="!w-full">
                {baseCurated.map((club, index) => {
                  const m = club.meta || {};
                  const genreLine =
                    Array.isArray(club.genres) && club.genres.length
                      ? club.genres.join(" • ")
                      : Array.isArray(m.genres) && m.genres.length
                      ? m.genres.join(" • ")
                      : "Any & all genres";
                  return (
                    <SwiperSlide key={`curated-${club.id}-${index}`} className="!w-[210px]">
                      <Link
                        to={`/clubs/${club.path || club.slug || club.rawId || club.id}`}
                        className="club-card group block"
                        onMouseEnter={(e) => handleEnter(e, club, index)}
                        onMouseLeave={handleLeave}
                      >
                        <div className="club-thumb">
                          <img
                            src={safeClubImage(club.image)}
                            alt={club.name}
                            loading="lazy"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.src = CLUB_PLACEHOLDER;
                            }}
                          />
                          <div className="club-badges">
                            <span className="badge">
                              <span className="badge-dot" />
                              Official
                            </span>
                          </div>
                        </div>
                        <div className="p-3">
                          <div className="text-sm font-semibold text-white truncate">{club.name}</div>
                          <div className="mt-1 text-[0.7rem] uppercase tracking-wide text-zinc-400 truncate">
                            {genreLine}
                          </div>
                        </div>
                      </Link>
                    </SwiperSlide>
                  );
                })}
              </Swiper>
            </div>
          )}

          {baseForCarousel.length > 0 && (
            <>
              <div className="mb-3">
                <h3 className="text-xl font-semibold text-[rgb(var(--brand-yellow))]">
                  {hasCurated ? "Member-Created Clubs" : "Clubs"}
                </h3>
                <p className="text-sm text-zinc-400">
                  {hasCurated
                    ? "Clubs made by the community, for the community."
                    : "Discover clubs across the SuperFilm community."}
                </p>
              </div>
              <Swiper {...swiperConfig} onSwiper={(s) => (swiperRefs.current[1] = s)} className="!w-full">
                {baseForCarousel.map((club, index) => {
                  const m = club.meta || {};
                  const genreLabel =
                    Array.isArray(club.genres) && club.genres.length
                      ? club.genres.join(" • ")
                      : Array.isArray(m.genres) && m.genres.length
                      ? m.genres.join(" • ")
                      : "Any & all genres";
                  return (
                    <SwiperSlide key={`popular-${club.id}-${index}`} className="!w-[210px]">
                      <Link
                        to={`/clubs/${club.path || club.slug || club.rawId || club.id}`}
                        className="club-card group block"
                        onMouseEnter={(e) => handleEnter(e, club, index)}
                        onMouseLeave={handleLeave}
                      >
                        <div className="club-thumb">
            <img
              src={safeClubImage(club.image)}
              alt={club.name}
              loading="lazy"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.src = CLUB_PLACEHOLDER;
              }}
            />
                          <div className="club-badges">
                            {m.isNew && (
                              <span className="badge">
                                <span className="badge-dot" />
                                New
                              </span>
                            )}
                            {m.activeThisWeek && (
                              <span className="badge">
                                <span className="badge-dot" />
                                Active this week
                              </span>
                            )}
                            {m.liveSoon && (
                              <span className="badge">
                                <span className="badge-dot" />
                                Live soon
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="p-3">
                          <div className="text-sm font-semibold text-white truncate">{club.name}</div>
                          <div className="mt-1 text-[0.7rem] uppercase tracking-wide text-zinc-400 truncate">
                            {genreLabel}
                          </div>
                        </div>
                      </Link>
                    </SwiperSlide>
                  );
                })}
              </Swiper>

            </>
          )}
        </section>

        <section className="pb-14">
          <Link
            to="/events"
            className="group block rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900/40 shadow-xl relative transition-all duration-300 hover:shadow-[0_0_25px_rgba(250,204,21,0.35)] hover:border-[rgb(var(--brand-yellow))]/60"
          >
            <div className="relative h-72 md:h-[24rem] lg:h-[28rem] overflow-hidden">
              <img
                src="https://image.tmdb.org/t/p/w1280/fUnrwL6B0yohfhaXqt5OWHMsjmd.jpg"
                alt="Explore upcoming events"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                loading="lazy"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent" />

              <div className="absolute bottom-4 left-5 md:left-7">
                <p className="text-sm uppercase tracking-widest text-zinc-400">SuperFilm Events</p>
                <h3 className="mt-1 text-2xl md:text-3xl font-semibold text-[rgb(var(--brand-yellow))] drop-shadow-lg">
                  Discover all upcoming events
                </h3>
                <p className="mt-2 text-sm text-zinc-300">Click to explore every scheduled club event.</p>
              </div>
            </div>
          </Link>
        </section>
      </main>

      {hover?.el && (
        <HoverPreview
          sourceEl={hover.el}
          club={hover.club}
          scale={1.06}
          showTooltip={showTip}
          tooltipData={tipData}
        />
      )}
    </div>
  );
}
