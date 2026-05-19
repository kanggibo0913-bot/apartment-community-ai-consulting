import './PageHeader.css'

interface PageHeaderProps {
  title: string
  description?: string
}

const PageHeader: React.FC<PageHeaderProps> = ({ title, description }) => {
  return (
    <div className="page-header">
      <h1 className="page-title">{title}</h1>
      {description && <p className="page-description">{description}</p>}
    </div>
  )
}

export default PageHeader
