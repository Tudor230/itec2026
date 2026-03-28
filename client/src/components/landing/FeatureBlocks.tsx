const featureBlocks = [
  {
    title: 'Real-Time Collaboration',
    body:
      'Presence-aware editing keeps contributors aligned in the same session context, with workspace structure designed for multi-user visibility.',
    kicker: 'Collaboration',
  },
  {
    title: 'AI-Assisted Iteration',
    body:
      'Planned right-side AI workspace patterns support inline refinement loops without leaving the coding surface or losing project context.',
    kicker: 'AI Workspace',
  },
  {
    title: 'Execution Feedback Loop',
    body:
      'Run and debug controls are evolving into a dedicated workspace flow where edits, execution status, and logs stay in one place.',
    kicker: 'Run and Debug',
  },
]

export default function FeatureBlocks() {
  return (
    <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {featureBlocks.map((feature, index) => (
        <article
          key={feature.title}
          className="island-shell feature-card rise-in rounded-2xl p-5"
          style={{ animationDelay: `${index * 100 + 70}ms` }}
        >
          <p className="island-kicker mb-2">{feature.kicker}</p>
          <h2 className="mb-2 text-base font-semibold text-[var(--sea-ink)]">
            {feature.title}
          </h2>
          <p className="m-0 text-sm leading-7 text-[var(--sea-ink-soft)]">
            {feature.body}
          </p>
        </article>
      ))}
    </section>
  )
}
