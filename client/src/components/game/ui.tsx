/**
 * 游戏通用 UI 原子组件
 * 设计规范见 docs/02-视觉设计提案.md：
 *  - 面板 = 铁灰底 + 细内线 + 金边可选
 *  - 稀有度由边框与光晕区分（R 铜 / SR 银 / SSR 赤金）
 *  - 图标与文字层级固定：eyebrow(小写标) → 主标(display) → 正文(parchment-dim)
 */
import type { ReactNode } from "react";
import { AlertTriangle, ImageOff, Info, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RESOURCE_ICON } from "./GameIcons";

export type Rarity = "R" | "SR" | "SSR";

export const RARITY_STYLE: Record<Rarity, { label: string; border: string; text: string; glow: string; ring: string }> = {
  R: { label: "常民", border: "border-[#B08050]/70", text: "text-[#C9995F]", glow: "", ring: "ring-[#B08050]/40" },
  SR: { label: "精锐", border: "border-[#A9B7C6]/85", text: "text-[#C6D2DE]", glow: "shadow-[inset_0_0_18px_-8px_rgba(169,183,198,0.5)]", ring: "ring-[#A9B7C6]/50" },
  SSR: { label: "英杰", border: "border-[#E0B84C]/95", text: "text-[#E8CE79]", glow: "shadow-[inset_0_0_22px_-8px_rgba(224,184,76,0.55)]", ring: "ring-[#E0B84C]/60" },
};

export const ELEMENT_COLOR: Record<string, string> = {
  physical: "#D6CBB2",
  fire: "#E0763C",
  frost: "#6FA8D8",
  lightning: "#E8CE79",
  holy: "#F2EFD8",
  shadow: "#8A6FC7",
};

export const ELEMENT_NAME: Record<string, string> = {
  physical: "物理",
  fire: "火焰",
  frost: "冰霜",
  lightning: "雷电",
  holy: "神圣",
  shadow: "暗影",
};

export const JOB_NAME: Record<string, string> = {
  warrior: "战士",
  knight: "骑士",
  mage: "法师",
  ranger: "游侠",
  cleric: "牧师",
  assassin: "刺客",
  sage: "贤者",
};

export const JOB_ROLE_TEXT: Record<string, string> = {
  warrior: "前排 · 高攻防的正面输出",
  knight: "前排 · 承伤与保护",
  mage: "后排 · 高爆发法术与群体伤害",
  ranger: "后排 · 单体点杀与命中加成",
  cleric: "后排 · 治疗与净化",
  assassin: "前排 · 高暴击与闪避",
  sage: "后排 · 增益、控制与支援",
};

export const RESOURCE_NAME: Record<string, string> = {
  gold: "金币",
  food: "粮食",
  wood: "木料",
  iron: "铁矿",
  aether: "星辉",
  renown: "声望",
};

export function Panel({ className, children, gold = false, ...rest }: { className?: string; children: ReactNode; gold?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("panel p-4", gold && "panel-gold", className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, action, className }: { eyebrow?: string; title: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="text-caption mb-1">{eyebrow}</div> : null}
        <h2 className="text-display text-lg leading-tight text-[color:var(--parchment)] sm:text-xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function GoldRule({ className }: { className?: string }) {
  return <hr className={cn("rule-gold my-3", className)} />;
}

/** 稀有度徽标 */
export function RarityBadge({ rarity, className }: { rarity: Rarity; className?: string }) {
  const style = RARITY_STYLE[rarity];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[0.68rem] font-semibold tracking-wider",
        style.border,
        style.text,
        "bg-[color:var(--ink-950)]/70",
        className,
      )}
    >
      {rarity}
      <span className="opacity-70">{style.label}</span>
    </span>
  );
}

/** 元素标签 */
export function ElementTag({ element, className }: { element: string; className?: string }) {
  const Icon = RESOURCE_ICON.aether;
  const color = ELEMENT_COLOR[element] ?? "#D6CBB2";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[0.68rem]", className)} style={{ borderColor: `${color}66`, color }}>
      <Icon size={11} />
      {ELEMENT_NAME[element] ?? element}
    </span>
  );
}

