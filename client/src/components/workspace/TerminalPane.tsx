export default function TerminalPane() {
  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-[rgba(7,16,20,0.92)] text-[#d2f3ee]">
      <div className="flex items-center justify-between border-b border-[rgba(130,225,212,0.18)] px-4 py-2">
        <p className="m-0 text-xs font-semibold tracking-[0.12em] uppercase text-[#95d6cc]">
          Terminal
        </p>
        <button
          type="button"
          className="rounded-md border border-[rgba(130,225,212,0.22)] px-2 py-1 text-xs text-[#a7e0d7]"
        >
          Clear
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3 font-mono text-xs leading-6 sm:text-sm">
        <p className="m-0 text-[#bce8e2]">$ workspace terminal connected</p>
        <p className="m-0 text-[#89b7b1]">Execution is not wired yet for this environment.</p>
        <p className="m-0 text-[#89b7b1]">Run panel and output streaming will appear here.</p>
      </div>

      <div className="border-t border-[rgba(130,225,212,0.18)] px-4 py-2 text-xs text-[#89b7b1]">
        Permission: read-only session shell
      </div>
    </section>
  )
}
