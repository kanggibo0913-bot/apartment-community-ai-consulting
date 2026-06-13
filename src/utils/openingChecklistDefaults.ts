import { ChecklistCategory, ChecklistPriority, OpeningChecklistData, OpeningChecklistItem } from '../types/CommunityData'

// 커뮤니티센터 오픈 준비 "공식" 기본 체크 항목 seed.
// 단지별 CommunityData.openingChecklist.items의 초기 시드 + 기존 데이터 migration 기준으로 사용된다.
// ⚠️ 매 호출마다 새 배열·새 객체를 반환해 단지(프로젝트) 간 참조 공유로 인한 상호 오염을 방지한다.
// ⚠️ 신규 프로젝트는 이 seed로 초기화되고, 기존 저장 데이터는 normalizeOpeningChecklistData가
//    (1) 레거시 '시설 체크' 항목을 시설별 category로 재분류하고 (2) 누락 항목만 append 하므로
//    사용자 입력값(상태/메모/수량/담당자/완료시각/제목)을 덮어쓰지 않는다.
// v3: 단일 '시설 체크'를 시설별 category(공통 시설/헬스/골프/수영/체육관/샤워 / 탈의)로 분리. subCategory는 '비품'에서만 사용.

// ── seed 버전 ────────────────────────────────────────────────────────────────
// seed 항목/구조를 바꿀 때 이 값을 올린다. openingChecklist.seedVersion이 이 값보다 낮은
// 기존 데이터는 1회 migration을 거친 뒤 이 값으로 stamp된다(이후 재실행 안 함).
//   v1: 137개 초기 seed, 제목 접두어로 세부 분류 표시
//   v2: subCategory 필드 도입 + 시설(골프장/수영장/체육관) & 비품 세부 분류·항목 보강
//   v3: '시설 체크'를 시설별 category로 분리(재분류 migration 포함) + 수영/헬스 항목 보강
// ⚠️ v3 migration은 레거시 '시설 체크' category 재분류 로직을 포함한다. 앞으로 seed 항목을 추가/수정/세분화하거나
//    category 구조를 바꿀 때는 반드시 이 값을 4 이상으로 올려야 기존 사용자 데이터에 migration이 적용된다.
//    올리지 않으면 seedVersion이 이미 최신인 데이터에는 변경이 반영되지 않는다.
export const OPENING_CHECKLIST_SEED_VERSION = 3

// 공통 항목 빌더. subCategory는 '비품'에서만 의미가 있고 그 외 카테고리는 ''.
const item = (
  id: string,
  category: ChecklistCategory,
  subCategory: string,
  title: string,
  priority: ChecklistPriority,
): OpeningChecklistItem => ({
  id,
  category,
  subCategory,
  title,
  description: '',
  status: '미확인',
  assignee: '',
  dueDate: '',
  completedAt: '',
  priority,
  memo: '',
})

// 비품 항목 빌더 (수량/단위/구매상태 기본값 포함)
const supply = (id: string, subCategory: string, title: string, unit: string, priority: ChecklistPriority): OpeningChecklistItem => ({
  ...item(id, '비품', subCategory, title, priority),
  quantityNeeded: 0,
  quantityReady: 0,
  unit,
  supplier: '',
  purchaseStatus: '미구매',
})

// 시설 category들은 subCategory 없이 [제목, 우선순위]만 갖는다.
type TP = [string, ChecklistPriority]

// ── 계약/행정 ──
const ADMIN: TP[] = [
  ['전기 계약 상태 확인', '높음'],
  ['수도 계약 상태 확인', '높음'],
  ['도시가스 / 온수 계약 상태 확인', '높음'],
  ['인터넷 계약 상태 확인', '높음'],
  ['전화 계약 상태 확인', '보통'],
  ['CCTV 계약 상태 확인', '높음'],
  ['정수기 계약 상태 확인', '보통'],
  ['비데 계약 상태 확인', '낮음'],
  ['보안 / 출입 시스템 계약 상태 확인', '필수'],
  ['키오스크 / 카드단말기 계약 상태 확인', '높음'],
  ['보험 / 책임보험 가입 여부 확인', '필수'],
  ['관리사무소 협의사항 확인', '높음'],
  ['운영시간 협의 확인', '보통'],
  ['이용요금 / 할인정책 협의 확인', '보통'],
  ['입주민 공지 방식 확인', '보통'],
  ['민원 접수 방식 확인', '보통'],
]

