// src/components/TasteCardPicker.jsx
import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, X, Lock } from "lucide-react";
import { toast } from "react-hot-toast";
import { TASTE_QUESTIONS } from "../constants/tasteQuestions";

/**
 * Persisted TasteCard shape:
 * {
 *   id: string,
 *   source: 'preset' | 'custom',
 *   presetId?: string,
 *   question: string,
 *   answer: string,
 *   style: { mode: 'glow' | 'outline', glow: string, outline: string }
 * }
 */

// Basic (free) + premium palettes
const BASIC_COLORS = [
  "#ef4444", "#f97316", "#FACC15", "#FACC15",
  "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6",
  "#a855f7", "#ec4899",
];
const MATTE_COLORS = ["#c2410c","#a16207","#166534","#0f766e","#1d4ed8","#6d28d9","#831843"];
const NEON_COLORS  = ["#f0f921","#00f5d4","#00c2ff","#7c3aed","#ff4ecd","#ff6b6b"];
const PEARL_COLORS = ["#f5eefa","#e6f4ff","#e9ffe6","#fff4e6","#ffe6f1","#e6f7ff"];

function genId(){ return Math.random().toString(36).slice(2)+Date.now().toString(36); }

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-zinc-300">{label}</div>
      {children}
      {hint ? <div className="mt-1 text-[11px] text-zinc-500">{hint}</div> : null}
    </label>
  );
}

function CardShell({ children, outlineColor, isOutline }) {
  return (
    <div
      className="relative rounded-2xl border border-white/10 bg-black/50 p-4"
      style={{
        boxShadow: !isOutline ? `0 0 18px 3px ${outlineColor}` : "none",
        outline: isOutline ? `2px solid ${outlineColor}` : "none",
        outlineOffset: isOutline ? "2px" : "0",
      }}
    >
      {children}
    </div>
  );
}

function RowActions({ onEdit, onRemove }) {
  return (
    <div className="absolute right-2 bottom-2 flex items-center gap-1">
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
        title="Edit"
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-red-200 hover:bg-white/10"
        title="Delete"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function Swatch({ hex, selected, onPick, disabled, title }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onPick}
      title={title}
      aria-pressed={selected ? "true" : "false"}
      className={`h-7 w-7 rounded-full border transition ${
        selected ? "ring-2 ring-yellow-400 animate-[pulse_250ms_ease-out]" : ""
      } ${disabled ? "opacity-50 cursor-not-allowed" : "hover:scale-105"} border-white/10`}
      style={{ background: hex, boxShadow: `0 0 10px 2px ${hex}` }}
    />
  );
}

