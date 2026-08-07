// One-off conversion script: several "SVG" illustrations in
// src/assets/illustrations/ are actually rasterized artwork (multi-layer
// AI-generated art, each layer up to 1024px) wrapped in SVG <pattern>/
// <image> tags with the raster embedded as base64 — not real vector art.
// Because they're imported via SVGR (see illustrations.tsx), that entire
// base64 blob gets inlined directly into the JS bundle, shipped to every
// visitor on every page that touches it, regardless of how small it's
// actually displayed. This renders each one down to a real compressed
// WebP at a sane target resolution (generous retina headroom over its
// actual max on-screen size, not the source's absurd native resolution),
// referenced via next/image instead — properly code-split, cached, and
// lazily loaded like any other image.
import sharp from "sharp";
import path from "node:path";

const DIR = path.resolve(import.meta.dirname, "..", "src", "assets", "illustrations");

const targets = [
  // [svg filename, output filename, target width, target height]
  ["Kappywithphone.svg", "Kappywithphone.webp", 636, 618],
  ["Kappywithfood.svg", "Kappywithfood.webp", 600, 900],
  ["kappywithwire.svg", "Kappywithwire.webp", 500, 750],
  ["kappymagnifyingglass.svg", "Kappymagnifyingglass.webp", 400, 600],
];

for (const [src, out, w, h] of targets) {
  const inPath = path.join(DIR, src);
  const outPath = path.join(DIR, out);
  await sharp(inPath, { density: 300 })
    .resize(w, h, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 82 })
    .toFile(outPath);
  console.log(`${src} -> ${out}`);
}
