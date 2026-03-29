import type { CSSProperties } from 'react'

interface RobotBodyProps {
  neckStackStyle: CSSProperties
  neckTopStyle: CSSProperties
  neckMidStyle: CSSProperties
  neckBaseStyle: CSSProperties
}

export function RobotBody({ neckStackStyle, neckTopStyle, neckMidStyle, neckBaseStyle }: RobotBodyProps) {
  return (
    <div className="mt-[clamp(8px,1.8vw,16px)] grid justify-items-center gap-0">
      <div className="grid justify-items-center" style={neckStackStyle} aria-hidden="true">
        <span
          className="block h-[clamp(46px,7vw,64px)] [width:clamp(70px,10vw,96px)] rounded-full [background:linear-gradient(150deg,var(--robot-neck-1)_0%,var(--robot-neck-2)_100%)] [box-shadow:inset_0_1px_0_var(--robot-neck-glint),inset_-4px_-6px_10px_var(--robot-neck-shade)]"
          style={neckTopStyle}
        />
        <span
          className="block h-[clamp(32px,5vw,44px)] [width:clamp(84px,12vw,118px)] rounded-full [background:linear-gradient(150deg,var(--robot-neck-1)_0%,var(--robot-neck-2)_100%)] [box-shadow:inset_0_1px_0_var(--robot-neck-glint),inset_-4px_-6px_10px_var(--robot-neck-shade)]"
          style={neckMidStyle}
        />
        <span
          className="block h-[clamp(34px,5vw,46px)] [width:clamp(30px,4.2vw,44px)] rounded-full [background:linear-gradient(150deg,var(--robot-neck-1)_0%,var(--robot-neck-2)_100%)] [box-shadow:inset_0_1px_0_var(--robot-neck-glint),inset_-4px_-6px_10px_var(--robot-neck-shade)]"
          style={neckBaseStyle}
        />
      </div>
    </div>
  )
}
