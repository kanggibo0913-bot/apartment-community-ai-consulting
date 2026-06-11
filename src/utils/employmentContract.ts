// 근로계약서 작성 — 타입·기본값·출력 헬퍼.
//
// ⚠️ 이 기능은 내부 작성 보조 + 인쇄 전용이다. 출력물은 최종 사용 전 노무사/법률 검토가
//    필요하며, 법적 효력·적법성은 앱이 보장하지 않는다. UI에도 동일한 안내문을 항상 노출한다.
//
// 저장 정책: 입력값은 어떤 저장소(localStorage/sessionStorage/Supabase)에도 저장하지 않는다.
//   - 화면 내 임시 state로만 존재하고, 새로고침/페이지 이탈 시 사라지는 것이 의도된 동작이다.
//   - 근로자 주민등록번호·주소·연락처·계좌·서명은 앱에서 입력받지 않고, 출력물의
//     수기 작성용 빈칸으로만 표시한다. (개인정보를 브라우저에 남기지 않기 위함)
//
// 원문 출처: "(주)맑음컴퍼니 근로계약서(다산펜테리움1차)" 문서 구조(제1조~제14조)를 유지하고,
// 현장마다 바뀌는 값(현장명/주소/기간/근무시간/임금/사업주)은 입력값 치환으로 출력한다.
// 제15조(특약 사항)는 신규 조항으로 추가한다.
//
// 법률검토 필요 조항(토글):
//   - 제13조 15호 "추징금 10배 보상" — 기본 비활성. 사용자가 직접 켜야만 출력된다.
//   - 제7조 포괄임금제 동의(4·5항) — 기본 활성(원문 보존)이되 ⚠️ 표시.
//   - 제6조 3항 연차수당 포괄임금 산입 — 기본 활성(원문 보존)이되 ⚠️ 표시.
//   - 제10조 2항 개인레슨/프리랜서 수익 퇴직금 산정 제외 — 기본 활성(원문 보존)이되 ⚠️ 표시.

export interface EcWorkDays {
  mon: boolean
  tue: boolean
  wed: boolean
  thu: boolean
  fri: boolean
  sat: boolean
  sun: boolean
}

export const EC_DAY_LABELS: Array<{ key: keyof EcWorkDays; label: string }> = [
  { key: 'mon', label: '월' },
  { key: 'tue', label: '화' },
  { key: 'wed', label: '수' },
  { key: 'thu', label: '목' },
  { key: 'fri', label: '금' },
  { key: 'sat', label: '토' },
  { key: 'sun', label: '일' },
]

export type EcPayType = 'monthly' | 'hourly'
export type EcInsuranceType = 'four' | 'freelancer' | 'custom'

export interface EmploymentContractInput {
  // 1. 현장 정보
  siteName: string
  siteAddress: string
  centerBrandName: string
  linkClientContractPeriod: boolean // 원청/위탁 계약기간 연동 문구(제2조 3항) 사용 여부
  siteSpecialNote: string // 현장별 특이 문구(제3조 하단에 비고로 출력)
  // 2. 계약 기간 / 수습
  contractStart: string // YYYY-MM-DD
  contractEnd: string // YYYY-MM-DD
  probationUsed: boolean
  probationMonths: number
  // 3. 근무시간
  workDays: EcWorkDays
  weekdayStart: string // HH:mm
  weekdayEnd: string
  weekendUsed: boolean
  weekendStart: string
  weekendEnd: string
  breakMinutes: number // 분 단위 필수
  holidayRule: string // 휴일/공휴일 규칙 (예: 매주 일요일·법정 공휴일 휴무)
  duties: string // 담당 업무 (제4조)
  // 4. 임금
  payType: EcPayType
  hourlyWage: number
  monthlySalary: number
  weeklyHolidayIncluded: boolean // 주휴수당 반영(포함) 여부 문구
  payday: string // 임금지급일 (예: 익월 10일)
  payMethod: string
  insuranceType: EcInsuranceType
  taxNote: string // 세금공제 메모 (insuranceType=custom 시 본문 출력)
  // 5. 인센티브 / 프리랜서 레슨
  incentiveUsed: boolean
  incentiveRate: string // 정산 비율 (예: 50%)
  incentivePayday: string // 정산일 (예: 매달 말일)
  personalLessonAllowed: boolean
  lessonShare: string // 수익 분배율 (예: 5:5)
  excludeLessonFromSeverance: boolean // ⚠️ 법률검토 — 퇴직금 산정 제외 문구
  // 6. 사업주 정보
  employerName: string
  employerAddress: string
  employerBizNo: string
  employerCeo: string
  // 7. 근로자 정보 — 성명만 선택 입력(임시 state, 저장되지 않음).
  // 주민등록번호·주소·연락처·계좌·서명은 앱에서 입력받지 않고 출력물 수기 작성 빈칸으로 둔다.
  workerName: string
  // 8. 법률검토 필요 조항 토글
  clausePenalty10x: boolean // ⚠️ 제13조 15호 — 기본 비활성
  clauseInclusiveWage: boolean // ⚠️ 제7조 포괄임금
  clauseAnnualLeaveInclusive: boolean // ⚠️ 제6조 3항 연차 포괄 산입
  // 특약 (제15조)
  specialTerms: string
  // 작성일
  contractDate: string // YYYY-MM-DD
}

