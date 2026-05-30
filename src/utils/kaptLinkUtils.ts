// K-apt(공동주택관리정보시스템) 입찰공고 검색 URL 생성 유틸.
// 크롤링/스크래핑/API 연동을 하지 않는다 — 단순히 사용자가 자주 쓰는 필터 조합을
// 쿼리스트링으로 조립해 새 탭에서 열어주는 단축 링크다.
//
// 기존 수동 검색 URL에서 확인된 고정값(사업자/용역/주민공동시설위탁 + 입찰공고일 기준 + 3개월):
//   - searchBidGb=bid_gb_1      : 일반 입찰 구분 (수동 URL 고정값)
//   - searchDateGb=reg          : 입찰공고일 기준 검색
//   - dateArea=2                : 최근 3개월 필터 (수동 URL 고정값)
//   - codeClassifyType1=02      : 사업자
//   - codeClassifyType2=03      : 용역
//   - codeClassifyType3=14      : 주민공동시설위탁
//   - pageNo=1, type=4          : 페이지 시작/리스트 보기 (수동 URL 고정값)
//   - 그 외 bidTitle/aptName/bidState 등은 빈 값으로 두어 전체 결과 반환.
// 정확한 의미가 K-apt 측에서 공개 문서로 확인되지 않는 항목은 "수동 검색 URL에서
// 확인된 고정값"으로 그대로 보존한다.

const KAPT_BASE_URL = 'https://www.k-apt.go.kr/bid/bidList.do'

// 로컬 타임존 기준 YYYY-MM-DD 변환.
// new Date().toISOString()을 쓰면 UTC 변환으로 하루 밀릴 수 있어 직접 조립한다.
const toLocalYmd = (d: Date): string => {
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * K-apt 입찰공고 검색 URL을 "오늘 포함 최근 90일" 범위로 생성한다.
 * @param now 기준 시각(테스트 가능성을 위해 주입 가능). 기본값은 `new Date()`.
 * @returns 새 탭에서 바로 열 수 있는 완성 URL.
 *
 * 예: today=2026-05-30 → dateStart=2026-03-02 / dateEnd=2026-05-30 / dTime=현재 epoch
 */
export function buildKaptRecentBidUrl(now: Date = new Date()): string {
  const today = new Date(now)
  const start = new Date(now)
  // "오늘 포함 최근 90일" = today에서 89일 뺀 날짜를 시작일로 (today, start 양 끝 포함)
  start.setDate(start.getDate() - 89)

  const params = new URLSearchParams({
    searchBidGb: 'bid_gb_1',
    bidTitle: '',
    aptName: '',
    searchDateGb: 'reg',
    dateArea: '2',
    bidState: '',
    codeAuth: '',
    codeWay: '',
    codeAuthSub: '',
    codeSucWay: '',
    codeClassifyType1: '02', // 사업자
    codeClassifyType2: '03', // 용역
    codeClassifyType3: '14', // 주민공동시설위탁
    pageNo: '1',
    type: '4',
    bidArea: '',
    bidNum: '',
    bidNo: '',
    mainKaptCode: '',
    aptCode: '',
    dateStart: toLocalYmd(start),
    dateEnd: toLocalYmd(today),
    dTime: String(now.getTime()),
  })

  return `${KAPT_BASE_URL}?${params.toString()}`
}
