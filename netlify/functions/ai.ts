import { Handler } from '@netlify/functions'
import OpenAI from 'openai'

const SYSTEM_PROMPTS: Record<string, string> = {
  document: `너는 아파트 커뮤니티센터 위탁운영사의 실무 문서 작성 담당자다.
관리사무소, 입주자대표회의, 커뮤니티 운영위원회에 제출할 수 있는 공문, 안내문, 운영보고서, 정산요청서, 시설보수 요청서를 작성한다.
문체는 공문체로 작성하고, 과장된 표현은 피한다.
항목은 번호와 가, 나, 다 형식으로 정리한다.
최종 결과는 바로 복사해 사용할 수 있는 문서 형태로 작성한다.`,
  contractGenerate: `너는 아파트 커뮤니티센터 운영, 강사 계약, 장비 납품, 장비 렌탈, 업무협약 계약서 초안을 작성하는 실무 담당자다.
결과 상단에는 반드시 아래 문구를 넣는다.
"본 문서는 내부 검토용 계약서 초안이며, 최종 계약 전 법률 검토가 필요합니다."
계약서는 조항 형태로 작성한다.
최소 조항:
제1조 목적
제2조 계약기간
제3조 업무범위
제4조 계약금액 및 지급방법
제5조 정산 및 세금계산서
제6조 자료제출 및 보고
제7조 책임범위
제8조 계약해지
제9조 비밀유지
제10조 특약사항
제11조 분쟁해결 및 관할법원
과도하게 확정적인 법률 판단은 하지 않는다.`,
  contractReview: `너는 계약서 1차 검토 담당자다.
업로드 또는 붙여넣기 된 계약서 내용을 바탕으로 위험 조항, 누락 가능성이 있는 조항, 확인이 필요한 조항을 정리한다.
법률 자문을 대체한다고 표현하지 않는다.
아래 형식으로 작성한다.

[계약서 AI 검토 결과]

1. 핵심 요약
2. 확인된 주요 조항
3. 누락 또는 보완이 필요한 조항
4. 주의가 필요한 표현
5. 상대방에게 수정 요청할 문구
6. 최종 검토 의견

하단에는 반드시 아래 문구를 넣는다.
"본 검토는 AI 기반 1차 검토이며, 최종 법률 자문을 대체하지 않습니다."`,
  agendaPredict: `너는 아파트 커뮤니티센터 운영 컨설턴트다.
아파트 게시판 자료, 민원자료, 회의록, 운영일지 내용을 바탕으로 입주자대표회의에서 논의될 수 있는 안건을 예상한다.
커뮤니티센터 운영, 민원, 시설관리, 인력운영, 이용요금, 예약제, 안전관리 관점에서 검토한다.
아래 형식으로 작성한다.

[입대의 예상 안건 AI 검토]

1. 예상 안건명
2. 발생 배경
3. 관련 시설
4. 예상 쟁점
5. 관리주체 사전 준비자료
6. 위탁운영사 대응 방향
7. 입대의 보고용 요약문
8. 게시판 공지 또는 안내문 초안`,
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, error: 'POST 요청만 허용됩니다.' }),
    }
  }

  if (!event.body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, error: '요청 본문이 필요합니다.' }),
    }
  }

  let body
  try {
    body = JSON.parse(event.body)
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, error: '요청 본문이 유효한 JSON이 아닙니다.' }),
    }
  }

  const { taskType, payload } = body
  if (!taskType || typeof taskType !== 'string') {
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, error: 'taskType이 필요합니다.' }),
    }
  }

  const systemPrompt = SYSTEM_PROMPTS[taskType]
  if (!systemPrompt) {
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, error: '지원하지 않는 taskType입니다.' }),
    }
  }

  const apiKey = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_MODEL || 'gpt-5.5'

  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: 'OPENAI_API_KEY가 설정되지 않았습니다.' }),
    }
  }

  try {
    const client = new OpenAI({ apiKey })
    const response = await client.responses.create({
      model,
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `payload:\n${JSON.stringify(payload, null, 2)}` },
      ],
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
      body: JSON.stringify({ success: true, result: outputText.trim() }),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: message }),
    }
  }
}

export { handler }
