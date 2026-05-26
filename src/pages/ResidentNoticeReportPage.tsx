import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import Button from '../components/Button'
import './ResidentNoticeReportPage.css'

type NoticeStatus = 'draft' | 'published'

// 입주민 안내 보고서. 입주민에게 공개 가능한 내용만 담는다.
// 매출/수익/인건비/원가/계약금액/민원 개인정보/동호수/연락처/내부 메모는 입력·출력 대상이 아니다.
// 추후 공개 보고서(PublishedReport) 발행 기능으로 전환하기 쉽도록 필드명을 유사하게 둔다.
export interface ResidentNoticeReport {
  id: string
  apartmentName: string
  reportMonth: string
  title: string
  summary: string
  operationNotice: string
  complaintSummary: string
  maintenanceSummary: string
  completedImprovements: string
  ongoingImprovements: string
  residentNotices: string
  contactInfo: string
  status: NoticeStatus
  createdAt: string
  updatedAt: string
}

const STORAGE_KEY = 'residentNoticeReports'

// 본문 섹션 정의 (폼/미리보기 공용)
const SECTIONS: Array<{ key: keyof FormState; label: string }> = [
  { key: 'summary', label: '이번 달 주요 안내' },
  { key: 'operationNotice', label: '운영 안내' },
  { key: 'complaintSummary', label: '민원 처리 요약' },
  { key: 'maintenanceSummary', label: '시설 보수 요약' },
  { key: 'completedImprovements', label: '개선 완료 사항' },
  { key: 'ongoingImprovements', label: '진행 중 조치' },
  { key: 'residentNotices', label: '이용자 협조 요청' },
  { key: 'contactInfo', label: '문의 안내' },
]

const loadReports = (): ResidentNoticeReport[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ResidentNoticeReport[]) : []
  } catch {
    return []
  }
}

const emptyForm = {
  apartmentName: '',
  reportMonth: new Date().toISOString().slice(0, 7),
  title: '',
  summary: '',
  operationNotice: '',
  complaintSummary: '',
  maintenanceSummary: '',
  completedImprovements: '',
  ongoingImprovements: '',
  residentNotices: '',
  contactInfo: '',
  status: 'draft' as NoticeStatus,
}

type FormState = typeof emptyForm

