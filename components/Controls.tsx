"use client";

const HEX = /^#[0-9a-f]{6}$/i;

const label = "text-[15px] text-neutral-500";
const tile =
  "h-14 rounded-2xl bg-neutral-100 text-neutral-900 outline-none transition-shadow focus-within:ring-2 focus-within:ring-neutral-900/15";

const normalize = (raw: string) => {
  const n = parseFloat(raw);
  return n > 0 ? String(Number(n.toFixed(3))) : "";
};

/** A number field that applies its value when you leave it or press Enter. */
export function NumberField({
  name,
  value,
  onCommit,
}: {
  name: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className={label}>{name}</span>
      <input
        // A new key remounts the field when the value is changed from outside
        // (for example when the link rescales the stroke).
        key={value}
        defaultValue={value}
        inputMode="decimal"
        placeholder="Auto"
        onBlur={(e) => {
          const next = normalize(e.currentTarget.value);
          e.currentTarget.value = next;
          onCommit(next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className={`${tile} w-24 text-center text-xl font-semibold placeholder:font-medium placeholder:text-neutral-400 focus:ring-2 focus:ring-neutral-900/15`}
      />
    </label>
  );
}

export function ColorField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className={label}>Colors</span>
      <div className={`${tile} flex items-center gap-3 pl-2.5 pr-4`}>
        <input
          type="color"
          aria-label="Fill color"
          value={HEX.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="swatch shrink-0"
        />
        <input
          aria-label="Fill color hex"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="w-24 bg-transparent font-mono text-[15px] font-medium uppercase outline-none"
        />
      </div>
    </div>
  );
}

export function LinkToggle({
  linked,
  onChange,
}: {
  linked: boolean;
  onChange: (linked: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={linked}
      onClick={() => onChange(!linked)}
      title={
        linked
          ? "Linked: changing the width rescales the stroke with it"
          : "Unlinked: the stroke keeps its size when the width changes"
      }
      className={`flex h-14 w-10 items-center justify-center rounded-xl transition-colors hover:bg-neutral-100 ${
        linked ? "text-green-500" : "text-neutral-400"
      }`}
    >
      <svg width="20" height="26" viewBox="0 0 20 26" fill="none" aria-hidden>
        <g stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          {linked ? (
            <>
              <rect x="5" y="2" width="10" height="14" rx="5" />
              <rect x="5" y="10" width="10" height="14" rx="5" />
            </>
          ) : (
            <>
              <rect x="5" y="2" width="10" height="9" rx="4.5" />
              <rect x="5" y="15" width="10" height="9" rx="4.5" />
            </>
          )}
        </g>
      </svg>
    </button>
  );
}

export function ZoomSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className={label}>
        Zoom <span className="tabular-nums text-neutral-400">{value.toFixed(1)}×</span>
      </span>
      <span className="flex h-14 items-center">
        <input
          type="range"
          min={1}
          max={8}
          step={0.1}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="zoom-range w-40"
        />
      </span>
    </label>
  );
}
