import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  History, 
  Play, 
  Settings, 
  Users, 
  X, 
  Maximize2, 
  Minimize2
} from 'lucide-react'
import { cn } from '../../lib/utils'

export type DrawerTab = 'timeline' | 'run' | 'env' | 'collab'

interface BottomDrawersProps {
  onClose?: () => void
}

const DRAWER_ITEMS: { id: DrawerTab; label: string; icon: any }[] = [
  { id: 'timeline', label: 'Timeline', icon: History },
  { id: 'run', label: 'Run & Debug', icon: Play },
  { id: 'env', label: 'Environment', icon: Settings },
  { id: 'collab', label: 'Collaboration', icon: Users },
]

export default function BottomDrawers(_props: BottomDrawersProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [height, setHeight] = useState(400)
  const isDragging = useRef(false)

  const toggleTab = (tab: DrawerTab) => {
    if (activeTab === tab) {
      setActiveTab(null)
      setIsExpanded(false)
    } else {
      setActiveTab(tab)
    }
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      
      const newHeight = window.innerHeight - e.clientY - 40
      
      if (newHeight >= 200 && newHeight <= window.innerHeight * 0.9) {
        setHeight(newHeight)
      }
    }

    const handleMouseUp = () => {
      isDragging.current = false
      document.body.style.cursor = 'default'
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  return (
    <div className="absolute bottom-0 left-0 right-0 z-50 flex flex-col pointer-events-none justify-end">
      {/* Bookmark Tabs */}
      <div className="flex gap-2 pointer-events-auto items-end relative z-10 mx-4">
        {DRAWER_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id
          
          return (
            <button
              key={item.id}
              onClick={() => toggleTab(item.id)}
              className={cn(
                "relative h-[36px] px-4 flex items-center gap-2 rounded-t-xl transition-all duration-200 group border border-b-0",
                isActive 
                  ? "bg-[rgba(var(--bg-rgb),0.95)] backdrop-blur-xl border-[var(--line)] text-[var(--lagoon-deep)] shadow-lg pb-1 h-[40px] z-20" 
                  : "bg-transparent border-transparent text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)] hover:bg-[rgba(var(--bg-rgb),0.4)] z-10"
              )}
            >
              <Icon size={14} className={cn("transition-transform", isActive ? "scale-110" : "group-hover:scale-110")} />
              
              <div className="relative flex items-center h-full">
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-widest",
                  isActive ? "" : "invisible" 
                )}>
                  {item.label}
                </span>
                
                {!isActive && (
                  <span className="text-[10px] font-bold uppercase tracking-widest absolute left-0 whitespace-nowrap opacity-70 group-hover:opacity-100 transition-opacity">
                    {item.label}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      <AnimatePresence mode="wait">
        {activeTab && (
          <motion.div
            key={activeTab}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: isExpanded ? '80vh' : height, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={cn(
              "relative z-0 pointer-events-auto flex flex-col mx-4 mb-4",
              "bg-[rgba(var(--bg-rgb),0.95)] backdrop-blur-xl border border-[var(--line)] rounded-xl shadow-2xl overflow-hidden"
            )}
          >
            {/* Drag Handle */}
            <div 
              className="h-3 w-full cursor-ns-resize flex items-center justify-center hover:bg-[rgba(255,255,255,0.05)] transition-colors group border-b border-[var(--line)]"
              onMouseDown={() => {
                isDragging.current = true
                document.body.style.cursor = 'ns-resize'
              }}
            >
              <div className="w-12 h-1 bg-[var(--line)] group-hover:bg-[var(--lagoon)] rounded-full transition-colors" />
            </div>

            {/* Drawer Header Controls */}
            <div className="absolute top-2 right-4 flex items-center gap-1 z-10">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 hover:bg-[rgba(0,0,0,0.05)] rounded-md text-[var(--sea-ink-soft)] transition-colors"
              >
                {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
              <button
                onClick={() => {
                  setActiveTab(null)
                  setIsExpanded(false)
                }}
                className="p-1.5 hover:bg-[rgba(0,0,0,0.05)] rounded-md text-[var(--sea-ink-soft)] transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="mt-2 flex-1 overflow-y-auto p-4">
              {activeTab === 'timeline' && (
                <div className="space-y-4">
                  <div className="p-8 border-2 border-dashed border-[var(--line)] rounded-xl flex flex-col items-center justify-center text-center opacity-50">
                    <History size={32} className="mb-2" />
                    <p className="font-semibold text-[var(--sea-ink)]">Timeline Manager</p>
                    <p className="text-xs text-[var(--sea-ink-soft)]">No active timelines found in this project.</p>
                  </div>
                </div>
              )}

              {activeTab === 'run' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 bg-[rgba(var(--lagoon-rgb),0.05)] border border-[rgba(var(--lagoon-rgb),0.1)] rounded-xl">
                    <div className="p-3 bg-[var(--lagoon)] rounded-full text-white">
                      <Play size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-[var(--sea-ink)]">Ready to Run</p>
                      <p className="text-xs text-[var(--sea-ink-soft)]">Click the play button to execute your code in the Docker sandbox.</p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'env' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-[var(--sea-ink)]">Environment Variables</h3>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input 
                        placeholder="KEY" 
                        className="flex-1 bg-transparent border border-[var(--line)] rounded-lg px-3 py-2 text-xs outline-none focus:border-[var(--lagoon)]" 
                      />
                      <input 
                        placeholder="VALUE" 
                        className="flex-1 bg-transparent border border-[var(--line)] rounded-lg px-3 py-2 text-xs outline-none focus:border-[var(--lagoon)]" 
                      />
                    </div>
                  </div>
                  <button className="w-full py-2 bg-[var(--sea-ink)] text-white rounded-lg text-xs font-bold hover:opacity-90 transition-opacity">
                    Add Variable
                  </button>
                </div>
              )}

              {activeTab === 'collab' && (
                <div className="space-y-4">
                   <div className="p-6 border border-[var(--line)] rounded-xl text-center">
                    <p className="text-sm font-medium text-[var(--sea-ink)]">Active Collaborators</p>
                    <div className="mt-4 flex justify-center -space-x-2">
                      <div className="w-10 h-10 rounded-full border-2 border-white bg-blue-500 flex items-center justify-center text-white text-xs font-bold">JD</div>
                      <div className="w-10 h-10 rounded-full border-2 border-white bg-teal-500 flex items-center justify-center text-white text-xs font-bold">AS</div>
                    </div>
                    <button className="mt-6 text-xs font-bold text-[var(--lagoon)] hover:underline">
                      Invite more people
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
