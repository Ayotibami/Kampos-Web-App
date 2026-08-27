"use client";

import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ImgHTMLAttributes,
  type VideoHTMLAttributes,
  type MouseEventHandler,
} from "react";

/**
 * Same grey token Avatar already falls back to (see Avatar.tsx) — applied as
 * the element's own background so it shows through while the media is still
 * decoding (instead of a blank/black flash), and swapped in permanently, in
 * place of the element, if the URL never loads after retrying (instead of
 * the browser's broken-image icon). One shared look across avatars, gist
 * photos/videos, and GIF/sticker thumbnails: the grey pulses while there's
 * still a chance it loads, and goes flat/static once it's actually given up.
 */
const MEDIA_BG = "bg-line/60";

// Most real-world load failures are a transient network blip, not a
// genuinely dead URL — same reasoning as the upload retry in cloudinary.ts.
// A couple of quiet retries recovers those without the user ever seeing
// anything broken; only a URL that fails MAX_VIEW_ATTEMPTS times in a row
// settles into the static "actually broken" grey.
const MAX_VIEW_ATTEMPTS = 3;
const VIEW_RETRY_DELAY_MS = 1200;

/** Cache-busting query param so a retried request is an actual new network
 * attempt, not the browser just replaying the same failed one. */
function withRetryParam(url: string, attempt: number): string {
  if (attempt === 0) return url;
  return `${url}${url.includes("?") ? "&" : "?"}_r=${attempt}`;
}

type MediaImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onClick"> & {
  src?: string | null;
  onClick?: MouseEventHandler<HTMLElement>;
};

export function MediaImage({
  src,
  alt = "",
  className = "",
  style,
  onClick,
  onLoad,
  onError,
  ...rest
}: MediaImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Fresh media (a different src) resets straight back to "loading" during
  // render — the documented React pattern for adjusting state on a prop
  // change (see e.g. GistMediaOverlay's own prevIndex) rather than in an
  // effect, which would set state synchronously right after an
  // already-committed render.
  const [prevSrc, setPrevSrc] = useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    setLoaded(false);
    setFailed(false);
    setAttempt(0);
  }

  // A failure still gets its remaining retries — whether it's reported by
  // a real onError event, or discovered already-settled on mount (see
  // below) — so a URL that happens to fail fast doesn't skip the retry
  // budget a slower failure would get.
  const handleFailure = (notify?: () => void) => {
    if (attempt < MAX_VIEW_ATTEMPTS - 1) {
      retryTimer.current = setTimeout(() => setAttempt((a) => a + 1), VIEW_RETRY_DELAY_MS);
    } else {
      setFailed(true);
      notify?.();
    }
  };

  // The <img> is server-rendered, so a URL that settles (success OR
  // failure) fast enough can finish before React hydrates and attaches
  // onLoad/onError — that native event fires with nothing listening yet.
  // Checking the already-settled element right after mount catches that
  // race either way instead of getting stuck pulsing forever.
  useEffect(() => {
    queueMicrotask(() => {
      const img = imgRef.current;
      if (img && img.complete) {
        if (img.naturalWidth === 0) handleFailure();
        else setLoaded(true);
      }
    });
    return () => clearTimeout(retryTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  if (!src || failed) {
    return <div className={`${MEDIA_BG} ${className}`} style={style} onClick={onClick} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={withRetryParam(src, attempt)}
      alt={alt}
      // The grey background only belongs on screen while there's actually
      // something to hide (still loading) — left on unconditionally, it
      // shows straight through as a permanent grey letterbox behind any
      // object-contain usage (the media stays smaller than its box on
      // purpose there, e.g. GistMediaOverlay's fullscreen view) once the
      // real image has already loaded fine.
      className={`${loaded ? "" : `${MEDIA_BG} animate-pulse`} ${className}`}
      style={style}
      onClick={onClick}
      onLoad={(e) => {
        setLoaded(true);
        onLoad?.(e);
      }}
      onError={(e) => handleFailure(() => onError?.(e))}
      {...rest}
    />
  );
}

type MediaVideoProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, "src" | "onClick"> & {
  src?: string | null;
  onClick?: MouseEventHandler<HTMLElement>;
};

export const MediaVideo = forwardRef<HTMLVideoElement, MediaVideoProps>(function MediaVideo(
  { src, className = "", style, onClick, onLoadedData, onError, ...rest },
  forwardedRef,
) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const innerRef = useRef<HTMLVideoElement>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Same render-time reset as MediaImage.
  const [prevSrc, setPrevSrc] = useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    setLoaded(false);
    setFailed(false);
    setAttempt(0);
  }

  // Same retry-respecting failure path as MediaImage.
  const handleFailure = (notify?: () => void) => {
    if (attempt < MAX_VIEW_ATTEMPTS - 1) {
      retryTimer.current = setTimeout(() => setAttempt((a) => a + 1), VIEW_RETRY_DELAY_MS);
    } else {
      setFailed(true);
      notify?.();
    }
  };

  // Same post-mount recheck as MediaImage, via the video's own readyState/
  // error instead of naturalWidth.
  useEffect(() => {
    queueMicrotask(() => {
      const video = innerRef.current;
      if (video) {
        if (video.error) handleFailure();
        else if (video.readyState >= 2) setLoaded(true);
      }
    });
    return () => clearTimeout(retryTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const setRefs = (node: HTMLVideoElement | null) => {
    innerRef.current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };

  if (!src || failed) {
    return <div className={`${MEDIA_BG} ${className}`} style={style} onClick={onClick} />;
  }

  return (
    <video
      ref={setRefs}
      src={withRetryParam(src, attempt)}
      // Same reasoning as MediaImage's own comment above.
      className={`${loaded ? "" : `${MEDIA_BG} animate-pulse`} ${className}`}
      style={style}
      onClick={onClick}
      onLoadedData={(e) => {
        setLoaded(true);
        onLoadedData?.(e);
      }}
      onError={(e) => handleFailure(() => onError?.(e))}
      {...rest}
    />
  );
});
