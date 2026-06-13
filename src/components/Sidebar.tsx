import { useState } from 'react'
import './Sidebar.css'

interface SidebarProps {
  currentPage: string
  setCurrentPage: (page: any) => void
  isOpen: boolean
  onClose: () => void
}

interface MenuItem {
  id: string
  label: string
  icon: string
}

interface MenuGroup {
  id: string
  title: string
  items: MenuItem[]
}

// 상단 공통 진입점
const topItem: MenuItem = { id: 'dashboard', label: '대시보드', icon: '📊' }

// 사용 목적 기준 2개 그룹 (페이지 id/라우팅은 기존 그대로 유지)
const menuGroups: MenuGroup[] = [
  {
    id: 'bid',
    title: '입찰용 기능',
    items: [
      { id: 'tender', label: '입찰공고 관리', icon: '📑' },
      { id: 'estimate', label: '입찰 산출표 작성', icon: '🧮' },
      { id: 'contract', label: '계약서 생성', icon: '🖋️' },
      { id: 'review', label: '계약서 검토', icon: '🔍' },
      { id: 'document', label: '공문/질의서 작성', icon: '📝' },
    ],
  },
  {
    id: 'ops',
    title: '현장 운영 기능',
    items: [
      { id: 'apartment', label: '단지 기본정보', icon: '🏢' },
      { id: 'facility', label: '시설 정보', icon: '🏛️' },
      { id: 'maintenance', label: '시설 보수 내역', icon: '🛠️' },
      { id: 'operation', label: '운영 정보', icon: '⚙️' },
      { id: 'cost', label: '현장 인건비/비용', icon: '💰' },
      { id: 'labor-cost', label: '현장 인건비 산출', icon: '🧾' },
      { id: 'employment-contract', label: '근로계약서 작성', icon: '📜' },
      { id: 'revenue', label: '수익 정보', icon: '📈' },
      { id: 'complaint', label: '민원 관리', icon: '📞' },
      { id: 'agenda', label: '안건 예상', icon: '📌' },
      { id: 'contract-manage', label: '계약 관리', icon: '📋' },
      { id: 'monthly-report', label: '월간 리포트', icon: '📰' },
      { id: 'weekly-report', label: '주간 리포트', icon: '🗓️' },
      { id: 'resident-notice', label: '입주민 안내 보고서', icon: '📢' },
      { id: 'report', label: '보고서 초안', icon: '📄' },
      { id: 'analysis', label: 'AI 분석 결과', icon: '🤖' },
      { id: 'ai-history', label: 'AI 결과 이력', icon: '🗂️' },
    ],
  },
  {
    id: 'system',
    title: '시스템',
    items: [
      { id: 'system-data-sync', label: '데이터 동기화', icon: '☁️' },
    ],
  },
]

const Sidebar: React.FC<SidebarProps> = ({ currentPage, setCurrentPage, isOpen, onClose }) => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const toggleGroup = (id: string) => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))

  const renderItem = (item: MenuItem) => (
    <button
      key={item.id}
      className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
      onClick={() => setCurrentPage(item.id)}
      title={item.label}
    >
      <span className="nav-icon">{item.icon}</span>
      <span className="nav-label">{item.label}</span>
    </button>
  )

  return (
    <>
      <div className={`sidebar-backdrop ${isOpen ? 'visible' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div>
            <h1>APT AI</h1>
            <p>커뮤니티 컨설팅</p>
          </div>
          <button className="sidebar-close" type="button" onClick={onClose} aria-label="메뉴 닫기">
            ✕
          </button>
        </div>
        <nav className="sidebar-nav">
          {renderItem(topItem)}

          {menuGroups.map((group) => {
            const isActiveGroup = group.items.some((item) => item.id === currentPage)
            // 현재 페이지가 속한 그룹은 항상 펼쳐 활성 항목이 보이게 한다
            const open = isActiveGroup || !collapsed[group.id]
            return (
              <div key={group.id} className={`nav-group ${isActiveGroup ? 'active-group' : ''}`}>
                <button
                  type="button"
                  className="nav-group-header"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={open}
                >
                  <span className="nav-group-title">{group.title}</span>
                  <span className="nav-group-caret">{open ? '▾' : '▸'}</span>
                </button>
                {open && <div className="nav-group-items">{group.items.map(renderItem)}</div>}
              </div>
            )
          })}
        </nav>
      </aside>
    </>
  )
}

export default Sidebar
