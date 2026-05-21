export type AiTaskType = 'document' | 'contractGenerate' | 'contractReview' | 'agendaPredict'

export interface AiResponse {
  success: boolean
  result?: string
  error?: string
}

export async function callAiFunction(taskType: AiTaskType, payload: unknown): Promise<AiResponse> {
  try {
    const response = await fetch('/.netlify/functions/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ taskType, payload }),
    })

    const data = await response.json()
    if (!response.ok || !data?.success) {
      return {
        success: false,
        error: data?.error || data?.message || 'AI 호출 중 오류가 발생했습니다.',
      }
    }

    return {
      success: true,
      result: data.result ?? '',
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
