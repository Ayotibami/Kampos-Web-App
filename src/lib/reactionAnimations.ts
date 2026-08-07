import type { ReactionType } from "@/types";

// Genuine animated emoji (Google's Noto Animated Emoji, same Lottie assets
// Gmail/Android use) — self-hosted, imported directly so they're bundled and
// render as real SVG (crisp at any scale, unlike a rasterized <img>). Shared
// between ReactionButton (the row) and GistCard (the big center-pop burst,
// on both double-tap and a row selection) so both draw from one source.
import likeAnim from "@/assets/lottie/like.json";
import loveAnim from "@/assets/lottie/love.json";
import fireAnim from "@/assets/lottie/fire.json";
import sadAnim from "@/assets/lottie/sad.json";
import laughAnim from "@/assets/lottie/laugh.json";

export const REACTION_ANIMATIONS: Record<ReactionType, object> = {
  LIKE: likeAnim,
  LOVE: loveAnim,
  FIRE: fireAnim,
  SAD: sadAnim,
  LAUGH: laughAnim,
};
