export type AiTaskType = 'document' | 'contractGenerate' | 'contractReview' | 'agendaPredict'

export interface AiResponse {
  success: boolean
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
