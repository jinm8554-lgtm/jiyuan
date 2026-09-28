import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WELCOME_RITUAL_COPY, WELCOME_SCREENS } from "@/welcomeScript";

type PrologueReplayProps = {
  playerName: string;
  onClose: () => void;
};

/** 编年史中的纯阅读序章，不读取或改写任何仪式状态。 */
export function PrologueReplay({ playerName, onClose }: PrologueReplayProps) {
  const [screenIndex, setScreenIndex] = useState(0);
  const screen = WELCOME_SCREENS[screenIndex];
  const isLastScreen = screenIndex === WELCOME_SCREENS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-[color:var(--ink-950)]/92 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="序章 · 第零章"
      onKeyDown={event => {
        if (event.key === "Escape") onClose();
      }}
    >
      <section className="relative flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-sm border border-[color:var(--gold-600)]/60 bg-[color:var(--ink-950)] shadow-2xl shadow-black/60 sm:h-auto sm:max-h-[92svh]">
        <button
          type="button"
          className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-sm border border-[color:var(--gold-600)]/60 bg-[color:var(--ink-950)]/90 text-[color:var(--parchment)] hover:border-[color:var(--gold-400)]"
          aria-label="关闭序章"
          onClick={onClose}
        >
          <X size={17} />
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <picture className="block h-32 bg-[color:var(--ink-900)] sm:h-52">
            <source media="(max-width: 639px)" srcSet={`/img/welcome/${screen.illustration}_tall.png`} />
            <img
              src={`/img/welcome/${screen.illustration}_wide.png`}
              alt={screen.title}
              className="h-full w-full object-cover opacity-75"
              onError={event => {
                event.currentTarget.style.display = "none";
              }}
            />
          </picture>

          <div className="ritual-parchment-edge bg-[color:var(--ink-900)] px-5 py-5 sm:px-8">
            <div className="mx-auto max-w-2xl">
              <div className="text-caption mb-2">序章 · 第零章 · {String(screenIndex + 1).padStart(2, "0")}</div>
              <h2 className="text-display text-2xl text-[color:var(--parchment)] sm:text-3xl">{screen.title}</h2>
              <div className="mt-5 space-y-3 text-sm leading-7 text-[color:var(--parchment-dim)] sm:text-base sm:leading-8">
                {screen.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
              </div>
              {isLastScreen ? <p className="mt-7 text-right text-sm text-[color:var(--gold-300)]">—— {playerName}</p> : null}
            </div>
          </div>
        </div>

        <footer className="shrink-0 border-t border-[color:var(--gold-600)]/45 bg-[color:var(--ink-950)] px-5 py-4 sm:px-8">
          <div className="mx-auto flex max-w-2xl justify-end">
            <Button
              className="btn-gold min-w-28 border-transparent text-[color:var(--ink-950)]"
              onClick={() => isLastScreen ? onClose() : setScreenIndex(current => current + 1)}
            >
              {isLastScreen ? "读完" : WELCOME_RITUAL_COPY.continue}
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}
