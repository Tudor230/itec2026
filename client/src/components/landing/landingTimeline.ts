export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

export function lerp(start: number, end: number, t: number) {
  return start + (end - start) * clamp01(t)
}

export function segmentProgress(progress: number, start: number, end: number) {
  if (end <= start) {
    return 0
  }

  return clamp01((progress - start) / (end - start))
}

export function nearestSnapPoint(progress: number, points: readonly number[]) {
  const safeProgress = clamp01(progress)

  return points.reduce((nearest, current) => {
    if (Math.abs(current - safeProgress) < Math.abs(nearest - safeProgress)) {
      return current
    }

    return nearest
  }, points[0] ?? 0)
}

export function easeOutCubic(t: number) {
  const clamped = clamp01(t)
  return 1 - (1 - clamped) ** 3
}

function windowOpacity(
  progress: number,
  fadeInStart: number,
  fadeInEnd: number,
  fadeOutStart: number,
  fadeOutEnd: number,
) {
  const fadeIn = segmentProgress(progress, fadeInStart, fadeInEnd)
  const fadeOut = 1 - segmentProgress(progress, fadeOutStart, fadeOutEnd)
  return clamp01(fadeIn * fadeOut)
}

export interface LandingTimelineView {
  heroOpacity: number
  philosophyOpacity: number
  scopeOpacity: number
  robotX: number
  robotOpacity: number
  robotZoom: number
  heroLift: number
  philosophyLift: number
  scopeLift: number
  philosophyX: number
  scopeX: number
}

export function deriveLandingTimeline(progress: number): LandingTimelineView {
  const clamped = clamp01(progress)
  const heroOpacity = 1 - segmentProgress(clamped, 0.12, 0.3)
  const philosophyOpacity = windowOpacity(clamped, 0.3, 0.38, 0.6, 0.72)
  const scopeOpacity = segmentProgress(clamped, 0.9, 0.98)

  let robotX = 0

  if (clamped < 0.3) {
    robotX = 0
  } else if (clamped < 0.48) {
    robotX = lerp(0, 24, segmentProgress(clamped, 0.3, 0.48))
  } else if (clamped < 0.72) {
    robotX = 22
  } else if (clamped < 0.9) {
    robotX = lerp(22, -24, segmentProgress(clamped, 0.72, 0.9))
  } else {
    robotX = -24
  }

  const robotZoom = 0.94
  const robotOpacity = lerp(0.24, 1, segmentProgress(clamped, 0.12, 0.3))

  const philosophyX = lerp(0, -120, segmentProgress(clamped, 0.3, 0.48))
  const scopeX = lerp(0, 132, segmentProgress(clamped, 0.9, 1))

  return {
    heroOpacity: clamp01(heroOpacity),
    philosophyOpacity,
    scopeOpacity,
    robotX,
    robotOpacity,
    robotZoom,
    heroLift: lerp(0, -18, segmentProgress(clamped, 0.1, 0.3)),
    philosophyLift: lerp(28, 0, segmentProgress(clamped, 0.3, 0.4)),
    scopeLift: lerp(24, 0, segmentProgress(clamped, 0.9, 1)),
    philosophyX,
    scopeX,
  }
}
