export default function PremiumBadge({ className = "" }) {
    return (
      <span
        className={[
          "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
          "text-black bg-gradient-to-br from-yellow-400 to-yellow-400",
          "ring-1 ring-yellow-300/60",
          className
        ].join(" ")}
      >
        Director’s Cut
      </span>
    );
  }
  