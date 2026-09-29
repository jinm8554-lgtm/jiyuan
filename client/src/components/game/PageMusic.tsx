import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { fade } from "@/audio/fade";
import { useMusicMuted } from "@/audio/musicPreference";
import { RITUAL_AUDIO_EVENT, type RitualAudioDetail } from "@/audio/ritualMusic";

type PageMusicProps = {
  src: string;
  areaName: string;
  volume?: number;
};

/** 页面环境音乐；所有区域共用同一个静音偏好，并在浏览器缓存中保留。 */
export function PageMusic({ src, areaName, volume = 0.25 }: PageMusicProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const pausedForRitual = useRef(false);
  const [muted, setMuted] = useMusicMuted();
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const fadeController = new AbortController();

    const removeGestureRetries = () => {
      window.removeEventListener("pointerdown", retryAfterUserGesture);
      window.removeEventListener("keydown", retryAfterUserGesture);
    };
    const start = (fadeIn = false) => {
      if (pausedForRitual.current) return;
      audio.muted = false;
      audio.volume = fadeIn ? 0 : volume;
      void audio.play()
        .then(() => {
          setIsPlaying(true);
          removeGestureRetries();
          if (fadeIn) void fade(audio, volume, 1500, fadeController.signal);
        })
        .catch(() => {
          setIsPlaying(false);
          window.addEventListener("pointerdown", retryAfterUserGesture, { once: true });
          window.addEventListener("keydown", retryAfterUserGesture, { once: true });
        });
    };
    function retryAfterUserGesture() {
      start();
    }
    const handleRitualAudio = (event: Event) => {
      const detail = (event as CustomEvent<RitualAudioDetail>).detail;
      if (detail.active) {
        pausedForRitual.current = true;
        removeGestureRetries();
        audio.pause();
        setIsPlaying(false);
        return;
      }

      pausedForRitual.current = false;
      if (detail.handoff && !muted) start(true);
    };
    window.addEventListener(RITUAL_AUDIO_EVENT, handleRitualAudio);

    if (muted) {
      removeGestureRetries();
      audio.pause();
      setIsPlaying(false);
    } else {
      start();
    }

    return () => {
      fadeController.abort();
      removeGestureRetries();
      window.removeEventListener(RITUAL_AUDIO_EVENT, handleRitualAudio);
      audio.pause();
      setIsPlaying(false);
    };
  }, [muted, src, volume]);

  const toggleMuted = () => {
    setMuted(!muted);
  };

  const buttonLabel = muted
    ? "开启全局音乐"
    : isPlaying
      ? `静音全局音乐（当前：${areaName}）`
      : `全局音乐已开启，首次交互后自动播放`;

  return (
    <>
      <audio ref={audioRef} autoPlay loop preload="metadata">
        <source src={src} type="audio/mpeg" />
      </audio>
      <button
        type="button"
        className="fixed bottom-20 right-4 z-40 grid h-10 w-10 place-items-center rounded-full border border-[color:var(--gold-600)]/70 bg-[color:var(--ink-950)]/85 text-[color:var(--gold-400)] shadow-lg backdrop-blur transition hover:scale-105 hover:border-[color:var(--gold-400)] hover:text-[color:var(--gold-300)] lg:bottom-5"
        aria-label={buttonLabel}
        aria-pressed={!muted}
        title={buttonLabel}
        onClick={toggleMuted}
      >
        {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
      </button>
    </>
  );
}
