import Image from "next/image";
import type { FC, SVGProps } from "react";

// True vector art — genuinely worth importing as inline SVG components
// (SVGR) so it scales crisply and can be styled/animated. Source files
// copied from the mobile app.
import Kamill from "@/assets/illustrations/Kamill.svg";
import Doodles from "@/assets/illustrations/doodles.svg";
import Doodlecard from "@/assets/illustrations/doddlecard.svg";
import Commentmodal from "@/assets/illustrations/commentmodal.svg";
import Commenticon from "@/assets/illustrations/commenticon.svg";
import Opencomment from "@/assets/illustrations/opencomment.svg";
import Cameraicon from "@/assets/illustrations/cameraicon.svg";
import Bad from "@/assets/illustrations/bad.svg";

// NOT real vector art — these were multi-layer AI-generated artwork (each
// layer up to 1024px) wrapped in SVG <pattern>/<image> tags with the raster
// baked in as base64, despite the .svg extension. Imported via SVGR like
// the ones above, that entire base64 blob got inlined straight into the JS
// bundle — 10MB+ combined, shipped to every visitor regardless of the ~1-2
// inches they're actually rendered at. Converted (scripts/convert-illustrations.mjs)
// to real compressed WebP at a sane target resolution and rendered via
// next/image instead: properly code-split, cached, and lazily loaded like
// any other image, at roughly 1/50th the size.
import Kappywithphone from "@/assets/illustrations/Kappywithphone.webp";
import Kappywithfood from "@/assets/illustrations/Kappywithfood.webp";
import Kappywithwire from "@/assets/illustrations/Kappywithwire.webp";
import Kappymagnifyingglass from "@/assets/illustrations/Kappymagnifyingglass.webp";

const VECTOR_ILLUSTRATIONS = {
  Kamill,
  Doodles,
  Doodlecard,
  Commentmodal,
  Commenticon,
  Opencomment,
  Cameraicon,
  Bad,
} satisfies Record<string, FC<SVGProps<SVGSVGElement>>>;

const RASTER_ILLUSTRATIONS = {
  Kappywithphone,
  Kappywithfood,
  Kappywithwire,
  Kappymagnifyingglass,
};

export type IllustrationName = keyof typeof VECTOR_ILLUSTRATIONS | keyof typeof RASTER_ILLUSTRATIONS;

type IllustrationProps = SVGProps<SVGSVGElement> & { name: IllustrationName };

/** Render a brand illustration by name: <Illustration name="Kamill" className="h-64" /> */
export function Illustration({ name, className, ...props }: IllustrationProps) {
  if (name in RASTER_ILLUSTRATIONS) {
    const src = RASTER_ILLUSTRATIONS[name as keyof typeof RASTER_ILLUSTRATIONS];
    // No `fill` — a static import already carries real width/height, so a
    // plain next/image renders like a normal <img> and respects the same
    // Tailwind sizing classes (h-64 w-auto etc.) every call site already
    // passes, no wrapping/positioned-parent changes needed at any of them.
    return <Image src={src} alt="" className={className} />;
  }
  const Svg = VECTOR_ILLUSTRATIONS[name as keyof typeof VECTOR_ILLUSTRATIONS];
  return <Svg className={className} {...props} />;
}
