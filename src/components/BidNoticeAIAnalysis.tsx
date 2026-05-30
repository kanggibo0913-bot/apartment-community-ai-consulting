import { useEffect, useMemo, useRef, useState } from 'react'
import Card from './Card'
import Button from './Button'
import AIResultPanel from './AIResultPanel'
import { callAI } from '../utils/aiClient'
import {
  BidAnalysisDraft,
  BidAnalysisParsed,
  GRADE_LABEL,
  buildBidAnalysisDraft,
  categorizeRisk,
  parseBidAnalysis,
  toDateInput,
} from '../utils/parseBidAnalysis'
import { formatNumber } from '../utils/formatUtils'
import './BidNoticeAIAnalysis.css'

interface BidForm {
  siteName: string
  noticeText: string
  siteVisitDate: string
  deadlineDate: string
  contractPeriod: string
  biddingMethod: string
  specialConditions: string
}

const emptyForm: BidForm = {
  siteName: '',
  noticeText: '',
  siteVisitDate: '',
  deadlineDate: '',
  contractPeriod: '',
  biddingMethod: '',
  specialConditions: '',
}

const DEFAULT_DOCS = [
  '사업자등록증',
  '법인등기부등본',
  '법인인감증명서',
  '사용인감계',
  '국세 완납증명서',
  '지방세 완납증명서',
  '실적증명서',
  '운영계획서',
  '산출내역서',
  '입찰보증금 관련 서류',
]

const CHECKLIST_KEY = 'bidNoticeChecklist'

