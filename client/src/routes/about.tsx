import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: About,
})

const workspaceFeatureGroups = [
  {
    title: 'Project and file control',
    points: [
      'Project-aware workspace routing with fast project switching.',
      'Tree explorer with filter, custom file icons, and dirty markers.',
      'Create, rename, and delete files and folders from the sidebar.',
    ],
  },
  {
    title: 'Editor productivity',
    points: [
      'Tabbed editing with close one, close others, and close all actions.',
      'Quick Open and command shortcuts such as save and panel toggles.',
      'Monaco editor with language detection and theme-aware styling.',
    ],
  },
  {
    title: 'Real-time collaboration',
    points: [
      'Live document sync with collaborator activity indicators by file.',
      'Shared presence data and role-aware collaborator listings.',
      'Autosave plus dirty-state handling across local and collab changes.',
    ],
  },
  {
    title: 'AI-assisted editing',
    points: [
      'Prompt-based file edits from the right assistant panel.',
      'Inline diff preview with accept or discard controls.',
      'Threaded chat history with rename, delete, and jump-to-file actions.',
    ],
  },
  {
    title: 'Run and terminal workflow',
    points: [
      'Run current file sends queued commands into the collaborative terminal.',
      'Terminal control requests with approve, reject, and revoke actions.',
      'Session-aware terminal sync with themed output and connection states.',
    ],
  },
  {
    title: 'Timeline, history, and access',
    points: [
      'Snapshot replay graph with preview and non-destructive rewind.',
      'Project and file history restore options in the timeline drawer.',
      'Hosted Auth0 lock overlay, invite links, and member access management.',
    ],
  },
]

function About() {
  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-10 sm:py-12">
      <section className="relative overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[linear-gradient(155deg,color-mix(in_oklab,var(--surface-strong)_92%,white_8%),color-mix(in_oklab,var(--surface)_94%,var(--bg-base)_6%))] p-6 shadow-[inset_0_1px_0_var(--inset-glint),0_22px_44px_color-mix(in_oklab,var(--lagoon)_20%,transparent),0_8px_22px_color-mix(in_oklab,var(--sea-ink)_14%,transparent)] backdrop-blur-[5px] animate-in fade-in slide-in-from-bottom-3 duration-700 motion-reduce:animate-none sm:p-9">
        <div className="pointer-events-none absolute left-[-5rem] top-[-6rem] h-64 w-64 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--lagoon)_44%,transparent),transparent_68%)]" />
        <div className="pointer-events-none absolute bottom-[-6.5rem] right-[-5rem] h-72 w-72 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--lagoon-deep)_28%,transparent),transparent_70%)]" />

        <div className="relative z-10 grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <p className="mb-3 text-[0.7rem] font-bold uppercase tracking-[0.18em] text-[var(--kicker)]">About iTECify</p>
            <h1 className="mb-4 max-w-4xl font-[Fraunces,Georgia,serif] text-4xl font-bold leading-[1.02] tracking-tight text-[var(--sea-ink)] sm:text-6xl">
              A focused workspace for shipping code together.
            </h1>
            <p className="m-0 max-w-2xl text-base leading-7 text-[var(--sea-ink-soft)] sm:text-lg">
              iTECify combines editor flow, collaboration, AI support, terminal control, and
              timeline recovery in one place. This page highlights what is already implemented,
              without the noise.
            </p>
          </div>

          <aside className="rounded-2xl border border-[color-mix(in_oklab,var(--line)_86%,var(--lagoon)_14%)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--surface-strong)_94%,white_6%),color-mix(in_oklab,var(--surface)_96%,var(--bg-base)_4%))] p-5 shadow-[inset_0_1px_0_var(--inset-glint),0_16px_26px_color-mix(in_oklab,var(--sea-ink)_10%,transparent)]">
            <h2 className="m-0 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[var(--kicker)]">Product intent</h2>
            <p className="mb-0 mt-3 text-sm leading-7 text-[var(--sea-ink-soft)] sm:text-[0.95rem]">
              Reduce the gap between idea, edit, run, and collaborate, while keeping secure
              access and recovery workflows first-class.
            </p>
          </aside>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="m-0 text-[0.7rem] font-bold uppercase tracking-[0.16em] text-[var(--kicker)]">
          Workspace features
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
        {workspaceFeatureGroups.map((group, index) => (
          <article
            key={group.title}
            className="rounded-2xl border border-[var(--line)] bg-[linear-gradient(165deg,color-mix(in_oklab,var(--surface-strong)_90%,white_10%),color-mix(in_oklab,var(--surface)_94%,var(--bg-base)_6%))] p-5 shadow-[inset_0_1px_0_var(--inset-glint),0_12px_24px_color-mix(in_oklab,var(--sea-ink)_9%,transparent)] animate-in fade-in slide-in-from-bottom-2 duration-700 motion-reduce:animate-none"
            style={{ animationDelay: `${index * 90}ms` }}
          >
            <h3 className="m-0 font-[Fraunces,Georgia,serif] text-2xl leading-tight text-[var(--sea-ink)]">{group.title}</h3>
            <ul className="mb-0 mt-3 space-y-2 pl-5 text-sm leading-6 text-[var(--sea-ink-soft)] sm:text-[0.95rem]">
              {group.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </article>
        ))}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[linear-gradient(140deg,color-mix(in_oklab,var(--surface-strong)_90%,white_10%),color-mix(in_oklab,var(--surface)_94%,var(--bg-base)_6%))] px-6 py-7 shadow-[inset_0_1px_0_var(--inset-glint),0_18px_34px_color-mix(in_oklab,var(--lagoon)_15%,transparent)] sm:px-8">
        <h2 className="m-0 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[var(--kicker)]">Next step</h2>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <p className="m-0 max-w-2xl text-sm leading-7 text-[var(--sea-ink-soft)] sm:text-[0.96rem]">
            Jump into Projects to use the full workspace: edit, collaborate, run, and recover history
            from one unified interface.
          </p>
          <Link
            to="/projects"
            className="inline-flex items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--lagoon-deep)_56%,var(--line)_44%)] bg-[color-mix(in_oklab,var(--lagoon)_16%,transparent)] px-5 py-2.5 text-sm font-semibold text-[var(--sea-ink)] no-underline transition hover:-translate-y-0.5 hover:bg-[color-mix(in_oklab,var(--lagoon)_24%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lagoon-deep)]"
          >
            Open Projects
          </Link>
        </div>
      </section>
    </main>
  )
}
