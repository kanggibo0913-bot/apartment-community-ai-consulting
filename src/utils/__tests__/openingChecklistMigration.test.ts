// 오픈 체크리스트 seed/migration 회귀 테스트.
//
// 검증 목표 (사용자 요구 7·8항):
//   - 신규 seed에 시설 체크 골프장/수영장/체육관, 비품 수영/체육관/골프 subCategory가 존재
//   - seed 내 (카테고리, 제목) 중복 없음
//   - 기존(구버전 접두어 표기) 데이터에 신규 세부 항목이 append 됨
//   - 기존 status/memo/수량/담당자/completedAt/구매상태 등 사용자 입력값을 절대 덮어쓰지 않음
//   - 동일 (category, 접두어 제거 title) 조합 중복이 생기지 않음
//   - subCategory가 비어 있던 기존 항목에 seed 기준 subCategory가 backfill 됨
//   - append 항목 id가 기존 id와 충돌하지 않음
//   - items:[] (사용자가 모두 지운 상태)는 재시드하지 않고 보존
//   - seedVersion이 최신이면 migration을 다시 실행하지 않음(삭제 항목 부활 방지)

import { describe, expect, it } from 'vitest'
import { OpeningChecklistItem } from '../../types/CommunityData'
import {
  OPENING_CHECKLIST_SEED_VERSION,
  createDefaultChecklistItems,
  migrateOpeningChecklistItems,
  normalizeOpeningChecklistData,
} from '../openingChecklistDefaults'

// 테스트용 키(소스의 itemKey와 동일 규칙): 카테고리 + 접두어 제거 제목
const baseTitle = (title: string) => title.replace(/^\s*\[[^\]]*\]\s*/, '').trim()
const key = (i: OpeningChecklistItem) => `${i.category} ${baseTitle(i.title)}`

// 구버전(v1, 접두어 표기·subCategory 없음) 저장 데이터를 흉내 낸 최소 표본 + 사용자 입력값.
const makeLegacyItem = (over: Partial<OpeningChecklistItem>): OpeningChecklistItem => ({
  id: 'legacy',
  category: '시설 체크',
  title: '제목',
  description: '',
  status: '미확인',
  assignee: '',
  dueDate: '',
  completedAt: '',
  priority: '보통',
  memo: '',
  ...over,
})

const legacySaved: OpeningChecklistItem[] = [
  // 사용자가 완료 + 메모 + 담당자 입력한 시설 체크 항목 (구버전 접두어)
  makeLegacyItem({
    id: 'oc-fac-8',
    category: '시설 체크',
    title: '[헬스] 거울 파손 / 들뜸 확인',
    status: '완료',
    memo: '우측 거울 교체 완료',
    assignee: '김매니저',
    completedAt: '2026-06-01T09:00:00.000Z',
  }),
  // 사용자가 수량/구매상태 입력한 비품 (구버전 '청소용품' 단일 항목 — 신규 seed엔 없음 → lingering)
  makeLegacyItem({
    id: 'oc-sup-25',
    category: '비품',
    title: '[운영/청소] 청소용품',
    quantityNeeded: 3,
    quantityReady: 5,
    unit: '세트',
    supplier: '클린마트',
    purchaseStatus: '구매완료',
  }),
  // 신규 seed에서도 동일 항목이 존재하는 비품 (접두어만 다름) → 중복 append 되면 안 됨 + subCategory backfill
  makeLegacyItem({
    id: 'oc-sup-1',
    category: '비품',
    title: '[인포/사무] 인포 PC',
    assignee: '이대리',
    quantityNeeded: 2,
    quantityReady: 2,
    unit: '대',
    purchaseStatus: '입고완료',
  }),
  // 신규 seed에 동일 항목 존재(골프 타석) → 중복 없음 + 골프장 backfill
  makeLegacyItem({ id: 'oc-fac-21', title: '[골프] 골프 타석 상태 확인', status: '진행중' }),
]

