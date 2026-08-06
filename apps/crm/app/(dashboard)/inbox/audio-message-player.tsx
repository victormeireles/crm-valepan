"use client";

import { useEffect, useRef, useState } from "react";

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function AudioMessagePlayer({
  messageId,
  src,
  mime,
}: {
  messageId: string;
  src: string;
  mime?: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const pauseOther = (event: Event) => {
      const activeId = (event as CustomEvent<string>).detail;
      if (activeId !== messageId) audioRef.current?.pause();
    };
    window.addEventListener("crm:audio-play", pauseOther);
    return () => window.removeEventListener("crm:audio-play", pauseOther);
  }, [messageId]);

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      window.dispatchEvent(new CustomEvent("crm:audio-play", { detail: messageId }));
      void audio.play().catch(() => setFailed(true));
    } else {
      audio.pause();
    }
  }

  function cycleSpeed() {
    const speeds = [1, 1.5, 2];
    const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  return (
    <div className="w-[min(100%,360px)] rounded-xl border border-current/15 bg-black/[0.035] p-2.5">
      <audio
        ref={audioRef}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onError={() => setFailed(true)}
      >
        <source src={src} type={mime} />
      </audio>

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={togglePlayback}
          disabled={failed}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-current/10 transition hover:bg-current/20 disabled:opacity-45"
          aria-label={playing ? "Pausar áudio" : "Reproduzir áudio"}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
              <path d="M6 5h4v14H6zm8 0h4v14h-4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 fill-current" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            disabled={!duration || failed}
            onChange={(event) => {
              const next = Number(event.target.value);
              setCurrentTime(next);
              if (audioRef.current) audioRef.current.currentTime = next;
            }}
            aria-label="Posição do áudio"
            className="h-1.5 w-full cursor-pointer accent-current disabled:cursor-default"
          />
          <div className="mt-1 flex justify-between text-[10px] tabular-nums opacity-75">
            <span>{formatTime(currentTime)}</span>
            <span>{failed ? "Áudio indisponível" : formatTime(duration)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={cycleSpeed}
          disabled={failed}
          className="min-w-9 rounded-lg px-1.5 py-1 text-[11px] font-semibold hover:bg-current/10 disabled:opacity-45"
          aria-label={`Velocidade ${speed} vezes`}
        >
          {speed}x
        </button>
      </div>
    </div>
  );
}