const ResidentNoticeReportPage: React.FC = () => {
  const [reports, setReports] = useState<ResidentNoticeReport[]>(loadReports)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | NoticeStatus>('all')
  const [query, setQuery] = useState('')
  const [preview, setPreview] = useState<ResidentNoticeReport | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reports))
  }, [reports])

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const resetForm = () => {
    setForm({ ...emptyForm, reportMonth: new Date().toISOString().slice(0, 7) })
    setEditingId(null)
  }

  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(''), 2500)
  }

  const handleSave = (status: NoticeStatus) => {
    if (!form.title.trim()) {
      flash('제목은 필수입니다.')
      return
    }
    const now = new Date().toISOString()
    if (editingId) {
      setReports((prev) =>
        prev.map((r) => (r.id === editingId ? { ...r, ...form, status, updatedAt: now } : r)),
      )
      flash(status === 'published' ? '발행 완료로 저장되었습니다.' : '임시저장되었습니다.')
    } else {
      const rec: ResidentNoticeReport = {
        id: 'rnr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        ...form,
        status,
        createdAt: now,
        updatedAt: now,
      }
      setReports((prev) => [rec, ...prev])
      flash(status === 'published' ? '발행 완료로 저장되었습니다.' : '임시저장되었습니다.')
    }
    resetForm()
  }

  const handleEdit = (r: ResidentNoticeReport) => {
    setEditingId(r.id)
    setForm({
      apartmentName: r.apartmentName,
      reportMonth: r.reportMonth,
      title: r.title,
      summary: r.summary,
      operationNotice: r.operationNotice,
      complaintSummary: r.complaintSummary,
      maintenanceSummary: r.maintenanceSummary,
      completedImprovements: r.completedImprovements,
      ongoingImprovements: r.ongoingImprovements,
      residentNotices: r.residentNotices,
      contactInfo: r.contactInfo,
      status: r.status,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = (id: string) => {
    if (!window.confirm('이 입주민 안내 보고서를 삭제하시겠습니까?')) return
    setReports((prev) => prev.filter((r) => r.id !== id))
    if (editingId === id) resetForm()
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return reports
      .filter((r) => statusFilter === 'all' || r.status === statusFilter)
      .filter((r) => !q || r.title.toLowerCase().includes(q) || r.apartmentName.toLowerCase().includes(q) || r.summary.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
  }, [reports, statusFilter, query])

  return (
    <div className="page rnr-page">
      <PageHeader
        title="입주민 안내 보고서"
        description="입주민에게 공개할 월간 안내문/운영 안내 보고서를 직접 작성하고 관리합니다. (민감 정보는 입력하지 마세요)"
      />

      <Card title={editingId ? '안내 보고서 수정' : '새 안내 보고서 작성'}>
        <div className="form-row">
          <div className="form-group">
            <label>단지명</label>
            <input type="text" value={form.apartmentName} onChange={(e) => update('apartmentName', e.target.value)} />
          </div>
          <div className="form-group">
            <label>보고월</label>
            <input type="month" value={form.reportMonth} onChange={(e) => update('reportMonth', e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label>제목 *</label>
          <input type="text" value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="예: 5월 커뮤니티센터 운영 안내" />
        </div>

        {SECTIONS.map((s) => (
          <div className="form-group" key={s.key}>
            <label>{s.label}</label>
            <textarea value={form[s.key] as string} onChange={(e) => update(s.key, e.target.value as FormState[typeof s.key])} rows={2} />
          </div>
        ))}

        <div className="page-actions">
          <Button variant="secondary" onClick={() => handleSave('draft')}>임시저장</Button>
          <Button variant="primary" onClick={() => handleSave('published')}>발행 완료로 저장</Button>
          {editingId && <Button variant="secondary" onClick={resetForm}>취소</Button>}
          {msg && <span className="rnr-msg">{msg}</span>}
        </div>
      </Card>

      <Card title={`안내 보고서 목록 (${filtered.length})`}>
        <div className="rnr-filters">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | NoticeStatus)}>
            <option value="all">전체 상태</option>
            <option value="draft">임시저장</option>
            <option value="published">발행완료</option>
          </select>
          <input type="search" placeholder="제목·단지명 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        {filtered.length === 0 ? (
          <p className="rnr-empty">작성된 안내 보고서가 없습니다. 위 폼에서 새 보고서를 작성하세요.</p>
        ) : (
          <div className="rnr-table-wrap">
            <table className="rnr-table">
              <thead>
                <tr>
                  <th>보고월</th>
                  <th>단지명</th>
                  <th>제목</th>
                  <th>상태</th>
                  <th>수정일</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>{r.reportMonth}</td>
                    <td>{r.apartmentName || '-'}</td>
                    <td>{r.title}</td>
                    <td>
                      <span className={`rnr-status ${r.status === 'published' ? 'rnr-published' : 'rnr-draft'}`}>
                        {r.status === 'published' ? '발행완료' : '임시저장'}
                      </span>
                    </td>
                    <td>{new Date(r.updatedAt).toLocaleString('ko-KR')}</td>
                    <td className="rnr-row-actions">
                      <button type="button" onClick={() => setPreview(r)}>보기</button>
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

      {preview && (
        <div className="rnr-modal-backdrop" onClick={() => setPreview(null)}>
          <div className="rnr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rnr-modal-head">
              <div>
                <span className={`rnr-status ${preview.status === 'published' ? 'rnr-published' : 'rnr-draft'}`}>
                  {preview.status === 'published' ? '발행완료' : '임시저장'}
                </span>
                <h3>{preview.title}</h3>
                <div className="rnr-modal-meta">
                  {preview.apartmentName && <span>{preview.apartmentName}</span>}
                  {preview.reportMonth && <span>보고월 {preview.reportMonth}</span>}
                </div>
              </div>
              <button type="button" className="rnr-modal-close" onClick={() => setPreview(null)} aria-label="닫기">✕</button>
            </div>
            <div className="rnr-modal-body">
              {SECTIONS.filter((s) => (preview[s.key as keyof ResidentNoticeReport] as string)?.trim()).map((s) => (
                <section key={s.key}>
                  <h4>{s.label}</h4>
                  <p>{preview[s.key as keyof ResidentNoticeReport] as string}</p>
                </section>
              ))}
              {SECTIONS.every((s) => !(preview[s.key as keyof ResidentNoticeReport] as string)?.trim()) && (
                <p className="rnr-empty">작성된 본문 내용이 없습니다.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ResidentNoticeReportPage
