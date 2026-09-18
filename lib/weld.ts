import { parsePathData, type Segment } from "unstroke";

/**
 * Some icons draw a shape as several open strokes whose flat ends meet, e.g. a
 * dot made of two half circles. unstroke flattens curves into short chords, so
 * on a tiny curve the flat end of each stroke ends up tilted a few degrees and
 * the two ends leave a thin wedge-shaped gap where they meet.
 *
 * Before converting we find open strokes whose ends coincide and replace each
 * such end with a short straight stub that follows the true end tangent and
 * pokes a hair past the end. The stubs make the ends exactly square and make
 * them overlap, so the union merges them. The change is about 1/8000 of the
 * icon size, far below anything visible.
 */

type Pt = [number, number];
type Sub = { segs: Segment[]; closed: boolean };

const STUB = 1 / 8000; // stub length and overshoot, as a fraction of icon size
const TOUCH = 1 / 20000; // ends closer than this (fraction of icon size) count as touching

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lerp = (a: Pt, b: Pt, t: number): Pt => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];
const unit = (from: Pt, to: Pt): Pt | null => {
  const d = dist(from, to);
  return d < 1e-9 ? null : [(to[0] - from[0]) / d, (to[1] - from[1]) / d];
};
const pt = (s: Segment): Pt => [(s as { x: number }).x, (s as { y: number }).y];

function splitCubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number) {
  const a = lerp(p0, p1, t);
  const b = lerp(p1, p2, t);
  const c = lerp(p2, p3, t);
  const d = lerp(a, b, t);
  const e = lerp(b, c, t);
  const f = lerp(d, e, t);
  return { left: [p0, a, d, f], right: [f, e, c, p3] } as const;
}

/** Smallest t-step (halving from 0.5) that puts the split point within `len` of `from`. */
function findStep(at: (s: number) => Pt, from: Pt, len: number): number {
  let s = 0.5;
  for (let i = 0; i < 40 && dist(at(s), from) > len; i++) s /= 2;
  return s;
}

function splitSubpaths(segs: Segment[]): Sub[] {
  const subs: Sub[] = [];
  let cur: Sub | null = null;
  let start: Pt = [0, 0];
  let last: Pt = [0, 0];
  for (const seg of segs) {
    if (seg.type === "M") {
      cur = { segs: [seg], closed: false };
      subs.push(cur);
      start = last = pt(seg);
    } else {
      if (!cur || cur.closed) {
        cur = { segs: [{ type: "M", x: start[0], y: start[1] }], closed: false };
        subs.push(cur);
      }
      cur.segs.push(seg);
      if (seg.type === "Z") {
        cur.closed = true;
        last = start;
      } else {
        last = pt(seg);
      }
    }
  }
  return subs;
}

const n = (v: number) => String(Number(v.toFixed(6)));

function toPathData(subs: Sub[]): string {
  return subs
    .flatMap((s) => s.segs)
    .map((s) => {
      switch (s.type) {
        case "M":
        case "L":
          return `${s.type}${n(s.x)} ${n(s.y)}`;
        case "C":
          return `C${n(s.x1)} ${n(s.y1)} ${n(s.x2)} ${n(s.y2)} ${n(s.x)} ${n(s.y)}`;
        case "Z":
          return "Z";
      }
    })
    .join("");
}

const isOpen = (s: Sub) => !s.closed && s.segs.length >= 2;

function startTangent(s: Sub): Pt | null {
  const p0 = pt(s.segs[0]);
  const first = s.segs[1];
  if (first.type === "L") return unit(p0, pt(first));
  if (first.type !== "C") return null;
  return (
    unit(p0, [first.x1, first.y1]) ??
    unit(p0, [first.x2, first.y2]) ??
    unit(p0, pt(first))
  );
}

function endTangent(s: Sub): Pt | null {
  const last = s.segs[s.segs.length - 1];
  const prev = pt(s.segs[s.segs.length - 2]);
  if (last.type === "L") return unit(prev, pt(last));
  if (last.type !== "C") return null;
  const end = pt(last);
  return (
    unit([last.x2, last.y2], end) ??
    unit([last.x1, last.y1], end) ??
    unit(prev, end)
  );
}

function extendEnd(s: Sub, tan: Pt, stub: number) {
  const i = s.segs.length - 1;
  const last = s.segs[i];
  if (last.type === "L") {
    s.segs[i] = {
      type: "L",
      x: last.x + tan[0] * stub,
      y: last.y + tan[1] * stub,
    };
  } else if (last.type === "C") {
    const p0 = pt(s.segs[i - 1]);
    const p1: Pt = [last.x1, last.y1];
    const p2: Pt = [last.x2, last.y2];
    const p3 = pt(last);
    const step = findStep((k) => splitCubic(p0, p1, p2, p3, 1 - k).left[3], p3, stub);
    const { left } = splitCubic(p0, p1, p2, p3, 1 - step);
    const q = left[3];
    s.segs[i] = {
      type: "C",
      x1: left[1][0],
      y1: left[1][1],
      x2: left[2][0],
      y2: left[2][1],
      x: q[0],
      y: q[1],
    };
    const reach = dist(q, p3) + stub;
    s.segs.push({ type: "L", x: q[0] + tan[0] * reach, y: q[1] + tan[1] * reach });
  }
}