// ── 공통 시설 (구 공통 + 안전/방재 + 설비/전기) ──
const COMMON: TP[] = [
  ['안내데스크 상태 확인', '보통'],
  ['인포 공간 동선 확인', '보통'],
  ['사무공간 상태 확인', '보통'],
  ['창고 상태 확인', '낮음'],
  ['출입문 / 자동문 상태 확인', '높음'],
  ['조명 상태 확인', '보통'],
  ['콘센트 상태 확인', '보통'],
  ['냉난방 상태 확인', '높음'],
  ['환기 상태 확인', '보통'],
  ['소방시설 위치 확인', '필수'],
  ['비상구 / 피난 동선 확인', '필수'],
  ['CCTV 사각지대 확인', '높음'],
]

// ── 헬스 ──
const HEALTH: TP[] = [
  ['헬스장 장비 배치 확인', '보통'],
  ['유산소 장비 작동 확인', '높음'],
  ['웨이트 장비 작동 확인', '높음'],
  ['프리웨이트 존 안전거리 확인', '높음'],
  ['바닥 충격흡수재 상태 확인', '높음'],
  ['고무매트 / 에버롤 들뜸 확인', '보통'],
  ['벽면 필름지 부착 상태 확인', '보통'],
  ['거울 파손 / 들뜸 확인', '높음'],
  ['운동기구 고정 상태 확인', '높음'],
  ['운동기구 전원 연결 상태 확인', '보통'],
  ['기구 간 동선 확인', '보통'],
  ['스트레칭 공간 확인', '낮음'],
  ['소독 티슈 / 타월 비치 위치 확인', '보통'],
]

// ── 골프 ──
const GOLF: TP[] = [
  ['골프 타석 상태 확인', '보통'],
  ['타석별 이격 거리 확인', '높음'],
  ['안전선 설치 여부 확인', '필수'],
  ['그물망 상태 확인', '높음'],
  ['표적지 상태 확인', '보통'],
  ['스크린 / 센서 작동 확인', '높음'],
  ['골프채 거치대 상태 확인', '낮음'],
  ['타석 바닥 상태 확인', '보통'],
  ['타석 조명 상태 확인', '보통'],
  ['타석 주변 벽면 보호 상태 확인', '보통'],
  ['타구 방향 안전성 확인', '높음'],
  ['타석별 소음 전달 여부 확인', '낮음'],
  ['스윙 공간 간섭 여부 확인', '높음'],
  ['골프공 보관 위치 확인', '낮음'],
  ['골프채 이동 동선 확인', '낮음'],
  ['스크린 타석 환기 상태 확인', '보통'],
  ['장비 전원 / 멀티탭 안전성 확인', '높음'],
  ['이용자 대기 공간 동선 확인', '보통'],
]

