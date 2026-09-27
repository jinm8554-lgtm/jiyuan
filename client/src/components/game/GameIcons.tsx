/**
 * 原创图标集（纯手写 SVG，不引用任何第三方图标库资源）
 * 视觉规则：1.6px 描边、圆角端点、尺寸 24 基准，颜色继承 currentColor
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const base = ({ size = 20, ...props }: IconProps) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

/** 灰隼纹章（主城/品牌标志） */
export function FalconCrest({ size = 24, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })} strokeWidth={1.4}>
      <path d="M12 3.2c1.6 1.5 2.6 3 2.6 4.9 0 1-.2 1.7-.6 2.4 1.9-1.1 4-1.2 6-0.6-1.5 1.1-2.4 2-3 3.2-.5 1-.7 1.9-.7 3 0 1.5.4 3 1.2 4.7-2.4-1.3-4.1-3.1-5.1-5.4-.4-.9-.6-1.9-.6-2.9 0-1.3.4-2.6 1.1-3.8" />
      <path d="M12 3.2c-1.6 1.5-2.6 3-2.6 4.9 0 1 .2 1.7.6 2.4-1.9-1.1-4-1.2-6-0.6 1.5 1.1 2.4 2 3 3.2.5 1 .7 1.9.7 3 0 1.5-.4 3-1.2 4.7 2.4-1.3 4.1-3.1 5.1-5.4.4-.9.6-1.9.6-2.9 0-1.3-.4-2.6-1.1-3.8" />
    </svg>
  );
}

/** 星辉符文 */
export function AetherRune({ size = 20, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })}>
      <path d="M12 2.5 14.2 9l6.3 2.4-6.3 2.4L12 21.5 9.8 13.8 3.5 11.4 9.8 9z" />
      <circle cx="12" cy="11.4" r="1.6" />
    </svg>
  );
}

export function GoldCoin({ size = 20, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })}>
      <ellipse cx="12" cy="12" rx="7.5" ry="6.5" />
      <path d="M9.5 9.5c.7-.7 1.6-1 2.7-1 1.4 0 2.3.6 2.3 1.6 0 1.9-4.9 1-4.9 3.2 0 1 1 1.7 2.6 1.7 1.1 0 2-.3 2.7-1" />
      <path d="M12 7.2v9.6" />
    </svg>
  );
}

export function WheatSheaf({ size = 20, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })}>
      <path d="M12 21V8" />
      <path d="M12 8c0-2 1-3.4 2.8-4.2C14.6 5.8 13.8 7.2 12 8z" />
      <path d="M12 8c0-2-1-3.4-2.8-4.2C9.4 5.8 10.2 7.2 12 8z" />
      <path d="M9.6 13.4c-1.9-.7-2.8-2-2.9-4 1.9.3 3 1.4 3.4 3.2z" />
      <path d="M14.4 13.4c1.9-.7 2.8-2 2.9-4-1.9.3-3 1.4-3.4 3.2z" />
      <path d="M9.2 18.6c-2-.6-3-1.8-3.3-3.9 2 .2 3.2 1.2 3.7 3z" />
      <path d="M14.8 18.6c2-.6 3-1.8 3.3-3.9-2 .2-3.2 1.2-3.7 3z" />
    </svg>
  );
}

export function LogPile({ size = 20, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })}>
      <rect x="3.5" y="14" width="17" height="5" rx="2.4" />
      <circle cx="7" cy="16.5" r="1.1" />
      <circle cx="12" cy="16.5" r="1.1" />
      <circle cx="17" cy="16.5" r="1.1" />
      <path d="M6 11.2 12 6l6 5.2" />
    </svg>
  );
}

export function IronIngot({ size = 20, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })}>
      <path d="M4 17h16l-2-7H6z" />
      <path d="M7.5 10 9 6.5h6L16.5 10" />
      <path d="M9.6 13.4h4.8" />
    </svg>
  );
}

export function ShieldIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })}>
      <path d="M12 3 5.5 5.4v6c0 4 2.7 7.3 6.5 8.6 3.8-1.3 6.5-4.6 6.5-8.6v-6z" />
      <path d="M9.2 12.2 11 14l3.9-4.2" />
    </svg>
  );
}

export function SwordIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })}>
      <path d="M17.5 3.5 20 6l-8.4 8.4-2.5-2.5z" />
      <path d="M9.1 11.9 5.5 15.5" />
      <path d="M5.2 15.2 3.5 20.5 8.8 18.8z" />
      <path d="M14.4 6.6 17.4 9.6" />
    </svg>
  );
}

export function StaffIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })}>
      <path d="M12 21V7.5" />
      <circle cx="12" cy="5" r="2.4" />
      <path d="M12 4v-1.5M9.6 5 8.4 4M14.4 5 15.6 4" />
    </svg>
  );
}

