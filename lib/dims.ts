/**
 * Read an icon's drawing size from its root tag without a full parse.
 * `units` is the width of its coordinate grid (viewBox width, else width),
 * `px` is the size it is drawn at (width attribute, else the grid width).
 */
export function iconDims(svg: string): { units: number; px: number } {
  const tag = svg.match(/<svg\b[^>]*>/)?.[0] ?? "";
  const attr = (name: string) =>
    tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`))?.[1];
  const num = (v?: string) => (v && !v.trim().endsWith("%") ? parseFloat(v) : NaN);

  const vb = attr("viewBox")?.trim().split(/[\s,]+/).map(Number);
  const vbW = vb?.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 ? vb[2] : NaN;
  const w = num(attr("width"));

  const units = vbW > 0 ? vbW : w > 0 ? w : 24;
  const px = w > 0 ? w : units;
  return { units, px };
}
