"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { outlineSvg, type SvgWarning } from "unstroke";
import { weldTouchingCaps } from "@/lib/weld";
import { applySize } from "@/lib/resize";

type Item = { id: string; name: string; source: string };

type Result =
  | { ok: true; svg: string; warnings: string[] }
  | { ok: false; message: string };

const toDataUri = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`;

const byteLength = (s: string) => new TextEncoder().encode(s).length;

/** "24 × 24 px" from the root tag's width and height, if it has both. */
const dimensions = (svg: string) => {
  const tag = svg.match(/<svg\b[^>]*>/)?.[0] ?? "";
  const w = tag.match(/\swidth="([\d.]+)(?:px)?"/)?.[1];
  const h = tag.match(/\sheight="([\d.]+)(?:px)?"/)?.[1];
  return w && h ? `${w} × ${h} px` : "";
};

const download = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export function Converter() {
  const [items, setItems] = useState<Item[]>([]);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [dragging, setDragging] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);

  const [fill, setFill] = useState("currentColor");
  const [strokeWidth, setStrokeWidth] = useState("");
  const [size, setSize] = useState("");
  const [includeFills, setIncludeFills] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);

  const addFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const svgs = files.filter(
      (f) => f.type === "image/svg+xml" || f.name.toLowerCase().endsWith(".svg"),
    );
    setSkipped(files.filter((f) => !svgs.includes(f)).map((f) => f.name));
    const loaded = await Promise.all(
      svgs.map(
        async (f): Promise<Item> => ({
          id: String(nextId.current++),
          name: f.name,
          source: await f.text(),
        }),
      ),
    );
    setItems((prev) => [...prev, ...loaded]);
  }, []);

  const options = useMemo(() => {
    const width = parseFloat(strokeWidth);
    return {
      fill: fill.trim() || "currentColor",
      strokeWidth: width > 0 ? width : undefined,
      fills: includeFills,
    };
  }, [fill, strokeWidth, includeFills]);

  // Convert every file whenever the files or options change. The work is
  // synchronous and can be heavy, so yield between files to keep the page alive.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await new Promise((r) => setTimeout(r, 200));
      const next: Record<string, Result> = {};
      for (const item of items) {
        if (cancelled) return;
        const warnings: string[] = [];
        try {
          const svg = outlineSvg(weldTouchingCaps(item.source), {
            ...options,
            onWarning: (w: SvgWarning) => warnings.push(w.message),
          });
          next[item.id] = { ok: true, svg, warnings };
        } catch (e) {
          next[item.id] = {
            ok: false,
            message: e instanceof Error ? e.message : "Could not convert this file",
          };
        }
        setResults((prev) => ({ ...prev, [item.id]: next[item.id] }));
        await new Promise((r) => setTimeout(r));
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [items, options]);

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setResults((prev) => {
      const rest = { ...prev };
      delete rest[id];
      return rest;
    });
  };

  const clearAll = () => {
    setItems([]);
    setResults({});
    setSkipped([]);
  };

  // The export size only changes the width and height attributes, so it is
  // applied here rather than re-running the conversion.
  const exported = useMemo(() => {
    const width = parseFloat(size);
    const out: Record<string, string> = {};
    for (const [id, r] of Object.entries(results)) {
      if (r.ok) out[id] = width > 0 ? applySize(r.svg, width) : r.svg;
    }
    return out;
  }, [results, size]);

  const ready = items.filter((i) => exported[i.id] !== undefined);

  const downloadOne = (item: Item) => {
    const svg = exported[item.id];
    if (svg !== undefined) download(new Blob([svg], { type: "image/svg+xml" }), item.name);
  };

  const downloadAll = async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const used = new Set<string>();
    for (const item of ready) {
      let name = item.name;
      for (let n = 2; used.has(name); n++) {
        name = item.name.replace(/(\.svg)?$/i, `-${n}$1`);
      }
      used.add(name);
      zip.file(name, exported[item.id]);
    }
    download(await zip.generateAsync({ type: "blob" }), "outlined-icons.zip");
  };

  const converting = items.length > 0 && items.some((i) => !results[i.id]);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 pb-32 pt-16">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">
          SVG stroke outliner
        </h1>
        <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-neutral-500">
          Upload icons that use strokes and get back filled outlines: one clean
          path per icon, no overlaps. Everything runs in your browser, so files
          never leave your computer.
        </p>
      </header>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-14 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 ${
          dragging
            ? "border-neutral-900 bg-neutral-100"
            : "border-neutral-300 bg-neutral-50 hover:border-neutral-400 hover:bg-neutral-100/60"
        }`}
      >
        <p className="text-[15px] font-medium text-neutral-900">
          Drop SVG files here
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          or click to choose. You can select many at once.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".svg,image/svg+xml"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {skipped.length > 0 && (
        <p className="mt-3 text-sm text-amber-700">
          Skipped {skipped.length} file{skipped.length > 1 ? "s" : ""} that
          aren&apos;t SVG: {skipped.join(", ")}
        </p>
      )}

      <section className="mt-6 flex flex-wrap items-end gap-x-6 gap-y-4 rounded-xl border border-neutral-200 px-5 py-4 text-sm">
        <label className="flex flex-col gap-1.5">
          <span className="text-neutral-500">Fill color</span>
          <span className="flex items-center gap-2">
            <input
              value={fill}
              onChange={(e) => setFill(e.target.value)}
              spellCheck={false}
              className="w-32 rounded-lg border border-neutral-300 px-2.5 py-1.5 font-mono text-[13px] outline-none focus:border-neutral-900"
            />
            {fill !== "currentColor" && (
              <button
                onClick={() => setFill("currentColor")}
                className="text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
              >
                reset
              </button>
            )}
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-neutral-500">Stroke width</span>
          <input
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(e.target.value)}
            inputMode="decimal"
            placeholder="keep original"
            title="In the icon's own units, e.g. 1.5 on a 24 grid"
            className="w-32 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-[13px] outline-none placeholder:text-neutral-400 focus:border-neutral-900"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-neutral-500">Icon size (px)</span>
          <input
            value={size}
            onChange={(e) => setSize(e.target.value)}
            inputMode="decimal"
            placeholder="keep original"
            title="Width of the exported icon; height follows the aspect ratio"
            className="w-32 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-[13px] outline-none placeholder:text-neutral-400 focus:border-neutral-900"
          />
        </label>

        <label className="flex items-center gap-2 pb-1.5">
          <input
            type="checkbox"
            checked={includeFills}
            onChange={(e) => setIncludeFills(e.target.checked)}
            className="size-4 accent-neutral-900"
          />
          <span className="text-neutral-700">Keep shapes that are already filled</span>
        </label>
      </section>

      {items.length > 0 && (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {items.map((item) => {
            const r = results[item.id];
            return (
              <li
                key={item.id}
                className="rounded-xl border border-neutral-200 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <p
                    className="min-w-0 truncate text-sm font-medium text-neutral-900"
                    title={item.name}
                  >
                    {item.name}
                  </p>
                  <button
                    onClick={() => removeItem(item.id)}
                    aria-label={`Remove ${item.name}`}
                    className="-mr-1 -mt-1 rounded-md px-2 py-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
                  >
                    ✕
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Preview label="Before" src={toDataUri(item.source)} />
                  <Preview
                    label="After"
                    src={exported[item.id] ? toDataUri(exported[item.id]) : undefined}
                    pending={!r}
                  />
                </div>

                {r && !r.ok && (
                  <p className="mt-3 text-sm text-red-600">{r.message}</p>
                )}
                {r?.ok && r.warnings.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-amber-700">
                    {r.warnings.map((w, i) => (
                      <li key={i}>⚠ {w}</li>
                    ))}
                  </ul>
                )}

                <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
                  <span>
                    {formatBytes(byteLength(item.source))}
                    {exported[item.id] !== undefined && (
                      <>
                        {" "}
                        → {formatBytes(byteLength(exported[item.id]))}
                        {dimensions(exported[item.id]) &&
                          ` · ${dimensions(exported[item.id])}`}
                      </>
                    )}
                  </span>
                  <button
                    onClick={() => downloadOne(item)}
                    disabled={!r?.ok}
                    className="rounded-lg border border-neutral-300 px-3 py-1.5 text-[13px] font-medium text-neutral-900 hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    Download
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {items.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <p className="text-sm text-neutral-500">
              {converting
                ? "Converting…"
                : `${ready.length} of ${items.length} converted`}
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={clearAll}
                className="text-sm text-neutral-500 hover:text-neutral-900"
              >
                Clear all
              </button>
              <button
                onClick={downloadAll}
                disabled={ready.length === 0}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40 disabled:hover:bg-neutral-900"
              >
                Download all (.zip)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Preview({
  label,
  src,
  pending,
}: {
  label: string;
  src?: string;
  pending?: boolean;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-neutral-400">{label}</p>
      <div className="flex aspect-square items-center justify-center rounded-lg bg-neutral-50 p-6">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="size-full object-contain" />
        ) : pending ? (
          <span className="text-xs text-neutral-400">…</span>
        ) : null}
      </div>
    </div>
  );
}
