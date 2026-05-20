// src/App.jsx
import {
  BrowserRouter as Router,
  Routes,
  Route,
  NavLink,
  useLocation,
  useNavigate,
  useParams,
  Navigate,
} from "react-router-dom";
import { useState, useMemo, useEffect, useRef, Suspense, lazy } from "react";
import { HelmetProvider } from "react-helmet-async";
import debounce from "lodash.debounce";
import { Toaster } from "react-hot-toast";
import { trackPageView } from "./lib/analytics";
import BetaBanner from "./components/BetaBanner";
import CookieConsent from "./components/CookieConsent";
import { Home as HomeIcon, Users, Film, User as UserIcon } from "lucide-react";
import PwaUpdateToast from "./components/PwaUpdateToast";
import PwaInstallPrompt from "./components/PwaInstallPrompt";
import usePerfLogger from "./hooks/usePerfLogger";
import useMyClubs from "./hooks/useMyClubs";
import { AppResumeProvider } from "./hooks/useAppResume";
import { PWA_INSTALLED_KEY } from "./constants/pwaInstall";

import "./styles/glows.css";
import NavActions from "./components/NavActions";

import { UserProvider, useUser } from "./context/UserContext";
import supabase from "lib/supabaseClient";
import ErrorBoundary from "./components/ErrorBoundary";







// Lazy pages
const Events = lazy(() => import("./pages/Events"));
const EventNew = lazy(() => import("./pages/EventNew.jsx"));
const EventDetails = lazy(() => import("./pages/EventDetails.jsx"));

const MovieDetails = lazy(() => import("./pages/MovieDetails"));
const SearchResults = lazy(() => import("./pages/SearchResults"));
const Movies = lazy(() => import("./pages/Movies"));
const ClubProfile = lazy(() => import("./pages/ClubProfile"));
const MembersPage = lazy(() => import("./pages/MembersPage"));
const UserProfile = lazy(() => import("./pages/UserProfile.jsx"));