/** 资源胶囊 */
export function ResourcePill({ kind, value, suffix, dim = false, className }: { kind: string; value: number | string; suffix?: string; dim?: boolean; className?: string }) {
  const Icon = RESOURCE_ICON[kind as keyof typeof RESOURCE_ICON] ?? RESOURCE_ICON.gold;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border border-[color:var(--ink-500)]/70 bg-[color:var(--ink-950)]/60 px-2 py-1 text-xs",
        dim ? "text-[color:var(--parchment-muted)]" : "text-[color:var(--parchment)]",
        className,
      )}
      title={RESOURCE_NAME[kind] ?? kind}
    >
      <Icon size={13} className={kind === "aether" ? "text-[color:var(--aether-300)]" : "text-[color:var(--gold-500)]"} />
      <span className="text-numeric font-medium">{typeof value === "number" ? value.toLocaleString("zh-CN") : value}</span>
      {suffix ? <span className="text-[0.66rem] text-[color:var(--parchment-muted)]">{suffix}</span> : null}
    </span>
  );
}

/** 进度条（体力 / 经验 / 控制度） */
export function ProgressBar({
  value,
  max,
  tone = "gold",
  height = 8,
  showLabel = false,
  label,
  className,
}: {
  value: number;
  max: number;
  tone?: "gold" | "aether" | "ember" | "verdant";
  height?: number;
  showLabel?: boolean;
  label?: string;
  className?: string;
}) {
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const tones: Record<string, string> = {
    gold: "linear-gradient(90deg,#A9821C,#E8CE79)",
    aether: "linear-gradient(90deg,#2E9BB5,#7FE0F2)",
    ember: "linear-gradient(90deg,#B54A24,#E0763C)",
    verdant: "linear-gradient(90deg,#3F7D62,#57A382)",
  };
  return (
    <div className={className}>
      {showLabel || label ? (
        <div className="mb-1 flex items-center justify-between text-[0.7rem] text-[color:var(--parchment-muted)]">
          <span>{label ?? ""}</span>
          <span className="text-numeric">
            {Math.round(value)} / {max}
          </span>
        </div>
      ) : null}
      <div className="bar-track" style={{ height }}>
        <div className="bar-fill" style={{ width: `${percent}%`, backgroundImage: tones[tone] }} />
      </div>
    </div>
  );
}

