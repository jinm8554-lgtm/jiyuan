import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Compass, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/game/ui";

export function TutorialGuide() {
  const utils = trpc.useUtils();
  const [location] = useLocation();
  const onboarding = trpc.meta.onboarding.useQuery();
  const intro = trpc.keep.introStatus.useQuery();
  const complete = trpc.meta.completeTutorialAction.useMutation({ onSuccess: () => utils.meta.onboarding.invalidate() });
  const welcome = onboarding.data?.tutorialVersion === 2 && !onboarding.data.skipped && onboarding.data.currentKey === "welcome_keep" && intro.data?.introCompleted === true && location === "/keep";
  const begin = () => complete.mutate({ action: "dismiss_welcome" }, { onSuccess: () => window.setTimeout(() => document.getElementById("tutorial-building-area")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0) });
  if (!welcome) return null;
  // 该欢迎层只截获自身按钮，菜单、浏览器返回与键盘导航仍可使用。
  return <div className="pointer-events-none fixed inset-x-3 top-20 z-50 mx-auto max-w-xl sm:top-28" role="dialog" aria-label="灰隼堡，仍然在等人。"><Panel gold className="pointer-events-auto border-[color:var(--gold-600)]/60 bg-[color:var(--ink-900)] p-5 shadow-2xl"><p className="text-caption">灰隼堡 · 第一日</p><h2 className="text-display mt-1 text-xl text-[color:var(--parchment)]">灰隼堡，仍然在等人。</h2><p className="pt-2 text-sm leading-7 text-[color:var(--parchment-dim)]">你已经接过瓦尔登家族的旗帜。这里没有完整的军队，也没有充足的粮仓，只有一座还没有倒下的城堡。先看看你继承的领地，再决定第一件要修复的事情。</p><div className="mt-4 flex flex-wrap justify-between gap-2"><Button variant="ghost" className="text-[color:var(--parchment-muted)]" disabled={complete.isPending} onClick={begin}>稍后再看</Button><Button className="btn-gold border-transparent text-[color:var(--ink-950)]" disabled={complete.isPending} onClick={begin}><Compass size={15} className="mr-1.5" />开始巡视</Button></div></Panel></div>;
}

/** 目标元素不存在时保留为页面内指引；Escape 只关闭提示，不会写完成状态。 */
export function TutorialSpotlight({ targetId, title, description, className }: { targetId: string; title: string; description: string; className?: string }) {
  const [visible, setVisible] = useState(true);
  const [found, setFound] = useState(false);
  useEffect(() => {
    const target = document.getElementById(targetId);
    setFound(Boolean(target));
    target?.classList.add("tutorial-spotlight");
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setVisible(false); };
    window.addEventListener("keydown", close);
    return () => { target?.classList.remove("tutorial-spotlight"); window.removeEventListener("keydown", close); };
  }, [targetId]);
  if (!visible) return null;
  return <Panel gold className={cn("border-[color:var(--gold-500)]/75 p-3", className)} role="status"><p className="text-caption">新手指引{found ? " · 当前行动" : ""}</p><p className="mt-1 text-sm font-medium text-[color:var(--parchment)]">{title}</p><p className="mt-1 text-xs leading-relaxed text-[color:var(--parchment-muted)]">{description}</p><Button size="sm" variant="ghost" className="mt-2 h-7 px-2 text-xs text-[color:var(--parchment-dim)]" onClick={() => setVisible(false)}>知道了</Button></Panel>;
}

export function TutorialSkip({ className }: { className?: string }) {
  const utils = trpc.useUtils();
  const complete = trpc.meta.completeTutorialAction.useMutation({ onSuccess: () => utils.meta.onboarding.invalidate() });
  return <Button size="sm" variant="ghost" className={cn("h-7 px-2 text-[0.66rem] text-[color:var(--parchment-muted)]", className)} disabled={complete.isPending} onClick={() => complete.mutate({ action: "skip_tutorial" })}><SkipForward size={12} className="mr-1" />跳过新手指导</Button>;
}

export function TutorialTarget({ title, hint, href }: { title: string; hint: string; href: string }) {
  return <div className="flex min-w-0 flex-1 items-center gap-3"><div className="min-w-0 flex-1"><p className="text-caption">当前目标</p><p className="truncate text-sm font-medium text-[color:var(--parchment)]">{title}</p><p className="truncate text-xs text-[color:var(--parchment-muted)]">{hint}</p></div><Link href={href}><Button size="sm" className="btn-gold border-transparent text-[color:var(--ink-950)]">前往</Button></Link></div>;
}
