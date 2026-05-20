import { NavLink } from "react-router-dom";
import useEntitlements from "../hooks/useEntitlements";

export default function PremiumGate({ children, fallbackText = "This feature is available in Director’s Cut." }) {
  const { flags } = useEntitlements();

  if (flags.isPremium) return children;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
      <p className="text-sm text-zinc-300">{fallbackText}</p>
      <NavLink
        to="/premium"
        className={[
          "mt-3 inline-flex items-center justify-center rounded-2xl px-4 py-2 font-semibold",
          "text-black bg-gradient-to-br from-yellow-400 to-yellow-400",
          "shadow-[0_0_30px_rgba(250,204,21,0.35)] ring-1 ring-yellow-400/60",
          "transition hover:scale-[1.02]"
        ].join(" ")}
      >
        Upgrade to Director’s Cut
      </NavLink>
    </div>
  );
}
