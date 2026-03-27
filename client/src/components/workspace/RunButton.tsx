import { Play } from 'lucide-react'

interface RunButtonProps {
  onRunRequest?: () => void
  label?: string
}

export default function RunButton({
  onRunRequest,
  label = 'Run',
}: RunButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onRunRequest?.()}
      aria-label={label}
      className="inline-flex items-center gap-2 rounded-full border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.16)] px-4 py-2 text-sm font-semibold text-[var(--lagoon-deep)] shadow-[0_8px_22px_rgba(30,90,72,0.08)] transition hover:-translate-y-0.5 hover:bg-[rgba(79,184,178,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(50,143,151,0.5)]"
    >
      <Play size={14} />
      <span>{label}</span>
    </button>
  )
}