export function BowIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })}>
      <path d="M4 20 20 4" />
      <path d="M4 20c-1-4.6.5-9.8 4.4-13.7C12.3 2.4 17.5 1 20 4" />
      <path d="M17.5 2.5 20 4l-1.4 2.6" />
      <path d="M7 17.6 5.2 19.4" />
    </svg>
  );
}

export function CrossIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })}>
      <path d="M12 3v18" />
      <path d="M7 8h10" />
      <path d="M12 12c-2.4-.6-3.6-2.2-3.6-4.6" />
    </svg>
  );
}

export function DaggerIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })}>
      <path d="M12 3 14 9l-1.4 6H11.4L10 9z" />
      <path d="M9 16.4h6" />
      <path d="M12 16.4V21" />
    </svg>
  );
}

export function CompassIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.8 9.2 13.3 13.3 9.2 14.8 10.7 10.7z" />
    </svg>
  );
}

export function BuildingIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })}>
      <path d="M4 20h16" />
      <path d="M6 20V9l6-4 6 4v11" />
      <path d="M10 20v-5h4v5" />
      <path d="M9 11.5h1.5M13.5 11.5H15" />
    </svg>
  );
}

export function HallIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })}>
      <path d="M3 20h18" />
      <path d="M4.5 20V11L12 4.5 19.5 11v9" />
      <path d="M9 20v-4.5h6V20" />
      <circle cx="12" cy="11" r="1.2" />
    </svg>
  );
}

export function ScrollIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })}>
      <path d="M6.5 4h9.2a2.3 2.3 0 0 1 2.3 2.3V19a1.5 1.5 0 0 0 1.5 1.5H8.8A2.3 2.3 0 0 1 6.5 18.2z" />
      <path d="M6.5 4A1.5 1.5 0 0 0 5 5.5v13" />
      <path d="M9.7 8.5h5.6M9.7 12h5.6M9.7 15.5h3.4" />
    </svg>
  );
}

export function CampIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })}>
      <path d="M4 19h16" />
      <path d="M12 5 19.5 19h-15z" />
      <path d="M12 12.5 15.5 19h-7z" />
    </svg>
  );
}

export function BookIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5" />
    </svg>
  );
}

export function GearIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18" />
    </svg>
  );
}

export function UsersIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })}>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19.5c0-3 2.5-5.2 5.5-5.2s5.5 2.2 5.5 5.2" />
      <path d="M16 6.2c1.7.3 3 1.7 3 3.4 0 1-.4 1.9-1.1 2.5" />
      <path d="M17.6 14.6c1.7.7 2.9 2.3 2.9 4.2" />
    </svg>
  );
}

export function ChestIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })}>
      <rect x="3.5" y="9.5" width="17" height="10" rx="1.8" />
      <path d="M3.5 13.5h17" />
      <path d="M4.8 9.5 7 5.5h10l2.2 4" />
      <path d="M11 12h2v3h-2z" />
    </svg>
  );
}

export function FlameIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })}>
      <path d="M12 3c2.4 3 4.6 5.3 4.6 8.4A4.6 4.6 0 0 1 12 16a4.6 4.6 0 0 1-4.6-4.6C7.4 8.3 9.6 6 12 3z" />
      <path d="M12 21c-2 0-3.6-1.2-3.6-3 0-1.6 1.2-2.6 2.2-3.6.6 1 1.4 1.6 2.4 2 .8.3 1.2.9 1.2 1.6 0 1.8-1.4 3-2.2 3z" />
    </svg>
  );
}

export function SnowIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })}>
      <path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9" />
      <path d="M9.5 4.2 12 6l2.5-1.8M9.5 19.8 12 18l2.5 1.8" />
    </svg>
  );
}

export function BoltIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })}>
      <path d="M13.5 2.5 5.5 13h5l-1 8.5L18 10.5h-5z" />
    </svg>
  );
}

export function SunIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6" />
    </svg>
  );
}

export function MoonIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })}>
      <path d="M20 14.5A8.2 8.2 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" />
    </svg>
  );
}

export function HandIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })}>
      <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M12 11V4.8a1.5 1.5 0 0 1 3 0V11" />
      <path d="M15 11.4V7.2a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.2a6 6 0 0 1-4.6-2.2l-2.3-2.9a1.6 1.6 0 0 1 2.2-2.3L9 15" />
    </svg>
  );
}

export const ELEMENT_ICON = {
  physical: SwordIcon,
  fire: FlameIcon,
  frost: SnowIcon,
  lightning: BoltIcon,
  holy: SunIcon,
  shadow: MoonIcon,
} as const;

export const JOB_ICON = {
  warrior: SwordIcon,
  knight: ShieldIcon,
  mage: StaffIcon,
  ranger: BowIcon,
  cleric: CrossIcon,
  assassin: DaggerIcon,
  sage: BookIcon,
} as const;

export const RESOURCE_ICON = {
  gold: GoldCoin,
  food: WheatSheaf,
  wood: LogPile,
  iron: IronIngot,
  aether: AetherRune,
  renown: FalconCrest,
  stamina: BoltIcon,
} as const;