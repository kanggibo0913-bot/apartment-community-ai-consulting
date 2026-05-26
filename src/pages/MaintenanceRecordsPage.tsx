import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import Button from '../components/Button'
import './MaintenanceRecordsPage.css'

type MaintenanceCategory = '헬스장' | '골프연습장' | 'GX룸' | '샤워실' | '탈의실' | '공용부' | '기타'
type MaintenanceStatus = '접수' | '점검중' | '보수중' | '완료' | '보류'

// 시설 보수 기록. memo(내부 메모)는 입주민 공개 보고서에 자동 포함하지 않는다.
// isPublicVisible은 추후 공개 보고서 연동 시 true 항목만 후보로 사용하기 위한 플래그(현재는 표시/저장만).
export interface MaintenanceRecord {
  id: string
  facilityName: string
  category: MaintenanceCategory
  issueTitle: string
  issueDescription: string
  reportedAt: string
  inspectionDate?: string
  completedAt?: string
  status: MaintenanceStatus
  actionTaken?: string
  vendorName?: string
  memo?: string
  isPublicVisible: boolean
}

const STORAGE_KEY = 'maintenanceRecords'
const CATEGORIES: MaintenanceCategory[] = ['헬스장', '골프연습장', 'GX룸', '샤워실', '탈의실', '공용부', '기타']
const STATUSES: MaintenanceStatus[] = ['접수', '점검중', '보수중', '완료', '보류']
const STATUS_CLASS: Record<MaintenanceStatus, string> = {
  접수: 'st-received',
  점검중: 'st-inspecting',
  보수중: 'st-repairing',
  완료: 'st-done',
  보류: 'st-hold',
}

const loadRecords = (): MaintenanceRecord[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as MaintenanceRecord[]) : []
  } catch {
    return []
  }
}

const emptyForm = {
  facilityName: '',
  category: '헬스장' as MaintenanceCategory,
  issueTitle: '',
  issueDescription: '',
  reportedAt: new Date().toISOString().slice(0, 10),
  inspectionDate: '',
  completedAt: '',
  status: '접수' as MaintenanceStatus,
  actionTaken: '',
  vendorName: '',
  memo: '',
  isPublicVisible: false,
}

type FormState = typeof emptyForm

