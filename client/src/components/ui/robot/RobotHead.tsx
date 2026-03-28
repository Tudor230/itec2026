interface RobotHeadProps {
  transitioning: boolean
}

export function RobotHead({ transitioning }: RobotHeadProps) {
  const transitionClassName = transitioning ? 'rl-robot-head--transition' : ''

  return (
    <div className={`rl-robot-head-wrap ${transitionClassName}`.trim()}>
      <div className="rl-robot-head">
        <div className="rl-robot-face">
          <span className="rl-robot-eye rl-robot-eye--left" aria-hidden="true" />
          <span className="rl-robot-eye rl-robot-eye--right" aria-hidden="true" />
        </div>
      </div>
      <span className="rl-robot-ear rl-robot-ear--left" aria-hidden="true" />
      <span className="rl-robot-ear rl-robot-ear--right" aria-hidden="true" />
    </div>
  )
}
