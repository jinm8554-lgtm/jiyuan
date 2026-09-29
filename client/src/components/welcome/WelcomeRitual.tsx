import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { fade } from "@/audio/fade";
import { GAME_MUSIC_DEFAULT_VOLUME, useMusicMuted } from "@/audio/musicPreference";
import { publishRitualAudio } from "@/audio/ritualMusic";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { WELCOME_RITUAL_COPY, WELCOME_SCREENS } from "@/welcomeScript";

type WelcomeRitualProps = {
  mode?: "intro" | "replay";
  onActivityChange?: (active: boolean) => void;
  onClose?: () => void;
  playerName?: string;
};

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
}

/** 首次进入主城时命名；编年史通过 replay 模式只读重看同一仪式。 */
export function WelcomeRitual({
  mode = "intro",
  onActivityChange,
  onClose,
  playerName = "领主",
}: WelcomeRitualProps) {
  const isReplay = mode === "replay";
  const utils = trpc.useUtils();
  const intro = trpc.keep.introStatus.useQuery(undefined, { enabled: !isReplay, retry: false });
  const completeIntro = trpc.keep.completeIntro.useMutation();
  const [screenIndex, setScreenIndex] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [closing, setClosing] = useState(false);
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState<string>(
    WELCOME_RITUAL_COPY.familyNameDefault
  );
  const [fallbackLineVisible, setFallbackLineVisible] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const welcomeAudioRef = useRef<HTMLAudioElement>(null);
  const timers = useRef<number[]>([]);
  const fadeController = useRef<AbortController | null>(null);
  const reducedMotion = useReducedMotion();
  const [muted] = useMusicMuted();

  const visible =
    isReplay ||
    (!dismissed &&
      !intro.isLoading &&
      !intro.isError &&
      intro.data?.introCompleted !== true);
  const screen = WELCOME_SCREENS[screenIndex];
  const isNamingScreen = !isReplay && screen.id === "registry";
  const isLastScreen = screenIndex === WELCOME_SCREENS.length - 1;

  const schedule = (callback: () => void, duration: number) => {
    const timer = window.setTimeout(callback, duration);
    timers.current.push(timer);
  };

  useEffect(() => {
    if (isReplay) return;
    onActivityChange?.(visible);
    return () => onActivityChange?.(false);
  }, [isReplay, onActivityChange, visible]);

  useEffect(() => {
    if (!visible || isReplay) return;
    const audio = welcomeAudioRef.current;
    const playWelcomeMusic = () => {
      if (!audio || muted) return;
      audio.muted = false;
      audio.volume = GAME_MUSIC_DEFAULT_VOLUME;
      void audio.play().catch(() => undefined);
    };

    publishRitualAudio({ active: true });
    playWelcomeMusic();
    window.addEventListener("click", playWelcomeMusic);
    window.addEventListener("keydown", playWelcomeMusic);
    return () => {
      window.removeEventListener("click", playWelcomeMusic);
      window.removeEventListener("keydown", playWelcomeMusic);
      audio?.pause();
    };
  }, [isReplay, muted, visible]);

  useEffect(() => {
    return () => {
      timers.current.forEach(timer => window.clearTimeout(timer));
      fadeController.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (visible && isNamingScreen && !closing) inputRef.current?.focus();
  }, [closing, isNamingScreen, visible]);

  const advance = () => {
    if (transitioning || isNamingScreen) return;
    if (isReplay && isLastScreen) {
      onClose?.();
      return;
    }
    if (reducedMotion) {
      setScreenIndex(current => current + 1);
      return;
    }

    setTransitioning(true);
    schedule(() => {
      setScreenIndex(current => current + 1);
      setTransitioning(false);
    }, 200);
  };

  const finish = () => {
    if (closing) return;
    setClosing(true);
    schedule(
      async () => {
        onActivityChange?.(false);
        publishRitualAudio({ active: false, handoff: true });
        const audio = welcomeAudioRef.current;
        if (audio) {
          const controller = new AbortController();
          fadeController.current = controller;
          await fade(audio, 0, 1500, controller.signal);
          if (controller.signal.aborted) return;
          audio.pause();
        }
        setDismissed(true);
        void utils.keep.introStatus.invalidate();
      },
      reducedMotion ? 0 : 600
    );
  };

  const submitName = () => {
    if (completeIntro.isPending || closing) return;
    setSubmitError("");
    setFallbackLineVisible(false);
    completeIntro.mutate(
      { givenName: givenName.trim(), familyName: familyName.trim() },
      {
        onSuccess: result => {
          if (result.usedFallbackName) {
            setFallbackLineVisible(true);
            schedule(finish, reducedMotion ? 0 : 900);
            return;
          }
          finish();
        },
        onError: () => setSubmitError(WELCOME_RITUAL_COPY.retryMessage),
      }
    );
  };

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[60] grid place-items-center p-3 sm:p-6 ${isReplay ? "bg-[color:var(--ink-950)]/92" : `bg-[color:var(--ink-950)]/72 backdrop-blur-[12px] transition-opacity duration-[600ms] motion-reduce:backdrop-blur-none motion-reduce:transition-none ${closing ? "pointer-events-none opacity-0" : "opacity-100"}`}`}
      role="dialog"
      aria-modal="true"
      aria-label={isReplay ? "序章 · 第零章" : WELCOME_RITUAL_COPY.dialogLabel}
      onKeyDownCapture={event => {
        if (event.key !== "Escape") return;
        if (isReplay) onClose?.();
        else event.preventDefault();
      }}
    >
      {!isReplay ? (
        <audio ref={welcomeAudioRef} preload="metadata">
          <source src="/audio/welcome_ritual.mp3" type="audio/mpeg" />
        </audio>
      ) : null}
      <section className="relative flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-sm border border-[color:var(--gold-600)]/60 bg-[color:var(--ink-950)] shadow-2xl shadow-black/60 sm:h-auto sm:max-h-[92svh]">
        {isReplay ? (
          <button
            type="button"
            className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-sm border border-[color:var(--gold-600)]/60 bg-[color:var(--ink-950)]/90 text-[color:var(--parchment)] hover:border-[color:var(--gold-400)]"
            aria-label="关闭序章"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        ) : null}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 z-10 border-y border-[color:var(--gold-600)]/45"
            style={{
              maskImage:
                "linear-gradient(to bottom, transparent, black 7%, black 93%, transparent)",
              WebkitMaskImage:
                "linear-gradient(to bottom, transparent, black 7%, black 93%, transparent)",
            }}
          />
          <picture
            key={screen.illustration}
            className="block h-32 bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--gold-900)_44%,transparent),transparent_66%),var(--ink-900)] sm:h-52"
          >
            <source
              media="(max-width: 639px)"
              srcSet={`/img/welcome/${screen.illustration}_tall.png`}
            />
            <img
              src={`/img/welcome/${screen.illustration}_wide.png`}
              alt={screen.title}
              className="h-full w-full object-cover opacity-75"
              onError={event => {
                event.currentTarget.style.display = "none";
              }}
            />
          </picture>

          <div className="ritual-parchment-edge min-h-0 max-h-[calc(100svh-15rem)] overflow-y-auto bg-[color:var(--ink-900)] px-5 py-5 sm:max-h-[48vh] sm:px-8">
            <div
              className={`mx-auto max-w-2xl transition-opacity duration-200 motion-reduce:transition-none ${transitioning ? "opacity-0" : "opacity-100"}`}
            >
              <div className="text-caption mb-2">
                {isReplay ? `序章 · 第零章 · ${String(screenIndex + 1).padStart(2, "0")}` : String(screenIndex + 1).padStart(2, "0")}
              </div>
              <h1 className="text-display text-2xl text-[color:var(--parchment)] sm:text-3xl">
                {screen.title}
              </h1>
              <div className="mt-5 space-y-3 text-sm leading-7 text-[color:var(--parchment-dim)] sm:text-base sm:leading-8">
                {screen.paragraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>

              {isNamingScreen ? (
                <div className="mt-6 space-y-4 border-t border-[color:var(--gold-600)]/40 pt-5">
                  <label className="grid gap-1.5 text-sm text-[color:var(--parchment-dim)]">
                    <span>{WELCOME_RITUAL_COPY.givenNameLabel}</span>
                    <input
                      ref={inputRef}
                      value={givenName}
                      maxLength={12}
                      onChange={event => setGivenName(event.target.value)}
                      className="h-11 rounded-sm border border-[color:var(--ink-500)] bg-[color:var(--ink-950)]/70 px-3 text-base text-[color:var(--parchment)] outline-none transition focus:border-[color:var(--gold-400)] focus:ring-2 focus:ring-[color:var(--gold-600)]/30"
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm text-[color:var(--parchment-dim)]">
                    <span>{WELCOME_RITUAL_COPY.familyNameLabel}</span>
                    <input
                      value={familyName}
                      maxLength={12}
                      onChange={event => setFamilyName(event.target.value)}
                      className="h-11 rounded-sm border border-[color:var(--ink-500)] bg-[color:var(--ink-950)]/70 px-3 text-base text-[color:var(--parchment)] outline-none transition focus:border-[color:var(--gold-400)] focus:ring-2 focus:ring-[color:var(--gold-600)]/30"
                    />
                  </label>
                  {fallbackLineVisible ? (
                    <p className="text-sm text-[color:var(--gold-300)]">
                      {WELCOME_RITUAL_COPY.fallbackLine}
                    </p>
                  ) : null}
                  {submitError ? (
                    <p className="text-sm text-[color:var(--blood)]">
                      {submitError}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {isReplay && isLastScreen ? (
                <p className="mt-7 text-right text-sm text-[color:var(--gold-300)]">—— {playerName}</p>
              ) : null}
            </div>
          </div>
        </div>

        <footer className="shrink-0 border-t border-[color:var(--gold-600)]/45 bg-[color:var(--ink-950)] px-5 py-4 sm:px-8">
          <div className="mx-auto flex max-w-2xl justify-end">
            {isNamingScreen ? (
              <Button
                className="btn-gold min-w-28 border-transparent text-[color:var(--ink-950)]"
                disabled={completeIntro.isPending || closing}
                onClick={submitName}
              >
                {completeIntro.isPending
                  ? WELCOME_RITUAL_COPY.submitting
                  : WELCOME_RITUAL_COPY.submit}
              </Button>
            ) : (
              <Button
                className="btn-gold min-w-28 border-transparent text-[color:var(--ink-950)]"
                disabled={transitioning}
                onClick={advance}
              >
                {isReplay && isLastScreen ? "读完" : WELCOME_RITUAL_COPY.continue}
              </Button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}