/** 属性行（角色详情 / 装备对比通用） */
export function StatRow({ label, value, bonus, suffix }: { label: string; value: number | string; bonus?: number; suffix?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[color:var(--ink-600)]/45 py-1.5 text-sm last:border-0">
      <span className="text-[color:var(--parchment-dim)]">{label}</span>
      <span className="flex items-center gap-2">
        <span className="text-numeric font-medium text-[color:var(--parchment)]">
          {typeof value === "number" ? value.toLocaleString("zh-CN") : value}
          {suffix}
        </span>
        {bonus && bonus !== 0 ? (
          <span className={cn("text-numeric text-xs", bonus > 0 ? "text-[color:var(--verdant)]" : "text-[color:var(--blood)]")}>
            {bonus > 0 ? `+${bonus.toLocaleString("zh-CN")}` : bonus.toLocaleString("zh-CN")}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/** 图片（带失败兜底：纹章首字母牌） */
export function SafeImage({
  src,
  alt,
  className,
  fallbackText,
  rounded = "rounded-sm",
  ratio,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackText?: string;
  rounded?: string;
  ratio?: string;
}) {
  if (!src) {
    return (
      <div className={cn("flex items-center justify-center border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]", rounded, className)} style={{ aspectRatio: ratio }}>
        {fallbackText ? (
          <span className="text-display text-lg text-[color:var(--gold-600)]/70">{fallbackText.slice(0, 1)}</span>
        ) : (
          <ImageOff size={16} className="text-[color:var(--parchment-muted)]" />
        )}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn("object-cover", rounded, className)}
      style={{ aspectRatio: ratio }}
      onError={(event) => {
        const target = event.currentTarget;
        target.style.display = "none";
        const holder = target.nextElementSibling as HTMLElement | null;
        if (holder) holder.style.display = "flex";
      }}
    />
  );
}

export function Avatar({
  src,
  name,
  size = 44,
  rarity,
  className,
}: {
  src?: string | null;
  name: string;
  size?: number;
  rarity?: Rarity;
  className?: string;
}) {
  const style = rarity ? RARITY_STYLE[rarity] : null;
  return (
    <div className={cn("relative shrink-0 overflow-hidden rounded-sm border bg-[color:var(--ink-800)]", style?.border ?? "border-[color:var(--ink-500)]/70", className)} style={{ width: size, height: size }}>
      {src ? (
        <img src={src} alt={name} loading="lazy" decoding="async" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />
      ) : null}
      <span className="absolute inset-0 hidden items-center justify-center text-display text-sm text-[color:var(--gold-600)]/80" style={{ display: src ? "none" : "flex" }}>
        {name.slice(0, 1)}
      </span>
    </div>
  );
}

/* ------------------------- 状态块：加载 / 空 / 错误 ------------------------- */

export function LoadingState({ label = "正在读取…", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-10 text-[color:var(--parchment-muted)]", className)}>
      <Loader2 size={22} className="animate-spin text-[color:var(--gold-500)]" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function SkeletonState({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-14 animate-pulse rounded-sm border border-[color:var(--ink-600)]/40 bg-[color:var(--ink-700)]/50" />
      ))}
    </div>
  );
}

export function EmptyState({ title, hint, action, icon, className }: { title: string; hint?: string; action?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-sm border border-dashed border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/40 px-4 py-10 text-center", className)}>
      <div className="text-[color:var(--gold-600)]/80">{icon ?? <Info size={22} />}</div>
      <div className="text-sm font-medium text-[color:var(--parchment)]">{title}</div>
      {hint ? <div className="max-w-md text-xs leading-relaxed text-[color:var(--parchment-muted)]">{hint}</div> : null}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry, className }: { message?: string; onRetry?: () => void; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-sm border border-[color:var(--blood)]/45 bg-[color:var(--ink-800)]/60 px-4 py-8 text-center", className)}>
      <AlertTriangle size={22} className="text-[color:var(--blood)]" />
      <div className="text-sm text-[color:var(--parchment)]">{message ?? "读取失败，请稍后再试"}</div>
      {onRetry ? (
        <Button size="sm" variant="outline" className="btn-gold border-transparent" onClick={onRetry}>
          <RefreshCw size={14} className="mr-1" />
          重试
        </Button>
      ) : null}
    </div>
  );
}

export function TargetChip({ icon, label, tone = "gold" }: { icon: ReactNode; label: string; tone?: "gold" | "aether" | "ember" }) {
  const tones = {
    gold: "border-[color:var(--gold-600)]/50 text-[color:var(--gold-300)]",
    aether: "border-[color:var(--aether-500)]/50 text-[color:var(--aether-300)]",
    ember: "border-[color:var(--ember-600)]/50 text-[color:var(--ember-400)]",
  } as const;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-sm border bg-[color:var(--ink-950)]/60 px-2 py-1 text-xs", tones[tone])}>
      {icon}
      {label}
    </span>
  );
}

export function Tag({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "gold" | "aether" | "danger" | "good"; className?: string }) {
  const tones = {
    neutral: "border-[color:var(--ink-500)]/70 text-[color:var(--parchment-dim)]",
    gold: "border-[color:var(--gold-600)]/60 text-[color:var(--gold-300)]",
    aether: "border-[color:var(--aether-500)]/60 text-[color:var(--aether-300)]",
    danger: "border-[color:var(--blood)]/60 text-[color:var(--blood)]",
    good: "border-[color:var(--verdant)]/60 text-[color:var(--verdant)]",
  } as const;
  return <span className={cn("inline-flex items-center rounded-sm border bg-[color:var(--ink-950)]/50 px-1.5 py-0.5 text-[0.68rem]", tones[tone], className)}>{children}</span>;
}

/** 内容分级声明（全年龄向，出现在关键页面底部） */
export function AllAgesNote({ className }: { className?: string }) {
  return (
    <p className={cn("text-[0.68rem] leading-relaxed text-[color:var(--parchment-muted)]", className)}>
      内容分级：全年龄向 · 本作不含色情内容、性奴役、色情服装与身体羞辱；角色均为冒险者、骑士、法师、领主、学者等正向身份。
    </p>
  );
}