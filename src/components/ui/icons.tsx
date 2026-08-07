/**
 * Single icon surface for the app. Re-exporting from lucide-react here keeps the
 * rest of the codebase decoupled from the icon library (easy to swap later).
 */
export {
  ArrowLeft,
  Search,
  X,
  Camera,
  Check,
  Image as ImageIcon,
  Send,
  MessageCircle,
  Plus,
  Heart,
  Flame,
  Trash2,
  RefreshCw,
  Video,
  SwitchCamera,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  LogOut,
  Sticker,
} from "lucide-react";

// Phosphor, fill-weight — bolder/playfuller than lucide's thin stroke. This
// is the app's one "expressive" icon set: the gist card's pop-out action
// menu (share/quote/report), its footer metrics, its video controls
// (mute/play), AND the top navigation (settings, theme toggle) all draw from
// here now, so nothing in the app reads as a mismatched icon style.
export {
  PaperPlaneTilt as ShareIconFill,
  PaperPlaneRight as SendIconFill,
  Flag as FlagIconFill,
  DotsThreeOutlineVertical as DotsIconFill,
  ChatCircle as CommentIconFill,
  Smiley as ReactionIconFill,
  Eye as ViewIconFill,
  GearSix as SettingsIconFill,
  Sun as SunIconFill,
  Moon as MoonIconFill,
  SpeakerHigh as VolumeIconFill,
  Link as LinkIconFill,
  WhatsappLogo as WhatsappLogoFill,
  XLogo as XLogoFill,
  FacebookLogo as FacebookLogoFill,
  SpeakerX as MuteIconFill,
  Play as PlayIconFill,
  Pause as PauseIconFill,
  ArrowsOut as ExpandIconFill,
  Camera as CameraIconFill,
  Image as ImageIconFill,
  PencilSimple as EditIconFill,
  TrashSimple as DeleteIconFill,
} from "@phosphor-icons/react";
