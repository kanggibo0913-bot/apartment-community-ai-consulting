import { useMemo, useState } from 'react'
import {
  CHECKLIST_CATEGORIES,
  CHECKLIST_PRIORITIES,
  CHECKLIST_STATUSES,
  ChecklistCategory,
  ChecklistStatus,
  OpeningChecklistData,
  OpeningChecklistItem,
  SUBCATEGORY_CATEGORIES,
  SUPPLY_PURCHASE_STATUSES,
  SUPPLY_SUBCATEGORIES,
} from '../types/CommunityData'
import Card from '../components/Card'
import Button from '../components/Button'
import './OpeningChecklistPage.css'

interface OpeningChecklistPageProps {
  data: OpeningChecklistData
  onChange: (next: Partial<OpeningChecklistData>) => void
}

const SUPPLY_CATEGORY: ChecklistCategory = '비품'
// subCategory가 비어 있는 항목을 필터/표시할 때 쓰는 라벨
const NO_SUBCATEGORY = '미분류'

// 카테고리별 subCategory 권장값 (폼/필터 옵션). v3부터 subCategory는 비품에서만 사용한다.
const subCategoryOptions = (category: ChecklistCategory): readonly string[] => {
  if (category === SUPPLY_CATEGORY) return SUPPLY_SUBCATEGORIES
  return []
}

const blankDraft = (): OpeningChecklistItem => ({
  id: '',
  category: '계약/행정',
  subCategory: '',
  title: '',
  description: '',
  status: '미확인',
  assignee: '',
  dueDate: '',
  completedAt: '',
  priority: '보통',
  memo: '',
})

// 상태가 '완료'가 되면 completedAt을 현재 시각으로 기록하고, 완료에서 벗어나면 비운다.
const withStatusTimestamp = (item: OpeningChecklistItem, nextStatus: ChecklistStatus): OpeningChecklistItem => {
  if (nextStatus === '완료') {
    return { ...item, status: nextStatus, completedAt: item.completedAt || new Date().toISOString() }
  }
  return { ...item, status: nextStatus, completedAt: '' }
}

// 카테고리에 맞게 항목을 정돈한다.
//  - subCategory는 '비품'에서만 유지하고 그 외 카테고리에서는 비운다.
//  - 비품 전용 수량/구매 필드는 비품이 아닌 카테고리에서 제거해 데이터를 깔끔하게 유지한다.
const normalizeItemForCategory = (item: OpeningChecklistItem): OpeningChecklistItem => {
  const subCategory = SUBCATEGORY_CATEGORIES.includes(item.category) ? (item.subCategory ?? '') : ''
  if (item.category === SUPPLY_CATEGORY) {
    return {
      ...item,
      subCategory,
      quantityNeeded: Number.isFinite(item.quantityNeeded) ? item.quantityNeeded : 0,
      quantityReady: Number.isFinite(item.quantityReady) ? item.quantityReady : 0,
      unit: item.unit ?? '',
      supplier: item.supplier ?? '',
      purchaseStatus: item.purchaseStatus ?? '미구매',
    }
  }
  const { quantityNeeded, quantityReady, unit, supplier, purchaseStatus, ...rest } = item
  void quantityNeeded
  void quantityReady
  void unit
  void supplier
  void purchaseStatus
  return { ...rest, subCategory }
}