describe('createDefaultChecklistItems (v2 seed)', () => {
  const seed = createDefaultChecklistItems()

  it('시설 체크에 골프장/수영장/체육관 subCategory가 존재한다', () => {
    const facSubs = new Set(seed.filter((i) => i.category === '시설 체크').map((i) => i.subCategory))
    expect(facSubs.has('골프장')).toBe(true)
    expect(facSubs.has('수영장')).toBe(true)
    expect(facSubs.has('체육관')).toBe(true)
  })

  it('비품에 수영/체육관/골프 subCategory가 구분되어 존재한다', () => {
    const supSubs = new Set(seed.filter((i) => i.category === '비품').map((i) => i.subCategory))
    expect(supSubs.has('수영')).toBe(true)
    expect(supSubs.has('체육관')).toBe(true)
    expect(supSubs.has('골프')).toBe(true)
    expect(supSubs.has('청소 / 위생')).toBe(true)
  })

  it('구버전 단일 "청소용품"이 세부 항목(빗자루/대걸레 등)으로 분해되어 있다', () => {
    const titles = seed.map((i) => i.title)
    expect(titles).toContain('빗자루')
    expect(titles).toContain('대걸레')
    expect(titles).toContain('변기 세정제')
    expect(titles).not.toContain('청소용품')
  })

  it('seed 내 (카테고리, 제목) 중복이 없다', () => {
    const keys = seed.map(key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('seed id가 유일하다', () => {
    const ids = seed.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('subCategory는 시설 체크/비품에만 채워져 있고 그 외 카테고리는 비어 있다', () => {
    for (const i of seed) {
      if (i.category === '시설 체크' || i.category === '비품') {
        expect(i.subCategory && i.subCategory.length > 0).toBe(true)
      } else {
        expect(i.subCategory ?? '').toBe('')
      }
    }
  })
})

describe('migrateOpeningChecklistItems', () => {
  const result = migrateOpeningChecklistItems(legacySaved)

  it('기존 항목을 모두 보존한다(삭제 없음)', () => {
    for (const orig of legacySaved) {
      expect(result.items.find((i) => i.id === orig.id)).toBeDefined()
    }
  })

  it('기존 사용자 입력값(상태/메모/담당자/수량/구매상태/completedAt)을 덮어쓰지 않는다', () => {
    const mirror = result.items.find((i) => i.id === 'oc-fac-8')!
    expect(mirror.status).toBe('완료')
    expect(mirror.memo).toBe('우측 거울 교체 완료')
    expect(mirror.assignee).toBe('김매니저')
    expect(mirror.completedAt).toBe('2026-06-01T09:00:00.000Z')

    const cleaning = result.items.find((i) => i.id === 'oc-sup-25')!
    expect(cleaning.quantityReady).toBe(5)
    expect(cleaning.purchaseStatus).toBe('구매완료')
    expect(cleaning.supplier).toBe('클린마트')
    expect(cleaning.title).toBe('[운영/청소] 청소용품') // 제목도 변경하지 않음

    const pc = result.items.find((i) => i.id === 'oc-sup-1')!
    expect(pc.assignee).toBe('이대리')
    expect(pc.purchaseStatus).toBe('입고완료')
  })

  it('subCategory가 비어 있던 기존 항목에 seed 기준 subCategory를 backfill 한다', () => {
    expect(result.items.find((i) => i.id === 'oc-fac-8')!.subCategory).toBe('헬스장')
    expect(result.items.find((i) => i.id === 'oc-sup-1')!.subCategory).toBe('인포 / 사무')
    expect(result.items.find((i) => i.id === 'oc-fac-21')!.subCategory).toBe('골프장')
    expect(result.backfilledCount).toBeGreaterThanOrEqual(3)
  })

  it('신규 세부 항목을 append 한다', () => {
    const titles = result.items.map((i) => i.title)
    expect(titles).toContain('수영장 염도 확인') // 시설 체크(수영장) 신규
    expect(titles).toContain('체육관 이용 안내판') // 비품(체육관) 신규
    expect(titles).toContain('빗자루') // 비품(청소/위생) 신규
    expect(result.appendedCount).toBeGreaterThan(0)
  })

  it('동일 (카테고리, 접두어 제거 제목) 조합 중복을 만들지 않는다', () => {
    const keys = result.items.map(key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('접두어만 다른 동일 항목은 중복 append 하지 않는다(인포 PC/골프 타석은 1건씩)', () => {
    expect(result.items.filter((i) => baseTitle(i.title) === '인포 PC').length).toBe(1)
    expect(result.items.filter((i) => baseTitle(i.title) === '골프 타석 상태 확인').length).toBe(1)
  })

  it('append 항목 id가 기존 id와 충돌하지 않는다', () => {
    const ids = result.items.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('id가 seed와 겹쳐도(예: oc-sup-1 기존 보유) append 항목에 새 id를 부여한다', () => {
    // 기존이 oc-sup-1을 점유 → 신규 seed의 oc-sup-1(인포 PC)은 매칭되어 append 안 됨.
    // 하지만 다른 신규 seed 항목 중 id가 기존과 겹칠 수 있는 경우를 대비한 충돌 보정 검증:
    const ids = result.items.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('migrateOpeningChecklistItems — id 충돌 보정', () => {
  it('기존 id가 신규 append 대상 seed id와 겹쳐도 유일성을 유지한다', () => {
    const seed = createDefaultChecklistItems()
    // 신규 append 될 어떤 seed 항목의 id를, 전혀 다른 기존 항목이 점유하도록 구성.
    const collidingId = seed.find((s) => s.title === '체육관 이용 안내판')!.id
    const saved: OpeningChecklistItem[] = [
      makeLegacyItem({ id: collidingId, category: '계약/행정', title: '사용자 임의 항목', subCategory: '' }),
    ]
    const out = migrateOpeningChecklistItems(saved, seed)
    const ids = out.items.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length) // 중복 id 없음
    // 사용자의 임의 항목은 그대로 보존
    expect(out.items.find((i) => i.title === '사용자 임의 항목')!.id).toBe(collidingId)
  })
})

describe('normalizeOpeningChecklistData', () => {
  it('openingChecklist가 없으면 최신 seed + 최신 버전으로 초기화한다', () => {
    const out = normalizeOpeningChecklistData(undefined)
    expect(out.items.length).toBe(createDefaultChecklistItems().length)
    expect(out.seedVersion).toBe(OPENING_CHECKLIST_SEED_VERSION)
  })

  it('items:[] (사용자가 모두 지움)는 재시드하지 않고 보존한다', () => {
    const out = normalizeOpeningChecklistData({ items: [] })
    expect(out.items.length).toBe(0)
    expect(out.seedVersion).toBe(OPENING_CHECKLIST_SEED_VERSION)
  })

  it('seedVersion이 최신이면 migration을 다시 실행하지 않는다(삭제 항목 부활 방지)', () => {
    const oneItem = legacySaved.slice(0, 1)
    const out = normalizeOpeningChecklistData({ items: oneItem, seedVersion: OPENING_CHECKLIST_SEED_VERSION })
    expect(out.items.length).toBe(1) // append 없음
  })

  it('seedVersion이 낮으면(또는 없으면) 1회 migration 후 최신 버전으로 stamp 한다', () => {
    const out = normalizeOpeningChecklistData({ items: legacySaved })
    expect(out.seedVersion).toBe(OPENING_CHECKLIST_SEED_VERSION)
    expect(out.items.length).toBeGreaterThan(legacySaved.length) // 신규 항목 append
  })
})
