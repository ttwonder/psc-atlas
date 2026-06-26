import { BarChart3, ChevronLeft, Database, LayoutDashboard, Library, ListChecks, ShieldCheck, Sparkles } from 'lucide-react'
import { CompassMark } from './Icons'

export type NavKey = 'overview' | 'cases' | 'findings' | 'priority' | 'analysis' | 'sources' | 'permissions'

const nav: Array<{ key: NavKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: 'overview', label: '總覽', icon: LayoutDashboard },
  { key: 'cases', label: '案例庫', icon: Library },
  { key: 'findings', label: '缺陷詳情', icon: ListChecks },
  { key: 'priority', label: '重點缺陷', icon: Sparkles },
  { key: 'analysis', label: '缺陷分析', icon: BarChart3 },
  { key: 'sources', label: '資料來源', icon: Database },
  { key: 'permissions', label: '權限管理', icon: ShieldCheck },
]

interface SidebarProps { active: NavKey; collapsed: boolean; mobileOpen: boolean; onToggle: () => void; onNavigate: (key: NavKey) => void }

export function Sidebar({ active, collapsed, mobileOpen, onToggle, onNavigate }: SidebarProps) {
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="brand">
        <CompassMark className="brand-mark" />
        <span>PSC Atlas</span>
      </div>
      <nav aria-label="主要導覽">
        {nav.map(({ key, label, icon: Icon }) => (
          <button className={`nav-item ${key === active ? 'active' : ''}`} type="button" key={key} aria-current={key === active ? 'page' : undefined} onClick={() => onNavigate(key)}>
            <Icon size={20} strokeWidth={1.75} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <button className="collapse-button" type="button" aria-label={collapsed ? '展開側欄' : '收合側欄'} onClick={onToggle}><ChevronLeft size={23} /></button>
    </aside>
  )
}
