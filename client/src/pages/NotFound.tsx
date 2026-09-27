/**
 * 404 页面
 * 视觉规则：与游戏内页统一（暗色羊皮纸 + 金色描边），不使用模板默认的浅色卡片，
 * 否则玩家从游戏内跳错时会看到完全不同的界面语言。
 */
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/game/ui";
import { CompassIcon } from "@/components/game/GameIcons";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-grain px-4">
      <Panel className="w-full max-w-lg text-center">
        <div className="flex justify-center mb-5">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-full border border-gold-500/40 bg-gold-500/10 text-gold-300">
            <CompassIcon size={30} />
          </span>
        </div>

        <p className="text-caption tracking-[0.3em] text-ink-400">AETHERFALL CHRONICLE</p>
        <h1 className="mt-2 font-display text-4xl text-parchment-200">迷途的岔路</h1>
        <p className="mt-1 text-title text-parchment-100">这条路上没有留下任何痕迹。</p>

        <div className="mt-6 space-y-2 text-body text-ink-300">
          <p>你要找的页面不存在，或者已经被蚀影抹去了记录。</p>
          <p className="text-caption text-ink-400">若要继续远征，请返回领地或世界地图。</p>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button className="btn-gold border-transparent text-[color:var(--ink-950)]" onClick={() => setLocation("/keep")}>
            返回我的领地
          </Button>
          <Button variant="outline" onClick={() => setLocation("/")}>
            回到首页
          </Button>
        </div>
      </Panel>
    </div>
  );
}