// ── 수영 (수질/측정 · 순환/펌프/여과 · 시설/마감 · 안전/운영) ──
const SWIM: TP[] = [
  // 수질 / 측정
  ['수영장 수질 관리 상태 확인', '필수'],
  ['염도 확인', '높음'],
  ['pH 확인', '높음'],
  ['잔류염소 확인', '높음'],
  ['탁도 확인', '보통'],
  ['수온 확인', '보통'],
  ['수질 측정 키트 비치 확인', '보통'],
  ['염도계 비치 및 작동 확인', '보통'],
  ['pH 측정기 비치 및 작동 확인', '보통'],
  ['수온계 비치 및 작동 확인', '보통'],
  ['수질 점검 기록표 준비 확인', '보통'],
  // 순환 / 펌프 / 여과
  ['순환펌프 작동 확인', '높음'],
  ['수압펌프 작동 확인', '높음'],
  ['여과기 상태 확인', '높음'],
  ['여과기 압력 게이지 확인', '보통'],
  ['배관 누수 확인', '높음'],
  ['배관 밸브 개폐 상태 확인', '보통'],
  ['급수 / 배수 라인 확인', '보통'],
  ['물넘침 / 오버플로우 상태 확인', '보통'],
  ['배수구 막힘 확인', '보통'],
  ['배수구 냄새 확인', '낮음'],
  ['수위 유지 상태 확인', '보통'],
  // 시설 / 마감
  ['수심 표시 확인', '높음'],
  ['수영장 바닥 미끄럼 위험 확인', '높음'],
  ['수영장 타일 깨짐 확인', '보통'],
  ['수영장 벽면 마감 상태 확인', '보통'],
  ['수영장 모서리 파손 확인', '보통'],
  ['사다리 / 손잡이 고정 상태 확인', '높음'],
  ['수영장 주변 조명 상태 확인', '보통'],
  ['수영장 환기 상태 확인', '보통'],
  ['습기 / 결로 발생 여부 확인', '보통'],
  ['곰팡이 발생 여부 확인', '보통'],
  ['샤워실 연결 동선 확인', '보통'],
  // 안전 / 운영
  ['안전용품 위치 확인', '필수'],
  ['구명환 비치 확인', '필수'],
  ['구조봉 비치 확인', '필수'],
  ['미끄럼주의 안내판 확인', '높음'],
  ['수영장 이용 안내문 확인', '보통'],
  ['수영장 안전수칙 안내문 확인', '높음'],
  ['수영장 청소도구 보관 위치 확인', '낮음'],
  ['응급상황 동선 확인', '높음'],
  ['관리자 시야 확보 여부 확인', '높음'],
]

// ── 체육관 ──
const GYM: TP[] = [
  ['체육관 바닥 상태 확인', '보통'],
  ['바닥 라인 상태 확인', '낮음'],
  ['바닥 니스칠 상태 확인', '낮음'],
  ['바닥 미끄럼 정도 확인', '높음'],
  ['바닥 들뜸 / 파임 확인', '보통'],
  ['농구대 / 배구대 / 네트 설치 상태 확인', '보통'],
  ['벽면 보호매트 상태 확인', '보통'],
  ['천장 높이 / 장애물 확인', '보통'],
  ['체육관 울림 / 소음 전달 확인', '낮음'],
  ['조명 밝기 확인', '보통'],
  ['조명 안전망 설치 여부 확인', '높음'],
  ['조명 깜빡임 확인', '보통'],
  ['창문 / 환기창 상태 확인', '보통'],
  ['음향장비 사용 가능 여부 확인', '낮음'],
  ['대기 공간 / 관람 공간 확인', '낮음'],
  ['출입문 개폐 상태 확인', '보통'],
  ['비상구 / 대피 동선 확인', '필수'],
  ['체육관 창고 상태 확인', '낮음'],
  ['체육용품 보관 위치 확인', '낮음'],
  ['행사 / 대관 운영 동선 확인', '낮음'],
]

// ── 샤워 / 탈의 ──
const SHOWER: TP[] = [
  ['샤워실 수압 확인', '보통'],
  ['샤워실 온수 확인', '높음'],
  ['탈의실 상태 확인', '보통'],
  ['락커 설치 여부 확인', '보통'],
  ['락커 필름지 / 문짝 / 번호키 상태 확인', '보통'],
  ['드라이기 위치 및 작동 확인', '보통'],
]

// ── 하자보수 ──
const DEFECT: TP[] = [
  ['바닥 하자 확인', '보통'],
  ['벽면 하자 확인', '보통'],
  ['천장 하자 확인', '보통'],
  ['누수 확인', '높음'],
  ['결로 확인', '보통'],
  ['전기 하자 확인', '높음'],
  ['설비 하자 확인', '높음'],
  ['장비 하자 확인', '보통'],
  ['도장 / 필름지 하자 확인', '낮음'],
  ['마루 들뜸 확인', '보통'],
  ['타일 깨짐 확인', '보통'],
  ['문 / 손잡이 / 경첩 하자 확인', '보통'],
  ['락커 하자 확인', '보통'],
  ['샤워기 / 수전 하자 확인', '보통'],
  ['배수구 냄새 / 막힘 확인', '보통'],
  ['에어컨 / 공조 하자 확인', '높음'],
  ['조명 깜빡임 확인', '보통'],
  ['콘센트 불량 확인', '높음'],
  ['안전사고 위험 구간 확인', '필수'],
]

