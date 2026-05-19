import { useState } from 'react'
import './App.css'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import ApartmentInfo from './pages/ApartmentInfo'
import FacilityInfo from './pages/FacilityInfo'
import OperationInfo from './pages/OperationInfo'
import CostInfo from './pages/CostInfo'
import RevenueInfo from './pages/RevenueInfo'
import ComplaintInfo from './pages/ComplaintInfo'
import AIAnalysis from './pages/AIAnalysis'
import ReportDraft from './pages/ReportDraft'

type PageType = 'dashboard' | 'apartment' | 'facility' | 'operation' | 'cost' | 'revenue' | 'complaint' | 'analysis' | 'report'

function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('dashboard')

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />
      case 'apartment':
        return <ApartmentInfo />
      case 'facility':
        return <FacilityInfo />
      case 'operation':
        return <OperationInfo />
      case 'cost':
        return <CostInfo />
      case 'revenue':
        return <RevenueInfo />
      case 'complaint':
        return <ComplaintInfo />
      case 'analysis':
        return <AIAnalysis />
      case 'report':
        return <ReportDraft />
      default:
        return <Dashboard />
    }
  }

  return (
    <div className="app-container">
      <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} />
      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  )
}

export default App
