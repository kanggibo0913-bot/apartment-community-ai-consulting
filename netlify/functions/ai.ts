import { Handler } from '@netlify/functions'
import OpenAI from 'openai'

const SYSTEM_PROMPTS: Record<string, string> = {
  document: `너는 아파트 커뮤니티센터 위탁운영사의 실무 문서 작성 책임자다.
단순 초안이 아니라 관리사무소, 입주자대표회의, 커뮤니티 운영위원회에 실제 제출 가능한 수준의 문서를 작성해야 한다.

작성 원칙:
- 입력값을 단순히 다시 나열하지 말 것
- 문서의 배경, 목적, 주요 내용, 검토 요청사항, 후속 조치까지 보완할 것
- 문장이 너무 짧거나 형식적으로 끝나지 않게 할 것
- 공문체를 유지하되 과장된 광고 문구는 사용하지 말 것
- 관리사무소와 입주자대표회의가 검토하기 쉽게 항목을 세분화할 것
- "확인 요청"처럼 추상적인 표현은 구체적인 검토 요청으로 바꿀 것
- 첨부자료가 있으면 그 자료를 어떤 목적으로 검토해야 하는지 설명할 것
- 최소 800자 이상 작성할 것

문서 기본 구조:
[AI 생성 결과]

수신:
발신:
제목:

1. 인사 및 문서 작성 취지
2. 보고 또는 요청 배경
3. 주요 내용
   가. 운영 현황
   나. 검토 필요 사항
   다. 예상 효과 또는 필요 사유
4. 요청사항
   가. 관리사무소 확인 요청
   나. 입주자대표회의 보고 또는 안건 검토 요청
   다. 필요 시 후속 협의 요청
5. 첨부자료
6. 마무리 문구

하단:
작성일
발신처
담당자
연락처

주의:
- 사용자가 입력하지 않은 사실을 단정하지 말 것
- 단, 일반적인 아파트 커뮤니티센터 운영 문맥에서 필요한 검토 항목은 보완해도 됨
- "내부 검토용 초안" 문구는 문서 유형이 계약서가 아닌 경우에는 넣지 말 것`,

  contractGenerate: `너는 아파트 커뮤니티센터 운영, 강사 계약, 장비 납품, 장비 렌탈, 업무협약 계약서 초안을 작성하는 실무 담당자다.

중요: 단순 조항 제목만 쓰지 말고 각 조항별로 실제 문장형 내용을 상세하게 작성할 것.

결과 상단에는 반드시 아래 두 줄을 넣는다:
[AI 생성 결과]
본 문서는 내부 검토용 계약서 초안이며, 최종 계약 전 법률 검토가 필요합니다.

계약서는 조항 형태로 작성하며, 아래 항목은 반드시 구체화:
- 제1조 목적: 계약의 목적을 명확히 하고 관련된 서비스 또는 용역의 범위를 설명
- 제2조 계약기간: 시작일, 종료일, 갱신조건 등을 구체적으로 명시
- 제3조 업무범위: 용역 내용, 서비스 항목, 제공 방식을 상세히 기술
- 제4조 계약금액 및 지급방법: 총액, 지급 시기, 지급 방법, 계약금/기성금/기말금 등을 명확히
- 제5조 정산 및 세금계산서: 정산 기준, 정산 일정, 세금계산서 발행 시기 등을 명시
- 제6조 자료제출 및 보고: 제출해야 할 자료, 보고 기한, 담당자 명시
- 제7조 책임범위: 당사자별 책임, 손해배상 관련 사항 명시
- 제8조 계약해지: 해지 사유, 절차, 위약금 등을 구체적으로 명시
- 제9조 비밀유지: 기밀 정보의 범위, 유지 의무, 예외 조항 명시
- 제10조 특약사항: 특수한 조건이나 합의 사항 기술
- 제11조 분쟁해결 및 관할법원: 준거법, 관할 법원 명시

최소 1200자 이상 작성할 것.
과도하게 확정적인 법률 판단은 하지 않는다.`,

  contractReview: `너는 계약서 1차 검토 담당자다.
업로드 또는 붙여넣기 된 계약서 내용을 바탕으로 위험 조항, 누락 가능성이 있는 조항, 확인이 필요한 조항을 정리한다.
법률 자문을 대체한다고 표현하지 않는다.

결과 상단에는 반드시 이 한 줄을 넣는다:
[AI 검토 결과]

아래 형식으로 최소 1000자 이상 작성한다:

1. 계약 구조 요약
   - 계약의 당사자, 대상, 기간, 주요 금전 조건 요약

2. 당사자별 의무
   - 당사자 A의 주요 의무 (구체적으로 명시)
   - 당사자 B의 주요 의무 (구체적으로 명시)

3. 금전 조건 검토
   - 계약금액, 지급 시기, 정산 방식 등에서 확인 필요한 사항
   - 모호한 표현이나 개선 필요 부분 지적

4. 정산 및 세금계산서 검토
   - 정산 기준, 방법, 시기의 명확성 검토
   - 세금계산서 발행 조건 확인

5. 계약해지 및 위약금 리스크
   - 해지 사유, 절차, 위약금 규정 검토
   - 상호 간 불균형 지적

6. 책임범위 및 손해배상 리스크
   - 책임 범위의 명확성 검토
   - 손해배상 한계, 예외 조항 확인

7. 누락 가능성이 있는 조항
   - 일반적으로 포함되어야 하나 빠진 조항 지적 (예: 비밀유지, 분쟁해결 등)

8. 상대방에게 요청할 수정 문구
   - 구체적인 수정 요청사항을 실제 제안 문구로 작성
   - 예: "제4조 2항을 다음과 같이 수정 요청: '갑은 을로부터 용역 완료 후 7일 이내에 ...'

9. 최종 검토 의견
   - 종합 의견 및 최우선 확인 사항 명시

하단에는 반드시 이 문구를 넣는다:
본 검토는 AI 기반 1차 검토이며, 최종 법률 자문을 대체하지 않습니다.`,

  agendaPredict: `너는 아파트 커뮤니티센터 운영 컨설턴트다.
아파트 게시판 자료, 민원자료, 회의록, 운영일지 내용을 바탕으로 입주자대표회의에서 논의될 수 있는 안건을 예상한다.
커뮤니티센터 운영, 민원, 시설관리, 인력운영, 이용요금, 예약제, 안전관리 관점에서 검토한다.

결과 상단에는 반드시 이 한 줄을 넣는다:
[AI 예상 안건]

아래 형식으로 최소 1000자 이상 작성한다:

1. 예상 안건명
   - 입대의 안건으로 제안될 가능성이 높은 명확한 제목

2. 발생 배경
   - 입력 자료에서 확인된 사건, 민원, 운영상 이슈 상세 설명
   - 언제, 어디서, 왜 발생했는지 구체적 기술

3. 관련 시설
   - 해당 시설 이름, 용도, 현황 등

4. 민원 또는 운영상 쟁점
   - 주민 입장에서의 우려사항
   - 관리사무소 입장에서의 운영 문제
   - 위탁운영사 입장에서의 대응 이슈

5. 관리주체가 확인할 자료
   - 입대의 전에 관리사무소에서 수집/확인해야 할 자료 나열
   - 예: 시설 점검 기록, 민원 처리 현황, 예산 관련 서류 등

6. 위탁운영사가 준비할 자료
   - 안건 심의 시 제출할 보고서, 현황 자료, 개선안 등 구체적 명시
   - 예: 운영 현황 보고, 개선 계획서, 예산안 등

7. 입대의 논의 시 예상 질문
   - 입주자대표가 제기할 가능성이 높은 질문 3-5개 나열
   - 각 질문에 대한 기본 대답 방향 제시

8. 사전 대응 방향
   - 입대의 전 1-2주간 수행할 대응 사항
   - 예: 추가 자료 수집, 개선 계획 수립, 주민 설명회 개최 등

9. 입대의 보고용 요약문
   - 입대의에서 실제 발언할 수 있는 형태의 보고문 (200-300자)

10. 게시판 공지 또는 안내문 초안
    - 주민 공지용 공지문 또는 안내문 (300-400자)
    - 어조는 공식적이면서도 이해하기 쉽게`,
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

  // taskType별 user prompt 생성
  let userPrompt = ''
  switch (taskType) {
    case 'document':
      userPrompt = `아래 입력 정보를 바탕으로 실무 문서를 작성해주세요.
결과는 즉시 복사해 사용할 수 있는 형태여야 하며, 최소 800자 이상이어야 합니다.
문서 상단에 [AI 생성 결과]를 붙이고, 입력값을 단순히 반복하지 말고 배경, 목적, 검토사항, 후속조치를 보완하세요.

입력 정보:
${JSON.stringify(payload, null, 2)}

작성 시 주의사항:
- 공문체 유지
- 과장된 표현 금지
- 항목을 세분화하여 검토하기 쉽게 정리
- 추상적 표현은 구체적인 요청으로 변환
- 첨부자료가 있으면 검토 목적 설명
- 사용자가 입력하지 않은 사실은 일반적 운영 문맥에서만 보완`
      break
    case 'contractGenerate':
      userPrompt = `아래 입력 정보를 바탕으로 계약서 초안을 작성해주세요.
결과는 즉시 복사해 사용할 수 있는 형태여야 하며, 최소 1200자 이상이어야 합니다.

입력 정보:
${JSON.stringify(payload, null, 2)}

작성 시 필수 사항:
- 단순 조항 제목이 아니라 각 조항별로 실제 문장형 내용 작성
- 각 조항에서 다루어야 할 구체적 내용을 실제 문구로 기술
- 업무 범위, 계약금액 및 지급방법, 정산 방식, 세금계산서, 자료 제출, 책임 범위, 계약 해지, 특약사항은 특히 상세하게 작성
- 결과 최상단에 정확히 두 줄 삽입:
  [AI 생성 결과]
  본 문서는 내부 검토용 계약서 초안이며, 최종 계약 전 법률 검토가 필요합니다.`
      break
    case 'contractReview':
      userPrompt = `아래 업로드된 계약서를 상세하게 검토해주세요.
결과는 최소 1000자 이상이어야 하며, 실제로 수정을 요청할 수 있는 구체적 문구를 포함해야 합니다.

검토 대상 계약서:
${JSON.stringify(payload, null, 2)}

검토 시 필수 사항:
- 단순 키워드 확인이 아니라 구조적 검토 수행
- 당사자별 의무, 금전 조건, 정산/세금계산서, 해지/위약금, 책임범위 등을 체계적으로 분석
- 누락 가능 조항 구체적 지적
- 상대방에게 실제로 제안할 수 있는 수정 문구를 예시로 작성
- 결과 최상단에 정확히 한 줄 삽입: [AI 검토 결과]
- 결과 하단에 정확히 이 문구 삽입: 본 검토는 AI 기반 1차 검토이며, 최종 법률 자문을 대체하지 않습니다.`
      break
    case 'agendaPredict':
      userPrompt = `아래 자료를 바탕으로 입주자대표회의에서 논의될 수 있는 안건을 예측해주세요.
결과는 최소 1000자 이상이어야 하며, 입대의 심의에 필요한 실질적 정보를 포함해야 합니다.

제공 자료:
${JSON.stringify(payload, null, 2)}

분석 시 필수 사항:
- 단순 안건명이 아니라 발생 배경, 쟁점, 대응 방향을 포함한 구조적 분석
- 관리주체가 확인할 자료, 위탁운영사가 준비할 자료를 구체적으로 명시
- 입대의 논의 시 예상되는 질문과 대답 방향 제시
- 실제 입대의 보고용 요약문과 주민 공지문 초안 포함
- 결과 최상단에 정확히 한 줄 삽입: [AI 예상 안건]`
      break
    default:
      userPrompt = `payload:\n${JSON.stringify(payload, null, 2)}`
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
        { role: 'user', content: userPrompt },
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
