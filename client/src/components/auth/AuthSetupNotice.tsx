import { missingAuth0EnvVars } from '../../lib/auth0-config'

export default function AuthSetupNotice() {
  if (missingAuth0EnvVars.length === 0) {
    return null
  }

  return (
    <section className="rounded-2xl border border-[rgba(50,143,151,0.2)] bg-[linear-gradient(165deg,var(--surface-strong),var(--surface))] p-6 shadow-[inset_0_1px_0_var(--inset-glint),0_22px_44px_rgba(30,90,72,0.1),0_6px_18px_rgba(23,58,64,0.08)] backdrop-blur-[4px]">
      <p className="mb-2 text-[0.69rem] font-bold uppercase tracking-[0.16em] text-[var(--kicker)]">
        Auth0 Setup Required
      </p>
      <h2 className="mb-3 text-2xl font-semibold text-[var(--sea-ink)]">
        Add your Auth0 environment variables before testing login.
      </h2>
      <p className="mb-4 text-sm leading-7 text-[var(--sea-ink-soft)]">
        The app is wired for Auth0 already. Fill in the missing values in{' '}
        <code>.env</code> and restart <code>npm run dev</code>.
      </p>
      <ul className="m-0 list-disc space-y-2 pl-5 text-sm text-[var(--sea-ink-soft)]">
        {missingAuth0EnvVars.map((envVar) => (
          <li key={envVar}>{envVar}</li>
        ))}
      </ul>
    </section>
  )
}
