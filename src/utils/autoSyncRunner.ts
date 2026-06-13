// 자동 동기화 "실행 코어" (Phase D-1) — 수동 1회 실행용 오케스트레이터.
//
// 목적:
//   Phase D-0의 순수 판정 엔진(decideAutoSync)을 "트리거"로 삼아, 사용자가 버튼을 눌렀을 때
//   1회만 실제 동작(클라우드 저장/불러오기 병합)을 수행하는 흐름을 모은다.
//   ⚠️ 이 단계는 자동 트리거가 아니다 — setInterval/visibilitychange/beforeunload/페이지 진입 자동 실행
//      은 일절 없다. 호출부가 버튼 onClick에서 1회 호출할 때만 동작한다.
//
// 설계 원칙(테스트 가능성 + 안전):
//   - 이 모듈은 window/DOM/fetch/localStorage/타이머에 직접 의존하지 않는다. 필요한 부수효과(클라우드
//     조회/저장, 백업, 병합 적용, 지문 계산, 현재 시각)는 전부 deps로 "주입"받는다. 그래서 단위 테스트에서
//     실제 네트워크/스토리지 없이 stub만으로 모든 분기를 검증할 수 있다.
//   - "실행 직전" 클라우드 상태를 항상 새로(GET) 조회하고, 그 신선한 신호로 decideAutoSync를 "다시" 호출한다.
//     → 페이지가 들고 있던 오래된(stale) 판정으로 저장하는 사고를 구조적으로 차단한다.
//     특히 canPush는 "신선 재판정 결과가 canPush" 라는 것 자체가 "cloud updated_at == 기준선(cloudChanged=false)"
//     임을 의미한다(decideAutoSync 계약). 직전에 cloud가 바뀌었다면 재판정이 needsManualMerge/canPullMerge가 되어
//     push로 진입하지 못한다.
//   - 이 모듈은 메타를 직접 저장하거나 새로고침하지 않는다. "무엇을 메타에 반영해야 하는지(metaPatch)"와
//     "새로고침이 필요한지(shouldReload)"만 돌려주고, 영구화/새로고침은 호출부가 한다(reload 전에 saveMeta가
//     보장되도록 — 기존 수동 불러오기 흐름과 동일).

import {
  decideAutoSync,
  type AutoSyncMetaFields,
  type AutoSyncState,
  type CloudSignal,
} from './autoSyncDecision'

// 실행 결과 분류(사용자 표시/페이지 분기용).
export type AutoSyncOutcome =
  | 'disabled' // 토글 꺼짐 — 실행하지 않음
  | 'idle' // 변경 없음 — 아무 작업 없음
  | 'pushed' // 클라우드 저장 완료
  | 'pulledMerged' // 클라우드 불러오기 + 병합 완료
  | 'needsManualMerge' // 양쪽 변경 — 자동 처리하지 않음(수동 병합 필요)
  | 'needsInitialSync' // 기준선 없음 — 먼저 수동 저장/불러오기 필요
  | 'cancelled' // canPush 저장 직전 사용자가 확인을 취소함 — 쓰기 없음
  | 'error' // 클라우드 확인 실패/네트워크 오류 등 — 중단

// ─── 주입 의존성 타입 ─────────────────────────────────────────────────────────
// push(저장) 결과. POST 응답을 호출부가 정규화해 넘긴다(이 모듈은 fetch 모름).
export interface PushOutcome {
  ok: boolean
  saved: number
  message?: string
}
// pull(불러오기) 페이로드. GET 응답을 호출부가 정규화해 넘긴다.
export interface PullPayload {
  ok: boolean
  items: Record<string, unknown>
  updatedAt: Record<string, string>
  message?: string
}
// 병합 적용 결과. 호출부가 mergeSyncValue로 localStorage에 병합 적용한 뒤,
// 적용 건수/병합 후 지문/클라우드 최신 updated_at을 돌려준다.
export interface ApplyMergeOutcome {
  applied: number
  mergedFingerprint: string
  cloudLatest: string | null
}

export interface AutoSyncRunDeps {
  // 결정성/테스트를 위해 현재 시각(ISO)도 주입. (이 모듈은 new Date()를 직접 부르지 않는다.)
  now: () => string
  // 실행 직전 클라우드 상태를 새로(GET) 조회. 읽기 전용 — 절대 쓰기 금지.
  getCloudSignal: () => Promise<CloudSignal>
  // 현재 동기화 대상 localStorage payload의 지문(자동 판정 비교용).
  getLocalFingerprint: () => string
  // canPush 직전 사용자 확인 게이트(필수). false면 push(저장 POST)를 호출하지 않는다.
  // ⚠️ 안전 계약: 실제 클라우드 저장은 사용자가 명시적으로 승인했을 때만 일어난다.
  confirmPush: () => boolean
  // canPush: 현재 로컬을 클라우드에 저장(POST). 성공/저장건수/메시지 반환.
  push: () => Promise<PushOutcome>
  // canPullMerge 전: 병합 직전 로컬 백업 생성(되돌리기 안전망). 실패 시 throw → 불러오기 중단.
  backup: () => string
  // canPullMerge: 클라우드 payload + updated_at 맵 GET.
  pull: () => Promise<PullPayload>
  // canPullMerge: pull 결과를 mergeSyncValue로 localStorage에 병합 적용.
  applyMerge: (pull: PullPayload) => ApplyMergeOutcome
}