// ── 운영 시뮬레이션 ──
const OPS: TP[] = [
  ['회원 입장 동선 확인', '보통'],
  ['신규 회원 등록 동선 확인', '높음'],
  ['결제 동선 확인', '높음'],
  ['환불 / 정지 / 연장 응대 동선 확인', '보통'],
  ['민원 응대 동선 확인', '보통'],
  ['직원 출근 체크 확인', '보통'],
  ['직원 퇴근 / 마감 체크 확인', '높음'],
  ['일매출 정산 흐름 확인', '높음'],
  ['회원권 확인 방식 점검', '보통'],
  ['락커 배정 흐름 확인', '보통'],
  ['분실물 처리 흐름 확인', '낮음'],
  ['청소 체크 흐름 확인', '보통'],
  ['비품 보충 흐름 확인', '보통'],
  ['시설 하자 접수 흐름 확인', '보통'],
  ['응급상황 대응 확인', '필수'],
  ['정전 / 단수 대응 확인', '필수'],
  ['화재 / 대피 대응 확인', '필수'],
  ['관리사무소 보고 흐름 확인', '보통'],
]

// ── 비품 ── [subCategory, 제목, 단위, 우선순위] (subCategory는 비품에서만 사용)
const SUPPLIES: Array<[string, string, string, ChecklistPriority]> = [
  // 인포 / 사무
  ['인포 / 사무', '인포 PC', '대', '높음'],
  ['인포 / 사무', '모니터', '대', '보통'],
  ['인포 / 사무', '프린터', '대', '높음'],
  ['인포 / 사무', '전화기', '대', '보통'],
  ['인포 / 사무', '공유기', '개', '높음'],
  ['인포 / 사무', '카드단말기', '대', '높음'],
  ['인포 / 사무', '키오스크', '대', '높음'],
  ['인포 / 사무', '마우스', '개', '보통'],
  ['인포 / 사무', '키보드', '개', '보통'],
  ['인포 / 사무', '멀티탭', '개', '보통'],
  ['인포 / 사무', '랜선', '개', '보통'],
  ['인포 / 사무', '볼펜', '개', '낮음'],
  ['인포 / 사무', '네임펜', '개', '낮음'],
  ['인포 / 사무', '형광펜', '개', '낮음'],
  ['인포 / 사무', 'A4용지', '박스', '보통'],
  ['인포 / 사무', 'L자파일', '개', '낮음'],
  ['인포 / 사무', '클립보드', '개', '낮음'],
  ['인포 / 사무', '스테이플러', '개', '낮음'],
  ['인포 / 사무', '가위', '개', '낮음'],
  ['인포 / 사무', '테이프', '개', '낮음'],
  // 운영 / 안내
  ['운영 / 안내', '회원카드', '장', '높음'],
  ['운영 / 안내', '안내문', '부', '보통'],
  ['운영 / 안내', '게시판 자석 / 압정', '개', '낮음'],
  ['운영 / 안내', 'QR 안내판', '개', '보통'],
  ['운영 / 안내', '분실물 보관함', '개', '낮음'],
  ['운영 / 안내', '우산꽂이', '개', '낮음'],
  // 청소 / 위생
  ['청소 / 위생', '빗자루', '개', '보통'],
  ['청소 / 위생', '쓰레받기', '개', '낮음'],
  ['청소 / 위생', '밀대', '개', '보통'],
  ['청소 / 위생', '대걸레', '개', '보통'],
  ['청소 / 위생', '물걸레 청소포', '개', '보통'],
  ['청소 / 위생', '바닥 세정제', '개', '보통'],
  ['청소 / 위생', '유리 세정제', '개', '보통'],
  ['청소 / 위생', '거울 세정제', '개', '낮음'],
  ['청소 / 위생', '락스', '개', '보통'],
  ['청소 / 위생', '곰팡이 제거제', '개', '보통'],
  ['청소 / 위생', '배수구 클리너', '개', '보통'],
  ['청소 / 위생', '변기 세정제', '개', '보통'],
  ['청소 / 위생', '욕실 세정제', '개', '보통'],
  ['청소 / 위생', '소독제', '개', '높음'],
  ['청소 / 위생', '손소독제', '개', '높음'],
  ['청소 / 위생', '분무기', '개', '낮음'],
  ['청소 / 위생', '고무장갑', '개', '낮음'],
  ['청소 / 위생', '니트릴장갑', '박스', '낮음'],
  ['청소 / 위생', '청소솔', '개', '낮음'],
  ['청소 / 위생', '변기솔', '개', '낮음'],
  ['청소 / 위생', '스퀴지', '개', '낮음'],
  ['청소 / 위생', '쓰레기봉투 일반', '묶음', '보통'],
  ['청소 / 위생', '쓰레기봉투 재활용', '묶음', '보통'],
  ['청소 / 위생', '종량제 봉투', '묶음', '보통'],
  ['청소 / 위생', '휴지', '개', '보통'],
  ['청소 / 위생', '핸드타월', '개', '보통'],
  ['청소 / 위생', '물티슈', '개', '보통'],
  ['청소 / 위생', '분리수거함', '개', '보통'],
  ['청소 / 위생', '청소도구 보관함', '개', '낮음'],
  // 샤워 / 탈의
  ['샤워 / 탈의', '락커키', '개', '보통'],
  ['샤워 / 탈의', '수건', '장', '보통'],
  ['샤워 / 탈의', '드라이기', '대', '보통'],
  ['샤워 / 탈의', '체중계', '대', '보통'],
  ['샤워 / 탈의', '욕실화', '켤레', '낮음'],
  ['샤워 / 탈의', '샤워실 발매트', '개', '낮음'],
  // 헬스
  ['헬스', '운동기구 안내판', '개', '보통'],
  ['헬스', '안전 안내문', '부', '높음'],
  ['헬스', '스트레칭 매트', '개', '보통'],
  ['헬스', '소독 티슈', '개', '보통'],
  ['헬스', '기구 닦는 타월', '장', '보통'],
  // 골프
  ['골프', '골프공', '개', '보통'],
  ['골프', '골프티', '개', '낮음'],
  ['골프', '골프채 거치대', '개', '낮음'],
  ['골프', '타석 안내문', '부', '보통'],
  ['골프', '타석 안전선 표시물', '개', '높음'],
  ['골프', '스크린 리모컨', '개', '보통'],
  ['골프', '센서 청소용품', '개', '낮음'],
  ['골프', '골프공 바구니', '개', '낮음'],
  // 수영
  ['수영', '수영장 이용 안내판', '개', '보통'],
  ['수영', '수영장 안전 안내문', '부', '높음'],
  ['수영', '구명환', '개', '필수'],
  ['수영', '구조봉', '개', '필수'],
  ['수영', '수질 측정 키트', '개', '높음'],
  ['수영', '염도 측정기', '대', '보통'],
  ['수영', 'pH 측정기', '대', '보통'],
  ['수영', '수온계', '개', '보통'],
  ['수영', '수영장 미끄럼주의 안내판', '개', '높음'],
  ['수영', '수영장 청소솔', '개', '낮음'],
  // 체육관
  ['체육관', '체육관 이용 안내판', '개', '보통'],
  ['체육관', '바닥 보호 매트', '개', '보통'],
  ['체육관', '라인 테이프', '개', '낮음'],
  ['체육관', '농구공', '개', '보통'],
  ['체육관', '배구공', '개', '보통'],
  ['체육관', '네트', '개', '보통'],
  ['체육관', '점수판', '개', '낮음'],
  ['체육관', '호루라기', '개', '낮음'],
  ['체육관', '체육용품 보관함', '개', '낮음'],
  ['체육관', '조명 안전망 예비품', '개', '낮음'],
  // 안전 / 응급
  ['안전 / 응급', '응급처치 키트', '개', '필수'],
  ['안전 / 응급', '아이스팩', '개', '보통'],
  ['안전 / 응급', '소화기 위치 안내문', '부', '높음'],
  ['안전 / 응급', '비상연락망 안내문', '부', '높음'],
  ['안전 / 응급', '미끄럼주의 안내판', '개', '높음'],
  // 기타 소모품
  ['기타 소모품', '기타 소모품', '개', '낮음'],
]

