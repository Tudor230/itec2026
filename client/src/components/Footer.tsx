export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="mt-20 border-t border-[var(--line)] bg-[color-mix(in_oklab,var(--header-bg)_84%,transparent_16%)] px-4 pb-14 pt-10 text-[var(--sea-ink-soft)]">
      <div className="mx-auto flex w-full max-w-[1080px] flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
        <p className="m-0 text-sm">&copy; {year} iTECify.</p>
        <p className="m-0 text-[0.69rem] font-bold uppercase tracking-[0.16em] text-[var(--kicker)]">Collaborative coding, shared timelines, AI assistance.</p>
      </div>
      <div className="mt-4 flex justify-center gap-4">
        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          className="rounded-xl p-2 text-[var(--sea-ink-soft)] transition hover:bg-[var(--link-bg-hover)] hover:text-[var(--sea-ink)]"
        >
          GitHub
        </a>
        <a
          href="/about"
          className="rounded-xl p-2 text-[var(--sea-ink-soft)] transition hover:bg-[var(--link-bg-hover)] hover:text-[var(--sea-ink)]"
        >
          Product notes
        </a>
      </div>
    </footer>
  )
}
