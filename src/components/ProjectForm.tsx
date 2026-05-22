import { useState } from 'react'
import { CommunityProject } from '../types/CommunityData'
import Button from './Button'
import './ProjectForm.css'

interface ProjectFormProps {
  project?: CommunityProject
  isOpen: boolean
  onClose: () => void
  onSave: (project: Omit<CommunityProject, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void
}

const ProjectForm: React.FC<ProjectFormProps> = ({ project, isOpen, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: project?.name || '',
    address: project?.address || '',
    householdCount: project?.householdCount || 0,
    managementCompany: project?.managementCompany || '',
    memo: project?.memo || '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: name === 'householdCount' ? parseInt(value) || 0 : value,
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      alert('단지명을 입력해주세요.')
      return
    }

    onSave({
      ...formData,
      id: project?.id,
      data: project?.data || ({} as any),
    })

    setFormData({
      name: '',
      address: '',
      householdCount: 0,
      managementCompany: '',
      memo: '',
    })
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="project-form-overlay">
      <div className="project-form-modal">
        <h3>{project ? '단지 정보 수정' : '새로운 단지 추가'}</h3>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">단지명 *</label>
            <input
              id="name"
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="예: 래미안 커뮤니티"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="address">주소</label>
            <input
              id="address"
              type="text"
              name="address"
              value={formData.address}
              onChange={handleChange}
              placeholder="예: 서울특별시 강남구"
            />
          </div>

          <div className="form-group">
            <label htmlFor="householdCount">세대수</label>
            <input
              id="householdCount"
              type="number"
              name="householdCount"
              value={formData.householdCount}
              onChange={handleChange}
              min="0"
              placeholder="0"
            />
          </div>

          <div className="form-group">
            <label htmlFor="managementCompany">관리회사</label>
            <input
              id="managementCompany"
              type="text"
              name="managementCompany"
              value={formData.managementCompany}
              onChange={handleChange}
              placeholder="예: ABC 관리회사"
            />
          </div>

          <div className="form-group">
            <label htmlFor="memo">비고</label>
            <textarea
              id="memo"
              name="memo"
              value={formData.memo}
              onChange={handleChange}
              placeholder="기타 메모사항"
              rows={3}
            />
          </div>

          <div className="form-actions">
            <Button type="submit" className="btn-primary">
              {project ? '수정하기' : '추가하기'}
            </Button>
            <Button type="button" onClick={onClose} className="btn-secondary">
              취소
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ProjectForm
