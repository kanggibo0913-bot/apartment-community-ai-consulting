import './Sidebar.css'

interface SidebarProps {
  currentPage: string
  setCurrentPage: (page: any) => void
}

const Sidebar: React.FC<SidebarProps> = ({ currentPage, setCurrentPage }) => {
  const menuItems = [
    { id: 'dashboard', label: '📊 대시보드', icon: '📊' },
    { id: 'apartment', label: '🏢 단지 기본정보', icon: '🏢' },
    { id: 'facility', label: '🏛️ 시설 정보', icon: '🏛️' },
    { id: 'operation', label: '⚙️ 운영 정보', icon: '⚙️' },
    { id: 'cost', label: '💰 비용 정보', icon: '💰' },
    { id: 'revenue', label: '📈 수익 정보', icon: '📈' },
    { id: 'complaint', label: '📞 민원 정보', icon: '📞' },
    { id: 'analysis', label: '🤖 AI 분석 결과', icon: '🤖' },
    { id: 'report', label: '📄 보고서 초안', icon: '📄' },
  ]

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>APT AI</h1>
        <p>커뮤니티 컨설팅</p>
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
  )
}

export default Sidebar
