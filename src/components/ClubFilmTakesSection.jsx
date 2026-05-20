// src/components/ClubFilmTakesSection.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "lib/supabaseClient";
import { useUser } from "../context/UserContext";
import { createNotification } from "../utils/notify";
import DirectorsCutBadge from "./DirectorsCutBadge";
import usePageVisibility from "../hooks/usePageVisibility";

const CLAPS_TABLE = "club_take_claps"; // ← use the actual table you created

export default function ClubFilmTakesSection({
  clubId,
  filmId,
  canSeeMembersOnly,
  userId,           // ← pass viewer id in
  rotateMs = 8000,
}) {
  const { user, profile } = useUser();
  const effectiveUserId = userId || user?.id || null;
  const [takes, setTakes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [index, setIndex] = useState(0);
  const timerRef = useRef(null);
  const isVisible = usePageVisibility();

  async function fetchTakes() {
    if (!clubId || !filmId) {
      setTakes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);

    try {
      // 1) Load takes (no embedding)
      const { data: base, error: e1 } = await supabase
        .from("club_film_takes")
        .select(`
          id, user_id, rating, take, created_at, is_archived,
          profiles:profiles!user_id ( display_name, avatar_url, is_premium, plan )
        `)
        .eq("club_id", clubId)
        .eq("film_id", Number(filmId))
        .eq("is_archived", false)
        .order("created_at", { ascending: true });

      if (e1) throw e1;

      const rows = Array.isArray(base) ? base : [];
      if (rows.length === 0) {
        setTakes([]);
        setIndex(0);
        setLoading(false);
        return;
      }

      const ids = rows.map((r) => r.id);

      // 2) Counts per take
      const { data: counts, error: e2 } = await supabase
        .from(CLAPS_TABLE)
        .select("take_id")
        .in("take_id", ids);

      if (e2) throw e2;

      const byTake = (counts || []).reduce((acc, r) => {
        acc[r.take_id] = (acc[r.take_id] || 0) + 1;
        return acc;
      }, {});

      // 3) Has the viewer clapped any of these?
      let mySet = new Set();
      if (effectiveUserId) {
        const { data: mine } = await supabase
          .from(CLAPS_TABLE)
          .select("take_id")
          .eq("user_id", effectiveUserId)
          .in("take_id", ids);
        mySet = new Set((mine || []).map((m) => m.take_id));
      }

      // 4) Merge
      const merged = rows.map((r) => ({
        ...r,
        clap_count: byTake[r.id] || 0,
        clapped_by_me: mySet.has(r.id),
      }));

      setTakes(merged);
      setIndex(0);
    } catch (e) {
      setErr(e?.message || "Failed to load film takes");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTakes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, filmId, effectiveUserId]);

  useEffect(() => {
    function onUpdated(e) {
      if (
        e?.detail?.clubId === clubId &&
        Number(e?.detail?.filmId) === Number(filmId)
      ) {
        fetchTakes();
      }
    }
    window.addEventListener("club-film-takes-updated", onUpdated);
    return () => window.removeEventListener("club-film-takes-updated", onUpdated);
  }, [clubId, filmId]);

  const safeTakes = useMemo(() => takes.filter(Boolean), [takes]);

  useEffect(() => {
    clearInterval(timerRef.current);
    if (!safeTakes.length || !isVisible) return;
    timerRef.current = setInterval(
      () => setIndex((i) => (i + 1) % safeTakes.length),
      rotateMs
    );
    return () => clearInterval(timerRef.current);
  }, [safeTakes.length, rotateMs, isVisible]);

  if (!canSeeMembersOnly) {
    return (
      <div className="mt-3 rounded-xl border border-zinc-800 bg-black/40 p-3 text-sm text-zinc-400">
        Film Takes are for members.
      </div>
    );
  }

  // detect if viewer already has a take for "Edit your take" link
  const myTake = effectiveUserId
    ? safeTakes.find((t) => t.user_id === effectiveUserId)
    : null;

  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-yellow-400">Film Takes</h3>
        {myTake ? (
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("open-take-editor", {
                  detail: {
                    preset: myTake?.take ?? "",
                    rating: myTake?.rating ?? null,
                  },
                })
              )
            }
            className="text-xs text-yellow-400 hover:underline"
          >
            Edit your take
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 animate-pulse text-sm text-zinc-400">
          Loading takes…
        </div>
      ) : err ? (
        <div className="rounded-2xl border border-red-900/60 bg-red-900/20 p-4 text-sm text-red-300">
          {err}
        </div>
      ) : safeTakes.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-zinc-300">
          No takes yet — be the first to share your thoughts.
        </div>
      ) : (
        <SpotlightCard
          take={safeTakes[index]}
          count={safeTakes.length}
          index={index}
          onToggleClap={async (takeId, clapped) => {
            if (!effectiveUserId) {
              alert("Sign in to clap.");
              return;
            }

            // optimistic update
            setTakes((prev) =>
              prev.map((t) =>
                t.id === takeId
                  ? {
                      ...t,
                      clapped_by_me: !clapped,
                      clap_count: (t.clap_count || 0) + (clapped ? -1 : 1),
                    }
                  : t
              )
            );

            try {
              if (clapped) {
                // remove clap
                const { error } = await supabase
                  .from(CLAPS_TABLE)
                  .delete()
                  .eq("take_id", takeId)
                  .eq("user_id", effectiveUserId);
                if (error) throw error;
              } else {
                const take = safeTakes.find((t) => t.id === takeId);
                // add clap (include club_id for RLS)
                const { error } = await supabase
                  .from(CLAPS_TABLE)
                  .insert({ club_id: clubId, take_id: takeId, user_id: effectiveUserId });
                // ignore unique-violation from double clicks
                if (error && error.code !== "23505") throw error;

                if (take?.user_id && take.user_id !== effectiveUserId) {
                  const actorName =
                    profile?.display_name ||
                    profile?.username ||
                    user?.email?.split("@")[0] ||
                    "Someone";
                  const { error: notifyErr } = await createNotification({
                    userId: take.user_id,
                    type: "club.take.clap",
                    actorId: effectiveUserId,
                    clubId,
                    data: {
                      title: "New clap",
                      message: `${actorName} clapped your take.`,
                      href: `/clubs/${clubId}`,
                    },
                  });
                  if (notifyErr) {
                    console.warn("[clap notify] failed:", notifyErr.message || notifyErr);
                  }
                }
              }
            } catch (e) {
              // rollback UI on failure
              setTakes((prev) =>
                prev.map((t) =>
                  t.id === takeId
                    ? {
                        ...t,
                        clapped_by_me: clapped,
                        clap_count: (t.clap_count || 0) + (clapped ? 1 : -1),
                      }
                    : t
                )
              );
              alert(e?.message || "Could not update clap.");
            }
          }}
        />
      )}
    </div>
  );
}

