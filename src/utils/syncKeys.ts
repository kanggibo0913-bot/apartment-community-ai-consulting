// 클라우드 수동 동기화 대상 key의 단일 출처(Single Source of Truth).
//
// 배경:
//   기존에는 같은 key 목록이 두 곳에 중복 정의돼 있었다.
//     - src/pages/SystemDataSyncPage.tsx 의 SYNC_GROUPS (UI 표시 + 저장/불러오기)
//     - netlify/functions/app-state.ts 의 ALLOWED_KEYS (서버 화이트리스트)
//   한쪽만 고치면 둘이 어긋나(드리프트) "프론트는 보내는데 서버가 무시" 같은 사고가 난다.
//   이 파일을 양쪽이 import해 단일 출처로 삼는다. key 추가/변경 시 이 파일만 고치면 된다.
//
// ⚠️ 이 파일은 반드시 "순수 데이터"만 포함해야 한다.
//   - window / DOM / React / process 등 런타임 환경 의존 금지.
//   - 다른 모듈 import 금지(타입 전용 import도 두지 않는다).
//   Netlify 함수(app-state.ts)가 esbuild로 이 파일을 함께 번들하므로,
//   순수해야 함수 배포가 깨지지 않는다(브라우저/Node 양쪽에서 안전).
//
// ⚠️ 화이트리스트 원칙: 동기화는 아래 목록의 key로만 제한된다.
//   legacy 전역 잔재가 아닌 "실제 사용되는 전역 key"는 포함하되,
//   UI 임시 상태(systemDataSyncMeta 등)·세션 토글·보안 메타
//   (projectScopedLegacyMigration)·구 단일 데이터(apartmentCommunityData)는 의도적으로 제외한다.

export interface SyncKeyDef {
  key: string
  label: string
}

export interface SyncGroup {
  title: string
  items: SyncKeyDef[]
}

// 그룹화는 UI 표시에만 영향을 주고, 저장/불러오기·서버 검증은 평면화된 목록(SYNC_KEYS)을 쓴다.
export const SYNC_GROUPS: SyncGroup[] = [
  {
    title: '단지/커뮤니티 기본',
    items: [
      // 단지 기본정보·시설·운영·비용·수익·민원·계약·월간/주간 리포트·오픈 체크리스트 전부가
      // 이 한 key에 직렬화되어 들어 있다.
      { key: 'communityAiProjects', label: '단지/커뮤니티 프로젝트 전체' },
    ],
  },
  {
    title: '입찰공고 관리',
    items: [
      { key: 'tenderNotices', label: '입찰공고 목록' },
      { key: 'tenderScheduleEvents', label: '입찰 스케줄러 일정' },
      { key: 'bidNoticeChecklist', label: '공고문 제출서류 체크리스트' },
    ],
  },
  {
    title: '입찰 산출표',
    items: [
      { key: 'estimateSheets', label: '입찰 산출표 시트' },
      { key: 'bidCalculationSnapshots', label: '입찰 산출표 저장본' },
    ],
  },
  {
    title: '현장 인건비 (단지별)',
    items: [
      { key: 'siteLaborCalendarInputsByProject', label: '현장 인건비 근무표 (단지별)' },
      { key: 'siteLaborCostDataByProject', label: '현장 인건비 산출 입력값 (단지별)' },
      { key: 'siteLaborCostSnapshotsByProject', label: '현장 인건비 저장본 (단지별)' },
      { key: 'siteLaborPayrollDraftByProject', label: '급여 초안 (단지별)' },
      { key: 'siteLaborPayrollSourcePrefByProject', label: '급여요약 적용 기준 (단지별)' },
    ],
  },
  {
    title: '시설 보수 / 입주민 보고서 (단지별)',
    items: [
      { key: 'maintenanceRecordsByProject', label: '시설 보수 내역 (단지별)' },
      { key: 'residentNoticeReportsByProject', label: '입주민 안내 보고서 (단지별)' },
      { key: 'publishedResidentReportsByProject', label: '입주민 공개 발행본 (단지별)' },
    ],
  },
  {
    title: 'Legacy (전역, 하위호환용)',
    items: [
      { key: 'siteLaborCalendarInputs', label: '구버전 현장 인건비 근무표 (legacy)' },
      { key: 'siteLaborCostData', label: '구버전 현장 인건비 산출 입력값 (legacy)' },
      { key: 'siteLaborCostSnapshots', label: '구버전 현장 인건비 저장본 (legacy)' },
      { key: 'siteLaborPayrollDraft', label: '구버전 급여 초안 (legacy)' },
      { key: 'siteLaborPayrollSourcePref', label: '구버전 급여요약 적용 기준 (legacy)' },
      { key: 'maintenanceRecords', label: '구버전 시설 보수 내역 (legacy)' },
      { key: 'residentNoticeReports', label: '구버전 입주민 안내 보고서 (legacy)' },
      { key: 'publishedResidentReports', label: '구버전 입주민 공개 발행본 (legacy)' },
    ],
  },
  {
    title: 'AI 결과 이력',
    items: [
      { key: 'aiResultHistory', label: 'AI 결과 이력' },
    ],
  },
]

// 평면화된 key 정의(라벨 포함) — UI 목록/검색용.
export const SYNC_KEY_DEFS: SyncKeyDef[] = SYNC_GROUPS.flatMap((g) => g.items)

// 평면화된 key 문자열 목록 — 저장/불러오기 루프용.
export const SYNC_KEYS: string[] = SYNC_KEY_DEFS.map((d) => d.key)

// 빠른 화이트리스트 검사용 Set — 서버(app-state.ts)의 ALLOWED_KEYS 대용.
export const SYNC_KEY_SET: ReadonlySet<string> = new Set(SYNC_KEYS)