export const createDefaultChecklistItems = (): OpeningChecklistItem[] => [
  ...ADMIN.map(([t, p], i) => item(`oc-admin-${i + 1}`, '계약/행정', '', t, p)),
  ...COMMON.map(([t, p], i) => item(`oc-common-${i + 1}`, '공통 시설', '', t, p)),
  ...HEALTH.map(([t, p], i) => item(`oc-health-${i + 1}`, '헬스', '', t, p)),
  ...GOLF.map(([t, p], i) => item(`oc-golf-${i + 1}`, '골프', '', t, p)),
  ...SWIM.map(([t, p], i) => item(`oc-swim-${i + 1}`, '수영', '', t, p)),
  ...GYM.map(([t, p], i) => item(`oc-gym-${i + 1}`, '체육관', '', t, p)),
  ...SHOWER.map(([t, p], i) => item(`oc-shower-${i + 1}`, '샤워 / 탈의', '', t, p)),
  ...DEFECT.map(([t, p], i) => item(`oc-defect-${i + 1}`, '하자보수', '', t, p)),
  ...OPS.map(([t, p], i) => item(`oc-ops-${i + 1}`, '운영 시뮬레이션', '', t, p)),
  ...SUPPLIES.map(([sub, t, u, p], i) => supply(`oc-sup-${i + 1}`, sub, t, u, p)),
]

