import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import { ArrowRight, CheckCircle2, Compass, LocateFixed, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/game/ui";

export function TutorialGuide() {
  const utils = trpc.useUtils();
  const [location, navigate] = useLocation();
  const onboarding = trpc.meta.onboarding.useQuery();
  const intro = trpc.keep.introStatus.useQuery();
  const complete = trpc.meta.completeTutorialAction.useMutation({ onSuccess: () => utils.meta.onboarding.invalidate() });
  const previousKey = useRef<string | null>(null);
  const [transition, setTransition] = useState<null | {
    completed: { id: string; label: string };
    next: { id: string; label: string; hint: string; href: string };
  }>(null);
  const welcome = onboarding.data?.tutorialVersion === 2 && !onboarding.data.skipped && onboarding.data.currentKey === "welcome_keep" && intro.data?.introCompleted === true && location === "/keep";
  const begin = () => complete.mutate({ action: "dismiss_welcome" }, { onSuccess: () => window.setTimeout(() => document.getElementById("tutorial-building-area")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0) });

  useEffect(() => {
    const data = onboarding.data;
    if (!data || data.skipped || !data.currentKey) {
      previousKey.current = null;
      setTransition(null);
      return;
    }
    const current = data.currentKey;
    const previous = previousKey.current;
    previousKey.current = current;
    if (!previous || previous === current) return;
    const completed = data.steps.find((step) => step.id === previous);
    const next = data.steps.find((step) => step.id === current);
    if (completed && next) setTransition({ completed, next });
  }, [onboarding.data]);

  useEffect(() => {
    if (!transition || transition.next.id === "tutorial_complete") return;
    const onNextPage = transition.next.href === location;
    const shouldAutoNavigate = transition.completed.id === "finish_wall" || transition.completed.id === "form_expedition";
    if (!onNextPage && !shouldAutoNavigate) return;
    const timer = window.setTimeout(() => {
      setTransition(null);
      if (!onNextPage) navigate(transition.next.href);
    }, onNextPage ? 4200 : 4000);
    return () => window.clearTimeout(timer);
  }, [location, navigate, transition]);

  const current = onboarding.data?.nextStep ?? null;
  const needsNavigation = Boolean(
    current
      && !welcome
      && !transition
      && current.key !== "tutorial_complete"
      && current.href !== location,
  );

  return (
    <>
      {welcome ? (
        // 该欢迎层只截获自身按钮，菜单、浏览器返回与键盘导航仍可使用。
        <div className="pointer-events-none fixed inset-x-3 top-20 z-[70] mx-auto max-w-xl sm:top-28" role="dialog" aria-label="灰隼堡，仍然在等人。">
          <Panel gold className="pointer-events-auto border-[color:var(--gold-600)]/60 bg-[color:var(--ink-900)] p-5 shadow-2xl">
            <p className="text-caption">灰隼堡 · 第一日</p>
            <h2 className="text-display mt-1 text-xl text-[color:var(--parchment)]">灰隼堡，仍然在等人。</h2>
            <p className="pt-2 text-sm leading-7 text-[color:var(--parchment-dim)]">你已经接过瓦尔登家族的旗帜。这里没有完整的军队，也没有充足的粮仓，只有一座还没有倒下的城堡。先看看你继承的领地，再决定第一件要修复的事情。</p>
            <div className="mt-4 flex flex-wrap justify-between gap-2">
              <TutorialSkip />
              <Button className="btn-gold border-transparent text-[color:var(--ink-950)]" disabled={complete.isPending} onClick={begin}><Compass size={15} className="mr-1.5" />开始巡视</Button>
            </div>
          </Panel>
        </div>
      ) : null}

      {transition ? (
        <div className="pointer-events-none fixed inset-x-3 top-20 z-[70] mx-auto max-w-lg sm:top-24" role="status" aria-live="polite">
          <Panel gold className="pointer-events-auto border-[color:var(--gold-400)]/80 bg-[color:var(--ink-900)] p-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[color:var(--verdant)]/60 text-[color:var(--verdant)]"><CheckCircle2 size={17} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-caption text-[color:var(--verdant)]">行动完成</p>
                <p className="mt-1 text-sm text-[color:var(--parchment)]">{transition.completed.label}</p>
                <p className="mt-2 text-xs leading-5 text-[color:var(--parchment-muted)]"><span className="text-[color:var(--gold-300)]">下一步：{transition.next.label}</span><br />{transition.next.hint}</p>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              {transition.next.id === "tutorial_complete" ? (
                <Button className="btn-gold border-transparent text-[color:var(--ink-950)]" onClick={() => { setTransition(null); navigate("/keep"); }}>完成巡视</Button>
              ) : transition.next.href !== location ? (
                <Button className="btn-gold border-transparent text-[color:var(--ink-950)]" onClick={() => { setTransition(null); navigate(transition.next.href); }}>立即前往 <ArrowRight size={14} className="ml-1" /></Button>
              ) : (
                <Button variant="outline" className="border-[color:var(--gold-600)]/60 text-[color:var(--gold-300)]" onClick={() => setTransition(null)}>继续</Button>
              )}
            </div>
          </Panel>
        </div>
      ) : null}

      {needsNavigation && current ? (
        <div className="pointer-events-none fixed bottom-20 left-3 z-[60] w-[calc(100vw-1.5rem)] max-w-sm lg:bottom-5 lg:left-5" role="status">
          <Panel gold className="pointer-events-auto border-[color:var(--gold-500)]/75 bg-[color:var(--ink-900)] p-3 shadow-2xl">
            <p className="text-caption">当前新手目标</p>
            <p className="mt-1 text-sm font-medium text-[color:var(--parchment)]">{current.label}</p>
            <p className="mt-1 text-xs leading-5 text-[color:var(--parchment-muted)]">{current.hint}</p>
            <div className="mt-3 flex items-center justify-between gap-2">
              <TutorialSkip />
              <Button size="sm" className="btn-gold border-transparent text-[color:var(--ink-950)]" onClick={() => navigate(current.href)}>前往目标 <ArrowRight size={13} className="ml-1" /></Button>
            </div>
          </Panel>
        </div>
      ) : null}
    </>
  );
}

/** 异步页面也会持续寻找目标；找到后自动滚动并保持醒目的操作高亮。 */
export function TutorialSpotlight({ targetId, title, description, className }: { targetId: string; title: string; description: string; className?: string }) {
  const [found, setFound] = useState(false);
  const targetRef = useRef<HTMLElement | null>(null);

  const locate = useCallback(() => {
    const target = document.getElementById(targetId);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    target.focus({ preventScroll: true });
  }, [targetId]);

  useEffect(() => {
    let scrolled = false;
    const bindTarget = () => {
      const target = document.getElementById(targetId);
      if (targetRef.current !== target) {
        targetRef.current?.classList.remove("tutorial-spotlight");
        targetRef.current?.removeAttribute("data-tutorial-current");
        targetRef.current = target;
        target?.classList.add("tutorial-spotlight");
        target?.setAttribute("data-tutorial-current", "true");
        setFound(Boolean(target));
      }
      if (target && !scrolled) {
        scrolled = true;
        window.setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }), 120);
      }
    };
    bindTarget();
    const observer = new MutationObserver(bindTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      targetRef.current?.classList.remove("tutorial-spotlight");
      targetRef.current?.removeAttribute("data-tutorial-current");
      targetRef.current = null;
    };
  }, [targetId]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="pointer-events-none fixed bottom-20 left-3 z-[65] w-[calc(100vw-1.5rem)] max-w-sm lg:bottom-5 lg:left-5">
      <Panel gold className={cn("pointer-events-auto border-[color:var(--gold-500)]/80 bg-[color:var(--ink-900)] p-3 shadow-2xl", className)} role="status" aria-live="polite">
        <p className="text-caption">新手指引 · {found ? "目标已高亮" : "正在定位"}</p>
        <p className="mt-1 text-sm font-medium text-[color:var(--parchment)]">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-[color:var(--parchment-muted)]">{description}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <TutorialSkip />
          <Button size="sm" variant="outline" className="h-7 border-[color:var(--gold-600)]/60 px-2 text-xs text-[color:var(--gold-300)]" disabled={!found} onClick={locate}><LocateFixed size={12} className="mr-1" />定位操作</Button>
        </div>
      </Panel>
    </div>,
    document.body,
  );
}

export function TutorialSkip({ className }: { className?: string }) {
  const utils = trpc.useUtils();
  const complete = trpc.meta.completeTutorialAction.useMutation({ onSuccess: () => utils.meta.onboarding.invalidate() });
  return <Button size="sm" variant="ghost" className={cn("h-7 px-2 text-[0.66rem] text-[color:var(--parchment-muted)]", className)} disabled={complete.isPending} onClick={() => complete.mutate({ action: "skip_tutorial" })}><SkipForward size={12} className="mr-1" />跳过新手指导</Button>;
}

export function TutorialTarget({ title, hint, href }: { title: string; hint: string; href: string }) {
  return <div className="flex min-w-0 flex-1 items-center gap-3"><div className="min-w-0 flex-1"><p className="text-caption">当前目标</p><p className="truncate text-sm font-medium text-[color:var(--parchment)]">{title}</p><p className="truncate text-xs text-[color:var(--parchment-muted)]">{hint}</p></div><Link href={href}><Button size="sm" className="btn-gold border-transparent text-[color:var(--ink-950)]">前往</Button></Link></div>;
}
