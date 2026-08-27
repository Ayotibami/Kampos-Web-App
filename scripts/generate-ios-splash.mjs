// One-off generator for iOS's apple-touch-startup-image assets — real,
// pixel-rendered full-screen PNGs (brand blue + centered Kappy mark +
// "Kampos" in real Nunito), since iOS gives no other way to get pixel-level
// control over its native launch splash the way the in-page SplashScreen
// component controls the plain-website case. Run once (or whenever the
// design changes): `node scripts/generate-ios-splash.mjs`.
//
// Two things that weren't obvious on the first pass, worth knowing if this
// ever needs touching again:
//  1. icon-512.png has its own (slightly different) blue baked into every
//     pixel, not transparency — compositing it straight onto this script's
//     own background color left a visible seam/box around the mark. Fixed
//     by thresholding the icon's greyscale luminance into a binary alpha
//     mask, then compositing a flat white shape through that mask instead
//     of the original pixels at all.
//  2. sharp's SVG rasterizer (librsvg) does not reliably support embedded
//     base64 @font-face fonts in a <style> block — text rendered that way
//     silently fell back to a generic serif, not Nunito. Fixed by using
//     opentype.js to convert the actual Nunito outline into real SVG path
//     data ahead of time, so the rasterizer only ever draws vector paths,
//     never resolves a font by name at all.
import sharp from "sharp";
import opentype from "opentype.js";
import { readFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BRAND_BLUE = "#165ABF";

const FONT_PATH = path.join(ROOT, "scripts", "assets", "Nunito-ExtraBold.ttf");
const ICON_PATH = path.join(ROOT, "public", "icons", "icon-512.png");
const OUT_DIR = path.join(ROOT, "public", "splash");

const SIZES = [
  { width: 750, height: 1334, name: "iphone-se" }, // SE 2nd/3rd gen, 8, 7, 6s
  { width: 828, height: 1792, name: "iphone-11-xr" },
  { width: 1170, height: 2532, name: "iphone-12-13-14" },
  { width: 1179, height: 2556, name: "iphone-14pro-15-16" },
  { width: 1242, height: 2688, name: "iphone-11pro-max-xsmax" },
  { width: 1290, height: 2796, name: "iphone-pro-max" },
];

/** White Kappy mark on a fully transparent background — see note (1) above. */
async function makeTransparentIcon(targetSize) {
  const alpha = await sharp(ICON_PATH)
    .resize(targetSize, targetSize)
    .greyscale()
    .threshold(140)
    .raw()
    .toBuffer();
  const white = await sharp({
    create: { width: targetSize, height: targetSize, channels: 3, background: "#ffffff" },
  })
    .raw()
    .toBuffer();
  return sharp(white, { raw: { width: targetSize, height: targetSize, channels: 3 } })
    .joinChannel(alpha, { raw: { width: targetSize, height: targetSize, channels: 1 } })
    .png()
    .toBuffer();
}

/** Real Nunito ExtraBold glyph outlines for "Kampos", as an SVG path string
 * centered at (centerX, baselineY) — see note (2) above for why this can't
 * just be an SVG <text> element. */
function wordmarkPathSvg(font, text, fontSizePx, canvasWidth, canvasHeight, baselineY) {
  // Built glyph-by-glyph via charToGlyph, not font.getPath()/stringToGlyphs
  // — those route through opentype.js's Bidi/GSUB text-shaping pipeline,
  // which throws outright on this Nunito file's ccmp table (an
  // unconditional pass, not something the `features` option can skip).
  // Plain "Kampos" needs no ligatures or contextual substitution at all,
  // so a simple char->glyph->advance walk is not just a workaround here,
  // it's genuinely all this text needs.
  const scale = (1 / font.unitsPerEm) * fontSizePx;
  let x = 0;
  const glyphPaths = [];
  for (const ch of text) {
    const glyph = font.charToGlyph(ch);
    glyphPaths.push(glyph.getPath(x, baselineY, fontSizePx));
    x += glyph.advanceWidth * scale;
  }
  const totalWidth = x;
  const offsetX = (canvasWidth - totalWidth) / 2;
  const d = glyphPaths.map((p) => p.toPathData(2)).join(" ");
  return `<svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg"><path d="${d}" fill="#FFFFFF" transform="translate(${offsetX}, 0)" /></svg>`;
}

async function generate(font, { width, height, name }) {
  // Bumped from 0.32/0.072 — these images are dedicated splash assets, not
  // reused as the actual app icon anywhere, so unlike icon-512.png itself
  // there's no shape-mask/safe-zone risk in making the mark genuinely bold
  // here. Checked the numbers stay clear of the wordmark below at every
  // generated size before committing to this.
  const iconSize = Math.round(width * 0.42);
  const iconTop = Math.round(height * 0.42 - iconSize / 2);
  const iconLeft = Math.round((width - iconSize) / 2);
  const iconBuffer = await makeTransparentIcon(iconSize);

  const fontSize = Math.round(width * 0.088);
  const baselineY = Math.round(height * 0.865);
  const textSvg = wordmarkPathSvg(font, "Kampos", fontSize, width, height, baselineY);
  const textBuffer = Buffer.from(textSvg);

  const outPath = path.join(OUT_DIR, `${name}.png`);
  await sharp({
    create: { width, height, channels: 4, background: BRAND_BLUE },
  })
    .composite([
      { input: iconBuffer, top: iconTop, left: iconLeft },
      { input: textBuffer, top: 0, left: 0 },
    ])
    .png()
    .toFile(outPath);

  console.log(`  Generated ${name}.png (${width}x${height})`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  // .buffer alone would risk including bytes beyond this file if Node's
  // Buffer pooling backed it with a larger shared ArrayBuffer — slice to
  // the real byteOffset/byteLength to get exactly this file's bytes.
  const fontFile = readFileSync(FONT_PATH);
  const fontArrayBuffer = fontFile.buffer.slice(fontFile.byteOffset, fontFile.byteOffset + fontFile.byteLength);
  const font = opentype.parse(fontArrayBuffer);
  console.log(`Generating ${SIZES.length} iOS startup images...`);
  for (const size of SIZES) await generate(font, size);
  console.log("Done.");
}

main().catch((err) => {
  console.error("Splash generation failed:", err);
  process.exit(1);
});
