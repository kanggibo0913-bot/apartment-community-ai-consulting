export type AiTaskType =
  | 'document'
  | 'contractGenerate'
  | 'contractReview'
  | 'agendaPredict'
  | 'monthlyReport'
  | 'bidNoticeAnalysis'

export interface AiResponse {
  success: boolean
  result?: string
  error?: string
}

// 신규/개편 코드에서 사용하는 안전한 반환 형태
export interface AIResult {
  ok: boolean
  result?: string
  error?: string
}

export async function callAiFunction(taskType: AiTaskType, payload: unknown): Promise<AiResponse> {
  try {
    console.log('AI request:', taskType, payload)
    
    const response = await fetch('/.netlify/functions/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ taskType, payload }),
    })

    // 먼저 text로 받아서 JSON 파싱 시도
    const rawText = await response.text()
    
    let data
    try {
      data = JSON.parse(rawText)
    } catch (parseError) {
      console.error('Non-JSON response from AI function:', rawText.slice(0, 500))
      return {
        success: false,
        error: `AI 함수 응답이 JSON이 아닙니다. 상태코드: ${response.status}. 응답 앞부분: ${rawText.slice(0, 200)}`,
      }
    }

    if (!response.ok || !data?.success) {
      return {
        success: false,
        error: data?.error || data?.message || `AI 호출 실패 (상태: ${response.status})`,
      }
    }

    return {
      success: true,
      result: data.result ?? '',
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('callAiFunction error:', errorMsg)
    return {
      success: false,
      error: `AI 함수 호출 중 오류: ${errorMsg}`,
    }
  }
}

// 서버/네트워크 오류를 사용자용 한국어 메시지로 분류한다.
function mapAiError(serverError: string, status: number): string {
  const e = serverError || ''
  if (status === 504 || status === 408) {
    return 'AI 응답 시간이 초과되었습니다. 다시 시도해주세요.'
  }
  if (e.includes('OPENAI_API_KEY')) {
    return 'AI API 키가 설정되지 않았습니다. Netlify 환경변수를 확인해주세요.'
  }
  if (e.includes('OPENAI_MODEL') || /\bmodel\b/i.test(e)) {
    return 'AI 모델 호출 중 오류가 발생했습니다. OPENAI_MODEL 값을 확인해주세요.'
  }
  if (/timeout|시간이 길어|시간이 초과/i.test(e)) {
    return 'AI 응답 시간이 초과되었습니다. 다시 시도해주세요.'
  }
  if (e) return e // 서버가 제공한 구체 메시지를 우선 노출
  return 'AI 응답 생성 중 알 수 없는 오류가 발생했습니다.'
}

// 신규/개편 코드용 호출 함수. 타임아웃·네트워크·HTTP·파싱 오류를 모두 분류해 {ok,result,error}로 반환한다.
const AI_REQUEST_TIMEOUT_MS = 60000

export async function callAI(
  taskType: AiTaskType,
  payload: unknown,
  timeoutMs: number = AI_REQUEST_TIMEOUT_MS,
): Promise<AIResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch('/.netlify/functions/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskType, payload }),
      signal: controller.signal,
    })

    const rawText = await response.text()

    let data: { success?: boolean; result?: string; error?: string; message?: string } | null = null
    try {
      data = JSON.parse(rawText)
    } catch {
      // JSON이 아니면 함수 미서빙(404) 또는 게이트웨이 타임아웃/오류(502/504)
      console.error('Non-JSON response from AI function:', response.status, rawText.slice(0, 200))
      if (response.status === 504 || response.status === 502 || response.status === 408) {
        return { ok: false, error: 'AI 응답 시간이 초과되었습니다. 다시 시도해주세요.' }
      }
      return {
        ok: false,
        error: 'AI 함수에 연결할 수 없습니다. 배포 환경 또는 Netlify Functions 설정을 확인해주세요.',
      }
    }

    if (response.ok && data?.success) {
      return { ok: true, result: data.result ?? '' }
    }

    return { ok: false, error: mapAiError(data?.error || data?.message || '', response.status) }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, error: 'AI 응답 시간이 초과되었습니다. 다시 시도해주세요.' }
    }
    const msg = error instanceof Error ? error.message : String(error)
    console.error('callAI network error:', msg)
    return { ok: false, error: '네트워크 오류로 AI 요청에 실패했습니다.' }
  } finally {
    // 성공/실패/타임아웃/예외 모든 경로에서 타이머 정리 → 호출부 finally의 loading 해제가 항상 동작
    clearTimeout(timer)
  }
}