// ── migration ────────────────────────────────────────────────────────────────
const LEGACY_FACILITY_CATEGORY: ChecklistCategory = '시설 체크'

// 레거시 '시설 체크' 항목을 시설별 category로 재분류하는 기준.
// (1순위) subCategory 기준 매핑
const FACILITY_SUBCATEGORY_TO_CATEGORY: Record<string, ChecklistCategory> = {
  헬스장: '헬스',
  골프장: '골프',
  수영장: '수영',
  체육관: '체육관',
  '샤워 / 탈의': '샤워 / 탈의',
  공통: '공통 시설',
  '안전 / 방재': '공통 시설',
  '설비 / 전기': '공통 시설',
}
// (2순위) subCategory가 없는 아주 구버전(v1) 데이터: 제목 접두어 [헬스]/[골프]/[수영]/[공통] 기준
const FACILITY_TITLE_PREFIX_TO_CATEGORY: Record<string, ChecklistCategory> = {
  헬스: '헬스',
  골프: '골프',
  수영: '수영',
  공통: '공통 시설',
}

// 레거시 시설 항목을 어떤 시설별 category로 옮길지 결정. 매칭 실패 시 안전하게 '공통 시설'.
const resolveFacilityCategory = (it: OpeningChecklistItem): ChecklistCategory => {
  const sub = (it.subCategory ?? '').trim()
  if (FACILITY_SUBCATEGORY_TO_CATEGORY[sub]) return FACILITY_SUBCATEGORY_TO_CATEGORY[sub]
  const m = it.title.match(/^\s*\[([^\]]*)\]/)
  const prefix = m ? m[1].trim() : ''
  if (FACILITY_TITLE_PREFIX_TO_CATEGORY[prefix]) return FACILITY_TITLE_PREFIX_TO_CATEGORY[prefix]
  return '공통 시설'
}

// 저장 title에서 선행 [분류] 접두어를 제거해 구버전(접두어 표기) ↔ 신버전(접두어 없음) 항목을 같은 키로 매칭한다.
const stripCategoryPrefix = (title: string): string => title.replace(/^\s*\[[^\]]*\]\s*/, '').trim()

// 중복/매칭 키: 카테고리 + 접두어 제거 제목. (subCategory는 키에 넣지 않음 — 구버전엔 없어서 매칭이 깨짐)
const itemKey = (it: OpeningChecklistItem): string => `${it.category} ${stripCategoryPrefix(it.title)}`

export interface OpeningChecklistMigrationResult {
  items: OpeningChecklistItem[]
  reclassifiedCount: number // 레거시 '시설 체크' → 시설별 category로 옮긴 항목 수
  appendedCount: number // 새로 추가된 seed 항목 수
  backfilledCount: number // subCategory를 채워 넣은 기존 항목 수
}

