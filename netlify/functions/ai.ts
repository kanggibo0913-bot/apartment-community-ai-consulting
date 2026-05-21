import { Handler } from '@netlify/functions'
import OpenAI from 'openai'

// 공통 지침: 모든 taskType에 공통으로 적용됩니다.
const COMMON_GUIDELINES = `공통 지침:
- 사용자가 입력하지 않은 구체적 금액, 날짜, 보너스, 수수료, 특약, 법적 의무를 임의로 작성하지 마세요.
- 입력값이 부족한 항목은 "별도 협의", "확인 필요", "입력 필요"로 표시하세요.
- 특정 사실처럼 단정하지 말고, 필요한 경우 "검토 필요 사항"으로 분류하세요.
- 계약서 생성 시 특약사항 입력값이 없으면 임의 특약을 만들지 말고 간단한 안내 문구로 처리하세요.
- 계약서 검토 시 제공된 계약문에 없는 내용을 사실처럼 단정하지 말고 보완 필요사항으로 제시하세요.`

const SYSTEM_PROMPTS: Record<string, string> = {
  document: `${COMMON_GUIDELINES}\n\n아파트 커뮤니티센터 위탁운영사의 실무 문서를 작성하는 책임자입니다. 관리사무소, 입주자대표회의에 제출 가능한 공문 형식으로 작성하세요. 작성 요칙: - 공문체 유지 - 배경, 주요 내용, 요청사항, 첨부자료 포함 - 과장 금지 - 상단에 "[AI 생성 결과]" 라벨 붙일 것 - 500~900자 수준으로 작성`,

  contractGenerate: `${COMMON_GUIDELINES}\n\n아파트 커뮤니티센터 계약서 초안을 작성합니다. 상단에 "[AI 생성 결과]"와 "본 문서는 내부 검토용 초안이며, 최종 계약 전 법률 검토가 필요합니다." 표시. 11개 조항을 작성: 제1조 목적, 제2조 계약기간, 제3조 업무범위, 제4조 계약금액 및 지급방법, 제5조 정산 및 세금계산서, 제6조 자료제출, 제7조 책임범위, 제8조 계약해지, 제9조 비밀유지, 제10조 특약사항, 제11조 분쟁해결. 각 조항은 2~4문장 이내의 1차 초안 수준으로 작성. 특약사항 입력값이 없을 경우 제10조에는 "본 계약과 관련한 특약사항은 별도 합의서 또는 본 계약서 말미에 기재한다."라고 기재하세요. 1,000~1,500자.`,

  contractReview: `${COMMON_GUIDELINES}\n\n계약서 1차 검토 담당자입니다. 상단에 "[AI 검토 결과]" 라벨 붙일 것. 검토 항목: 1. 계약 구조 요약 2. 당사자별 의무 3. 금전 조건 검토 4. 계약해지 및 위약금 리스크 5. 누락 조항 6. 수정 요청 문구 (구체적) 7. 최종 의견. 하단에 "본 검토는 AI 기반 1차 검토이며, 최종 법률 자문을 대체하지 않습니다." 표시. 800~1,200자.`,

  agendaPredict: `${COMMON_GUIDELINES}\n\n아파트 커뮤니티센터 운영 컨설턴트입니다. 입주자대표회의에서 논의될 안건을 예측합니다. 상단에 "[AI 예상 안건]" 라벨 붙일 것. 분석 항목: 1. 예상 안건명 2. 발생 배경 3. 쟁점 4. 관리주체 확인 자료 5. 위탁운영사 준비 자료 6. 입대의 보고용 요약 (200자) 7. 게시판 공지 초안 (300자). 800~1,100자.`,
}

const handler: Handler = async (event) => {
  const jsonHeaders = { 'Content-Type': 'application/json' }

  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({
        success: false,
        error: 'AI function is alive. Use POST request.',
      }),
    }
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: jsonHeaders,
      body: JSON.stringify({ success: false, error: 'POST 요청만 허용됩니다.' }),
    }
  }

  if (!event.body) {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ success: false, error: '요청 본문이 필요합니다.' }),
    }
  }

  let body
  try {
    body = JSON.parse(event.body)
  } catch {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ success: false, error: '요청 본문이 유효한 JSON이 아닙니다.' }),
    }
  }

  const { taskType, payload } = body
  if (!taskType || typeof taskType !== 'string') {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ success: false, error: 'taskType이 필요합니다.' }),
    }
  }

  console.log('AI function taskType:', taskType)

  const systemPrompt = SYSTEM_PROMPTS[taskType]
  if (!systemPrompt) {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({
        success: false,
        error: `지원하지 않는 taskType입니다: ${taskType}. 지원하는 taskType: document, contractGenerate, contractReview, agendaPredict`,
      }),
    }
  }


  // taskType별 user prompt 생성 (간결하게)
  let userPrompt = ''
  switch (taskType) {
    case 'document':
      userPrompt = `입력: ${JSON.stringify(payload)}\n위 정보로 공문 형식의 문서를 작성하세요. 배경, 내용, 요청사항 포함.`
      break
    case 'contractGenerate':
      userPrompt = `입력: ${JSON.stringify(payload)}\n위 정보로 계약서 초안 (11개 조항)을 작성하세요. 각 조항은 2~4문장.`
      break
    case 'contractReview':
      userPrompt = `검토 계약서: ${JSON.stringify(payload)}\n위 계약서의 핵심 리스크를 검토하고 수정 요청 문구를 작성하세요.`
      break
    case 'agendaPredict':
      userPrompt = `자료: ${JSON.stringify(payload)}\n입대의 안건을 예측하고, 보고 요약문과 공지문 초안을 작성하세요.`
      break
    default:
      userPrompt = `payload:\n${JSON.stringify(payload, null, 2)}`
  }

  const maxOutputTokensByTask: Record<string, number> = {
    document: 900,
    contractGenerate: 1400,
    contractReview: 1200,
    agendaPredict: 1100,
  }
  const maxOutputTokens = maxOutputTokensByTask[taskType] || 900

  const apiKey = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_MODEL || 'gpt-4-turbo'


  if (!apiKey) {
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ success: false, error: 'OPENAI_API_KEY가 설정되지 않았습니다.' }),
    }
  }

  try {
    const client = new OpenAI({ apiKey, timeout: 25000 })
    const response = await client.responses.create({
      model,
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_output_tokens: maxOutputTokens,
    })

    const outputText = Array.isArray(response.output)
      ? response.output
          .map((item: any) => {
            if (typeof item === 'string') return item
            if (item?.content) {
              if (Array.isArray(item.content)) {
                return item.content.map((piece: any) => (typeof piece === 'string' ? piece : piece.text ?? '')).join('')
              }
              return typeof item.content === 'string' ? item.content : item.content.text ?? ''
            }
            return ''
          })
          .join('')
      : typeof response.output_text === 'string'
      ? response.output_text
      : ''

    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({ success: true, result: outputText.trim() }),
    }
  } catch (error) {
    let message = '알 수 없는 오류가 발생했습니다.'

    if (error instanceof Error) {
      const isTimeoutError =
        error.name === 'TimeoutError' ||
        error.message.includes('timeout') ||
        error.message.includes('Timeout') ||
        error.message.includes('ECONNABORTED')

      if (isTimeoutError) {
        message = 'AI 응답 시간이 길어 요청이 중단되었습니다. 입력 내용을 줄이거나 다시 시도해주세요.'
      } else {
        message = `AI 호출 중 오류가 발생했습니다: ${error.message}`
      }
    }

    console.error('AI function error:', message)
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ success: false, error: message }),
    }
  }
}

export { handler }
