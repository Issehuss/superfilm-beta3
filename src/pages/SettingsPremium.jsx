// src/pages/SettingsPremium.jsx
// src/pages/SettingsPremium.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import supabase from "lib/supabaseClient";
import { useUser } from "../context/UserContext";
import { openBillingPortal, startCheckout } from "../lib/billing";
import { toast } from "react-hot-toast";
const DIRECT_PORTAL_URL = "https://billing.stripe.com/p/login/aFa3cocP83Mx5LUgU9gQE00";

// 5.7.a — human-readable status
const humanStatus = (s) =>
    ({ active: "Active", trialing: "Trialing", past_due: "Past due (grace)" }[s] ||
     (s || "—").replaceAll("_", " "));
  


export default function SettingsPremium() {
  const { user, isPremium, profile, refreshProfile } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState(null);
  const [error, setError] = useState(null);

  const { search } = useLocation();

useEffect(() => {
  const q = new URLSearchParams(search);
  if (q.get("upgraded") === "1") toast.success("Welcome to Director’s Cut! 🎬");
}, [search]);

useEffect(() => {
  if (sub?.cancel_at_period_end) {
    toast("Your subscription will end at the period boundary.", { id: "cancel-scheduled" });
  }
}, [sub?.cancel_at_period_end]);

  // 5.1.b — refresh profile once on mount (after returning from Stripe, etc.)
  const didRefetch = useRef(false);
  useEffect(() => {
    if (didRefetch.current) return;
    didRefetch.current = true;
    const id = setTimeout(() => { refreshProfile?.(); }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Optional toast when returning from /premium/success?upgraded=1
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get("upgraded") === "1") {
      toast.success("Welcome to Director’s Cut! 🎬");
    }
  }, [location.search]);

  // Load the user's latest subscription (if any)
  useEffect(() => {
    let mounted = true;
    let retryTimer;

    const loadSub = async () => {
      try {
        setLoading(true);
        setError(null);
        const { data: auth } = await supabase.auth.getSession();
        const sessionUserId = auth?.session?.user?.id || null;
        const resolvedUserId = user?.id || sessionUserId;
        if (!resolvedUserId) {
          if (mounted) {
            setSub(null);
            retryTimer = setTimeout(loadSub, 500);
          }
          return;
        }
        const { data, error } = await supabase
          .from("subscriptions")
          .select(`
            id,
            status,
            price_id,
            current_period_start,
            current_period_end,
            cancel_at_period_end,
            updated_at
          `)
          .eq("user_id", resolvedUserId)
          .order("current_period_end", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        if (!mounted) return;
        setSub(data || null);
      } catch (e) {
        console.error("[SettingsPremium] load sub error:", e);
        if (mounted) setError(e?.message || "Failed to load subscription");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadSub();
    return () => {
      mounted = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [user?.id]);

  const periodEndLabel = useMemo(() => {
    const iso = sub?.current_period_end;
    if (!iso) return null;
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return iso;
    }
  }, [sub?.current_period_end]);

  const statusBadge = useMemo(() => {
    const s = (sub?.status || "").toLowerCase();
    if (!s) return null;
    const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1";
    if (s === "active" || s === "trialing")
      return <span className={`${base} bg-emerald-500/10 text-emerald-300 ring-emerald-400/30`}>{s}</span>;
    if (s === "past_due")
      return <span className={`${base} bg-yellow-400/10 text-yellow-400 ring-yellow-400/30`}>past due</span>;
    if (["canceled","unpaid","incomplete","incomplete_expired","paused"].includes(s))
      return <span className={`${base} bg-zinc-700/40 text-zinc-300 ring-white/10`}>{s}</span>;
    return <span className={`${base} bg-zinc-700/40 text-zinc-300 ring-white/10`}>{s}</span>;
  }, [sub?.status]);

  // Views
  if (!user) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold mb-4">Premium</h1>
        <div className="rounded-2xl border border-zinc-800 bg-black/40 p-6">
          <p className="text-zinc-300">Please sign in to manage SuperFilm Premium.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold mb-4">Premium</h1>
        <div className="rounded-2xl border border-zinc-800 bg-black/40 p-6">
          <div className="h-24 rounded-xl bg-zinc-900 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!isPremium) {
    // Free plan: quiet upsell with one CTA
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold mb-4">Premium</h1>
        <div className="rounded-2xl border border-zinc-800 bg-black/40 p-6">
          <p className="text-zinc-300">
            You’re currently on the free plan. Upgrade to Director’s Cut to unlock advanced glow options,
            extra Taste Cards, and club management tools.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={startCheckout}
              className={[
                "inline-flex items-center justify-center rounded-2xl px-4 py-2 font-semibold",
                "text-black",
                "bg-gradient-to-br from-yellow-400 to-yellow-400",
                "shadow-[0_0_30px_rgba(250,204,21,0.35)] hover:shadow-[0_0_42px_rgba(250,204,21,0.55)]",
                "transition-all duration-300 hover:scale-[1.02]",
                "ring-1 ring-yellow-400/60 hover:ring-yellow-200"
              ].join(" ")}
            >
              Go Premium
            </button>
            <button
              type="button"
              onClick={() => navigate("/premium")}
              className="rounded-xl px-4 py-2 bg-zinc-800/70 hover:bg-zinc-700/70 text-zinc-200 ring-1 ring-white/10 transition-colors"
            >
              Learn more
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-500">14-day free trial. Cancel anytime.</p>
        </div>
      </div>
    );
  }

  // Premium view (active/trialing/past_due within grace)
  const cancelAtPeriodEnd = !!sub?.cancel_at_period_end;
  const header = cancelAtPeriodEnd ? "Premium · Cancels at period end" : "Premium · Active";

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold mb-2">{header}</h1>
      <div className="mb-4 rounded-xl bg-zinc-900/60 px-4 py-3 text-sm text-zinc-300">
        Please allow up to 5 minutes for your new premium features to become fully active across the app.
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-900/60 bg-red-950/50 p-3 text-red-200">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-zinc-800 bg-black/40 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">Director’s Cut</span>
              {statusBadge}
            </div>
            <div className="mt-1 text-sm text-zinc-400">
              {cancelAtPeriodEnd ? (
                <>Expires on <span className="text-zinc-200">{periodEndLabel || "—"}</span>.</>
              ) : (
                <>Renews on <span className="text-zinc-200">{periodEndLabel || "—"}</span>.</>
              )}
            </div>
            {profile?.premium_expires_at && (
              <div className="mt-1 text-xs text-zinc-500">
                Account expiry: {new Date(profile.premium_expires_at).toLocaleString()}
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={openBillingPortal}
              className="rounded-xl px-4 py-2 bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-200 ring-1 ring-white/10 transition-colors"
            >
              Manage billing
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  await openBillingPortal();
                } catch {
                  navigate("/premium");
                }
              }}
              className="rounded-xl px-4 py-2 bg-zinc-900/60 text-zinc-300 ring-1 ring-white/5 hover:bg-zinc-900/80 transition-colors"
            >
              Update plan
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-4">
            <div className="text-sm font-semibold text-white">Your plan</div>
            <div className="mt-1 text-zinc-300">Director’s Cut (monthly)</div>
            {sub?.price_id && (
              <div className="mt-1 text-xs text-zinc-500">Price ID: {sub.price_id}</div>
            )}
          </div>

          <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-4">
            <div className="text-sm font-semibold text-white">Status</div>
            <div className="mt-1 text-zinc-300">
  {humanStatus(sub?.status || "active")}
</div>

            <div className="mt-1 text-xs text-zinc-500">
              Updated {sub?.updated_at ? new Date(sub.updated_at).toLocaleString() : "—"}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-amber-700/20 bg-amber-900/10 p-4 text-amber-200">
          Tip: You can cancel or resume your subscription anytime via{" "}
          <button
            type="button"
            onClick={openBillingPortal}
            className="underline underline-offset-2 hover:text-yellow-400"
            
          >
            the billing portal
          </button>.
          {" "}If the portal link doesn’t load, you can also{" "}
          <a
            href={DIRECT_PORTAL_URL}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-yellow-400"
          >
            open the Stripe portal directly
          </a>.
        </div>

        {/* 5.7.b — Stripe note */}
<div className="mt-3 text-xs text-zinc-500">
  Billing is handled securely by Stripe. You can cancel anytime in the billing portal.
</div>

      </div>
    </div>
  );
}
