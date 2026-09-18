"use client";

import { useEffect, useRef, useState } from "react";

const toDataUri = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const MAX_ZOOM = 32;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Recolor the root fill so the outline can be laid over the original. */
const tint = (svg: string, color: string) =>
  svg.replace(/(<svg\b[^>]*?\sfill=")[^"]*(")/, `$1${color}$2`);

export function Inspector({
  name,
  before,
  after,
  onClose,
}: {
  name: string;
  before: string;
  after: string;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(2);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [overlay, setOverlay] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const reset = () => {
    setZoom(1);
    setPos({ x: 0, y: 0 });
  };

  const pane = (children: React.ReactNode, title: string) => (
    <div className="min-w-0 flex-1">
      <p className="mb-2 text-sm text-neutral-500">{title}</p>
      <div
        className="relative aspect-square w-full cursor-grab touch-none select-none overflow-hidden rounded-xl bg-neutral-50 active:cursor-grabbing"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) setPos({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y });
        }}
        onPointerUp={() => (drag.current = null)}
        onWheel={(e) => setZoom((z) => clamp(z * Math.exp(-e.deltaY * 0.002), 1, MAX_ZOOM))}
      >
        {children}
      </div>
    </div>
  );

  // Sizing by width and height (not a CSS scale) keeps the vectors crisp at any zoom.
  const layer = (src: string, extra = "") => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      draggable={false}
      className={`pointer-events-none absolute left-1/2 top-1/2 max-w-none object-contain ${extra}`}
      style={{
        width: `${zoom * 72}%`,
        height: `${zoom * 72}%`,
        transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`,
      }}
    />
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-label={`Inspect ${name}`}
        className="flex max-h-full w-full max-w-4xl flex-col gap-4 overflow-auto rounded-2xl bg-white p-5 shadow-xl"
      >
        <div className="flex items-center justify-between gap-4">
          <p className="min-w-0 truncate text-base font-medium text-neutral-900">{name}</p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-2 py-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
          >
            ✕
          </button>
        </div>

        <div className="flex w-full gap-4">
          {overlay ? (
            <div className="mx-auto w-full max-w-[560px]">
              {pane(
                <>
                  {layer(toDataUri(before), "opacity-50")}
                  {layer(toDataUri(tint(after, "#ff2d55")), "mix-blend-multiply opacity-80")}
                </>,
                "Overlay",
              )}
            </div>
          ) : (
            <>
              {pane(layer(toDataUri(before)), "Before")}
              {pane(layer(toDataUri(after)), "After")}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-neutral-500">
          <label className="flex items-center gap-3">
            Zoom
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="zoom-range w-48"
            />
            <span className="w-12 tabular-nums text-neutral-900">{zoom.toFixed(1)}×</span>
          </label>
          <button
            onClick={reset}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-neutral-900 hover:bg-neutral-100"
          >
            Fit
          </button>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={overlay}
              onChange={(e) => setOverlay(e.target.checked)}
              className="size-4 accent-neutral-900"
            />
            Overlay
          </label>
          <span className="text-neutral-400">
            {overlay
              ? "Dark red: they match. Bright red: only in the outline. Gray: only in the original."
              : "Scroll to zoom, drag to move. Both sides move together."}
          </span>
        </div>
      </div>
    </div>
  );
}
