// src/pages/CreateClubWizard.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "lib/supabaseClient";
import { useUser } from "../context/UserContext";
import TmdbImage from "../components/TmdbImage";
import { MapPin, ChevronDown } from "lucide-react";

const ROLE = { PRESIDENT: "president" };
const MAX_CREATE_WAIT_MS = 3000;

const isUuid = (v) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

/* --------------------------------
   Helpers
--------------------------------- */
const slugify = (s) =>
  (s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);

// TMDB helpers
function tmdbUrl(size, path) {
  // size: w300, w780, w1280, original
  // path: '/abc123.jpg'
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

function normalizeTmdbPath(input) {
  if (!input) return "";
  try {
    if (input.startsWith("http")) {
      const u = new URL(input);
      const filename = u.pathname.split("/").pop() || "";
      return `/${filename}`;
    }
    return input.startsWith("/") ? input : `/${input}`;
  } catch {
    return input.startsWith("/") ? input : `/${input}`;
  }
}

/* --------------------------------
   Backdrops (HD — TMDB paths)
   (Use only the filename path; the component builds size-specific URLs)
--------------------------------- */
const BACKDROPS = [
  "/8AUJ6a638gLWVgBMMUHLriUgAxG.jpg",
  "/vAsxVpXP53cMSsD9u4EekQKz4ur.jpg",
  "/wEF0ENqmkbCMJ47yDRf1vQ4VKve.jpg",
  "/jONSbZ92K3tvDEsYrBuog5DW1KL.jpg",
  "/iimkH5M5VfkIegy68LrJiFXOnza.jpg",
  "/A9KPbYTQvWsp51Lgz85ukVkFrKf.jpg",
  "/jZj6cGNWxggM5tA6hDxPAuqzv5I.jpg",
  "/h1GIFzevCInehjALUltUOJNdO9S.jpg",
  "/u5dQ0RsvHTGbghnni4cWR1EoIOu.jpg",
  "/4y7rMDjSyYMdWDf0P76VUMngf4d.jpg",
  "/hS5P3ktQO8tk6YoVq2kKwaV7rGS.jpg",
  "/xOuhhbQ3Nzznt5MjRdLBJb0CmDE.jpg",
  "/muY69LawUjeZtQ7l2cfhUbKZOY4.jpg",
  "/59ur074TVZ13QuQvRcubrEB3Izf.jpg",
];

const CUSTOM_CITY_OPTION = "__custom_city__";

const CITY_OPTIONS = [
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
  "Online / Virtual",
];

/* --------------------------------
   Ultra-sharp responsive backdrop with LQIP → hi-res fade
--------------------------------- */
/* --------------------------------
   OPTIMISED + SAFARI-STABLE BACKDROP
--------------------------------- */
function CinematicBackdrop({ path, priority = false, objectPosition = "50% 50%" }) {
  const safePath = useMemo(() => normalizeTmdbPath(path), [path]);

  // Use TMDB's stable CDN
  const lqip = useMemo(() => `https://image.tmdb.org/t/p/w780${safePath}`, [safePath]);
  const hd = useMemo(() => `https://image.tmdb.org/t/p/w1280${safePath}`, [safePath]);
  const original = useMemo(() => `https://image.tmdb.org/t/p/original${safePath}`, [safePath]);

  const [loaded, setLoaded] = useState(false);
  const [errorFallback, setErrorFallback] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setErrorFallback(false);

    const img = new Image();
    img.src = original;

    const finish = () => setLoaded(true);

    if (img.decode) {
      img.decode().then(finish).catch(() => {
        img.onload = finish;
      });
    } else {
      img.onload = finish;
    }

    img.onerror = () => {
      // Try HD as backup
      const fallbackImg = new Image();
      fallbackImg.src = hd;
      fallbackImg.onload = finish;
      fallbackImg.onerror = () => setErrorFallback(true);
    };
  }, [hd, original]);

  // Decide what we actually show
  const finalHD = errorFallback ? lqip : loaded ? original : lqip;

  return (
    <div className="absolute inset-0">
      {/* LQIP BLUR BASE LAYER */}
      <TmdbImage
        src={lqip}
        srcSet={`${lqip} 780w, ${hd} 1280w, ${original} 2000w`}
        sizes="100vw"
        alt=""
        className="absolute inset-0 w-full h-full"
        imgClassName="object-cover"
        style={{
          objectPosition,
          filter: "brightness(0.92)",
        }}
        draggable={false}
      />

      {/* HD LAYER */}
      <TmdbImage
        src={finalHD}
        srcSet={`${lqip} 780w, ${hd} 1280w, ${original} 2000w`}
        sizes="100vw"
        alt=""
        className="absolute inset-0 w-full h-full"
        imgClassName="object-cover transition-opacity duration-[900ms]"
        style={{
          objectPosition,
          opacity: loaded ? 1 : 0,
        }}
        draggable={false}
      />

      {/* GRADIENT OVERLAY */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/20 to-black/10" />
    </div>
  );
}



