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
      <div className="relative h-full w-full rounded-[clamp(20px,2.6vw,28px)] [background:linear-gradient(130deg,var(--robot-shell-1)_0%,var(--robot-shell-2)_55%,var(--robot-shell-3)_100%)] [box-shadow:inset_0_1px_0_var(--robot-shell-glint),inset_-10px_-12px_20px_var(--robot-shell-shade),0_14px_28px_var(--robot-shadow)]">
        <div className="absolute inset-[clamp(10px,1.6vw,14px)] flex items-center justify-center gap-[clamp(18px,3.2vw,30px)] rounded-[clamp(16px,2.2vw,22px)] border-[3px] [border-color:var(--robot-screen-border)] [background:radial-gradient(130%_120%_at_28%_20%,var(--robot-screen-highlight)_0%,transparent_50%),linear-gradient(152deg,var(--robot-screen-1)_0%,var(--robot-screen-2)_42%,var(--robot-screen-3)_100%)] [box-shadow:inset_0_1px_0_var(--robot-screen-glint),inset_0_-14px_18px_var(--robot-screen-shade)]">
          <span
            className="block [width:clamp(26px,3.8vw,42px)] aspect-square rounded-full [background:radial-gradient(circle_at_34%_30%,var(--robot-eye-1)_0%,var(--robot-eye-2)_44%,var(--robot-eye-3)_100%)] [box-shadow:inset_-4px_-5px_8px_var(--robot-eye-shadow),0_3px_8px_var(--robot-shadow)] transition-transform duration-50 linear"
            style={eyeStyle}
            aria-hidden="true"
          />
          <span
            className="block [width:clamp(26px,3.8vw,42px)] aspect-square rounded-full [background:radial-gradient(circle_at_34%_30%,var(--robot-eye-1)_0%,var(--robot-eye-2)_44%,var(--robot-eye-3)_100%)] [box-shadow:inset_-4px_-5px_8px_var(--robot-eye-shadow),0_3px_8px_var(--robot-shadow)] transition-transform duration-50 linear"
            style={eyeStyle}
            aria-hidden="true"
          />
        </div>
      </div>
      <span
        className="absolute left-[clamp(-9px,-1.4vw,-13px)] top-1/2 block h-[clamp(44px,6vw,58px)] w-[clamp(14px,2vw,18px)] -translate-y-1/2 rounded-full border-2 [border-color:var(--robot-side-border)] [background:linear-gradient(180deg,var(--robot-side-1),var(--robot-side-2))]"
        aria-hidden="true"
      />
      <span
        className="absolute right-[clamp(-9px,-1.4vw,-13px)] top-1/2 block h-[clamp(44px,6vw,58px)] w-[clamp(14px,2vw,18px)] -translate-y-1/2 rounded-full border-2 [border-color:var(--robot-side-border)] [background:linear-gradient(180deg,var(--robot-side-1),var(--robot-side-2))]"
        aria-hidden="true"
      />
    </div>
  )
}