const genId = () => `oc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const formatDateTime = (iso: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('ko-KR')
}

const STATUS_CLASS: Record<ChecklistStatus, string> = {
  미확인: 'oc-status-unknown',
  진행중: 'oc-status-progress',
  완료: 'oc-status-done',
  보류: 'oc-status-hold',
  문제발생: 'oc-status-issue',
}
const PRIORITY_CLASS: Record<string, string> = {
  낮음: 'oc-pri-low',
  보통: 'oc-pri-normal',
  높음: 'oc-pri-high',
  필수: 'oc-pri-must',
}

const OpeningChecklistPage: React.FC<OpeningChecklistPageProps> = ({ data, onChange }) => {
  const items = data?.items ?? []

  const [categoryFilter, setCategoryFilter] = useState<'all' | ChecklistCategory>('all')
  const [subCategoryFilter, setSubCategoryFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | ChecklistStatus>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<OpeningChecklistItem>(blankDraft())

  const setItems = (nextItems: OpeningChecklistItem[]) => onChange({ items: nextItems })

  // ─── 진행률 계산 ──────────────────────────────────────────────────────────
  const overall = useMemo(() => {
    const total = items.length
    const done = items.filter((i) => i.status === '완료').length
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 }
  }, [items])

  const perCategory = useMemo(
    () =>
      CHECKLIST_CATEGORIES.map((cat) => {
        const inCat = items.filter((i) => i.category === cat)
        const done = inCat.filter((i) => i.status === '완료').length
        return { category: cat, total: inCat.length, done, pct: inCat.length ? Math.round((done / inCat.length) * 100) : 0 }
      }),
    [items],
  )

  const mustNotDone = useMemo(
    () => items.filter((i) => i.priority === '필수' && i.status !== '완료'),
    [items],
  )

  // subCategory 필터는 카테고리가 '비품'일 때만 노출한다.
  const showSubCategoryFilter =
    categoryFilter !== 'all' && SUBCATEGORY_CATEGORIES.includes(categoryFilter as ChecklistCategory)

  // 현재 선택 카테고리에 실제로 존재하는 subCategory 목록(빈 값은 '미분류'로 묶음).
  const availableSubCategories = useMemo(() => {
    if (!showSubCategoryFilter) return [] as string[]
    const present = new Set<string>()
    for (const i of items) {
      if (i.category !== categoryFilter) continue
      present.add(i.subCategory && i.subCategory.trim() ? i.subCategory : NO_SUBCATEGORY)
    }
    // 권장 순서 우선, 그 외(미분류 등)는 뒤에 정렬해서 붙인다.
    const recommended = subCategoryOptions(categoryFilter as ChecklistCategory).filter((s) => present.has(s))
    const extras = [...present].filter((s) => !recommended.includes(s)).sort()
    return [...recommended, ...extras]
  }, [items, categoryFilter, showSubCategoryFilter])

  // 카테고리 필터를 바꾸면 subCategory 필터는 초기화(다른 카테고리의 값이 남지 않게).
  const changeCategoryFilter = (next: 'all' | ChecklistCategory) => {
    setCategoryFilter(next)
    setSubCategoryFilter('all')
  }

  const filtered = useMemo(
    () =>
      items.filter((i) => {
        if (categoryFilter !== 'all' && i.category !== categoryFilter) return false
        if (statusFilter !== 'all' && i.status !== statusFilter) return false
        if (showSubCategoryFilter && subCategoryFilter !== 'all') {
          const sub = i.subCategory && i.subCategory.trim() ? i.subCategory : NO_SUBCATEGORY
          if (sub !== subCategoryFilter) return false
        }
        return true
      }),
    [items, categoryFilter, statusFilter, subCategoryFilter, showSubCategoryFilter],
  )

  // ─── CRUD ─────────────────────────────────────────────────────────────────
  const openAddForm = () => {
    setEditingId(null)
    setDraft(blankDraft())
    setFormOpen(true)
  }

  const openEditForm = (item: OpeningChecklistItem) => {
    setEditingId(item.id)
    setDraft({ ...item })
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditingId(null)
  }

  const saveDraft = () => {
    if (!draft.title.trim()) {
      window.alert('항목 제목을 입력하세요.')
      return
    }
    const cleaned = normalizeItemForCategory({ ...draft, title: draft.title.trim() })
    if (editingId) {
      setItems(items.map((i) => (i.id === editingId ? { ...cleaned, id: editingId } : i)))
    } else {
      setItems([...items, { ...cleaned, id: genId() }])
    }
    closeForm()
  }

  const deleteItem = (id: string) => {
    const target = items.find((i) => i.id === id)
    if (target && !window.confirm(`"${target.title}" 항목을 삭제할까요?`)) return
    setItems(items.filter((i) => i.id !== id))
  }

  const changeStatus = (id: string, status: ChecklistStatus) => {
    setItems(items.map((i) => (i.id === id ? withStatusTimestamp(i, status) : i)))
  }

  const isSupplyDraft = draft.category === SUPPLY_CATEGORY
  const isSubcatDraft = SUBCATEGORY_CATEGORIES.includes(draft.category)

  return (
    <div className="page oc-page">
      {/* 진행률 요약 */}
      <Card>
        <div className="oc-summary-head">
          <h3 style={{ margin: 0 }}>전체 진행률</h3>
          <span className="oc-summary-count">
            {overall.done} / {overall.total} 완료 ({overall.pct}%)
          </span>
        </div>
        <div className="oc-progress oc-progress-lg">
          <div className="oc-progress-fill" style={{ width: `${overall.pct}%` }} />
        </div>

        <div className="oc-cat-progress-grid">
          {perCategory.map((c) => (
            <div key={c.category} className="oc-cat-progress">
              <div className="oc-cat-progress-label">
                <span>{c.category}</span>
                <span>
                  {c.done}/{c.total} ({c.pct}%)
                </span>
              </div>
              <div className="oc-progress">
                <div className="oc-progress-fill" style={{ width: `${c.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 필수 미완료 항목 */}
      {mustNotDone.length > 0 && (
        <Card>
          <h3 className="oc-must-title">⚠️ 필수 항목 중 미완료 {mustNotDone.length}건</h3>
          <ul className="oc-must-list">
            {mustNotDone.map((i) => (
              <li key={i.id}>
                <span className={`oc-badge ${PRIORITY_CLASS[i.priority]}`}>{i.priority}</span>
                <span className="oc-must-cat">[{i.category}]</span>
                <span className="oc-must-name">{i.title}</span>
                <span className={`oc-badge ${STATUS_CLASS[i.status]}`}>{i.status}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 필터 + 추가 */}
      <Card>
        <div className="oc-toolbar">
          <div className="oc-filter-group">
            <span className="oc-filter-label">카테고리</span>
            <div className="oc-chip-row">
              <button className={`oc-chip ${categoryFilter === 'all' ? 'on' : ''}`} onClick={() => changeCategoryFilter('all')}>
                전체
              </button>
              {CHECKLIST_CATEGORIES.map((c) => (
                <button key={c} className={`oc-chip ${categoryFilter === c ? 'on' : ''}`} onClick={() => changeCategoryFilter(c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          {showSubCategoryFilter && (
            <div className="oc-filter-group">
              <span className="oc-filter-label">세부 분류</span>
              <select value={subCategoryFilter} onChange={(e) => setSubCategoryFilter(e.target.value)}>
                <option value="all">전체</option>
                {availableSubCategories.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="oc-filter-group">
            <span className="oc-filter-label">상태</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | ChecklistStatus)}>
              <option value="all">전체</option>
              {CHECKLIST_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="oc-toolbar-spacer" />
          <Button className="btn-primary" onClick={openAddForm}>
            + 항목 추가
          </Button>
        </div>

        {/* 추가/수정 폼 */}
        {formOpen && (
          <div className="oc-form">
            <h4 style={{ margin: '0 0 10px' }}>{editingId ? '항목 수정' : '새 항목 추가'}</h4>
            <div className="oc-form-grid">
              <label>
                카테고리
                <select
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({ ...draft, category: e.target.value as ChecklistCategory, subCategory: '' })
                  }
                >
                  {CHECKLIST_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              {isSubcatDraft && (
                <label>
                  세부 분류
                  <select value={draft.subCategory ?? ''} onChange={(e) => setDraft({ ...draft, subCategory: e.target.value })}>
                    <option value="">(미분류)</option>
                    {subCategoryOptions(draft.category).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                우선순위
                <select
                  value={draft.priority}
                  onChange={(e) => setDraft({ ...draft, priority: e.target.value as OpeningChecklistItem['priority'] })}
                >
                  {CHECKLIST_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="oc-form-wide">
                제목
                <input type="text" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="예: 위탁운영 계약서 체결 확인" />
              </label>
              <label>
                상태
                <select value={draft.status} onChange={(e) => setDraft(withStatusTimestamp(draft, e.target.value as ChecklistStatus))}>
                  {CHECKLIST_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                담당자
                <input type="text" value={draft.assignee} onChange={(e) => setDraft({ ...draft, assignee: e.target.value })} placeholder="담당자명" />
              </label>
              <label>
                목표일
                <input type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} />
              </label>
              <label className="oc-form-wide">
                설명
                <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={2} placeholder="항목 설명(선택)" />
              </label>
              <label className="oc-form-wide">
                메모
                <textarea value={draft.memo} onChange={(e) => setDraft({ ...draft, memo: e.target.value })} rows={2} placeholder="메모(선택)" />
              </label>

              {/* 비품 전용 필드 */}
              {isSupplyDraft && (
                <>
                  <label>
                    필요 수량
                    <input
                      type="number"
                      min={0}
                      value={draft.quantityNeeded ?? 0}
                      onChange={(e) => setDraft({ ...draft, quantityNeeded: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                    />
                  </label>
                  <label>
                    준비 수량
                    <input
                      type="number"
                      min={0}
                      value={draft.quantityReady ?? 0}
                      onChange={(e) => setDraft({ ...draft, quantityReady: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                    />
                  </label>
                  <label>
                    단위
                    <input type="text" value={draft.unit ?? ''} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} placeholder="예: 개, 장, 세트" />
                  </label>
                  <label>
                    공급처
                    <input type="text" value={draft.supplier ?? ''} onChange={(e) => setDraft({ ...draft, supplier: e.target.value })} placeholder="공급처(선택)" />
                  </label>
                  <label>
                    구매 상태
                    <select
                      value={draft.purchaseStatus ?? '미구매'}
                      onChange={(e) => setDraft({ ...draft, purchaseStatus: e.target.value as OpeningChecklistItem['purchaseStatus'] })}
                    >
                      {SUPPLY_PURCHASE_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
            <div className="oc-form-actions">
              <Button className="btn-primary" onClick={saveDraft}>
                {editingId ? '수정 저장' : '추가'}
              </Button>
              <Button className="btn-secondary" onClick={closeForm}>
                취소
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* 항목 목록 */}
      <Card>
        <div className="oc-list-head">
          <h3 style={{ margin: 0 }}>체크 항목 ({filtered.length})</h3>
          {/* TODO(사진 업로드): 항목별 현장 사진 첨부 기능 — 이번 범위 제외 */}
          {/* TODO(AI 요약): 체크리스트 진행 상황 AI 요약 — 이번 범위 제외 */}
        </div>

        {filtered.length === 0 ? (
          <p className="oc-empty">조건에 맞는 항목이 없습니다.</p>
        ) : (
          <ul className="oc-item-list">
            {filtered.map((item) => {
              const isSupply = item.category === SUPPLY_CATEGORY
              const shortNeeded = (item.quantityReady ?? 0) < (item.quantityNeeded ?? 0)
              return (
                <li key={item.id} className="oc-item">
                  <div className="oc-item-main">
                    <div className="oc-item-top">
                      <span className={`oc-badge ${PRIORITY_CLASS[item.priority]}`}>{item.priority}</span>
                      <span className="oc-item-cat">{item.category}</span>
                      {item.subCategory && <span className="oc-badge oc-subcat-badge">{item.subCategory}</span>}
                      <span className="oc-item-title">{item.title}</span>
                    </div>
                    {item.description && <p className="oc-item-desc">{item.description}</p>}
                    <div className="oc-item-meta">
                      {item.assignee && <span>담당: {item.assignee}</span>}
                      {item.dueDate && <span>목표일: {item.dueDate}</span>}
                      {item.completedAt && <span>완료: {formatDateTime(item.completedAt)}</span>}
                    </div>
                    {isSupply && (
                      <div className={`oc-supply ${shortNeeded ? 'short' : 'ok'}`}>
                        준비 {item.quantityReady ?? 0} / 필요 {item.quantityNeeded ?? 0} {item.unit ?? ''}
                        {shortNeeded ? ' · 부족' : ' · 충족'}
                        <span className="oc-supply-purchase">{item.purchaseStatus ?? '미구매'}</span>
                        {item.supplier && <span className="oc-supply-vendor">공급처: {item.supplier}</span>}
                      </div>
                    )}
                    {item.memo && <p className="oc-item-memo">📝 {item.memo}</p>}
                  </div>
                  <div className="oc-item-side">
                    <select
                      className={`oc-status-select ${STATUS_CLASS[item.status]}`}
                      value={item.status}
                      onChange={(e) => changeStatus(item.id, e.target.value as ChecklistStatus)}
                    >
                      {CHECKLIST_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <div className="oc-item-buttons">
                      <button type="button" onClick={() => openEditForm(item)}>
                        수정
                      </button>
                      <button type="button" className="oc-delete" onClick={() => deleteItem(item.id)}>
                        삭제
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}

export default OpeningChecklistPage
