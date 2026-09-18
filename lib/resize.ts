/**
 * Set the exported width and height of an SVG. The drawing scales with it
 * (strokes are already outlines, so nothing else changes) and the aspect
 * ratio is kept. Returns the input unchanged if the size can't be worked out.
 */
export function applySize(svg: string, width: number): string {
  if (!(width > 0)) return svg;
  try {
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const root = doc.documentElement;
    if (root.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) {
      return svg;
    }

    let vbW: number;
    let vbH: number;
    const vb = root.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
    if (vb?.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) {
      [vbW, vbH] = [vb[2], vb[3]];
    } else {
      // No viewBox: the old width and height become one, so the drawing can scale.
      vbW = parseFloat(root.getAttribute("width") ?? "");
      vbH = parseFloat(root.getAttribute("height") ?? "");
      if (!(vbW > 0) || !(vbH > 0)) return svg;
      root.setAttribute("viewBox", `0 0 ${vbW} ${vbH}`);
    }

    const round = (v: number) => String(Number(v.toFixed(3)));
    root.setAttribute("width", round(width));
    root.setAttribute("height", round((width * vbH) / vbW));
    return new XMLSerializer().serializeToString(doc);
  } catch {
    return svg;
  }
}