const MaintenanceRecordsPage: React.FC = () => {
  const [records, setRecords] = useState<MaintenanceRecord[]>(loadRecords)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [catFilter, setCatFilter] = useState<'all' | MaintenanceCategory>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | MaintenanceStatus>('all')
  const [query, setQuery] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  }, [records])

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const resetForm = () => {
    setForm({ ...emptyForm, reportedAt: new Date().toISOString().slice(0, 10) })
    setEditingId(null)
  }

  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(''), 2500)
  }

  const handleSave = () => {
    if (!form.facilityName.trim() || !form.issueTitle.trim()) {
      flash('시설명과 문제 제목은 필수입니다.')
      return
    }
    if (editingId) {
      setRecords((prev) => prev.map((r) => (r.id === editingId ? { ...r, ...form } : r)))
      flash('수정되었습니다.')
    } else {
      const rec: MaintenanceRecord = { id: 'mnt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), ...form }
      setRecords((prev) => [rec, ...prev])
      flash('등록되었습니다.')
    }
    resetForm()
  }

  const handleEdit = (r: MaintenanceRecord) => {
    setEditingId(r.id)
    setForm({
      facilityName: r.facilityName,
      category: r.category,
      issueTitle: r.issueTitle,
      issueDescription: r.issueDescription,
      reportedAt: r.reportedAt,
      inspectionDate: r.inspectionDate || '',
      completedAt: r.completedAt || '',
      status: r.status,
      actionTaken: r.actionTaken || '',
      vendorName: r.vendorName || '',
      memo: r.memo || '',
      isPublicVisible: r.isPublicVisible,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = (id: string) => {
    if (!window.confirm('이 시설 보수 기록을 삭제하시겠습니까?')) return
    setRecords((prev) => prev.filter((r) => r.id !== id))
    if (editingId === id) resetForm()
  }

  const handleStatusChange = (id: string, status: MaintenanceStatus) =>
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)))

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return records
      .filter((r) => catFilter === 'all' || r.category === catFilter)
      .filter((r) => statusFilter === 'all' || r.status === statusFilter)
      .filter(
        (r) =>
          !q ||
          r.facilityName.toLowerCase().includes(q) ||
          r.issueTitle.toLowerCase().includes(q) ||
          (r.issueDescription || '').toLowerCase().includes(q),
      )
      .slice()
      .sort((a, b) => (a.reportedAt < b.reportedAt ? 1 : a.reportedAt > b.reportedAt ? -1 : 0))
  }, [records, catFilter, statusFilter, query])

  return (
    <div className="page mnt-page">
      <PageHeader
        title="시설 보수 내역"
        description="커뮤니티센터 시설의 점검·고장·보수·교체·완료 현황을 기록하고 관리합니다."
      />

      <Card title={editingId ? '보수 기록 수정' : '보수 기록 등록'}>
        <div className="form-row">
          <div className="form-group">
            <label>시설명 *</label>
            <input type="text" value={form.facilityName} onChange={(e) => update('facilityName', e.target.value)} placeholder="예: 헬스장 러닝머신 3호" />
          </div>
          <div className="form-group">
            <label>구분</label>
            <select value={form.category} onChange={(e) => update('category', e.target.value as MaintenanceCategory)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>문제 제목 *</label>
          <input type="text" value={form.issueTitle} onChange={(e) => update('issueTitle', e.target.value)} placeholder="예: 러닝머신 벨트 마모" />
        </div>

        <div className="form-group">
          <label>문제 내용</label>
          <textarea value={form.issueDescription} onChange={(e) => update('issueDescription', e.target.value)} rows={3} />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>접수일</label>
            <input type="date" value={form.reportedAt} onChange={(e) => update('reportedAt', e.target.value)} />
          </div>
          <div className="form-group">
            <label>점검일</label>
            <input type="date" value={form.inspectionDate} onChange={(e) => update('inspectionDate', e.target.value)} />
          </div>
          <div className="form-group">
            <label>완료일</label>
            <input type="date" value={form.completedAt} onChange={(e) => update('completedAt', e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>처리 상태</label>
            <select value={form.status} onChange={(e) => update('status', e.target.value as MaintenanceStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>업체명</label>
            <input type="text" value={form.vendorName} onChange={(e) => update('vendorName', e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label>조치 내용</label>
          <textarea value={form.actionTaken} onChange={(e) => update('actionTaken', e.target.value)} rows={2} />
        </div>

        <div className="form-group">
          <label>내부 메모 <span className="mnt-hint">(입주민 공개 보고서에 포함되지 않습니다)</span></label>
          <textarea value={form.memo} onChange={(e) => update('memo', e.target.value)} rows={2} />
        </div>

        <label className="mnt-checkbox">
          <input type="checkbox" checked={form.isPublicVisible} onChange={(e) => update('isPublicVisible', e.target.checked)} />
          입주민 공개 보고서 포함 대상으로 표시
        </label>

        <div className="page-actions">
          <Button variant="primary" onClick={handleSave}>{editingId ? '수정 저장' : '등록'}</Button>
          {editingId && <Button variant="secondary" onClick={resetForm}>취소</Button>}
          {msg && <span className="mnt-msg">{msg}</span>}
        </div>
      </Card>

      <Card title={`보수 기록 목록 (${filtered.length})`}>
        <div className="mnt-filters">
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value as 'all' | MaintenanceCategory)}>
            <option value="all">전체 구분</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | MaintenanceStatus)}>
            <option value="all">전체 상태</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="search" placeholder="시설명·제목 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        {filtered.length === 0 ? (
          <p className="mnt-empty">기록이 없습니다. 위 폼에서 시설 보수 기록을 등록하세요.</p>
        ) : (
          <div className="mnt-table-wrap">
            <table className="mnt-table">
              <thead>
                <tr>
                  <th>접수일</th>
                  <th>시설명</th>
                  <th>구분</th>
                  <th>문제 제목</th>
                  <th>상태</th>
                  <th>완료일</th>
                  <th>공개</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>{r.reportedAt}</td>
                    <td>{r.facilityName}</td>
                    <td>{r.category}</td>
                    <td>{r.issueTitle}</td>
                    <td>
                      <select
                        className={`mnt-status ${STATUS_CLASS[r.status]}`}
                        value={r.status}
                        onChange={(e) => handleStatusChange(r.id, e.target.value as MaintenanceStatus)}
                      >
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td>{r.completedAt || '-'}</td>
                    <td>{r.isPublicVisible ? '공개' : '-'}</td>
                    <td className="mnt-row-actions">
                      <button type="button" onClick={() => handleEdit(r)}>수정</button>
                      <button type="button" className="danger" onClick={() => handleDelete(r.id)}>삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

export default MaintenanceRecordsPage