function CardEditorModal({ initial, onClose, onSave, isPremium }) {
  const [answer, setAnswer] = useState(initial?.answer || "");
  const [question, setQuestion] = useState(initial?.question || "");
  const [style, setStyle] = useState(
    initial?.style || { mode: "glow", glow: "#FACC15", outline: "#FACC15" }
  );

  const canSave =
    (question || "").trim().length > 0 && (answer || "").trim().length > 0;

  function setModeGlow(){ setStyle((s)=>({ ...s, mode: "glow" })); }
  function setModeOutline(){
    if (!isPremium) {
      toast("Outline style is a Director’s Cut feature.", { icon: "🔒" });
      return;
    }
    setStyle((s)=>({ ...s, mode: "outline" }));
  }

  function pick(hex) {
    setStyle((s)=>({ ...s, glow: hex, outline: hex }));
  }

  function lockToast() {
    toast((t)=>(
      <div className="text-sm">
        This colour is for Director’s Cut members.
        <div className="mt-2">
          <a
            href="/premium"
            onClick={()=>toast.dismiss(t.id)}
            className="inline-flex items-center justify-center rounded-2xl px-3 py-1.5 font-semibold text-black bg-gradient-to-br from-yellow-400 to-yellow-400 ring-1 ring-yellow-300/60 transition hover:scale-[1.02]"
          >
            Upgrade to unlock
          </a>
        </div>
      </div>
    ), { duration: 3500 });
  }

  const isOutline = style?.mode === "outline";
  const colorNow  = (isOutline ? style?.outline : style?.glow) || "#FACC15";

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-zinc-950 p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">
            {initial?.id ? "Edit Taste Card" : "Create Taste Card"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 p-1 text-zinc-300 hover:bg-white/5"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <Field
            label="Question"
            hint={initial?.source === "preset" ? "Preset can’t be changed; you can edit the answer and colour." : null}
          >
            <input
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-yellow-400 disabled:opacity-60"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={140}
              disabled={initial?.source === "preset"}
            />
          </Field>

          <Field label="Answer">
            <textarea
              className="min-h-[96px] w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-yellow-400"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              maxLength={280}
              placeholder="Write your answer…"
            />
          </Field>

          <div>
            <div className="mb-1 text-xs font-medium text-zinc-300">Style</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={setModeGlow}
                className={`rounded-lg border px-2 py-1 text-xs ${
                  style?.mode !== "outline"
                    ? "border-yellow-400 text-yellow-300"
                    : "border-white/10 text-zinc-300"
                }`}
              >
                Glow
              </button>
              <button
                type="button"
                onClick={setModeOutline}
                className={`rounded-lg border px-2 py-1 text-xs ${
                  style?.mode === "outline"
                    ? "border-yellow-400 text-yellow-300"
                    : "border-white/10 text-zinc-300"
                }`}
              >
                Outline {!isPremium && <Lock size={12} className="inline ml-1" />}
              </button>
            </div>

            {/* Single colour area (free = basics only; premium = all) */}
            <div className="mt-3 space-y-3">
              <div>
                <div className="mb-1 text-xs text-zinc-400">Basics</div>
                <div className="grid grid-cols-10 gap-2">
                  {BASIC_COLORS.map((hex) => (
                    <Swatch
                      key={hex}
                      hex={hex}
                      selected={hex === colorNow}
                      onPick={() => pick(hex)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs text-zinc-400">Matte (Premium)</div>
                <div className="grid grid-cols-10 gap-2">
                  {MATTE_COLORS.map((hex) => (
                    <Swatch
                      key={hex}
                      hex={hex}
                      selected={hex === colorNow}
                      onPick={() => (isPremium ? pick(hex) : lockToast())}
                      disabled={!isPremium}
                      title={!isPremium ? "Director’s Cut required" : ""}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs text-zinc-400">Neon (Premium)</div>
                <div className="grid grid-cols-10 gap-2">
                  {NEON_COLORS.map((hex) => (
                    <Swatch
                      key={hex}
                      hex={hex}
                      selected={hex === colorNow}
                      onPick={() => (isPremium ? pick(hex) : lockToast())}
                      disabled={!isPremium}
                      title={!isPremium ? "Director’s Cut required" : ""}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs text-zinc-400">Pearlescent (Premium)</div>
                <div className="grid grid-cols-10 gap-2">
                  {PEARL_COLORS.map((hex) => (
                    <Swatch
                      key={hex}
                      hex={hex}
                      selected={hex === colorNow}
                      onPick={() => (isPremium ? pick(hex) : lockToast())}
                      disabled={!isPremium}
                      title={!isPremium ? "Director’s Cut required" : ""}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* preview */}
        <div className="mt-5">
          <CardShell outlineColor={colorNow} isOutline={isOutline}>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-400">
              Question
            </div>
            <div className="mb-3 text-sm font-semibold text-white">{question}</div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-400">
              Answer
            </div>
            <div className="text-sm text-zinc-200">{answer}</div>
          </CardShell>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() =>
              onSave({
                id: initial?.id || genId(),
                source: initial?.source || "preset",
                presetId: initial?.presetId,
                question: (question || "").trim(),
                answer: (answer || "").trim(),
                style,
              })
            }
            className={`rounded-xl px-3 py-2 text-sm ${
              canSave
                ? "border border-yellow-500 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/20"
                : "border border-white/10 bg-white/5 text-zinc-500"
            }`}
          >
            Save Card
          </button>
        </div>
      </div>
    </div>
  );
}

function TasteCardRow({ card, onEdit, onRemove }) {
  const isOutline = card?.style?.mode === "outline";
  const color = (isOutline ? card?.style?.outline : card?.style?.glow) || "#FACC15";

  return (
    <CardShell outlineColor={color} isOutline={isOutline}>
      <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-400">
        Question
      </div>
      <div className="mb-3 text-sm font-semibold text-white">{card.question}</div>
      <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-400">Answer</div>
      <div className="text-sm text-zinc-200">{card.answer}</div>
      <RowActions onEdit={() => onEdit(card)} onRemove={() => onRemove(card.id)} />
    </CardShell>
  );
}

export default function TasteCardPicker({
  selected,
  setSelected,
  maxSelected = 4,
  isPremium = false,
  className = "",
}) {
  const [editing, setEditing] = useState(null);
  const [qSearch, setQSearch] = useState("");

  const canAdd = selected.length < maxSelected;
  const countText = `${selected.length}/${maxSelected}`;

  const filteredPresets = useMemo(() => {
    const q = qSearch.trim().toLowerCase();
    if (!q) return TASTE_QUESTIONS;
    return TASTE_QUESTIONS.filter((t) => t.label.toLowerCase().includes(q));
  }, [qSearch]);

  function addPreset(p) {
    if (!canAdd) return;
    const exists = selected.some((c) => c.presetId === p.id);
    if (exists) return;

    const draft = {
      id: genId(),
      source: "preset",
      presetId: p.id,
      question: p.label,
      answer: "",
      style: { mode: "glow", glow: "#FACC15", outline: "#FACC15" },
    };
    setEditing(draft);
  }

  function handleSave(card) {
    setSelected((prev) => {
      const exists = prev.some((c) => c.id === card.id);
      if (exists) return prev.map((c) => (c.id === card.id ? card : c));
      if (prev.length >= maxSelected) return prev;
      return [...prev, card];
    });
    setEditing(null);
  }

  function handleRemove(id) {
    setSelected((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className={className}>
      <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-white">Your Taste Cards</div>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span>{countText}</span>
            {isPremium ? (
              <button
                type="button"
                onClick={() =>
                  setEditing({
                    id: null,
                    source: "custom",
                    question: "",
                    answer: "",
                    style: { mode: "glow", glow: "#FACC15", outline: "#FACC15" },
                  })
                }
                disabled={!canAdd}
                className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-50"
                title={!canAdd ? "Limit reached" : "Create custom card (Premium)"}
              >
                <Plus size={14} />
                Custom
              </button>
            ) : null}
          </div>
        </div>

        <div className="mb-3">
          <input
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-yellow-400"
            placeholder="Search preset questions..."
            value={qSearch}
            onChange={(e) => setQSearch(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {filteredPresets.map((p) => {
            const disabled = !canAdd || selected.some((c) => c.presetId === p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => addPreset(p)}
                disabled={disabled}
                className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                  disabled
                    ? "border-white/10 text-zinc-500 cursor-not-allowed"
                    : "border-white/10 text-zinc-200 hover:bg-white/5"
                }`}
                title={disabled ? "Already added or limit reached" : "Add this question"}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {!canAdd && (
          <div className="mt-2 text-[11px] text-zinc-500">
            You’ve reached the limit for this plan.
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {selected.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/40 p-6 text-center text-zinc-400">
            No cards yet. Pick a preset above{isPremium ? " or create your own." : "."}
          </div>
        ) : (
          selected.map((card) => (
            <div key={card.id} className="relative">
              <TasteCardRow
                card={card}
                onEdit={(c) => setEditing(c)}
                onRemove={handleRemove}
              />
            </div>
          ))
        )}
      </div>

      {editing && (
        <CardEditorModal
          initial={editing?.id ? editing : null}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          isPremium={isPremium}
        />
      )}
    </div>
  );
}
