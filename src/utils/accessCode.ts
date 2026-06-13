// 워크스페이스 "접근 게이트"용 접근코드 클라이언트 유틸 (Phase C-1/C-2).
//
// ⚠️ 이것은 "현장(단지)별 격리"가 아니라 "워크스페이스 접근 게이트"다.
//    외부인이 함수 URL만 알고 클라우드 데이터를 읽거나 덮어쓰는 것을 1차로 막는 용도다.
//    현장별(projectId 단위) 접근 제한은 추후 server filtering 단계에서 별도로 구현 예정.
//
// 보안/격리 원칙:
//   - 접근코드는 동기화 대상이 아니다 — src/utils/syncKeys.ts(SYNC_KEYS)에 절대 포함되지 않고,
//     systemDataSyncMeta(동기화 판정용 메타)나 fingerprint 계산 대상에도 들어가지 않는다.
//   - 평문은 localStorage에 영구 저장하지 않는다. sessionStorage(탭 단위, 탭을 닫으면 사라짐)에만 둔다.
//     (불러오기/병합 후 일어나는 같은 탭의 새로고침에서는 코드가 유지되어 재입력이 불필요하다.)
//   - 화면에는 평문을 그대로 노출하지 않는다(maskAccessCode 사용).
//   - 코드 자체의 해시 계산/검증은 서버(Netlify Function)에서만 한다. 이 모듈은 코드를 보관/전달만 한다.

// sessionStorage 보관 key — 동기화 key와 의도적으로 완전히 분리된 식별자.
export const ACCESS_CODE_STORAGE_KEY = 'homebaseWorkspaceAccessCode'

// 클라우드 호출 시 코드를 실어 보낼 HTTP 헤더 이름.
// ⚠️ netlify/functions/app-state.ts 의 ACCESS_CODE_HEADER 와 반드시 동일해야 한다.
export const ACCESS_CODE_HEADER = 'x-workspace-access-code'

// SSR/테스트(node 환경) 등 sessionStorage가 없는 곳에서도 안전하도록 방어적으로 접근한다.
const safeSessionStorage = (): Storage | null => {
  try {
    const s = (globalThis as { sessionStorage?: Storage }).sessionStorage
    return s ?? null
  } catch {
    // 일부 환경(쿠키/스토리지 차단)에서 sessionStorage 접근 자체가 throw할 수 있다.
    return null
  }
}

// 현재 적용된 접근코드(트림). 없으면 빈 문자열.
export const getAccessCode = (): string => {
  const s = safeSessionStorage()
  if (!s) return ''
  try {
    return (s.getItem(ACCESS_CODE_STORAGE_KEY) || '').trim()
  } catch {
    return ''
  }
}

// 접근코드가 적용되어 있는가.
export const hasAccessCode = (): boolean => getAccessCode().length > 0

// 접근코드 적용. 빈 값(공백 포함)이면 삭제와 동일하게 처리한다.
export const setAccessCode = (code: string): void => {
  const s = safeSessionStorage()
  if (!s) return
  const trimmed = (code || '').trim()
  try {
    if (trimmed) s.setItem(ACCESS_CODE_STORAGE_KEY, trimmed)
    else s.removeItem(ACCESS_CODE_STORAGE_KEY)
  } catch {
    // 스토리지 쓰기 실패는 조용히 무시(코드가 적용되지 않을 뿐, 데이터 손상 없음).
  }
}

// 접근코드 삭제. 이후 호출은 전환기 기본 workspace fallback으로 동작한다.
export const clearAccessCode = (): void => {
  const s = safeSessionStorage()
  if (!s) return
  try {
    s.removeItem(ACCESS_CODE_STORAGE_KEY)
  } catch {
    // 무시.
  }
}

// 화면 표시용 마스킹. 평문 길이를 정확히 드러내지 않도록 고정 길이 점으로 가린다.
// 예: "MyCode2026" → "M••••6". 빈 값이면 빈 문자열.
export const maskAccessCode = (code: string): string => {
  const c = (code || '').trim()
  if (!c) return ''
  if (c.length <= 3) return '•••'
  return `${c[0]}••••${c[c.length - 1]}`
}

// 클라우드 호출에 붙일 헤더 객체. 코드가 없으면 빈 객체를 돌려준다(헤더 미부착 → 전환기 기본 workspace).
// fetch의 headers에 스프레드해서 사용한다: { ...buildAccessCodeHeaders(), 'Content-Type': ... }
export const buildAccessCodeHeaders = (): Record<string, string> => {
  const code = getAccessCode()
  return code ? { [ACCESS_CODE_HEADER]: code } : {}
}