/* --------------------------------
   Component
--------------------------------- */
export default function CreateClubWizard() {
  const navigate = useNavigate();
  const { user, isPartner } = useUser();

  // Steps: 1 name, 2 tagline, 3 about, 4 location, 5 tone-film (optional), 6 welcome + launch
  const FIRST_STEP = 1;
  const LAST_STEP = 6;
  const [step, setStep] = useState(FIRST_STEP);

  // Form state
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [about, setAbout] = useState("");
  const [location, setLocation] = useState("");
  const [customLocation, setCustomLocation] = useState("");

  // Tone-setting film (optional)
  const [toneFilmTmdbId, setToneFilmTmdbId] = useState("");
  const [toneFilmTitle, setToneFilmTitle] = useState("");

  // Welcome message (optional)
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [isCurated, setIsCurated] = useState(false);

  const finalLocation = useMemo(
    () =>
      location === CUSTOM_CITY_OPTION
        ? customLocation.trim()
        : location.trim(),
    [location, customLocation]
  );
  const isCityValid =
    location === CUSTOM_CITY_OPTION
      ? finalLocation.length > 0
      : CITY_OPTIONS.includes(location);

  const [submitting, setSubmitting] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Preload backdrops (just prime the cache; LQIP ensures instant paint)
  useEffect(() => {
    BACKDROPS.slice(0, 4).forEach((p) => {
      const img = new Image();
      img.src = tmdbUrl("w780", normalizeTmdbPath(p));
    });
  }, []);

  const backdrop = useMemo(() => BACKDROPS[(step - 1) % BACKDROPS.length], [step]);

  // Validation per step
  const canGoNext = useMemo(() => {
    if (step === 1) return !!name.trim();
    if (step === 2) return !!tagline.trim();
    if (step === 3) return !!about.trim();
    if (step === 4) return !!finalLocation && isCityValid;
    // 5 tone film optional
    // 6 final submit
    return true;
  }, [step, name, tagline, about, finalLocation, isCityValid]);

  const next = useCallback(() => {
    if (step < LAST_STEP && canGoNext) setStep((s) => s + 1);
  }, [step, canGoNext]);

  const back = useCallback(() => {
    if (step > FIRST_STEP) setStep((s) => s - 1);
  }, [step]);

  // Allow Enter to advance
  const onEnterAdvance = (e) => {
    if (e.key === "Enter" && canGoNext && step < LAST_STEP) {
      e.preventDefault();
      next();
    }
  };

  /* --------------------------------
     DB helpers (RLS-aware)
  --------------------------------- */
  async function createClubRow(payload) {
    const baseSlug = payload.slug;
    let slug = baseSlug;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { error } = await supabase.from("clubs").insert({ ...payload, slug });
      if (!error) return { id: null, slug };

      const msg = String(error.message || "").toLowerCase();
      const isDup =
        error.code === "23505" ||
        msg.includes("clubs_slug_key") ||
        msg.includes("duplicate key");
      if (!isDup) throw error;

      slug = `${baseSlug}-${attempt + 2}`;
    }

    throw new Error("Could not create club (slug already exists).");
  }

  async function upsertPresidentMembership(clubId, userId) {
    if (!clubId || !userId) return;
    const { error } = await supabase
      .from("club_members")
      .upsert(
        { club_id: clubId, user_id: userId, role: ROLE.PRESIDENT },
        { onConflict: "club_id,user_id" }
      );
    if (error && error.code !== "23505") {
      console.warn("[club_members upsert] ", error.message);
    }
  }

  /* --------------------------------
     Submit
  --------------------------------- */
  async function handleCreate() {
    if (submitting) return;

    // Final guard — jump to first missing
    if (!name || !tagline || !about || !finalLocation || !isCityValid) {
      alert("Please complete the required steps first.");
      if (!name) setStep(1);
      else if (!tagline) setStep(2);
      else if (!about) setStep(3);
      else if (!finalLocation || !isCityValid) setStep(4);
      return;
    }

    if (!user?.id) {
      navigate("/auth");
      return;
    }

    setSubmitting(true);
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    try {
      const safeName = name.trim();
      const safeSlug = slugify(safeName);

      // Lightweight cache (optional)
      try {
        const wizardCache = {
          toneFilm: toneFilmTmdbId
            ? { tmdb_id: toneFilmTmdbId, title: toneFilmTitle || null }
            : null,
          createdAt: Date.now(),
        };
        localStorage.setItem("clubWizard:lastPayload", JSON.stringify(wizardCache));
      } catch {
        // ignore
      }

      if (!isUuid(user.id)) {
        throw new Error("owner_id must be a uuid");
      }

      const isCuratedClub = Boolean(isPartner && isCurated);
      const locationForSave = isCuratedClub ? "Online / Virtual" : finalLocation;

      const payload = {
        name: safeName,
        slug: safeSlug,
        tagline: tagline.trim(),
        about: about.trim(),
        location: locationForSave,
        owner_id: user.id,
        president_user_id: user.id,
        created_by: user.id,
        next_screening_id: null,
        is_published: false,
        welcome_message: (welcomeMessage || "").trim() || null,
        ...(isCuratedClub
          ? {
              privacy_mode: "open",
              type: "superfilm_curated",
              visibility: "open",
              is_private: false,
            }
          : {}),
      };

      const created = await createClubRow(payload);
      const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
      console.info(
        "[CreateClubWizard] createClubRow(ms)",
        Math.round(t1 - t0),
        { curated: isCuratedClub }
      );
      const clubSlug = created?.slug ?? safeSlug;

      navigate(`/clubs/${clubSlug}`, { replace: true });

      setTimeout(() => {
        (async () => {
          let clubId = null;
          for (let attempt = 0; attempt < 5; attempt += 1) {
            const { data } = await supabase
              .from("clubs")
              .select("id, slug")
              .eq("slug", clubSlug)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (data?.id) {
              clubId = data.id;
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 350));
          }

          if (clubId) {
            await upsertPresidentMembership(clubId, user.id);
          }
          try {
            if (clubId) localStorage.setItem("activeClubId", String(clubId));
            if (clubSlug) localStorage.setItem("activeClubSlug", clubSlug);
          } catch {}
        })();
      }, 0);
    } catch (e) {
      console.error("[CreateClubWizard] create failed:", e);
alert("ERROR: " + (e?.message || JSON.stringify(e)));

    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  }

  /* --------------------------------
     Styling helpers
  --------------------------------- */
  const inputCls =
    "w-full p-4 rounded-lg bg-zinc-900 border border-yellow-500/60 focus:border-yellow-400 outline-none transition";
  const selectShellCls =
    "relative group mt-2 rounded-xl overflow-hidden bg-black/60 border border-white/10 ring-1 ring-yellow-500/25 shadow-[0_18px_45px_rgba(0,0,0,0.55)]";
  const selectGradientOverlay =
    "pointer-events-none absolute inset-0 bg-gradient-to-r from-yellow-500/10 via-transparent to-yellow-400/10 opacity-90 group-hover:opacity-100 transition-opacity duration-200";
  const selectCls =
    "w-full appearance-none bg-transparent px-5 pr-12 py-3 text-white text-sm tracking-tight outline-none";
  const textAreaCls =
    "w-full p-4 rounded-lg bg-zinc-900 border border-yellow-500/60 focus:border-yellow-400 outline-none transition";

  return (
    <div className="min-h-screen text-white bg-black" onKeyDown={onEnterAdvance}>
      {/* Inline CSS: vertical breathing motion */}
      <style>{`
        @keyframes sf-breathe-y {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
          100% { transform: translateY(0px); }
        }
        .sf-breathe-y {
          animation: sf-breathe-y 5.5s ease-in-out infinite;
          will-change: transform;
        }
      `}</style>

      <div className="mx-auto max-w-6xl pt-8 pb-16">
        <div className="relative overflow-hidden rounded-3xl border-4 border-white/20 shadow-2xl -mx-6 w-[calc(100%+3rem)] min-h-[1120px]">
          {/* HD backdrop with LQIP → hi-res fade */}
          <CinematicBackdrop path={backdrop} priority objectPosition="50% 50%" />

          {/* Wizard Card */}
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-black/70 backdrop-blur-sm border border-white/15 rounded-2xl p-8 shadow-xl">
              {/* Header */}
              <header className="mb-8 text-center">
                <h1 className="sf-breathe-y text-3xl md:text-4xl font-bold">
                  🎬 Create Your Club
                </h1>
                <p className="sf-breathe-y mt-2 text-sm text-zinc-300">
                  Step {step} of {LAST_STEP}
                </p>
              </header>

              {/* Step 1: Name */}
              {step === 1 && (
                <>
                  <div className="mb-2 text-sm text-zinc-300">
                    <span className="font-semibold">Q:</span> What will you call your club?
                  </div>
                  <input
                    className={inputCls}
                    placeholder="e.g., Southbank Thursday Classics"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    aria-label="Club name"
                    autoFocus
                  />
                  <div className="mt-2 text-xs text-zinc-400">
                    Slug preview:{" "}
                    <span className="text-zinc-200">/clubs/{slugify(name) || "your-club"}</span>
                  </div>
                  <div className="mt-6 text-right">
                    <button
                      disabled={!canGoNext}
                      onClick={next}
                      className="bg-yellow-500 px-6 py-2 text-black rounded-full font-semibold disabled:opacity-60"
                    >
                      Next →
                    </button>
                  </div>
                </>
              )}

              {/* Step 2: Tagline */}
              {step === 2 && (
                <>
                  <div className="mb-2 text-sm text-zinc-300">
                    <span className="font-semibold">Q:</span> What’s your short tagline?
                  </div>
                  <input
                    className={inputCls}
                    placeholder="e.g., World cinema every Thursday night"
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                    aria-label="Club tagline"
                    autoFocus
                  />
                  <div className="mt-6 flex justify-between">
                    <button onClick={back} className="text-zinc-300 hover:text-white">
                      ← Back
                    </button>
                    <button
                      disabled={!canGoNext}
                      onClick={next}
                      className="bg-yellow-500 px-6 py-2 text-black rounded-full font-semibold disabled:opacity-60"
                    >
                      Next →
                    </button>
                  </div>
                </>
              )}

              {/* Step 3: About */}
              {step === 3 && (
                <>
                  <div className="mb-2 text-sm text-zinc-300">
                    <span className="font-semibold">Q:</span> What is your club about?
                  </div>
                  <textarea
                    className={`${textAreaCls} h-32`}
                    placeholder="What do you personally enjoy? What cinema gravitates to you? Build and they will come."
                    value={about}
                    onChange={(e) => setAbout(e.target.value)}
                    aria-label="About the club"
                    autoFocus
                  />
                  <div className="mt-6 flex justify-between">
                    <button onClick={back} className="text-zinc-300 hover:text-white">
                      ← Back
                    </button>
                    <button
                      disabled={!canGoNext}
                      onClick={next}
                      className="bg-yellow-500 px-6 py-2 text-black rounded-full font-semibold disabled:opacity-60"
                    >
                      Next →
                    </button>
                  </div>
                </>
              )}

              {/* Step 4: Location */}
              {step === 4 && (
                <>
                  <div className="mb-2 text-sm text-zinc-300">
                    <span className="font-semibold">Q:</span> Which city does your club meet in?
                  </div>
                  <p className="text-xs text-zinc-400 mb-2">
                    Cities only — pick one from the list (no countries or regions). Choose
                    &ldquo;Online / Virtual&rdquo; if you never meet in person. If your city
                    isn’t listed, pick “Type your own” and enter it.
                  </p>
                  <div className={selectShellCls}>
                    <div className={selectGradientOverlay} aria-hidden="true" />
                    <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-yellow-400/80">
                      <MapPin size={18} />
                    </div>
                    <select
                      className={`${selectCls} pl-12`}
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      aria-label="Club city"
                      autoFocus
                    >
                      <option value="">Select a city</option>
                      <option value={CUSTOM_CITY_OPTION}>Type your own city…</option>
                      {CITY_OPTIONS.map((city) => (
                        <option key={city} value={city}>
                          {city}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-yellow-200/70">
                      <ChevronDown size={18} />
                    </div>
                  </div>
                  {location === CUSTOM_CITY_OPTION && (
                    <input
                      className={`${inputCls} mt-3`}
                      placeholder="Type your city"
                      value={customLocation}
                      onChange={(e) => setCustomLocation(e.target.value)}
                      aria-label="Custom city"
                    />
                  )}
                  {!isCityValid && location && (
                    <p className="mt-2 text-xs text-red-400">
                      Please choose a city from the list above or type your city.
                    </p>
                  )}
                  <div className="mt-6 flex justify-between">
                    <button onClick={back} className="text-zinc-300 hover:text-white">
                      ← Back
                    </button>
                    <button
                      disabled={!canGoNext}
                      onClick={next}
                      className="bg-yellow-500 px-6 py-2 text-black rounded-full font-semibold disabled:opacity-60"
                    >
                      Next →
                    </button>
                  </div>
                </>
              )}

              {/* Step 5: Tone-setting film (optional) */}
              {step === 5 && (
                <>
                  <div className="mb-2 text-sm text-zinc-300">
                    <span className="font-semibold">Q:</span> (Optional) Is there a film that sets your club’s tone?
                  </div>
                  <input
                    className={inputCls}
                    placeholder="TMDB film ID or link (optional)"
                    value={toneFilmTmdbId}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      const m = v.match(/(\d{2,})/);
                      setToneFilmTmdbId(m ? m[1] : v);
                    }}
                    aria-label="TMDB id or link"
                    autoFocus
                  />
                  <input
                    className={`${inputCls} mt-3`}
                    placeholder="Film title (optional)"
                    value={toneFilmTitle}
                    onChange={(e) => setToneFilmTitle(e.target.value)}
                    aria-label="Optional film title"
                  />
                  <div className="mt-6 flex justify-between">
                    <button onClick={back} className="text-zinc-300 hover:text-white">
                      ← Back
                    </button>
                    <button
                      onClick={next}
                      className="bg-yellow-500 px-6 py-2 text-black rounded-full font-semibold"
                    >
                      Next →
                    </button>
                  </div>
                </>
              )}

              {/* Step 6: Welcome + Launch */}
              {step === 6 && (
                <>
                  <div className="mb-2 text-sm text-zinc-300">
                    <span className="font-semibold">Q:</span> (Optional) What welcome message should new members receive?
                  </div>
                  <textarea
                    className={`${textAreaCls} h-28`}
                    placeholder="Welcome to the club! We usually meet Thursdays at 7pm. Introduce yourself in the chat ✨"
                    value={welcomeMessage}
                    onChange={(e) => setWelcomeMessage(e.target.value)}
                    aria-label="Welcome message"
                    autoFocus
                  />
                  {isPartner && (
                    <div className="mt-4 rounded-xl border border-white/10 bg-black/40 p-4">
                      <div className="text-sm font-semibold text-zinc-200">
                        SuperFilm curated club?
                      </div>
                      <p className="mt-1 text-xs text-zinc-400">
                        Curated clubs appear in the SuperFilm Clubs carousel. They’re open to everyone and set to
                        Online / Virtual by default.
                      </p>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <button
                          type="button"
                          onClick={() => setIsCurated(true)}
                          className={[
                            "rounded-full border px-4 py-2 text-sm font-semibold transition",
                            isCurated
                              ? "border-yellow-400 bg-yellow-400 text-black"
                              : "border-white/15 text-zinc-200 hover:border-yellow-400/60",
                          ].join(" ")}
                        >
                          Yes, SuperFilm curated
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsCurated(false)}
                          className={[
                            "rounded-full border px-4 py-2 text-sm font-semibold transition",
                            !isCurated
                              ? "border-yellow-400 bg-yellow-400 text-black"
                              : "border-white/15 text-zinc-200 hover:border-yellow-400/60",
                          ].join(" ")}
                        >
                          No, community club
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <button onClick={back} className="text-zinc-300 hover:text-white">
                      ← Back
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        handleCreate();
                      }}
                      disabled={submitting}
                      className="bg-yellow-400 text-black font-bold text-lg px-8 py-3 rounded-full shadow-[0_0_40px_rgba(250,204,21,0.4)] hover:scale-105 active:scale-95 transition disabled:opacity-40"
                      aria-label="Create club"
                    >
                      {submitting ? "Projector Warming Up…" : "🎞️ Launch This Film Club"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Credit */}
          <div className="absolute bottom-2 right-3 text-[10px] text-white/70">
            
          </div>
        </div>
      </div>
    </div>
  );
}