export const SPECIAL_TERMS_PLACEHOLDER =
  '예: ARM 컴퍼니와의 계약 기간인 2025년 9월 1일부터 근로를 한 것으로 간주하여 퇴직금 정산 시 반영한다.'

export const LEGAL_NOTICE =
  '본 문서는 내부 작성 보조용이며 최종 사용 전 노무사/법률 검토가 필요합니다.'

const todayStr = (): string => new Date().toISOString().slice(0, 10)

export const defaultContractInput = (): EmploymentContractInput => ({
  siteName: '',
  siteAddress: '',
  centerBrandName: '',
  linkClientContractPeriod: true,
  siteSpecialNote: '',
  contractStart: '',
  contractEnd: '',
  probationUsed: true,
  probationMonths: 3,
  workDays: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
  weekdayStart: '09:00',
  weekdayEnd: '18:00',
  weekendUsed: false,
  weekendStart: '09:00',
  weekendEnd: '13:00',
  breakMinutes: 60,
  holidayRule: '매주 일요일 및 법정 공휴일 휴무',
  duties: '커뮤니티 시설관리 및 입주민 운동프로그램, 운동지도관리 위탁운영관리, 오리엔테이션 업무, 청소 등',
  payType: 'monthly',
  hourlyWage: 10320,
  monthlySalary: 0,
  weeklyHolidayIncluded: true,
  payday: '익월(다음 달) 10일',
  payMethod: '근로자 명의 예금통장 또는 회사가 지정한 은행의 근로자 명의 예금통장에 입금한다.',
  insuranceType: 'four',
  taxNote: '',
  incentiveUsed: false,
  incentiveRate: '50%',
  incentivePayday: '매달 말일',
  personalLessonAllowed: false,
  lessonShare: '5:5',
  excludeLessonFromSeverance: true,
  employerName: '주식회사 엠아이케이',
  employerAddress: '경기도 남양주시 별내중앙로 26, 10층 1002-802호(별내동)',
  employerBizNo: '193-87-03746',
  employerCeo: '강기보',
  workerName: '',
  clausePenalty10x: false, // ⚠️ 기본 비활성 — 법률 리스크 조항
  clauseInclusiveWage: true,
  clauseAnnualLeaveInclusive: true,
  specialTerms: '',
  contractDate: todayStr(),
})

// ─── 출력 헬퍼 ────────────────────────────────────────────────────────────────

// YYYY-MM-DD → "YYYY년 M월 D일". 비어 있으면 "    년   월   일"(수기 기입 칸).
export const fmtKoreanDate = (s: string): string => {
  const m = (s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return '        년     월     일'
  return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일`
}

// 근무요일 요약 (예: "월~금", "월, 수, 금", "월~금, 토(격주)")
export const fmtWorkDays = (d: EcWorkDays): string => {
  const on = EC_DAY_LABELS.filter((x) => d[x.key])
  if (on.length === 0) return '(요일 미지정)'
  // 연속 구간 압축: 월~금 같은 표현
  const keys = EC_DAY_LABELS.map((x) => x.key)
  const flags = keys.map((k) => d[k])
  const parts: string[] = []
  let i = 0
  while (i < 7) {
    if (!flags[i]) {
      i++
      continue
    }
    let j = i
    while (j + 1 < 7 && flags[j + 1]) j++
    parts.push(j - i >= 2 ? `${EC_DAY_LABELS[i].label}~${EC_DAY_LABELS[j].label}` : EC_DAY_LABELS.slice(i, j + 1).map((x) => x.label).join(', '))
    i = j + 1
  }
  return parts.join(', ')
}

export const fmtMoney = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('ko-KR')

// 주 근무일수 (소수 없이 일수만)
export const countWorkDays = (d: EcWorkDays): number =>
  EC_DAY_LABELS.filter((x) => d[x.key]).length
