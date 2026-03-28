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

export interface LandingTimelineView {
  heroOpacity: number
  infoOpacity: number
  authOpacity: number
  robotX: number
  robotOpacity: number
}

export function deriveLandingTimeline(progress: number): LandingTimelineView {
  const clamped = clamp01(progress)
  const heroFade = 1 - segmentProgress(clamped, 0.2, 0.4)
  const infoFadeIn = segmentProgress(clamped, 0.2, 0.4)
  const infoFadeOut = segmentProgress(clamped, 0.6, 0.8)
  const infoOpacity = clamp01(infoFadeIn * (1 - infoFadeOut))
  const authOpacity = segmentProgress(clamped, 0.8, 1)

  let robotX = 0

  if (clamped < 0.2) {
    robotX = 0
  } else if (clamped < 0.4) {
    robotX = lerp(0, 30, segmentProgress(clamped, 0.2, 0.4))
  } else if (clamped < 0.6) {
    robotX = 30
  } else if (clamped < 0.99) {
    robotX = lerp(30, -30, segmentProgress(clamped, 0.6, 0.99))
  } else {
    robotX = -30
  }

  const robotOpacity = clamped < 0.2 ? 0.24 : lerp(0.24, 1, segmentProgress(clamped, 0.2, 0.4))

  return {
    heroOpacity: clamp01(heroFade),
    infoOpacity,
    authOpacity,
    robotX,
    robotOpacity,
  }
}