const loadChecklist = (): Record<string, boolean> => {
  try {
    return JSON.parse(window.localStorage.getItem(CHECKLIST_KEY) || '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

// 공고문 파일 업로드 관련 상수
const UPLOAD_MAX_BYTES = 10 * 1024 * 1024 // 10MB
type UploadKind = 'text' | 'csv' | 'xlsx' | 'pdf' | 'image' | 'hwp' | 'unsupported'
const UPLOAD_ACCEPT = '.txt,.csv,.pdf,.xlsx,.jpg,.jpeg,.png,.webp,.hwp'

// 확장자/MIME으로부터 처리 분류 결정. HWP는 명시적으로 안내만 제공.
const decideKind = (file: File): UploadKind => {
  const name = file.name.toLowerCase()
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''
  if (ext === 'txt') return 'text'
  if (ext === 'csv') return 'csv'
  if (ext === 'xlsx') return 'xlsx'
  if (ext === 'pdf') return 'pdf'
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'image'
  if (ext === 'hwp' || ext === 'hwpx') return 'hwp'
  // MIME fallback
  if (file.type.startsWith('text/')) return 'text'
  if (file.type === 'application/pdf') return 'pdf'
  if (file.type.startsWith('image/')) return 'image'
  return 'unsupported'
}

// 파일 크기를 사람이 읽기 쉽게 변환
const formatBytes = (n: number) => {
  if (!Number.isFinite(n) || n < 0) return '-'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

// 텍스트 파일을 UTF-8로 읽어 문자열 반환.
const readTextAsUtf8 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      resolve(typeof result === 'string' ? result : '')
    }
    reader.onerror = () => reject(reader.error || new Error('파일을 읽지 못했습니다.'))
    reader.readAsText(file, 'utf-8')
  })

// 이미지 미리보기 URL 생성. 호출자가 revokeObjectURL을 책임진다.
const createImagePreview = (file: File): string => URL.createObjectURL(file)

type UploadStatus = 'idle' | 'extracting' | 'done' | 'error'

const UPLOAD_HELPER_NOTE =
  '추출된 내용은 자동 분석 전 반드시 확인해주세요. 표·금액·시간·세대수는 원본과 다를 수 있으므로 수정 후 분석하는 것을 권장합니다.'

interface BidNoticeAIAnalysisProps {
  // 버튼1: 분석 결과를 공고 등록 폼에 반영. noticeText가 함께 전달되면 form.fullText도 채운다.
  // AI 분석 탭에서 "직접 공고 등록"은 더 이상 지원하지 않는다 (혼선 방지).
  // 실제 공고 등록은 반드시 "공고 등록·관리" 탭에서 사용자가 확인 후 진행한다.
  onApplyToForm?: (parsed: BidAnalysisParsed, overwrite: boolean, noticeText?: string) => void
  // 버튼2: 주요 일정만 캘린더에 추가 (공고 등록 없이 일정만 보고 싶은 흐름)
  onAddScheduleEvents?: (parsed: BidAnalysisParsed) => { added: number; duplicate: boolean }
  // 일정 등록 직후 입찰 스케줄러 탭으로 이동
  onJumpToScheduler?: () => void
  // 분석 완료 직후 공고 등록·관리 탭으로 이동
  onJumpToList?: () => void
}

const BidNoticeAIAnalysis: React.FC<BidNoticeAIAnalysisProps> = ({
  onApplyToForm,
  onAddScheduleEvents,
  onJumpToScheduler,
  onJumpToList,
}) => {
  const [form, setForm] = useState<BidForm>(emptyForm)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  const [checklist, setChecklist] = useState<Record<string, boolean>>(loadChecklist)
  const [applyMsg, setApplyMsg] = useState('')
  const [actionMsg, setActionMsg] = useState('')

  // 공고문 파일 업로드 상태 (이번 단계는 메모리에서만 처리, localStorage 미저장)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [uploadKind, setUploadKind] = useState<UploadKind>('unsupported')
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle')
  const [uploadError, setUploadError] = useState('')
  const [uploadWarning, setUploadWarning] = useState('')
  const [uploadSuccess, setUploadSuccess] = useState('')
  const [extractedText, setExtractedText] = useState('')
  const [imagePreviewUrl, setImagePreviewUrl] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  // dragenter/dragleave는 자식 요소 위로 마우스가 이동할 때마다 재발화되므로 카운터로 안정화.
  const dragCounterRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // 이미지 ObjectURL 정리
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    }
  }, [imagePreviewUrl])

  // 동일 파일 재선택 허용을 위해 input value 초기화 + 상태 리셋
  const resetUploadState = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    setUploadedFile(null)
    setUploadKind('unsupported')
    setUploadStatus('idle')
    setUploadError('')
    setUploadWarning('')
    setUploadSuccess('')
    setExtractedText('')
    setImagePreviewUrl('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // 파일 입력(<input type=file> 또는 드롭)에서 받은 파일 1건을 동일한 흐름으로 처리한다.
  // 다중 파일이 들어와도 호출자가 첫 번째 파일만 넘겨주는 것을 전제로 한다.
  const processFile = async (file: File) => {
    // 새 선택 시 직전 미리보기/상태 정리
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    setUploadError('')
    // multi-drop 안내 등은 호출자가 미리 설정해 둘 수 있으므로 warning은 비우지 않는다.
    setUploadSuccess('')
    setExtractedText('')
    setImagePreviewUrl('')

    // 용량 제한
    if (file.size === 0) {
      setUploadedFile(file)
      setUploadKind('unsupported')
      setUploadStatus('error')
      setUploadError('파일 내용이 비어 있습니다.')
      return
    }
    if (file.size > UPLOAD_MAX_BYTES) {
      setUploadedFile(file)
      setUploadKind('unsupported')
      setUploadStatus('error')
      setUploadError(`파일 용량이 너무 큽니다. (최대 ${formatBytes(UPLOAD_MAX_BYTES)})`)
      return
    }

    const kind = decideKind(file)
    setUploadedFile(file)
    setUploadKind(kind)

    if (kind === 'unsupported') {
      setUploadStatus('error')
      setUploadError('지원하지 않는 파일 형식입니다. (지원: TXT, CSV, PDF, XLSX, JPG, JPEG, PNG, WEBP)')
      return
    }

    if (kind === 'hwp') {
      setUploadStatus('idle')
      setUploadWarning('현재 HWP는 직접 텍스트 복사/붙여넣기를 권장합니다.')
      return
    }

    if (kind === 'image') {
      // 이미지 미리보기 + 안내
      try {
        const url = createImagePreview(file)
        setImagePreviewUrl(url)
        setUploadStatus('done')
        setUploadWarning(
          '이미지 공고문은 OCR 인식이 필요합니다. 이번 단계에서는 이미지 미리보기만 제공되며, 텍스트는 직접 입력하거나 다음 OCR 단계에서 처리됩니다.',
        )
      } catch {
        setUploadStatus('error')
        setUploadError('이미지 미리보기를 만들지 못했습니다.')
      }
      return
    }

    if (kind === 'pdf') {
      setUploadStatus('idle')
      setUploadWarning(
        'PDF 텍스트 자동 추출은 다음 단계에서 지원 예정입니다. 현재는 PDF 내용을 복사해 붙여넣어 주세요.',
      )
      return
    }

    if (kind === 'xlsx') {
      setUploadStatus('idle')
      setUploadWarning(
        'XLSX 자동 추출은 다음 단계에서 지원 예정입니다. 현재는 엑셀 내용을 복사해 붙여넣어 주세요.',
      )
      return
    }

    // TXT/CSV 추출 시도
    setUploadStatus('extracting')
    try {
      const text = await readTextAsUtf8(file)
      const trimmed = text.replace(/ /g, '') // 널 문자 제거 (이상 인코딩 방어)
      if (!trimmed.trim()) {
        setUploadStatus('error')
        setUploadError('파일에서 텍스트를 추출하지 못했습니다. 직접 복사해 붙여넣어 주세요.')
        return
      }
      setExtractedText(trimmed)
      setUploadStatus('done')
    } catch (err) {
      setUploadStatus('error')
      setUploadError(
        '파일 읽기에 실패했습니다. ' + (err instanceof Error ? err.message : String(err)),
      )
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // input value를 즉시 비워두면 같은 파일을 다시 선택해도 onChange가 다시 발화함
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (!file) return
    setUploadWarning('') // 직접 선택 시에는 multi-drop 안내가 없으므로 초기화
    void processFile(file)
  }

  // 드래그앤드롭 핸들러. dragenter/dragleave는 자식 요소 사이를 오갈 때마다 발생하므로
  // 카운터로 안정화해 깜빡임을 방지한다.
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types?.includes('Files')) {
      dragCounterRef.current += 1
      if (dragCounterRef.current > 0) setIsDragging(true)
    }
  }
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    // dragover에서 preventDefault를 호출해야 drop 이벤트가 발화됨.
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
    if (dragCounterRef.current === 0) setIsDragging(false)
  }
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragging(false)
    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return
    // 다중 파일은 첫 번째만 처리. 사용자가 인지할 수 있도록 안내 메시지 표시.
    if (files.length > 1) {
      setUploadWarning('1개 파일만 업로드할 수 있습니다. 첫 번째 파일만 처리했습니다.')
    } else {
      setUploadWarning('')
    }
    // input.value도 함께 초기화해 두면 직후 같은 파일을 다시 input으로 선택해도 동작.
    if (fileInputRef.current) fileInputRef.current.value = ''
    void processFile(files[0])
  }

  // 추출 텍스트를 분석 입력값(noticeText)에 반영.
  const handleApplyExtractedToAnalysis = () => {
    if (!extractedText.trim()) {
      setUploadError('미리보기 내용이 비어 있습니다.')
      return
    }
    setForm((prev) => ({ ...prev, noticeText: extractedText }))
    setUploadSuccess('분석 입력값에 반영되었습니다. 아래 "AI 공고문 분석" 버튼을 눌러 분석을 진행하세요.')
    setUploadError('')
    // 분석 textarea로 부드럽게 스크롤
    setTimeout(() => {
      const textarea = document.querySelector<HTMLTextAreaElement>('textarea[data-role="bid-notice-input"]')
      if (textarea) {
        textarea.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 50)
  }

  // draft는 single source of truth. analyze() 또는 onLoadSaved에서 한 번 빌드해
  // 화면 기본정보/구조화 결과 / 공고 등록 폼 / 스케줄러 후보 / ScheduleEvent 저장 모두에 같은 객체를 사용.
  const [draft, setDraft] = useState<BidAnalysisDraft | null>(null)
  // draft → BidAnalysisParsed 변환 헬퍼. draft가 source이므로 두 형태가 결코 어긋날 수 없게 한 자리에서 매핑.
  const draftToParsed = (d: BidAnalysisDraft): BidAnalysisParsed => ({
    summary: d.memo.split('\n')[0]?.replace(/^\[AI 분석\]\s*/, '') || '',
    complexName: d.apartmentName,
    region: d.region,
    bidMethod: d.bidMethod,
    managementOfficePhone: d.managementOfficePhone,
    households: d.households,
    siteBriefingDate: d.siteBriefingDate,
    siteBriefingTime: d.siteBriefingTime,
    siteBriefingStatus: d.siteBriefingStatus,
    siteBriefingNote: d.siteBriefingNote,
    bidDeadline: d.bidDeadlineDate,
    bidDeadlineTime: d.bidDeadlineTime,
    openingDate: d.openingDate,
    openingTime: d.openingTime,
    documentSubmissionDate: '',
    documentSubmissionTime: '',
    ptDate: d.ptDate,
    ptTime: d.ptTime,
    contractPeriod: d.contractPeriod,
    businessPresentationDate: d.businessPresentationDate,
    businessPresentationTime: d.businessPresentationTime,
    businessPresentationLocation: '',
    requiredDocuments: d.requiredDocuments,
    specialConditions: d.specialConditions,
    risks: d.risks,
    estimateNotes: d.estimateNotes,
    siteBriefingQuestions: [],
    participationGrade: d.participationGrade,
    participationReason: d.participationReason,
    recommendedAction: d.recommendedAction,
    scheduleEvents: d.scheduleEvents,
  })
  // 화면 표시·후보 생성에 그대로 쓸 parsed (draft에서 파생). draft가 source인 점만 다름.
  const parsed: BidAnalysisParsed | null = useMemo(
    () => (draft ? draftToParsed(draft) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft],
  )

  // 버튼3(일정만 추가)에 표시할 마일스톤 후보.
  // 1순위: AI가 반환한 scheduleEvents[] (시간 포함). 2순위: 단일 키 fallback.
  // 계약 시작/종료는 스케줄러 대상이 아니므로 후보 표시 단계에서도 제외한다.
  // individualVisit/unknown 상태는 날짜가 없을 수 있지만 화면 후보에는 유지(자동 등록은 비활성화).
  const scheduleCandidates = useMemo(() => {
    if (!parsed) return [] as { label: string; value: string; disabledReason?: string }[]
    const fmt = (raw: string) => {
      const d = toDateInput(raw)
      return d || (raw ? `날짜 확인 필요 (원문: ${raw})` : '')
    }
    const isContractLike = (ev: { eventType?: string; eventTypeLabel?: string }) => {
      const t = (ev.eventType || '').toLowerCase()
      const l = ev.eventTypeLabel || ''
      if (t === 'contract' || t === 'contractstart' || t === 'contractend') return true
      return /(계약|운영(시작|종료)|operation)/i.test(l)
    }
    const out: { label: string; value: string; disabledReason?: string }[] = []

    // 후보 표시용 관리소 전화번호: 후보가 전화번호를 가지고 있으면 우선 사용, 없으면 단지 전체 전화번호로 폴백.
    const topPhone = parsed.managementOfficePhone || ''
    const phoneSuffix = (phone?: string) => {
      const p = (phone || topPhone || '').trim()
      return p ? ` / 관리소 ${p}` : ' / 관리소 전화번호 확인 필요'
    }

    // 1) 현장확인/개별방문 또는 현장확인 여부 미확정은 날짜가 없어도 후보로 노출한다.
    //    자동 등록 대신 "일자 수동 입력 필요" 안내를 붙인다.
    if (parsed.siteBriefingStatus === 'individualVisit') {
      out.push({
        label: '현장확인/개별방문',
        value: '일자 수동 입력 필요' + phoneSuffix(),
        disabledReason: '단체 현장설명회 없음 / 개별 방문 일자를 직접 등록해주세요.',
      })
    } else if (parsed.siteBriefingStatus === 'unknown') {
      out.push({
        label: '현장확인 여부',
        value: '확인 필요 / 일자 수동 입력' + phoneSuffix(),
        disabledReason: '공고문에 현장설명회 미개최만 언급되어 있음. 현장확인 일자를 직접 등록해주세요.',
      })
    }

    if (parsed.scheduleEvents.length > 0) {
      parsed.scheduleEvents
        .filter((ev) => !isContractLike(ev))
        .forEach((ev) => {
          const parts: string[] = []
          if (ev.time) parts.push(ev.time)
          if (ev.location) parts.push(ev.location)
          const valueBase = ev.date
          const head =
            parts.length > 0 ? `${valueBase} (${parts.join(' · ')})` : `${valueBase}${ev.time ? '' : ' · 시간 미정'}`
          out.push({
            label: ev.eventTypeLabel || ev.eventType,
            value: head + phoneSuffix(ev.managementOfficePhone),
          })
        })
      return out
    }

    // 2) Fallback: 단일 키 응답
    if (parsed.siteBriefingDate && parsed.siteBriefingStatus !== 'individualVisit') {
      out.push({ label: '현장설명회', value: fmt(parsed.siteBriefingDate) + phoneSuffix() })
    }
    if (parsed.bidDeadline) out.push({ label: '입찰마감', value: fmt(parsed.bidDeadline) + phoneSuffix() })
    if (parsed.businessPresentationDate) {
      const extras: string[] = []
      if (parsed.businessPresentationTime) extras.push(parsed.businessPresentationTime)
      if (parsed.businessPresentationLocation) extras.push(parsed.businessPresentationLocation)
      const base = fmt(parsed.businessPresentationDate)
      out.push({
        label: '사업설명회/PT',
        value: (extras.length > 0 ? `${base} (${extras.join(' · ')})` : base) + phoneSuffix(),
      })
    }
    return out
  }, [parsed])

  const handleAddScheduleOnly = () => {
    if (!parsed || !onAddScheduleEvents) return
    const res = onAddScheduleEvents(parsed)
    if (res.added > 0) {
      setActionMsg(res.duplicate ? '주요 일정이 스케줄러에 추가되었습니다. (중복 일정은 제외)' : '주요 일정이 스케줄러에 추가되었습니다.')
    } else if (res.duplicate) {
      setActionMsg('이미 등록된 공고 또는 일정은 제외했습니다.')
    } else {
      setActionMsg('추가 가능한 일정이 없습니다. (날짜 확인 필요)')
    }
    setTimeout(() => setActionMsg(''), 6000)
  }

  const update = (key: keyof BidForm, value: string) => setForm(prev => ({ ...prev, [key]: value }))

  const analyze = async () => {
    if (!form.noticeText.trim()) {
      setError('분석할 공고문 내용을 입력(붙여넣기)해주세요.')
      return
    }
    setLoading(true)
    setError('')
    setApplyMsg('')
    try {
      const res = await callAI('bidNoticeAnalysis', form)
      if (res.ok) {
        const text = (res.result || '').trim()
        if (!text) {
          setError('AI가 빈 응답을 반환했습니다. 잠시 후 다시 시도해주세요.')
        } else {
          setResult(text)
          // 분석 완료 직후: AI 응답을 한 번 파싱 → noticeText 기반 gap-fill을 포함해 정규화된 draft 1개 생성.
          // 이 draft가 화면 기본정보·구조화 결과·공고 등록 폼·스케줄러 후보·등록 모두의 source of truth.
          // 절대 noticeText를 다시 parseBidAnalysis하지 않는다(원본 텍스트 재파싱 금지 정책).
          const parsedRaw = parseBidAnalysis(text)
          const newDraft = parsedRaw ? buildBidAnalysisDraft(parsedRaw, form.noticeText) : null
          setDraft(newDraft)
          // 동일 draft에서 도출된 parsed를 폼 반영에 전달.
          if (newDraft && onApplyToForm) {
            try {
              // 신규 draft를 그 자리에서 parsed로 변환해 폼 핸들러에 전달(state 비동기 지연 방지).
              onApplyToForm(draftToParsed(newDraft), false, form.noticeText)
              setApplyMsg('AI 분석 결과가 공고 등록 폼에 반영되었습니다. 공고 등록·관리 탭에서 확인 후 등록하세요.')
              setTimeout(() => setApplyMsg(''), 9000)
            } catch {
              // applyForm 실패는 분석 결과 자체에는 영향 없음
            }
          }
        }
      } else {
        setError(res.error || 'AI 응답 생성 중 알 수 없는 오류가 발생했습니다.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const toggleDoc = (doc: string) => {
    setChecklist(prev => {
      const next = { ...prev, [doc]: !prev[doc] }
      window.localStorage.setItem(CHECKLIST_KEY, JSON.stringify(next))
      return next
    })
  }

  const handleApply = (overwrite: boolean) => {
    if (!parsed || !onApplyToForm) return
    onApplyToForm(parsed, overwrite, form.noticeText)
    setApplyMsg(
      overwrite
        ? '공고 등록 폼을 분석 결과로 덮어썼습니다. 공고 등록·관리 탭에서 값을 확인하고 "공고 등록"을 누르면 스케줄러에도 반영됩니다.'
        : '비어 있는 공고 정보 항목을 분석 결과로 채웠습니다. 공고 등록·관리 탭에서 값을 확인하고 "공고 등록"을 누르면 스케줄러에도 반영됩니다.',
    )
    setTimeout(() => setApplyMsg(''), 6000)
  }

  const docs = parsed && parsed.requiredDocuments.length > 0 ? parsed.requiredDocuments : DEFAULT_DOCS
  const gradeKey = parsed && /^[ABCD]$/.test(parsed.participationGrade) ? parsed.participationGrade : ''

  return (
    <Card title="AI 공고문 분석 (텍스트 붙여넣기)">
      {/* 공고문 파일 업로드 + 추출 결과 미리보기 (Phase B-0). 기본 상태에서는 compact 노출. */}
      <div className="notice-upload-card notice-upload-card--compact">
        <h4>공고문 파일 업로드</h4>
        <p className="desc">
          파일을 업로드하면 분석용 텍스트를 먼저 추출합니다. 확인·수정 후 분석하세요.
          <span className="desc-formats">지원: TXT · CSV · PDF · XLSX · JPG · PNG · WEBP</span>
        </p>

        <div
          className={`notice-upload-dropzone${isDragging ? ' is-dragging' : ''}`}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <label className="browse-btn" htmlFor="bid-notice-file-input">
            파일 선택
          </label>
          <input
            id="bid-notice-file-input"
            type="file"
            ref={fileInputRef}
            accept={UPLOAD_ACCEPT}
            onChange={handleFileChange}
          />

          {uploadedFile ? (
            <div className="notice-upload-meta">
              <span>
                <strong>{uploadedFile.name}</strong>
              </span>
              <span>· {uploadKind.toUpperCase()}</span>
              <span>· {formatBytes(uploadedFile.size)}</span>
              <span className={`badge-status ${uploadStatus}`}>
                {uploadStatus === 'idle'
                  ? '대기'
                  : uploadStatus === 'extracting'
                  ? '추출 중'
                  : uploadStatus === 'done'
                  ? '추출 완료'
                  : '추출 실패'}
              </span>
              <button type="button" className="notice-upload-remove" onClick={resetUploadState}>
                파일 제거
              </button>
            </div>
          ) : (
            <span className="notice-upload-meta">
              파일을 선택하거나 이 영역에 끌어다 놓으세요. (지원: TXT, CSV, PDF, XLSX, JPG, JPEG, PNG, WEBP)
            </span>
          )}
        </div>

        {/* 이미지 미리보기 */}
        {uploadKind === 'image' && imagePreviewUrl && (
          <div className="notice-upload-preview">
            <strong style={{ fontSize: 12, color: '#475569' }}>이미지 미리보기</strong>
            <img src={imagePreviewUrl} alt="공고문 이미지 미리보기" />
          </div>
        )}

        {uploadWarning && <p className="notice-upload-warning">⚠ {uploadWarning}</p>}
        {uploadError && <p className="notice-upload-error">✕ {uploadError}</p>}
        {uploadSuccess && <p className="notice-upload-success">✓ {uploadSuccess}</p>}

        {/* 추출 결과 미리보기 - 추출 텍스트가 있는 경우만 */}
        {(extractedText || (uploadStatus === 'done' && (uploadKind === 'text' || uploadKind === 'csv'))) && (
          <div className="notice-extract-preview">
            <strong style={{ fontSize: 12, color: '#475569' }}>추출 결과 미리보기 (수정 가능)</strong>
            <textarea
              value={extractedText}
              onChange={(e) => setExtractedText(e.target.value)}
              placeholder="추출 결과가 비어있다면 직접 복사해 붙여넣어 주세요."
              rows={8}
            />
            <p className="desc" style={{ marginTop: 6 }}>{UPLOAD_HELPER_NOTE}</p>
            <div className="notice-extract-actions">
              <Button variant="primary" onClick={handleApplyExtractedToAnalysis}>
                이 내용으로 공고문 분석
              </Button>
              <Button variant="secondary" onClick={() => setExtractedText('')}>
                비우기
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>단지명</label>
          <input type="text" value={form.siteName} onChange={e => update('siteName', e.target.value)} />
        </div>
        <div className="form-group">
          <label>입찰방식</label>
          <input type="text" value={form.biddingMethod} onChange={e => update('biddingMethod', e.target.value)} placeholder="예: 적격심사제, 협상에 의한 계약" />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>현장설명회 일정</label>
          <input type="text" value={form.siteVisitDate} onChange={e => update('siteVisitDate', e.target.value)} placeholder="예: 2026-06-01 14:00" />
        </div>
        <div className="form-group">
          <label>입찰마감일</label>
          <input type="text" value={form.deadlineDate} onChange={e => update('deadlineDate', e.target.value)} placeholder="예: 2026-06-10 18:00" />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>계약기간</label>
          <input type="text" value={form.contractPeriod} onChange={e => update('contractPeriod', e.target.value)} placeholder="예: 2026-07-01 ~ 2027-06-30" />
        </div>
        <div className="form-group">
          <label>특이조건</label>
          <input type="text" value={form.specialConditions} onChange={e => update('specialConditions', e.target.value)} />
        </div>
      </div>

      <div className="form-group">
        <label>공고문 내용 (붙여넣기)</label>
        <textarea
          data-role="bid-notice-input"
          value={form.noticeText}
          onChange={e => update('noticeText', e.target.value)}
          rows={8}
          placeholder="입찰 공고문 전문을 붙여넣으세요. AI가 요약·일정·서류·리스크·참여 판단(A~D)을 분석합니다."
        />
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <Button variant="primary" onClick={analyze} disabled={loading}>
          {loading ? 'AI 분석 중...' : 'AI 공고문 분석'}
        </Button>
      </div>

      {/* 구조화 분석 카드 (JSON 파싱 성공 시) */}
      {parsed && draft && (
        <div className="bid-structured">
          <div className="bid-structured-head">
            <h4>구조화 분석 결과</h4>
            {gradeKey && (
              <span className={`grade-badge grade-${gradeKey}`}>{GRADE_LABEL[gradeKey] || gradeKey}</span>
            )}
          </div>

          {/* AI 기본정보: draft에서 직접 표시. 공고 등록 폼/스케줄러 카드 모두 같은 source를 봄. */}
          <section className="bid-block">
            <h5>AI 기본정보</h5>
            <ul className="bid-kv">
              <li><span>단지명</span> {draft.apartmentName || '확인 필요'}</li>
              <li><span>지역</span> {draft.region || '확인 필요'}</li>
              <li><span>세대수</span> {draft.households != null ? `${formatNumber(draft.households)}세대` : '확인 필요'}</li>
              <li><span>산출인원</span> {draft.calculatedStaffCount != null ? `${draft.calculatedStaffCount}명` : draft.staffCountText || '확인 필요'}</li>
              <li><span>관리소 전화번호</span> {draft.managementOfficePhone || '확인 필요'}</li>
              <li><span>입찰마감</span> {draft.bidDeadlineDate ? `${draft.bidDeadlineDate} ${draft.bidDeadlineTime || ''}`.trim() : '확인 필요'}</li>
              <li><span>PT/사업설명회</span> {draft.businessPresentationDate ? `${draft.businessPresentationDate} ${draft.businessPresentationTime || ''}`.trim() : '없음/확인 필요'}</li>
              <li>
                <span>현장확인</span>{' '}
                {draft.siteBriefingStatus === 'individualVisit'
                  ? `개별 방문 (${draft.siteBriefingNote || '일자 수동 확인 필요'})`
                  : draft.siteBriefingDate
                  ? `${draft.siteBriefingDate} ${draft.siteBriefingTime || ''}`.trim()
                  : '확인 필요'}
              </li>
            </ul>
          </section>

          {parsed.summary && (
            <section className="bid-block">
              <h5>공고 요약</h5>
              <p>{parsed.summary}</p>
            </section>
          )}

          <section className="bid-block">
            <h5>주요 일정</h5>
            <ul className="bid-kv">
              {/* 현장설명회 라벨/내용은 status에 따라 분기.
                  - scheduled : 날짜·시간 노출
                  - individualVisit : 라벨을 "현장확인/개별방문"으로 바꾸고 "일자 수동 확인 필요" 표시 (스케줄러 후보에는 유지)
                  - notRequired : "현장 확인 불필요" (스케줄러 후보 제외)
                  - unknown : "현장확인 여부 확인 필요" (스케줄러 후보에는 검토 항목으로 유지)
                  - '' : "공고문 확인 필요" */}
              <li>
                <span>{parsed.siteBriefingStatus === 'individualVisit' ? '현장확인/개별방문' : '현장설명회'}</span>{' '}
                {parsed.siteBriefingStatus === 'individualVisit'
                  ? `일자 수동 확인 필요${parsed.siteBriefingNote ? ' · ' + parsed.siteBriefingNote : ''}`
                  : parsed.siteBriefingStatus === 'notRequired'
                  ? parsed.siteBriefingNote || '현장 확인 불필요'
                  : parsed.siteBriefingStatus === 'unknown'
                  ? parsed.siteBriefingNote || '현장확인 여부 확인 필요'
                  : parsed.siteBriefingDate
                  ? [parsed.siteBriefingDate, parsed.siteBriefingTime].filter(Boolean).join(' · ')
                  : '공고문 확인 필요'}
              </li>
              {/* 서류제출 마감: documentSubmissionDate가 있을 때만 표시. */}
              {parsed.documentSubmissionDate && (
                <li>
                  <span>서류제출 마감</span>{' '}
                  {[parsed.documentSubmissionDate, parsed.documentSubmissionTime].filter(Boolean).join(' · ')}
                </li>
              )}
              {/* 입찰마감: 별도 일정. */}
              <li><span>입찰마감</span> {parsed.bidDeadline
                ? [parsed.bidDeadline, parsed.bidDeadlineTime].filter(Boolean).join(' · ')
                : '공고문 확인 필요'}</li>
              {/* 개찰: openingDate가 있을 때만 표시. */}
              {parsed.openingDate && (
                <li>
                  <span>개찰</span>{' '}
                  {[parsed.openingDate, parsed.openingTime].filter(Boolean).join(' · ')}
                </li>
              )}
              {/* 사업설명회/PT: 적격심사평가회의와 병합된 경우 scheduleEvents의 content/label에 병합 사실이 들어 있음. */}
              <li>
                <span>사업설명회/PT</span>{' '}
                {parsed.businessPresentationDate
                  ? [
                      parsed.businessPresentationDate,
                      parsed.businessPresentationTime,
                      parsed.businessPresentationLocation,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : '공고문 확인 필요'}
              </li>
              <li><span>계약기간</span> {parsed.contractPeriod || '공고문 확인 필요'}</li>
            </ul>
          </section>

          <section className="bid-block">
            <h5>제출서류 체크리스트</h5>
            <ul className="bid-checklist">
              {docs.map(doc => (
                <li key={doc}>
                  <label>
                    <input type="checkbox" checked={!!checklist[doc]} onChange={() => toggleDoc(doc)} />
                    <span className={checklist[doc] ? 'checked' : ''}>{doc}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          {parsed.risks.length > 0 && (
            <section className="bid-block">
              <h5>리스크</h5>
              <ul className="bid-risks">
                {parsed.risks.map((risk, i) => {
                  const { category, advice } = categorizeRisk(risk)
                  return (
                    <li key={i}>
                      <span className="risk-cat">{category}</span>
                      <span className="risk-text">{risk}</span>
                      <div className="risk-advice">대응: {advice}</div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {parsed.estimateNotes.length > 0 && (
            <section className="bid-block">
              <h5>산출표 작성 주의사항</h5>
              <ul className="bid-list">
                {parsed.estimateNotes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </section>
          )}

          {parsed.specialConditions.length > 0 && (
            <section className="bid-block">
              <h5>특이조건</h5>
              <ul className="bid-list">
                {parsed.specialConditions.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </section>
          )}

          {parsed.siteBriefingQuestions.length > 0 && (
            <section className="bid-block">
              <h5>현장설명회 질문 리스트</h5>
              <ul className="bid-list">
                {parsed.siteBriefingQuestions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </section>
          )}

          {(parsed.participationReason || parsed.recommendedAction) && (
            <section className="bid-block">
              <h5>참여 판단 / 다음 조치</h5>
              {parsed.participationReason && <p><strong>판단 근거:</strong> {parsed.participationReason}</p>}
              {parsed.recommendedAction && <p><strong>다음 조치:</strong> {parsed.recommendedAction}</p>}
            </section>
          )}

          <section className="bid-block bid-actions-section">
            <h5>분석 결과 활용</h5>

            {onApplyToForm && (
              <div className="bid-action-group">
                <p className="bid-action-desc">
                  아래 공고 등록 폼에 분석 값을 채웁니다. AI 분석 탭에서는 직접 공고를 등록하지 않습니다 —
                  반영 후 <strong>공고 등록·관리</strong> 탭에서 값을 확인하고 등록하세요.
                </p>
                <div className="bid-apply-actions">
                  <Button variant="secondary" onClick={() => handleApply(false)}>분석 결과를 공고 등록 폼에 반영 (빈 항목만)</Button>
                  <Button variant="secondary" onClick={() => handleApply(true)}>전체 덮어쓰기</Button>
                </div>
                {applyMsg && (
                  <div className="bid-action-banner">
                    <p className="bid-apply-msg" style={{ margin: 0 }}>{applyMsg}</p>
                    {onJumpToList && (
                      <>
                        <span className="bid-action-banner-hint">→ 공고 등록·관리 탭에서 폼 값을 확인 후 "공고 등록"을 눌러주세요.</span>
                        <Button variant="primary" onClick={onJumpToList}>공고 등록·관리로 이동</Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {onAddScheduleEvents && (
              <div className="bid-action-group">
                <p className="bid-action-desc">공고 등록 없이 주요 일정만 캘린더에 추가합니다.</p>
                {scheduleCandidates.length > 0 && (
                  <ul className="bid-kv">
                    {scheduleCandidates.map((c, i) => (
                      <li key={i}>
                        <span>{c.label}</span> {c.value}
                        {c.disabledReason && (
                          <div className="bid-apply-msg" style={{ marginTop: 4 }}>
                            ※ {c.disabledReason}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {scheduleCandidates.some((c) => c.disabledReason) && (
                  <p className="bid-apply-msg" style={{ marginTop: 4 }}>
                    안내: 일자 수동 입력 항목은 자동 등록되지 않습니다. 공고 등록 폼이나 일정표에서 직접 일자를 입력해 등록해주세요.
                  </p>
                )}
                <div className="bid-apply-actions">
                  <Button variant="primary" onClick={handleAddScheduleOnly}>주요 일정만 스케줄러에 추가</Button>
                </div>
              </div>
            )}

            {actionMsg && (
              <div className="bid-action-banner">
                <p className="bid-apply-msg" style={{ margin: 0 }}>{actionMsg}</p>
                {/* 스케줄러로 이동 버튼: 일정 등록·공고 등록 후 노출. onJumpToScheduler가 있을 때만. */}
                {onJumpToScheduler && /스케줄러|공고가 등록|등록되었/.test(actionMsg) && (
                  <>
                    <span className="bid-action-banner-hint">→ 입찰 스케줄러 탭에서 확인할 수 있습니다.</span>
                    <Button variant="secondary" onClick={onJumpToScheduler}>입찰 스케줄러로 이동</Button>
                  </>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {/* 원문 AI 결과 (복사/저장/다운로드/이력) */}
      <AIResultPanel
        title="공고문 분석 결과 (원문)"
        taskType="bidNoticeAnalysis"
        loading={loading}
        loadingText="AI가 공고문을 분석 중입니다."
        error={error}
        result={result}
        downloadFileName={`bid-notice-analysis-${new Date().toISOString().slice(0, 10)}.txt`}
        onClear={() => {
          setResult('')
          setDraft(null)
        }}
        onLoadSaved={(content) => {
          setResult(content)
          // 이력 로드는 원본 noticeText가 없으므로 gap-fill 없이 빈 noticeText로 draft 생성.
          const parsedRaw = parseBidAnalysis(content)
          setDraft(parsedRaw ? buildBidAnalysisDraft(parsedRaw, '') : null)
        }}
        showHistory
      />
    </Card>
  )
}

export default BidNoticeAIAnalysis
