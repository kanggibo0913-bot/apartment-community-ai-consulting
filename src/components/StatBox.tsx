import './StatBox.css'

interface StatBoxProps {
  label: string
  value: string | number
  unit?: string
  icon?: string
}

const StatBox: React.FC<StatBoxProps> = ({ label, value, unit, icon }) => {
  return (
    <div className="stat-box">
      {icon && <div className="stat-icon">{icon}</div>}
      <div className="stat-content">
        <p className="stat-label">{label}</p>
        <p className="stat-value">
          {value}
          {unit && <span className="stat-unit">{unit}</span>}
        </p>
      </div>
    </div>
  )
}

export default StatBox
