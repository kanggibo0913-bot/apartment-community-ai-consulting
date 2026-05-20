import './Sidebar.css'

interface SidebarProps {
  currentPage: string
  setCurrentPage: (page: any) => void
  isOpen: boolean
  onClose: () => void
}

const Sidebar: React.FC<SidebarProps> = ({ currentPage, setCurrentPage, isOpen, onClose }) => {
  const menuItems = [
    { id: 'dashboard', label: '대시보드', icon: '📊' },
    { id: 'apartment', label: '단지 기본정보', icon: '🏢' },
    { id: 'facility', label: '시설 정보', icon: '🏛️' },
    { id: 'operation', label: '운영 정보', icon: '⚙️' },
    { id: 'cost', label: '비용 정보', icon: '💰' },
    { id: 'revenue', label: '수익 정보', icon: '📈' },
    { id: 'complaint', label: '민원 정보', icon: '📞' },
    { id: 'analysis', label: 'AI 분석 결과', icon: '🤖' },
    { id: 'report', label: '보고서 초안', icon: '📄' },
    { id: 'tender', label: '입찰공고 관리', icon: '📑' },
    { id: 'estimate', label: '산출표 자동 계산', icon: '🧮' },
  ]

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
          {menuItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
              onClick={() => setCurrentPage(item.id)}
              title={item.label}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>
    </>
  )
}

export default Sidebar
