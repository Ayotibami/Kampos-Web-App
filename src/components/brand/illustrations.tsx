import type { FC, SVGProps } from "react";

// Kappy mascot + supporting art, imported as inline SVG components (SVGR) so they
// scale crisply and can be styled/animated. Source files copied from the mobile app.
import Kappyswag from "@/assets/illustrations/Kappyswag.svg";
import Kappyup from "@/assets/illustrations/Kappyup.svg";
import Kappywithphone from "@/assets/illustrations/Kappywithphone.svg";
import Kappywithfood from "@/assets/illustrations/Kappywithfood.svg";
import Kappymagnifyingglass from "@/assets/illustrations/kappymagnifyingglass.svg";
import Kappywithwire from "@/assets/illustrations/kappywithwire.svg";
import Kamill from "@/assets/illustrations/Kamill.svg";
import Prototype from "@/assets/illustrations/prototype.svg";
import Doodles from "@/assets/illustrations/doodles.svg";
import Doodlecard from "@/assets/illustrations/doddlecard.svg";
import Commentmodal from "@/assets/illustrations/commentmodal.svg";
import Commenticon from "@/assets/illustrations/commenticon.svg";
import Opencomment from "@/assets/illustrations/opencomment.svg";
import Cameraicon from "@/assets/illustrations/cameraicon.svg";
import Bad from "@/assets/illustrations/bad.svg";
import Appleicon from "@/assets/illustrations/Appleicon.svg";
import Googleicon from "@/assets/illustrations/Googleicon.svg";
import Facebookicon from "@/assets/illustrations/Facebookicon.svg";

export const ILLUSTRATIONS = {
  Kappyswag,
  Kappyup,
  Kappywithphone,
  Kappywithfood,
  Kappymagnifyingglass,
  Kappywithwire,
  Kamill,
  Prototype,
  Doodles,
  Doodlecard,
  Commentmodal,
  Commenticon,
  Opencomment,
  Cameraicon,
  Bad,
  Appleicon,
  Googleicon,
  Facebookicon,
} satisfies Record<string, FC<SVGProps<SVGSVGElement>>>;

export type IllustrationName = keyof typeof ILLUSTRATIONS;

type IllustrationProps = SVGProps<SVGSVGElement> & { name: IllustrationName };

/** Render a brand illustration by name: <Illustration name="Kappyswag" className="h-64" /> */
export function Illustration({ name, ...props }: IllustrationProps) {
  const Svg = ILLUSTRATIONS[name];
  return <Svg {...props} />;
}