function SpotlightCard({ take, count, index, onToggleClap }) {
  const name = take?.profiles?.display_name || "Member";
  const avatar = take?.profiles?.avatar_url || "/default-avatar.svg";
  const isPremium =
    take?.profiles?.is_premium === true ||
    String(take?.profiles?.plan || "").toLowerCase() === "directors_cut";
  const rating =
    typeof take?.rating === "number" && !Number.isNaN(take.rating)
      ? take.rating
      : null;
  const ratingOutOfFive =
    rating == null
      ? null
      : rating > 5
      ? Number((rating / 2).toFixed(1))
      : Number(rating.toFixed(1));

  // SuperFilm outlined container
  return (
    <div className="group relative overflow-hidden rounded-2xl border-[4px] border-yellow-500/35 bg-black/30 p-5 shadow-[0_0_20px_rgba(250,204,21,0.1)]">
      <div className="flex items-start gap-3">
        <img
          src={avatar}
          alt={name}
          className="h-10 w-10 rounded-full object-cover"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = "/default-avatar.svg";
          }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="truncate font-semibold text-white flex items-center gap-2">
              <span className="truncate">{name}</span>
              {isPremium && <DirectorsCutBadge className="ml-0" size="xs" />}
            </div>
            <div className="flex items-center gap-2">
              {/* Clap pill (no emoji) */}
              <button
                type="button"
                onClick={() => onToggleClap?.(take.id, !!take.clapped_by_me)}
                className={[
                  "h-7 px-2 rounded-full border text-xs font-semibold transition",
                  take.clapped_by_me
                    ? "border-yellow-400 text-yellow-300 bg-yellow-400/10"
                    : "border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/10",
                ].join(" ")}
                aria-pressed={take.clapped_by_me ? "true" : "false"}
                aria-label={take.clapped_by_me ? "Remove clap" : "Clap this take"}
              >
                Clap • {take.clap_count ?? 0}
              </button>

              {ratingOutOfFive != null && (
                <div className="shrink-0 rounded-full border border-yellow-500/30 px-2 py-0.5 text-xs text-yellow-400">
                  {ratingOutOfFive}/5
                </div>
              )}
            </div>
          </div>
          <p className="mt-2 text-zinc-200">{take?.take || "—"}</p>
        </div>
      </div>

      {count > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {Array.from({ length: count }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-6 rounded-full transition-opacity ${
                i === index ? "bg-yellow-400 opacity-100" : "bg-white/20 opacity-50"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