// ⬇️ Removed unused CreateClubWizard import
const ClubEventDetails = lazy(() => import("./pages/ClubEventDetails"));
const ClubPreview = lazy(() => import("./pages/ClubPreview"));
const EventAttendance = lazy(() => import("./pages/EventAttendance"));
const SupabasePing = lazy(() => import("./dev/SupabasePing"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const LandingPage = lazy(() => import("./pages/LandingPage"));
const DiscoverPage = lazy(() => import("./pages/Discover.jsx"));
const HomeSignedIn = lazy(() => import("./pages/HomeSignedIn"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const ClubChat = lazy(() => import("./pages/ClubChat"));
const LeaderboardAndPlayoffs = lazy(() =>
  import("./pages/LeaderboardAndPlayoffs.jsx")
);
const ClubRequests = lazy(() => import("./pages/ClubRequests.jsx"));
const PremiumPage = lazy(() => import("./pages/PremiumPage"));
const PremiumSuccess = lazy(() => import("./pages/PremiumSuccess.jsx"));
const DirectorsCutSuccess = lazy(() => import("./pages/DirectorsCutSuccess.jsx"));
const UserFilmTakes = lazy(() => import("./pages/UserFilmTakes"));
const ClubTakesArchive = lazy(() => import("./pages/ClubTakesArchive.jsx"));
const Clubs = lazy(() => import("./pages/Clubs.jsx"));
const LeaveClub = lazy(() => import("./pages/LeaveClub.jsx"));
const OnboardingTutorial = lazy(() =>
  import("./components/onboarding/OnboardingTutorial.jsx")
);
const AboutPage = lazy(() => import("./pages/AboutPage.jsx"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const UserSearchPage = lazy(() => import("./pages/UserSearchPage.jsx"));
const TermsPage = lazy(() => import("./pages/Terms.jsx"));
const PrivacyPage = lazy(() => import("./pages/Privacy.jsx"));
const CookiePolicyPage = lazy(() => import("./pages/CookiePolicy.jsx"));
const AcceptableUsePage = lazy(() => import("./pages/AcceptableUse.jsx"));
const CommunityGuidelinesPage = lazy(() => import("./pages/CommunityGuidelines.jsx"));
const BillingTermsPage = lazy(() => import("./pages/BillingTerms.jsx"));
const DataRetentionPage = lazy(() => import("./pages/DataRetention.jsx"));
const SubprocessorsPage = lazy(() => import("./pages/Subprocessors.jsx"));
const HelpPage = lazy(() => import("./pages/HelpPage.jsx"));
const OurSocialsPage = lazy(() => import("./pages/OurSocials.jsx"));
const ProfileFollows = lazy(() => import("./pages/ProfileFollows.jsx"));
const Watchlist = lazy(() => import("./pages/Watchlist.jsx"));
const SettingsProfile = lazy(() => import("./pages/SettingsProfile.jsx"));
const PwaInstall = lazy(() => import("./pages/PwaInstall.jsx"));
const JoinClubInvite = lazy(() => import("./pages/JoinClubInvite.jsx"));

// Premium/president-only pages
const ClubSettings = lazy(() => import("./pages/ClubSettings.jsx"));
const ManageInvites = lazy(() => import("./pages/ManageInvites"));


// Quiet premium management page
const SettingsPremium = lazy(() => import("./pages/SettingsPremium.jsx"));

// ⬇️ New wrappers (make sure these files exist)
const CreateClubPage = lazy(() => import("./pages/CreateClubPage.jsx"));
const MyClub = lazy(() => import("./pages/MyClub.jsx"));

// UI
const NotificationsBell = lazy(() => import("./components/NotificationsBell"));
const Splash = lazy(() => import("./components/Splash"));
// ⬇️ Club Switcher dropdown (premium feature)
const ClubSwitcher = lazy(() => import("./components/ClubSwitcher.jsx"));
const SuperFilmFooter = lazy(() =>
  import("./pages/AboutPage.jsx").then((m) => ({ default: m.SuperFilmFooter }))
);



/* ---------- Helpers ---------- */
function ClubSingularRedirect() {
  const { id } = useParams();
  const navigate = useNavigate();
  useEffect(() => {
    if (id) navigate(`/clubs/${id}`, { replace: true });
  }, [id, navigate]);
  return null;
}

function PageViewTracker() {
  const location = useLocation();
  const didMountRef = useRef(false);
  useEffect(() => {
    // Initial page view is triggered after analytics is enabled via CookieConsent.
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    const path = `${location.pathname}${location.search || ""}`;
    trackPageView(path);
  }, [location.pathname, location.search]);
  return null;
}

function isPwaInstalled() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true
  );
}

/* ==================== GUARD: RequirePresidentPremium ==================== */
function RequirePresidentPremium({ children }) {
  const { user, profile, loading, sessionLoaded } = useUser();
  const { clubParam } = useParams();
  const [ok, setOk] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // wait for user/profile hydration
    if (loading || !sessionLoaded) return;
    let mounted = true;
    setChecking(true);
    setOk(false);
    (async () => {
      try {
        if (!user?.id) {
          setOk(false);
          return;
        }

        const isPremium =
          profile?.plan === "directors_cut" || profile?.is_premium === true;
        if (!isPremium) {
          setOk(false);
          return;
        }

        let clubId = null;
        if (/^[0-9a-f-]{16,}$/i.test(clubParam)) {
          clubId = clubParam;
        } else {
          // NOTE: `clubs_public` intentionally excludes private clubs. Premium president
          // routes must resolve slug → id via `clubs` to support private clubs.
          const { data: bySlug } = await supabase
            .from("clubs")
            .select("id")
            .eq("slug", clubParam)
            .maybeSingle();
          clubId = bySlug?.id || null;
          if (!clubId) {
            const { data: bySlugPublic } = await supabase
              .from("clubs_public")
              .select("id")
              .eq("slug", clubParam)
              .maybeSingle();
            clubId = bySlugPublic?.id || null;
          }
        }
        if (!clubId) {
          setOk(false);
          return;
        }

        const { data: mem } = await supabase
          .from("club_members")
          .select("club_id, user_id, role, joined_at, accepted")
          .eq("club_id", clubId)
          .eq("user_id", user.id)
          .maybeSingle();

        const isPresident = mem?.role === "president";
        if (!isPresident) {
          setOk(false);
          return;
        }

        if (mounted) setOk(true);
      } catch (e) {
        console.warn("[RequirePresidentPremium] permission check failed:", e?.message || e);
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loading, sessionLoaded, user?.id, profile?.plan, profile?.is_premium, clubParam]);

  if (loading || checking) return <Splash message="Checking permissions…" />;
  if (!ok) return <Navigate to="/premium" replace />;

  return children;
}

/* ==================== GUARD: RequirePresident ==================== */
function RequirePresident({ children }) {
  const { user, loading, sessionLoaded } = useUser();
  const { clubParam } = useParams();
  const [ok, setOk] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // wait for user/profile hydration
    if (loading || !sessionLoaded) return;
    let mounted = true;
    setChecking(true);
    setOk(false);
    (async () => {
      try {
        if (!user?.id) {
          setOk(false);
          return;
        }

        let clubId = null;
        if (/^[0-9a-f-]{16,}$/i.test(clubParam)) {
          clubId = clubParam;
        } else {
          const { data: bySlug } = await supabase
            .from("clubs")
            .select("id")
            .eq("slug", clubParam)
            .maybeSingle();
          clubId = bySlug?.id || null;
          if (!clubId) {
            const { data: bySlugPublic } = await supabase
              .from("clubs_public")
              .select("id")
              .eq("slug", clubParam)
              .maybeSingle();
            clubId = bySlugPublic?.id || null;
          }
        }
        if (!clubId) {
          setOk(false);
          return;
        }

        const { data: mem } = await supabase
          .from("club_members")
          .select("club_id, user_id, role, joined_at, accepted")
          .eq("club_id", clubId)
          .eq("user_id", user.id)
          .maybeSingle();

        const isPresident = mem?.role === "president";
        if (!isPresident) {
          setOk(false);
          return;
        }

        if (mounted) setOk(true);
      } catch (e) {
        console.warn("[RequirePresident] permission check failed:", e?.message || e);
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loading, sessionLoaded, user?.id, clubParam]);

  if (loading || checking) return <Splash message="Checking permissions…" />;
  if (!ok) return <Navigate to="/clubs" replace />;

  return children;
}

/* ==================== APP WRAPPER ==================== */
export default function AppWrapper() {
  return (
    <AppResumeProvider>
      <UserProvider>
        <HelmetProvider>
          <Router>
            <CookieConsent />
            <PageViewTracker />
            <BetaBanner />
            <Routes>
              {/* Onboarding route — renders BEFORE MainShell */}
              <Route
                path="/onboarding"
                element={
                  <Suspense fallback={<Splash />}>
                    <OnboardingTutorial />
                  </Suspense>
                }
              />

              {/* Everything else */}
              <Route
                path="/*"
                element={
                  <ErrorBoundary fallback={<Splash message="Something went wrong loading the app." />}>
                    <MainShell />
                  </ErrorBoundary>
                }
              />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Router>
        </HelmetProvider>
      </UserProvider>
    </AppResumeProvider>
  );
}

/* ==================== DYNAMIC NAV LINK ==================== */
function NavClubSwitch() {
  const { user, loading } = useUser();
  const [checking, setChecking] = useState(true);
  const [target, setTarget] = useState({
    to: "/create-club",
    label: "Create a Club",
  });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (loading) return;
      if (!user?.id) {
        if (!cancelled) {
          setTarget({ to: "/auth", label: "Sign in" });
          setChecking(false);
        }
        return;
      }

      setChecking(true);
      try {
        const { data, error } = await supabase
          .from("club_members")
          .select("club_id, user_id, role, joined_at, accepted")
          .eq("user_id", user.id)
          .limit(1);

        if (cancelled) return;

        if (error) throw error;

        const row = data?.[0];
        if (row?.club_id) {
          const { data: clubRow } = await supabase
            .from("clubs_public")
            .select("id, slug")
            .eq("id", row.club_id)
            .maybeSingle();
          const slug = clubRow?.slug || row.club_id;
          localStorage.setItem("activeClubId", String(row.club_id));
          localStorage.setItem("activeClubSlug", String(slug));
          localStorage.setItem("myClubId", String(slug));
          setTarget({ to: "/myclub", label: "My Club" });
        } else {
          localStorage.removeItem("activeClubId");
          localStorage.removeItem("activeClubSlug");
          localStorage.removeItem("myClubId");
          setTarget({ to: "/create-club", label: "Create a Club" });
        }
      } catch {
        setTarget({ to: "/create-club", label: "Create a Club" });
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [user?.id, loading]);

  const linkClass = (isActive) =>
    [
      "relative px-2 py-1 text-zinc-300 hover:text-white transition-colors",
      "after:absolute after:left-0 after:-bottom-1 after:h-[2px] after:w-0 after:bg-yellow-400",
      "after:transition-[width] after:duration-300 hover:after:w-full",
      isActive ? "text-white" : "",
    ].join(" ");

  if (checking) {
    return (
      <span className="px-2 py-1 text-zinc-500 cursor-default select-none">
        My Club
      </span>
    );
  }

  return (
    <NavLink to={target.to} className={({ isActive }) => linkClass(isActive)}>
      {target.label}
    </NavLink>
  );
}

/* ==================== MAIN SHELL ==================== */
function MainShell() {
  const {
    user,
    isPremium,
    profile,
    loading: userLoading,
    isReady,
    sessionLoaded,
  } = useUser();
  const location = useLocation();
  const navigate = useNavigate();
  const pwaPromptedRef = useRef(false);
  const perfEnabled =
    typeof window !== "undefined" && localStorage.getItem("sf:perf") === "1";

  usePerfLogger({ enabled: perfEnabled, intervalMs: 30000 });

  // ⬇️ Onboarding redirect: only show onboarding once (post-signup)
  useEffect(() => {
    if (userLoading || !isReady || !user) return;

    const seenLocal =
      typeof window !== "undefined" &&
      localStorage.getItem("sf:onboarding_seen") === "1";
    const seenServer = Boolean(user?.user_metadata?.onboarding_seen);

    if (!seenLocal && !seenServer) {
      navigate("/onboarding", { replace: true });
    }
  }, [
    user,
    navigate,
    userLoading,
    isReady,
  ]);

  useEffect(() => {
    if (!sessionLoaded) return;
    if (!user) return;
    void import("./pages/HomeSignedIn.jsx");
  }, [sessionLoaded, user]);

  useEffect(() => {
    if (!user?.id || !isReady) return;
    if (pwaPromptedRef.current) return;
    pwaPromptedRef.current = true;

    if (isPwaInstalled()) return;
    try {
      if (localStorage.getItem(PWA_INSTALLED_KEY) === "1") return;
    } catch {}

    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    (async () => {
      try {
        const { data } = await supabase
          .from("notifications")
          .select("id, created_at, data")
          .eq("user_id", user.id)
          .eq("type", "pwa.install")
          .order("created_at", { ascending: false })
          .limit(1);

        const latest = data?.[0] || null;
        if (latest?.data?.dismissed) return;

        if (latest?.created_at) {
          const age = Date.now() - new Date(latest.created_at).getTime();
          if (age < WEEK_MS) return;
        }

        await supabase.from("notifications").insert({
          user_id: user.id,
          type: "pwa.install",
          data: {
            title: "Install SuperFilm PWA",
            message: "Get instant access from your home screen.",
            question: "Already got the PWA? Tap yes to dismiss this reminder.",
          },
        });
      } catch {}
    })();
  }, [user?.id, isReady]);


  const [rawQuery, setRawQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState("films"); // "films" | "users"

  const debouncedSearch = useMemo(
    () => debounce((value) => setSearchQuery(value), 500),
    []
  );

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setRawQuery(value);
    debouncedSearch(value);
  };

  const handleKeyDown = (e) => {
    if (e.key !== "Enter") return;
  
    const trimmed = rawQuery.trim();
    if (!trimmed) return;
  
    if (searchMode === "users") {
      navigate(`/search/users?q=${encodeURIComponent(trimmed.replace(/^@/, ""))}`);
      return;
    }

    // If query starts with '@' → USER SEARCH override
    if (trimmed.startsWith("@")) {
      const userQuery = trimmed.slice(1).trim(); // remove @
      if (!userQuery) return;
      navigate(`/search/users?q=${encodeURIComponent(userQuery)}`);
      return;
    }
  
    // Otherwise → MOVIE SEARCH (existing behaviour)
    navigate(`/search?q=${encodeURIComponent(trimmed)}`);
  };
  

  useEffect(() => {
    if (location.pathname === "/movies") {
      setRawQuery("");
      setSearchQuery("");
    }
  }, [location.pathname]);

  const linkClass = (isActive) =>
    [
      "relative px-2 py-1 text-zinc-300 hover:text-white transition-colors",
      "after:absolute after:left-0 after:-bottom-1 after:h-[2px] after:w-0 after:bg-yellow-400",
      "after:transition-[width] after:duration-300 hover:after:w-full",
      isActive ? "text-white" : "",
    ].join(" ");

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-black via-zinc-900 to-black text-white font-sans">
      {!isReady && (
        <div className="fixed top-2 right-3 text-xs text-zinc-400">
          Syncing…
        </div>
      )}
      {/* ===== Header ===== */}
      <header className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur border-b border-white/10">
        <div className="w-full flex items-center h-14 sm:h-16">
          {/* LEFT: SuperFilm logo */}
          <div className="flex-shrink-0 pl-3 sm:pl-4 md:pl-6">
            <NavLink
              to="/"
              end
              aria-label="Go to SuperFilm Home"
              className={({ isActive }) =>
                [
                  "group relative flex items-center gap-2",
                  "text-xl sm:text-2xl md:text-3xl font-bold tracking-wide",
                  "text-zinc-200 hover:text-white transition-colors",
                  "after:absolute after:left-0 after:-bottom-1 after:h-[2px] after:w-0 after:bg-yellow-400",
                  "after:transition-[width] after:duration-300 group-hover:after:w-full",
                  isActive ? "text-white after:w-full" : "",
                ].join(" ")
              }
            >
              <div className="flex items-center gap-2">
                <span>SuperFilm</span>
                <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.18em] text-yellow-400/90 border border-yellow-300/30 rounded-full px-1.5 py-[2px] sm:px-2 sm:py-[3px] bg-yellow-300/10">
                  Beta
                </span>
              </div>
              <img
                src="/superfilm-logo.png"
                alt=""
                aria-hidden="true"
                className="h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7 object-contain"
                draggable="false"
              />
            </NavLink>
          </div>

          {/* CENTER: Primary nav */}
          <div className="hidden sm:flex flex-1 min-w-0 justify-start pl-6 lg:pl-10">
            <nav className="flex" aria-label="Primary navigation">
              <ul className="flex items-center gap-4 lg:gap-6 whitespace-nowrap">
                <li>
                  <NavLink to="/" end className={({ isActive }) => linkClass(isActive)}>
                    Home
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/clubs" className={({ isActive }) => linkClass(isActive)}>
                    Discover
                  </NavLink>
                </li>
                <li>
                  <Suspense fallback={null}>
                    <ClubSwitcher />
                  </Suspense>
                </li>
                <li>
                  <NavLink to="/movies" className={({ isActive }) => linkClass(isActive)}>
                    Movies
                  </NavLink>
                </li>
              </ul>
            </nav>
          </div>

          {/* RIGHT: Search + actions */}
          <div className="ml-auto flex items-center gap-2 sm:gap-3 pr-3 sm:pr-4 md:pr-6">
            {/* Search (hide first on tighter widths) */}
            <div className="hidden xl:flex items-center rounded-full bg-zinc-800 ring-1 ring-white/10 px-2">
              <input
                type="text"
                value={rawQuery}
                onChange={handleSearchChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  searchMode === "users"
                    ? "Search @usernames"
                    : "Search films/@cinephiles"
                }
                className="
                  bg-transparent text-white placeholder-zinc-400 rounded-full 
                  px-3 py-2 w-28 md:w-36 lg:w-48 xl:w-48 2xl:w-60
                  outline-none
                  transition-all duration-300
                  focus:ring-0
                "
                aria-label="Search"
              />
              <div className="flex rounded-full bg-zinc-900/80 ring-1 ring-white/10">
                <button
                  type="button"
                  onClick={() => setSearchMode("films")}
                  className={`text-[11px] px-3 py-1 rounded-full transition ${
                    searchMode === "films"
                      ? "bg-yellow-400 text-black shadow-[0_0_12px_rgba(250,204,21,0.35)]"
                      : "text-zinc-300 hover:text-white"
                  }`}
                  aria-pressed={searchMode === "films"}
                >
                  Films
                </button>
                <button
                  type="button"
                  onClick={() => setSearchMode("users")}
                  className={`text-[11px] px-3 py-1 rounded-full transition ${
                    searchMode === "users"
                      ? "bg-yellow-400 text-black shadow-[0_0_12px_rgba(250,204,21,0.35)]"
                      : "text-zinc-300 hover:text-white"
                  }`}
                  aria-pressed={searchMode === "users"}
                >
                  Users
                </button>
              </div>
            </div>

            {user && (
              <Suspense fallback={null}>
                <NotificationsBell />
              </Suspense>
            )}

            <NavActions />
          </div>
        </div>
      </header>



      {/* ===== Main ===== */}

      <main className="flex-1 w-full p-0 sm:p-6 max-w-none sm:max-w-6xl sm:mx-auto">
        <Suspense fallback={<Splash />}>
          <Routes>
            <Route
              path="/"
              element={
                !sessionLoaded ? (
                  <LandingPage />
                ) : user ? (
                  <HomeSignedIn />
                ) : (
                  <LandingPage />
                )
              }
            />

            {/* Clubs */}
            <Route path="/clubs/:slug" element={<ClubProfile />} />
            <Route path="/clubs/:clubParam/takes/archive" element={<ClubTakesArchive />} />
            <Route path="/join/:code" element={<JoinClubInvite />} />
            <Route path="/discover" element={<DiscoverPage />} />

            {/* Premium president-only */}
            <Route
              path="/clubs/:clubParam/settings"
              element={
                <RequirePresidentPremium>
                  <ClubSettings />
                </RequirePresidentPremium>
              }
            />
            <Route
              path="/clubs/:clubParam/invites"
              element={
                <RequirePresident>
                  <ManageInvites />
                </RequirePresident>
              }
            />
           

            <Route path="/events" element={<Events />} />
            <Route path="/events/new" element={<EventNew />} />
            <Route path="/events/:slug" element={<EventDetails />} />

            <Route path="/u/:slug/takes" element={<UserFilmTakes />} />

            {/* Chat */}
            <Route path="/clubs/:clubParam/chat" element={<ClubChat />} />
            <Route path="/club/:clubId/chat" element={<ClubChat />} />

            {/* Legacy redirect */}
            <Route path="/club/:id" element={<ClubSingularRedirect />} />

            {/* Legacy variants */}
            <Route path="/club/:id/members" element={<MembersPage />} />
            <Route
              path="/club/:id/event/:eventSlug"
              element={<ClubEventDetails />}
            />

            {/* Nested event/members (slug or uuid) */}
            <Route
              path="/clubs/:clubParam/events/next"
              element={<EventAttendance />}
            />

<Route
  path="/clubs/:clubParam/leave"
  element={<LeaveClub />}
/>

<Route path="/clubs/:clubParam/leave" element={<LeaveClub />} />
            <Route
              path="/clubs/:clubParam/members"
              element={<MembersPage />}
            />

            {/* Old links support */}
            <Route
              path="/clubs/:id/events/next"
              element={<EventAttendance />}
            />

            {/* Other pages */}
            <Route
              path="/movies"
              element={<Movies searchQuery={searchQuery} />}
            />
            <Route
              path="/profile"
              element={<UserProfile key={window.location.search} />}
            />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/movie/:id" element={<MovieDetails />} />
            <Route path="/movies/:id" element={<MovieDetails />} />{" "}
            {/* alias */}
            <Route
              path="/clubs/:clubParam/movies/:id"
              element={<MovieDetails />}
            />

            <Route path="/search" element={<SearchResults />} />
            <Route path="/search/users" element={<UserSearchPage />} />

            {/* NEW wrappers */}
            <Route path="/create-club" element={<CreateClubPage />} />
            <Route path="/myclub" element={<MyClub />} />

            <Route path="/club-preview" element={<ClubPreview />} />
            <Route path="/dev/ping" element={<SupabasePing />} />
            <Route path="/u/:slug" element={<UserProfile />} />
            <Route path="/profile/:id" element={<UserProfile />} />
            <Route
              path="/clubs/:clubParam/requests"
              element={<ClubRequests />}
            />
            <Route path="/u/:slug/:mode" element={<ProfileFollows />} />
            <Route path="/profile/:id/:mode" element={<ProfileFollows />} />
            <Route path="/auth" element={<AuthPage />} />

            {/* Premium routing */}
            <Route
              path="/premium"
              element={
                isPremium ? (
                  <Navigate to="/settings/premium" replace />
                ) : (
                  <PremiumPage />
                )
              }
            />
            <Route
              path="/directors-cut"
              element={
                isPremium ? (
                  <Navigate to="/settings/premium" replace />
                ) : (
                  <PremiumPage />
                )
              }
            />
            <Route path="/settings/premium" element={<SettingsPremium />} />
            <Route path="/settings/profile" element={<SettingsProfile />} />
            <Route path="/pwa" element={<PwaInstall />} />
            <Route path="/premium/success" element={<PremiumSuccess />} />
            <Route path="/directors-cut/success" element={<DirectorsCutSuccess />} />

            <Route
              path="/leaderboard"
              element={<LeaderboardAndPlayoffs />}
            />
            <Route
              path="/notifications"
              element={<NotificationsPage />}
            />
            <Route path="/home" element={<HomeSignedIn />} />
            <Route path="/me/club" element={<MyClub />} />
            <Route path="/clubs" element={<Clubs />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/terms-and-conditions" element={<Navigate to="/terms" replace />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/privacy-policy" element={<Navigate to="/privacy" replace />} />
            <Route path="/cookie-policy" element={<CookiePolicyPage />} />
            <Route path="/acceptable-use" element={<AcceptableUsePage />} />
            <Route path="/community-guidelines" element={<CommunityGuidelinesPage />} />
            <Route path="/billing-terms" element={<BillingTermsPage />} />
            <Route path="/data-retention" element={<DataRetentionPage />} />
            <Route path="/subprocessors" element={<SubprocessorsPage />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/socials" element={<OurSocialsPage />} />
            <Route path="/auth/forgot" element={<ForgotPassword />} />
<Route path="/auth/reset" element={<ResetPassword />} />
<Route path="/search/users" element={<UserSearchPage />} />







            
          </Routes>
        </Suspense>
      </main>

      <PwaInstallPrompt />
      <PwaUpdateToast />
      <Toaster position="top-center" />
      <Suspense fallback={null}>
        <SuperFilmFooter />
      </Suspense>
      <MobileNav />
    </div>
  );
}

/* ==================== MOBILE NAV (GLOBAL) ==================== */
function MobileNav() {
  const location = useLocation();
  const { user } = useUser();
  const navigate = useNavigate();
  const { clubs: myClubs, loading: clubsLoading } = useMyClubs();
  const [clubsOpen, setClubsOpen] = useState(false);
  const clubsRef = useRef(null);

  useEffect(() => {
    if (!clubsOpen) return;
    function onDocClick(e) {
      if (clubsRef.current && !clubsRef.current.contains(e.target)) {
        setClubsOpen(false);
      }
    }
    function onKey(e) {
      if (e.key === "Escape") setClubsOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [clubsOpen]);

  // Always show on small screens; keep a minimal set of primary destinations
  return (
    <>
      {clubsOpen && (
        <div
          className="sm:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
          aria-hidden="true"
        />
      )}

      {clubsOpen && (
        <div className="sm:hidden fixed inset-x-0 bottom-16 z-50 px-4" ref={clubsRef}>
          <div className="rounded-2xl border border-white/10 bg-black/95 shadow-2xl">
            <div className="px-4 pt-3 pb-2 text-xs uppercase tracking-wide text-zinc-400">
              My Clubs
            </div>
            <div className="max-h-[45vh] overflow-auto">
              {clubsLoading ? (
                <div className="px-4 py-3 text-sm text-zinc-400">Loading clubs…</div>
              ) : myClubs.length === 0 ? (
                <div className="px-4 py-3 text-sm text-zinc-400">You haven’t joined a club yet.</div>
              ) : (
                myClubs.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setClubsOpen(false);
                      navigate(`/clubs/${c.slug || c.id}`);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-zinc-100 hover:bg-white/5"
                  >
                    <div className="h-9 w-9 rounded-full overflow-hidden border border-white/10 bg-zinc-900 shrink-0">
                      {c.profile_image_url ? (
                        <img
                          src={c.profile_image_url}
                          alt={c.name}
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{c.name}</div>
                      <div className="text-xs text-zinc-400">
                        {c.role ? c.role.replace("_", " ") : "member"}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  setClubsOpen(false);
                  navigate("/create-club");
                }}
                className="w-full px-4 py-3 text-sm text-white hover:bg-white/5 text-left"
              >
                Create a club
              </button>
              <button
                type="button"
                onClick={() => {
                  setClubsOpen(false);
                  navigate("/clubs");
                }}
                className="w-full px-4 py-3 text-sm text-yellow-400 hover:bg-white/5 text-left"
              >
                Browse all clubs
              </button>
            </div>
          </div>
        </div>
      )}

      <nav
        className="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-black/85 backdrop-blur-xl border-t border-white/10"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}
        aria-label="Mobile navigation"
      >
        <div className="mx-auto max-w-5xl px-4 py-2 flex items-center justify-around text-zinc-200 text-xs">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 ${isActive ? "text-white" : "text-zinc-300"}`
            }
            aria-label="Home"
          >
            <HomeIcon size={18} />
            <span>Home</span>
          </NavLink>

          {user ? (
            <button
              type="button"
              onClick={() => setClubsOpen((v) => !v)}
              className={`flex flex-col items-center gap-1 ${
                location.pathname.startsWith("/clubs") || clubsOpen
                  ? "text-white"
                  : "text-zinc-300"
              }`}
              aria-label="My clubs"
              aria-expanded={clubsOpen ? "true" : "false"}
            >
              <Users size={18} />
              <span>Clubs</span>
            </button>
          ) : (
            <NavLink
              to="/clubs"
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 ${isActive ? "text-white" : "text-zinc-300"}`
              }
              aria-label="Clubs"
            >
              <Users size={18} />
              <span>Clubs</span>
            </NavLink>
          )}

          <NavLink
            to="/movies"
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 ${isActive ? "text-white" : "text-zinc-300"}`
            }
            aria-label="Movies"
          >
            <Film size={18} />
            <span>Movies</span>
          </NavLink>
          <NavLink
            to={user ? "/profile" : "/auth"}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 ${isActive ? "text-white" : "text-zinc-300"}`
            }
            aria-label="Profile"
          >
            <UserIcon size={18} />
            <span>{user ? "Profile" : "Sign in"}</span>
          </NavLink>
        </div>
      </nav>
    </>
  );
}
