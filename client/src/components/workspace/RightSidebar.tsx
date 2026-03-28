import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Sparkles, 
  History, 
  Send, 
  Plus, 
  Zap,
  Code2,
  Bug,
  TestTube
} from 'lucide-react'
import { cn } from '../../lib/utils'

export type SidebarTab = 'ai' | 'history'

interface RightSidebarProps {
  isOpen: boolean
  onToggle: () => void
  activeTab: SidebarTab
  setActiveTab: (tab: SidebarTab) => void
}

export default function RightSidebar({ isOpen, onToggle, activeTab, setActiveTab }: RightSidebarProps) {
  const [chatInput, setChatInput] = useState('')

  const quickActions = [
    { label: 'Refactor', icon: Zap },
    { label: 'Explain', icon: Code2 },
    { label: 'Fix Bug', icon: Bug },
    { label: 'Tests', icon: TestTube },
  ]

  if (!isOpen) return null

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-[rgba(255,255,255,0.52)]">
      {/* Header */}
      <div className="h-[48px] px-2 border-b border-[var(--line)] flex items-center justify-between bg-[rgba(255,255,255,0.05)] whitespace-nowrap">
        <div className="flex bg-[rgba(0,0,0,0.1)] p-1 rounded-lg">
          <button 
            onClick={() => setActiveTab('ai')}
            className={cn(
              "px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1.5",
              activeTab === 'ai' 
                ? "bg-[var(--chip-bg)] text-[var(--sea-ink)] shadow-sm" 
                : "text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
            )}
          >
            <Sparkles size={12} />
            <span>AI</span>
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={cn(
              "px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1.5",
              activeTab === 'history' 
                ? "bg-[var(--chip-bg)] text-[var(--sea-ink)] shadow-sm" 
                : "text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
            )}
          >
            <History size={12} />
            <span>History</span>
          </button>
        </div>
        <button className="p-1.5 hover:bg-[rgba(0,0,0,0.05)] rounded-lg transition-colors text-[var(--sea-ink-soft)] mr-1">
          <Plus size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="w-full flex-1 overflow-y-auto p-4">
            {activeTab === 'ai' ? (
              <div className="space-y-6">
                {/* Empty Chat State */}
                <div className="text-center py-8 space-y-3">
                  <div className="w-12 h-12 bg-[rgba(var(--lagoon-rgb),0.1)] text-[var(--lagoon)] rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Sparkles size={24} />
                  </div>
                  <h3 className="text-sm font-bold text-[var(--sea-ink)]">How can I help today?</h3>
                  <p className="text-xs text-[var(--sea-ink-soft)] px-4">
                    I can help you refactor code, find bugs, or explain complex logic.
                  </p>
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-2 gap-2">
                  {quickActions.map((action) => (
                    <button
                      key={action.label}
                      className="flex items-center gap-2 p-2 rounded-lg border border-[var(--line)] hover:border-[var(--lagoon)] hover:bg-[rgba(var(--lagoon-rgb),0.02)] transition-all group"
                    >
                      <action.icon size={12} className="text-[var(--sea-ink-soft)] group-hover:text-[var(--lagoon)]" />
                      <span className="text-[10px] font-bold text-[var(--sea-ink-soft)] group-hover:text-[var(--sea-ink)]">{action.label}</span>
                    </button>
                  ))}
                </div>

                {/* Mock Messages */}
                <div className="space-y-4">
                  <div className="flex flex-col gap-1 max-w-[85%] self-start">
                    <div className="p-3 rounded-2xl rounded-tl-none bg-[var(--line)] text-xs text-[var(--sea-ink)]">
                      Hello! I'm your iTECify assistant. Select some code or just ask me a question.
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* History Timeline */}
                <div className="relative pl-6 space-y-8 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[2px] before:bg-[var(--line)]">
                  {[
                    { time: '2m ago', user: 'You', action: 'Refactored auth logic', type: 'commit' },
                    { time: '1h ago', user: 'Sarah', action: 'Fixed CSS grid issue', type: 'merge' },
                    { time: '3h ago', user: 'You', action: 'Initial project setup', type: 'commit' },
                  ].map((item, i) => (
                    <div key={i} className="relative group">
                      <div className={cn(
                        "absolute -left-6 top-1 w-4 h-4 rounded-full border-2 border-[var(--surface-strong)] transition-transform group-hover:scale-125",
                        item.type === 'commit' ? "bg-[var(--lagoon)]" : "bg-purple-500"
                      )} />
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-[var(--sea-ink)]">{item.user}</span>
                          <span className="text-[9px] text-[var(--sea-ink-soft)]">{item.time}</span>
                        </div>
                        <p className="text-xs text-[var(--sea-ink-soft)] group-hover:text-[var(--sea-ink)] transition-colors cursor-pointer">
                          {item.action}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer Input for AI */}
          {activeTab === 'ai' && (
            <div className="p-4 border-t border-[var(--line)] bg-[rgba(255,255,255,0.05)] w-full">
              <div className="relative">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask anything..."
                  className="w-full bg-[rgba(var(--bg-rgb),0.5)] border border-[var(--line)] rounded-xl px-3 py-2 pr-10 text-xs outline-none focus:border-[var(--lagoon)] transition-colors resize-none min-h-[80px]"
                />
                <button className="absolute right-2 bottom-2 p-1.5 bg-[var(--lagoon)] text-white rounded-lg hover:opacity-90 transition-opacity">
                  <Send size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
  )
}
