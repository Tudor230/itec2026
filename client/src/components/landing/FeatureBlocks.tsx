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
          className="rounded-2xl border border-[var(--line)] bg-[linear-gradient(165deg,color-mix(in_oklab,var(--surface-strong)_93%,white_7%),var(--surface))] p-5 shadow-[inset_0_1px_0_var(--inset-glint),0_18px_34px_rgba(30,90,72,0.1),0_4px_14px_rgba(23,58,64,0.06)] transition-[background-color,color,border-color,transform] duration-180 hover:-translate-y-[2px] hover:border-[color-mix(in_oklab,var(--lagoon-deep)_35%,var(--line))] animate-in fade-in slide-in-from-bottom-2 duration-700"
          style={{ animationDelay: `${index * 100 + 70}ms` }}
        >
          <p className="mb-2 text-[0.69rem] font-bold uppercase tracking-[0.16em] text-[var(--kicker)]">{feature.kicker}</p>
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