function extendStart(s: Sub, tan: Pt, stub: number) {
  const p0 = pt(s.segs[0]);
  const first = s.segs[1];
  if (first.type === "L") {
    s.segs[0] = { type: "M", x: p0[0] - tan[0] * stub, y: p0[1] - tan[1] * stub };
  } else if (first.type === "C") {
    const p1: Pt = [first.x1, first.y1];
    const p2: Pt = [first.x2, first.y2];
    const p3 = pt(first);
    const step = findStep((k) => splitCubic(p0, p1, p2, p3, k).left[3], p0, stub);
    const { right } = splitCubic(p0, p1, p2, p3, step);
    const q = right[0];
    const reach = dist(p0, q) + stub;
    s.segs.splice(
      0,
      2,
      { type: "M", x: q[0] - tan[0] * reach, y: q[1] - tan[1] * reach },
      { type: "L", x: q[0], y: q[1] },
      {
        type: "C",
        x1: right[1][0],
        y1: right[1][1],
        x2: right[2][0],
        y2: right[2][1],
        x: right[3][0],
        y: right[3][1],
      },
    );
  }
}

/**
 * Take the path data of sibling paths that share a coordinate space and fix any
 * open strokes whose ends meet. Returns the new path data for each input, or
 * null when nothing needed changing.
 */
export function weldPathData(ds: string[], size: number): string[] | null {
  const parsed: Sub[][] = [];
  try {
    for (const d of ds) parsed.push(splitSubpaths(parsePathData(d)));
  } catch {
    return null;
  }

  type End = { path: number; sub: number; which: "start" | "end"; at: Pt; tan: Pt };
  const ends: End[] = [];
  parsed.forEach((subs, path) =>
    subs.forEach((s, sub) => {
      if (!isOpen(s)) return;
      const a = startTangent(s);
      const b = endTangent(s);
      if (a) ends.push({ path, sub, which: "start", at: pt(s.segs[0]), tan: a });
      if (b) ends.push({ path, sub, which: "end", at: pt(s.segs[s.segs.length - 1]), tan: b });
    }),
  );

  const threshold = size * TOUCH;
  const matched = ends.filter((e) =>
    ends.some((o) => o !== e && dist(o.at, e.at) <= threshold),
  );
  if (matched.length === 0) return null;

  const stub = size * STUB;
  const changed = new Set<number>();
  // Ends first, then starts: extending an end never moves a subpath's start.
  for (const which of ["end", "start"] as const) {
    for (const e of matched.filter((m) => m.which === which)) {
      const s = parsed[e.path][e.sub];
      (which === "end" ? extendEnd : extendStart)(s, e.tan, stub);
      changed.add(e.path);
    }
  }
  return ds.map((d, i) => (changed.has(i) ? toPathData(parsed[i]) : d));
}

const NOT_DRAWN = new Set(["defs", "clipPath", "mask", "pattern", "marker", "symbol"]);

function hasStroke(el: Element): boolean {
  for (let e: Element | null = el; e; e = e.parentElement) {
    const style = e.getAttribute("style")?.match(/(?:^|;)\s*stroke\s*:\s*([^;]+)/);
    const value = (style?.[1] ?? e.getAttribute("stroke"))?.trim();
    if (value) return value !== "none";
  }
  return false;
}

function iconSize(root: Element): number {
  const vb = root.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (vb?.length === 4 && vb.every(Number.isFinite)) return Math.max(vb[2], vb[3]);
  const w = parseFloat(root.getAttribute("width") ?? "");
  const h = parseFloat(root.getAttribute("height") ?? "");
  return Math.max(w || 0, h || 0) || 24;
}

/** Returns the SVG with touching stroke ends welded, or the input unchanged. */
export function weldTouchingCaps(svg: string): string {
  try {
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const root = doc.documentElement;
    if (root.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) {
      return svg;
    }
    const size = iconSize(root);

    // Ends can only touch inside one coordinate space: same parent, same transform.
    const groups = new Map<Element, Map<string, Element[]>>();
    for (const path of Array.from(root.querySelectorAll("path[d]"))) {
      let hidden = false;
      for (let e = path.parentElement; e; e = e.parentElement) {
        if (NOT_DRAWN.has(e.localName)) hidden = true;
      }
      if (hidden || !hasStroke(path) || !path.parentElement) continue;
      const byTransform = groups.get(path.parentElement) ?? new Map();
      const key = path.getAttribute("transform") ?? "";
      byTransform.set(key, [...(byTransform.get(key) ?? []), path]);
      groups.set(path.parentElement, byTransform);
    }

    let changed = false;
    for (const byTransform of groups.values()) {
      for (const paths of byTransform.values()) {
        const next = weldPathData(paths.map((p) => p.getAttribute("d") ?? ""), size);
        if (!next) continue;
        paths.forEach((p, i) => p.setAttribute("d", next[i]));
        changed = true;
      }
    }
    return changed ? new XMLSerializer().serializeToString(doc) : svg;
  } catch {
    return svg;
  }
}