// 기존 저장 항목을 보존하면서 (0) 레거시 '시설 체크'를 시설별 category로 재분류하고,
// (1) subCategory가 비어 있는 비품에 seed 기준 subCategory를 backfill하고, (2) 누락된 seed 항목만 append 한다.
//  - 사용자 입력값(status/memo/quantity*/assignee/dueDate/completedAt/supplier/purchaseStatus/title)은 절대 덮어쓰지 않는다.
//  - 재분류는 category만 바꾸고, 시설로 흡수된 subCategory는 ''로 비워 카드에서 category와 중복 표시되지 않게 한다.
//  - 동일 (category, 접두어 제거 title) 조합은 중복 추가하지 않는다.
//  - append 항목 id는 기존 id와 충돌하지 않도록 보정한다. 기존 항목 순서는 유지하고 새 항목은 뒤에 붙인다.
export const migrateOpeningChecklistItems = (
  savedItems: OpeningChecklistItem[],
  seedItems: OpeningChecklistItem[] = createDefaultChecklistItems(),
): OpeningChecklistMigrationResult => {
  // 0) 레거시 '시설 체크' 재분류
  let reclassifiedCount = 0
  const remapped = savedItems.map((it) => {
    if (it.category !== LEGACY_FACILITY_CATEGORY) return it
    reclassifiedCount += 1
    return { ...it, category: resolveFacilityCategory(it), subCategory: '' }
  })

  // seed를 키로 인덱싱 (subCategory backfill용)
  const seedByKey = new Map<string, OpeningChecklistItem>()
  for (const s of seedItems) {
    if (!seedByKey.has(itemKey(s))) seedByKey.set(itemKey(s), s)
  }

  const existingKeys = new Set(remapped.map(itemKey))
  const existingIds = new Set(remapped.map((i) => i.id))

  // 1) 기존 항목 보존 + subCategory backfill (비어 있을 때만, 실질적으로 비품에만 적용)
  let backfilledCount = 0
  const preserved = remapped.map((it) => {
    if (it.subCategory && it.subCategory.trim()) return it
    const seed = seedByKey.get(itemKey(it))
    if (seed && seed.subCategory && seed.subCategory.trim()) {
      backfilledCount += 1
      return { ...it, subCategory: seed.subCategory }
    }
    return it
  })

  // 2) seed에서 누락 항목만 append (id 충돌 보정)
  let appendedCount = 0
  const appended: OpeningChecklistItem[] = []
  for (const s of seedItems) {
    if (existingKeys.has(itemKey(s))) continue
    let id = s.id
    while (existingIds.has(id)) id = `${s.id}-v${OPENING_CHECKLIST_SEED_VERSION}-${appendedCount}`
    existingIds.add(id)
    appended.push({ ...s, id })
    appendedCount += 1
  }

  return { items: [...preserved, ...appended], reclassifiedCount, appendedCount, backfilledCount }
}

// OpeningChecklistData 정규화 (App.tsx normalizeCommunityData에서 호출).
//  - openingChecklist 자체가 없으면(아주 구버전/신규 단지) 최신 seed로 초기화한다.
//  - 사용자가 항목을 모두 지운 경우(items:[])는 기존 계약대로 그대로 보존한다(재시드하지 않음).
//  - seedVersion이 최신이면 그대로 보존해, 사용자가 삭제한 항목이 다시 살아나지 않게 한다.
//  - seedVersion이 낮으면(또는 없으면) 1회 migration(재분류+append)을 실행하고 최신 버전으로 stamp한다.
export const normalizeOpeningChecklistData = (saved?: Partial<OpeningChecklistData>): OpeningChecklistData => {
  if (!saved || !Array.isArray(saved.items)) {
    return { items: createDefaultChecklistItems(), seedVersion: OPENING_CHECKLIST_SEED_VERSION }
  }
  const savedVersion = typeof saved.seedVersion === 'number' ? saved.seedVersion : 0
  if (savedVersion >= OPENING_CHECKLIST_SEED_VERSION) {
    return { items: saved.items, seedVersion: savedVersion }
  }
  if (saved.items.length === 0) {
    return { items: [], seedVersion: OPENING_CHECKLIST_SEED_VERSION }
  }
  const result = migrateOpeningChecklistItems(saved.items, createDefaultChecklistItems())
  return { items: result.items, seedVersion: OPENING_CHECKLIST_SEED_VERSION }
}
