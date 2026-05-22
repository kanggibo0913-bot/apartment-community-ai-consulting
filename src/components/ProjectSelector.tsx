import { useRef, useState } from 'react'
import { CommunityProject } from '../types/CommunityData'
import Button from './Button'
import './ProjectSelector.css'

interface ProjectSelectorProps {
  projects: CommunityProject[]
  activeProjectId: string
  onSelectProject: (projectId: string) => void
  onAddProject: () => void
  onEditProject: (project: CommunityProject) => void
  onDeleteProject: (projectId: string) => void
  onBackupProjects: () => void
  onRestoreProjects: (file: File) => Promise<{ success: boolean; message: string }>
}

const ProjectSelector: React.FC<ProjectSelectorProps> = ({
  projects,
  activeProjectId,
  onSelectProject,
  onAddProject,
  onEditProject,
  onDeleteProject,
  onBackupProjects,
  onRestoreProjects,
}) => {
  const [showBackupRestore, setShowBackupRestore] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const activeProject = projects.find(p => p.id === activeProjectId)

  const handleDeleteClick = () => {
    if (!activeProject) return
    if (projects.length === 1) {
      alert('최소 1개의 단지를 유지해야 합니다. 삭제할 수 없습니다.')
      return
    }
    if (confirm(`"${activeProject.name}" 단지를 삭제하시겠습니까? 이 작업은 취소할 수 없습니다.`)) {
      onDeleteProject(activeProjectId)
    }
  }

  const handleRestoreClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (confirm('데이터를 불러오면 현재 저장된 데이터가 백업 파일의 내용으로 교체됩니다. 계속하시겠습니까?')) {
      const result = await onRestoreProjects(file)
      alert(result.message)
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  if (!activeProject) {
    return (
      <div className="project-selector error">
        <p>선택된 단지가 없습니다. 단지를 추가해주세요.</p>
        <Button onClick={onAddProject} className="btn-primary">
          + 단지 추가
        </Button>
      </div>
    )
  }

  const lastModified = new Date(activeProject.updatedAt).toLocaleDateString('ko-KR')

  return (
    <div className="project-selector">
      <div className="project-header">
        <h2>현재 선택: {activeProject.name}</h2>
        <button
          className="btn-toggle-actions"
          type="button"
          onClick={() => setShowBackupRestore(!showBackupRestore)}
        >
          {showBackupRestore ? '▼' : '▶'} 데이터 관리
        </button>
      </div>

      <div className="project-info">
        <div className="info-row">
          <span className="label">주소:</span>
          <span className="value">{activeProject.address || '(미입력)'}</span>
        </div>
        <div className="info-row">
          <span className="label">세대수:</span>
          <span className="value">{activeProject.householdCount}세대</span>
        </div>
        <div className="info-row">
          <span className="label">관리회사:</span>
          <span className="value">{activeProject.managementCompany || '(미입력)'}</span>
        </div>
        <div className="info-row">
          <span className="label">마지막 수정:</span>
          <span className="value">{lastModified}</span>
        </div>
      </div>

      <div className="project-actions">
        <select
          value={activeProjectId}
          onChange={e => onSelectProject(e.target.value)}
          className="project-select"
        >
          <option disabled>-- 단지 선택 --</option>
          {projects.map(project => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>

        <Button onClick={onAddProject} className="btn-secondary">
          + 단지 추가
        </Button>
        <Button onClick={() => onEditProject(activeProject)} className="btn-secondary">
          ✎ 정보 수정
        </Button>
        <Button onClick={handleDeleteClick} className="btn-danger">
          × 단지 삭제
        </Button>
      </div>

      {showBackupRestore && (
        <div className="backup-actions">
          <Button onClick={onBackupProjects} className="btn-secondary">
            ⬇ 전체 데이터 백업
          </Button>
          <Button onClick={handleRestoreClick} className="btn-secondary">
            ⬆ 데이터 불러오기
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </div>
      )}
    </div>
  )
}

export default ProjectSelector
