"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Volume2 } from "lucide-react";

export default function VideoPlayer({
  src,
  poster,
  onRetry,
}: {
  src?: string;
  poster: string;
  onRetry?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    let hlsInstance: { destroy: () => void } | undefined;
    let cancelled = false;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
    } else {
      import("hls.js").then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) {
          setError(true);
          return;
        }
        const hls = new Hls();
        hlsInstance = hls;
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) setError(true);
        });
      });
    }

    return () => {
      cancelled = true;
      hlsInstance?.destroy();
    };
  }, [src]);

  if (!src) {
    return (
      <div className="video-placeholder" style={{ backgroundImage: `linear-gradient(180deg, transparent, rgba(20,25,22,.55)), url("${poster}")` }}>
        <span className="player-play"><Play size={22} fill="currentColor" /></span>
        <span className="placeholder-caption"><Volume2 size={15} /> Nội dung video sẽ xuất hiện tại đây</span>
      </div>
    );
  }

  return (
    <div className="video-frame">
      {error ? <div className="video-error">Không thể phát video hoặc quyền phát đã hết hạn. {onRetry && <button type="button" onClick={onRetry}>Lấy lại quyền phát</button>}</div> : null}
      <video ref={videoRef} controls playsInline poster={poster} className="video-element" />
    </div>
  );
}