export interface AutoSyncRunArgs {
  autoSyncEnabled: boolean
  baseline: {
    lastSyncedAt?: string
    lastCloudUpdatedAt?: string
    lastLocalFingerprint?: string
  }
}

export interface AutoSyncRunResult {
  outcome: AutoSyncOutcome
  decidedState: AutoSyncState // 신선 재판정으로 나온 state(참고/로그용)
  acted: boolean // 실제 네트워크 쓰기(push) 또는 병합 적용(merge-write)을 수행했는지
  shouldReload: boolean // 호출부가 새로고침해야 하는지(병합 적용 성공 시 true)
  message: string // 사용자 표시 메시지(한글)
  // 호출부가 systemDataSyncMeta에 머지해 저장할 변경분. 호출부는 reload 전에 반드시 먼저 저장한다.
  metaPatch: AutoSyncMetaFields
}

// 결과 빌더.
const make = (
  outcome: AutoSyncOutcome,
  decidedState: AutoSyncState,
  message: string,
  metaPatch: AutoSyncMetaFields,
  acted = false,
  shouldReload = false,
): AutoSyncRunResult => ({ outcome, decidedState, acted, shouldReload, message, metaPatch })

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e))

// 자동 동기화 1회 실행. 어떤 입력/오류에도 throw하지 않고 결과 객체로 돌려준다(호출부 보호).
export const runAutoSyncOnce = async (
  args: AutoSyncRunArgs,
  deps: AutoSyncRunDeps,
): Promise<AutoSyncRunResult> => {
  // 0) 토글 OFF면 어떤 deps도 호출하지 않고 즉시 중단(네트워크/메타 변경 0).
  //    버튼은 OFF일 때 비활성이어야 정상이지만, 방어적으로 한 번 더 막는다.
  if (!args || !args.autoSyncEnabled) {
    return make('disabled', 'disabled', '자동 동기화가 꺼져 있습니다. 토글을 켜야 실행할 수 있습니다.', {})
  }

  const at = deps.now()
  const attempt: AutoSyncMetaFields = { lastAutoSyncAttemptAt: at }

  try {
    // 1) 실행 직전 신선한 클라우드 상태 + 로컬 지문으로 "지금" 다시 판정한다(stale 방지).
    const cloud = await deps.getCloudSignal()
    const currentLocalFingerprint = deps.getLocalFingerprint()
    const decision = decideAutoSync({
      autoSyncEnabled: true,
      baseline: args.baseline,
      cloud,
      currentLocalFingerprint,
    })

    switch (decision.state) {
      // ── 쓰기 없는 안전 상태들 ──────────────────────────────────────────────
      case 'idle':
        return make('idle', 'idle', '로컬과 클라우드가 일치합니다 — 변경 사항이 없어 아무 작업도 하지 않았습니다.', {
          ...attempt,
          lastAutoSyncStatus: 'success',
          lastAutoSyncError: undefined,
        })

      case 'needsInitialSync':
        return make(
          'needsInitialSync',
          'needsInitialSync',
          '기준 동기화 기록이 없습니다. 먼저 "클라우드에 저장" 또는 "클라우드에서 불러오기"로 기준선을 한 번 잡아주세요.',
          { ...attempt, lastAutoSyncStatus: 'success', lastAutoSyncError: undefined },
        )

      case 'needsManualMerge':
        // 로컬·클라우드가 모두 변경 → 자동으로 저장/불러오기 어느 쪽도 하지 않는다.
        return make(
          'needsManualMerge',
          'needsManualMerge',
          '로컬과 클라우드가 모두 변경되어 자동으로 처리하지 않았습니다. "클라우드에서 불러오기(백업 후 병합)"로 직접 확인·병합해주세요.',
          { ...attempt, lastAutoSyncStatus: 'success', lastAutoSyncError: undefined },
        )

      case 'error':
        return make(
          'error',
          'error',
          '클라우드 상태를 확인할 수 없어 자동 동기화를 중단했습니다.',
          { ...attempt, lastAutoSyncStatus: 'error', lastAutoSyncError: '클라우드 상태 확인 실패' },
        )

      // ── canPush: 로컬만 변경 → 클라우드 저장 ─────────────────────────────────
      case 'canPush': {
        // 신선 재판정이 canPush라는 것은 "cloud updated_at == 기준선(cloudChanged=false)"라는 의미다.
        // 즉 직전에 cloud가 바뀌었다면 여기 오지 못한다(needsManualMerge/canPullMerge로 빠짐).
        // 실제 클라우드 저장(POST) 직전, 사용자 확인을 받는다. 취소 시 어떤 쓰기도 하지 않는다.
        if (!deps.confirmPush()) {
          return make('cancelled', 'canPush', '사용자가 취소했습니다. 클라우드에 저장하지 않았습니다.', {
            ...attempt, // 시도 시각만 기록(성공/실패 아님 → 기존 status는 건드리지 않음)
          })
        }
        const pushRes = await deps.push()
        if (!pushRes.ok) {
          const m = pushRes.message || '클라우드 저장에 실패했습니다.'
          return make('error', 'canPush', m, {
            ...attempt,
            lastAutoSyncStatus: 'error',
            lastAutoSyncError: m,
          })
        }
        if (pushRes.saved <= 0) {
          // 저장된 항목이 없으면(빈 데이터 등) 기준선을 갱신하지 않는다 — 의미 있는 저장이 아님.
          return make('idle', 'canPush', '저장할 데이터가 없어 아무 항목도 저장하지 않았습니다.', {
            ...attempt,
            lastAutoSyncStatus: 'success',
            lastAutoSyncError: undefined,
          })
        }
        // 저장 성공 → 새 클라우드 updated_at을 다시 조회해 기준선(lastCloudUpdatedAt)을 정확히 기록한다.
        // (POST 응답에는 updated_at이 없으므로 GET으로 재확인. push는 로컬을 바꾸지 않으므로 지문은 그대로지만
        //  안전하게 다시 계산해 기준선으로 삼는다.)
        const after = await deps.getCloudSignal()
        const fpAfter = deps.getLocalFingerprint()
        return make(
          'pushed',
          'canPush',
          `${pushRes.saved}개 항목을 클라우드에 저장했습니다.`,
          {
            ...attempt,
            lastSyncedAt: at,
            lastCloudUpdatedAt: after.available
              ? after.latestUpdatedAt || undefined
              : args.baseline.lastCloudUpdatedAt,
            lastLocalFingerprint: fpAfter,
            lastAutoSyncStatus: 'success',
            lastAutoSyncError: undefined,
          },
          true,
        )
      }

      // ── canPullMerge: 클라우드만 변경 → 백업 후 불러오기 병합 ──────────────────
      case 'canPullMerge': {
        // 1) 병합 적용 "전에" 반드시 로컬 백업을 먼저 만든다(되돌리기 안전망 — Phase A 정책).
        //    백업 실패 시 throw → catch에서 error 처리(어떤 쓰기도 하지 않음).
        const backupFileName = deps.backup()
        // 2) 클라우드 payload GET.
        const pull = await deps.pull()
        if (!pull.ok) {
          const m = pull.message || '클라우드 불러오기에 실패했습니다.'
          return make('error', 'canPullMerge', m, {
            ...attempt,
            lastAutoSyncStatus: 'error',
            lastAutoSyncError: m,
          })
        }
        // 3) key별 안전 병합(mergeSyncValue) 적용 → 병합 후 지문/클라우드 최신값 회수.
        const applied = deps.applyMerge(pull)
        // 4) 기준선 갱신: 병합 후 로컬이 클라우드를 흡수했으므로 현재 cloud updated_at + 병합 후 지문 기록.
        return make(
          'pulledMerged',
          'canPullMerge',
          `${applied.applied}개 항목을 백업 후 병합했습니다. (백업 파일: ${backupFileName}) 새로고침합니다.`,
          {
            ...attempt,
            lastSyncedAt: at,
            lastCloudUpdatedAt: applied.cloudLatest || args.baseline.lastCloudUpdatedAt,
            lastLocalFingerprint: applied.mergedFingerprint,
            lastAutoSyncStatus: 'success',
            lastAutoSyncError: undefined,
          },
          true,
          true, // shouldReload — 호출부가 saveMeta 후 새로고침
        )
      }

      // disabled는 위에서 이미 걸러졌지만, 완전성을 위해 방어적으로 처리.
      default:
        return make('disabled', decision.state, '자동 동기화가 꺼져 있습니다.', {})
    }
  } catch (e) {
    const m = errText(e)
    return make('error', 'error', '자동 동기화 중 오류가 발생했습니다: ' + m, {
      ...attempt,
      lastAutoSyncStatus: 'error',
      lastAutoSyncError: m,
    })
  }
}
