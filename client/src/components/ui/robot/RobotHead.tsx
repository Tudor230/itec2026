import type { CSSProperties } from 'react'

interface RobotHeadProps {
  transitioning: boolean
  headStyle: CSSProperties
  eyeStyle: CSSProperties
}

export function RobotHead({ transitioning, headStyle, eyeStyle }: RobotHeadProps) {
  return (
    <div
      className={`relative [width:clamp(210px,31vw,320px)] [aspect-ratio:1.64/1] [transform-style:preserve-3d] ${
        transitioning
          ? 'transition-transform duration-700 ease-[cubic-bezier(0.2,0.9,0.24,1)]'
          : 'transition-transform duration-500 ease-[cubic-bezier(0.2,0.9,0.24,1)]'
      }`}
      style={headStyle}
    >
      <div className="relative h-full w-full rounded-[clamp(20px,2.6vw,28px)] [background:linear-gradient(130deg,color-mix(in_oklab,var(--sea-ink)_70%,#020307_30%)_0%,color-mix(in_oklab,var(--sea-ink)_84%,#010102_16%)_55%,#05070c_100%)] [box-shadow:inset_0_1px_0_color-mix(in_oklab,color-mix(in_oklab,#ffffff_72%,var(--lagoon)_28%)_72%,transparent_28%),inset_-10px_-12px_20px_rgba(0,0,0,0.34),0_14px_28px_rgba(0,0,0,0.38)]">
        <div className="absolute inset-[clamp(10px,1.6vw,14px)] flex items-center justify-center gap-[clamp(18px,3.2vw,30px)] rounded-[clamp(16px,2.2vw,22px)] border-[3px] [border-color:color-mix(in_oklab,color-mix(in_oklab,var(--lagoon)_88%,#ffffff_12%)_58%,color-mix(in_oklab,var(--sea-ink)_70%,#020307_30%)_42%)] [background:radial-gradient(130%_120%_at_28%_20%,color-mix(in_oklab,color-mix(in_oklab,var(--lagoon)_88%,#ffffff_12%)_80%,white_20%)_0%,transparent_50%),linear-gradient(152deg,color-mix(in_oklab,color-mix(in_oklab,var(--lagoon)_88%,#ffffff_12%)_65%,color-mix(in_oklab,var(--lagoon)_64%,var(--sea-ink)_36%)_35%)_0%,color-mix(in_oklab,var(--lagoon)_64%,var(--sea-ink)_36%)_42%,color-mix(in_oklab,color-mix(in_oklab,var(--lagoon)_64%,var(--sea-ink)_36%)_42%,black_58%)_100%)] [box-shadow:inset_0_1px_0_color-mix(in_oklab,color-mix(in_oklab,#ffffff_72%,var(--lagoon)_28%)_85%,transparent_15%),inset_0_-14px_18px_rgba(10,11,16,0.3)]">
          <span
            className="block [width:clamp(26px,3.8vw,42px)] aspect-square rounded-full [background:radial-gradient(circle_at_34%_30%,#ffffff_0%,#e5edf2_44%,#a5b0b8_100%)] [box-shadow:inset_-4px_-5px_8px_rgba(16,24,31,0.24),0_3px_8px_rgba(0,0,0,0.3)] transition-transform duration-50 linear"
            style={eyeStyle}
            aria-hidden="true"
          />
          <span
            className="block [width:clamp(26px,3.8vw,42px)] aspect-square rounded-full [background:radial-gradient(circle_at_34%_30%,#ffffff_0%,#e5edf2_44%,#a5b0b8_100%)] [box-shadow:inset_-4px_-5px_8px_rgba(16,24,31,0.24),0_3px_8px_rgba(0,0,0,0.3)] transition-transform duration-50 linear"
            style={eyeStyle}
            aria-hidden="true"
          />
        </div>
      </div>
      <span
        className="absolute left-[clamp(-9px,-1.4vw,-13px)] top-1/2 block h-[clamp(44px,6vw,58px)] w-[clamp(14px,2vw,18px)] -translate-y-1/2 rounded-full border-2 [border-color:color-mix(in_oklab,color-mix(in_oklab,var(--sea-ink)_70%,#020307_30%)_72%,black_28%)] [background:linear-gradient(180deg,#0f131d,#06070b)]"
        aria-hidden="true"
      />
      <span
        className="absolute right-[clamp(-9px,-1.4vw,-13px)] top-1/2 block h-[clamp(44px,6vw,58px)] w-[clamp(14px,2vw,18px)] -translate-y-1/2 rounded-full border-2 [border-color:color-mix(in_oklab,color-mix(in_oklab,var(--sea-ink)_70%,#020307_30%)_72%,black_28%)] [background:linear-gradient(180deg,#0f131d,#06070b)]"
        aria-hidden="true"
      />
    </div>
  )
}
