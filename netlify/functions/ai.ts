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

  monthlyReport: `${COMMON_GUIDELINES}\n\n너는 아파트 커뮤니티센터 위탁운영사(MIK)의 운영 진단 책임자다. 입력 데이터와 함께 제공되는 "사전 계산 운영 지표" 블록을 진단 근거로 사용해, 단순 요약이 아닌 운영진단형 월간 리포트를 작성한다. 반드시 상단에 "[월간 커뮤니티 운영 리포트]" 라벨을 붙이고, 아래 10개 섹션 구조와 순서를 정확히 지켜 작성한다.\n\n1. 이번 달 핵심 진단: 이번 달 가장 중요한 문제 1~2개를 지표 수치를 인용해 2~3문장으로 명확히 제시\n2. 주요 운영 지표: 세대당 매출/운영비/손익, 인건비 비율(총운영비·총수익 대비), 인당 인건비, 민원 지표를 항목별로 정리\n3. 세대수 대비 수익성 분석: 세대당 월 매출 수준과 매출 침투율 판정, 세대수 규모 대비 매출이 적정한지 판단\n4. 비용 구조 분석: 인건비/공과금/기타 비용 구조, 인당 인건비의 적정성 판단 (비중이 아니라 절대 수준 기준)\n5. 시설 유형별 리스크: 운영 중인 시설 각각에 대해 제공된 "시설 유형별 점검 포인트"를 해당 단지 상황에 맞게 적용\n6. 민원/만족도 리스크: 민원 건수·미해결율 기반 판단, 민원 0건이면 수집 체계 부재 가능성 포함\n7. 원인 분석: 손익·운영 문제의 근본 원인을 우선순위 순서로 정리 (비율이 아니라 구조적 원인 중심)\n8. 다음 달 실행 액션: 현장 운영자가 실제로 실행 가능한 구체 액션 3~5개 (무엇을, 어떻게)\n9. 소장/입대의 보고용 요약: 관리소장·입주자대표회의에 그대로 보여줄 수 있는 3~4문장 (내부 판단·민감한 비용 평가 제외)\n10. MIK 내부 조치사항: 외부 보고서에는 넣지 않을 내부용 솔직한 판단과 조치 (수익 구조 평가, 인력 운용 판단, 계약 관점 의견)\n\n핵심 판단 규칙 (반드시 적용):\n- 인건비 비중(%)이 높다는 이유만으로 "인건비 과다"나 "인력 관리 필요"로 진단하지 마라. 인력 수와 인당 인건비를 먼저 확인하고, 인당 인건비가 최저임금~통상적 1인 운영 수준이면 비용 절감이 아니라 "매출 부족" 또는 "유료 전환 구조 부족"을 핵심 원인으로 우선 진단하라.\n- 세대수가 큰데 세대당 월 매출이 참고 기준보다 낮으면 반드시 "세대수 대비 매출 침투율 부족"을 지적하고, 유료회원 전환율·PT/소그룹 프로그램 매출·시간대별 이용률 확인을 우선 액션으로 제시하라.\n- 민원이 0건이라고 만족도가 높다고 단정하지 마라. 민원 수집 체계 부재 가능성을 함께 언급하라.\n- 운영시간·회원수·이용자수·프로그램 참여율 데이터가 없으면 "확인 필요"로만 끝내지 말고, 그 데이터가 어떤 의사결정(인력 배치, 가격 정책, 프로그램 개편 등)에 필요한지 설명하라. "미입력 데이터와 의사결정 영향" 블록이 제공되면 그 내용을 활용하라.\n- 시설 유형별 리스크는 제공된 점검 포인트를 근거로 판단하라. 헬스장이면 1인 운영 가능성, PT/소그룹 매출화, 청결·혼잡·기구 고장 리스크를 반드시 다룬다. 다른 시설 유형(골프장, GX룸 등)은 각 유형의 점검 포인트를 따른다.\n- 9번은 외부 보고용 문장, 10번은 MIK 내부 판단으로 명확히 구분하라. 같은 내용을 반복하지 마라.\n\n문체 규칙: 사전 계산 지표의 숫자를 그대로 인용해 판단한다. "확인 필요"의 기계적 반복을 피한다. 과장하지 않으며, 추정인 경우 "추정"임을 밝힌다. 실무 보고서 톤. 1,200~1,800자.`,

  weeklyReport: `${COMMON_GUIDELINES}\n\n너는 아파트 커뮤니티센터 위탁운영사(MIK)의 주간 운영 리포트 작성 담당자다. 입력된 한 주간의 운영 데이터를 바탕으로, 사용자 메시지에 명시된 "출력 모드"에 맞는 주간 운영 리포트를 작성한다.\n\n[관리소 보고용 모드]\n- 대상: 관리사무소/관리소장 보고. 실무적이고 구체적으로 작성한다.\n- 담당자명, 구체적 조치 내역, 하자·비용·책임 소재를 그대로 포함해도 된다.\n- 상단 라벨: "[주간 운영 리포트 — 관리소 보고용]"\n- 구조: 1) 보고 개요(보고 주차/기간/담당자) 2) 이번 주 주요 업무 3) 시설 점검 내역 4) 민원 대응 내역 5) 하자 발견 및 조치 6) 비품/재고 현황 7) 특이사항 8) 다음 주 예정 업무\n\n[입주민 공개용 모드]\n- 대상: 입주민 게시판 공개. 부드러운 안내체로 순화한다.\n- 반드시 제외: 직원·담당자 실명 등 개인명, 내부 책임 소재 표현(누구의 과실/책임 등), 구체적 금액·인건비·비용 등 민감한 비용 표현, 내부 운영 판단.\n- 민원·하자는 개별 세대나 개인을 특정하지 말고 "처리 중", "조치 완료" 수준으로 순화한다.\n- 상단 라벨: "[주간 커뮤니티 운영 안내]"\n- 구조: 1) 이번 주 커뮤니티 운영 안내 2) 시설 이용 관련 안내 3) 접수·처리된 불편사항 안내(순화) 4) 다음 주 안내. 입주민이 읽기 편한 따뜻한 안내체.\n\n공통 규칙: 입력되지 않은 항목은 임의로 지어내지 말고 "해당 없음"으로 표기하거나 생략한다. 과장하지 않는다. 출력 모드에 맞는 상단 라벨을 반드시 붙인다. 800~1,300자.`,

  bidNoticeAnalysis: `${COMMON_GUIDELINES}\n\n아파트 커뮤니티센터 위탁운영 입찰 공고문을 분석하는 컨설턴트다. 입력된 공고문 텍스트와 단지 정보를 위탁운영사(MIK) 관점에서 분석한다. 결과는 아래 키를 가진 단일 JSON 객체로만 출력한다. JSON 외의 설명 문장, 코드블록 표시, 라벨을 절대 붙이지 말 것. 공고문에 없는 금액/일정/자격요건은 임의로 만들지 말고 해당 값에 "공고문 확인 필요"라고 적는다.\n\n{\n  "summary": "공고 요약 2~3문장",\n  "complexName": "단지명",\n  "region": "지역",\n  "bidMethod": "입찰방식",\n  "managementOfficePhone": "관리사무소/담당자 연락처 (예: 02-1234-5678), 없으면 빈 문자열",\n  "siteBriefingDate": "YYYY-MM-DD",\n  "siteBriefingTime": "HH:MM 또는 빈 문자열",\n  "siteBriefingStatus": "scheduled | individualVisit | notRequired | unknown | 빈 문자열",\n  "siteBriefingNote": "현장설명회 진행 방식 보조 메모 (예: '개별 방문으로 현장 확인 필요')",\n  "bidDeadline": "YYYY-MM-DD",\n  "bidDeadlineTime": "HH:MM 또는 빈 문자열",\n  "openingDate": "YYYY-MM-DD 또는 빈 문자열",\n  "openingTime": "HH:MM 또는 빈 문자열",\n  "documentSubmissionDate": "YYYY-MM-DD 또는 빈 문자열",\n  "documentSubmissionTime": "HH:MM 또는 빈 문자열",\n  "ptDate": "YYYY-MM-DD 또는 빈 문자열",\n  "ptTime": "HH:MM 또는 빈 문자열",\n  "businessPresentationDate": "YYYY-MM-DD 또는 빈 문자열",\n  "businessPresentationTime": "HH:MM 또는 빈 문자열",\n  "businessPresentationLocation": "장소 또는 빈 문자열",\n  "contractPeriod": "계약기간 원문 (예: 2026-07-01 ~ 2027-06-30)",\n  "requiredDocuments": ["제출서류"],\n  "specialConditions": ["특이조건"],\n  "risks": ["리스크"],\n  "estimateNotes": ["산출표 작성 주의사항"],\n  "siteBriefingQuestions": ["현장설명회 질문"],\n  "participationGrade": "A 또는 B 또는 C 또는 D",\n  "participationReason": "참여등급 판단 근거 1~2문장",\n  "recommendedAction": "다음 조치",\n  "scheduleEvents": [\n    { "eventType": "siteBriefing|bidDeadline|opening|businessPresentation|documentSubmission|other", "eventTypeLabel": "현장설명회|입찰마감|개찰|사업설명회/PT|서류제출|기타", "date": "YYYY-MM-DD", "time": "HH:MM 또는 빈 문자열", "location": "장소 또는 빈 문자열", "content": "내용 또는 빈 문자열", "apartmentName": "단지명 또는 빈 문자열", "households": 숫자_또는_null, "calculatedStaffCount": 숫자_또는_null, "managementOfficePhone": "관리소 전화번호 또는 빈 문자열" }\n  ]\n}\n\n핵심 규칙:\n- 모든 날짜는 YYYY-MM-DD, 모든 시간은 HH:MM(24시간)로 정규화한다. 둘이 한 문자열에 섞이지 않도록 분리한다.\n- 시간이 공고문에 명시되어 있으면 반드시 time 필드에 채운다. (빈 값으로 두면 안 됨)\n- 시간이 공고문에 없으면 time은 빈 문자열로 둔다. 절대 추정하지 않는다.\n- 계약 시작일/계약 종료일/운영 시작일/운영 종료일은 scheduleEvents에 넣지 않는다. 계약기간 정보는 contractPeriod 키로만 남긴다.\n- "별도 통보"/"추후 공지"는 risks 또는 estimateNotes에만 남기고 scheduleEvents에는 넣지 않는다.\n- participationGrade는 A(적극 참여)/B(조건 확인 후 참여)/C(신중 검토)/D(참여 비추천) 중 한 글자. 배열 항목이 없으면 빈 배열로 둔다.`,
}

// taskType별 user prompt 빌더 (taskType 추가 시 여기에 case만 더하면 됨)
const buildUserPrompt = (taskType: string, payload: unknown): string => {
  const json = JSON.stringify(payload)
  switch (taskType) {
    case 'document':
      return `입력: ${json}\n위 정보로 공문 형식의 문서를 작성하세요. 배경, 내용, 요청사항 포함.`
    case 'contractGenerate':
      return `입력: ${json}\n위 정보로 계약서 초안 (11개 조항)을 작성하세요. 각 조항은 2~4문장.`
    case 'contractReview':
      return `검토 계약서: ${json}\n위 계약서의 핵심 리스크를 검토하고 수정 요청 문구를 작성하세요.`
    case 'agendaPredict':
      return `자료: ${json}\n입대의 안건을 예측하고, 보고 요약문과 공지문 초안을 작성하세요.`
    case 'monthlyReport': {
      // 사전 계산 지표 블록은 JSON 밖으로 분리해 읽기 좋은 형태로 전달
      const p = (payload ?? {}) as Record<string, unknown>
      const { operationMetricsContext, ...rest } = p
      const metricsBlock =
        typeof operationMetricsContext === 'string' && operationMetricsContext.trim()
          ? operationMetricsContext
          : '(사전 계산 지표 없음 — 입력 데이터만으로 판단하되, 세대당 매출과 인당 인건비를 직접 계산해 진단할 것)'
      return `월간 운영 리포트 작성: ${JSON.stringify(rest)}\n\n[사전 계산 운영 지표 및 진단 보조 자료]\n${metricsBlock}\n\n위 입력 데이터와 사전 계산 지표를 근거로 운영진단형 월간 리포트를 작성하세요. 지표의 숫자와 사전 판정을 그대로 인용해 판단하세요.`
    }
    case 'weeklyReport': {
      const p = (payload ?? {}) as Record<string, unknown>
      const mode = p.outputMode === 'resident' ? 'resident' : 'office'
      const modeInstruction =
        mode === 'resident'
          ? '출력 모드: 입주민 공개용. 개인명·내부 책임 소재·구체적 비용 표현을 모두 제외하고 안내체로 순화해 작성하세요. 상단 라벨은 "[주간 커뮤니티 운영 안내]".'
          : '출력 모드: 관리소 보고용. 실무 보고서 형식으로 구체적으로 작성하세요. 상단 라벨은 "[주간 운영 리포트 — 관리소 보고용]".'
      return `주간 운영 리포트 작성: ${JSON.stringify(p)}\n\n${modeInstruction}`
    }
    case 'bidNoticeAnalysis':
      return `입찰 공고문 분석: ${json}
위 공고문 텍스트와 단지 정보를 분석해 참여 판단(A~D 등급 포함)을 작성하세요.

[일정 추출 지침]
- 다음 동의어가 등장하면 "사업설명회/PT 발표 일정"으로 모두 인식하세요:
  사업설명회, 제안설명회, 제안서 발표, PT 발표, PT 일정, 프레젠테이션, 프리젠테이션,
  업체 발표, 운영계획 발표, 설명회 심사, 적격심사 발표, 적격심사평가회의, 평가회의,
  기술제안 발표, Presentation
- 같은 날짜·같은 시간에 "적격심사평가회의"와 "사업설명회"가 함께 등장하면 두 일정을 합쳐
  businessPresentation 항목 1건으로만 등록하고, content/memo에 "적격심사평가회의 및 사업설명회"처럼 병합 사실을 명시하세요.
- 사업설명회/PT 발표 일정이 있으면 JSON에 다음 키로 포함하세요:
  - businessPresentationDate: YYYY-MM-DD (없으면 빈 문자열)
  - businessPresentationTime: HH:MM (없으면 빈 문자열)
  - businessPresentationLocation: 장소 문자열 (없으면 빈 문자열)
- "사업설명회는 별도 통보" 등 명확한 날짜가 없을 경우 일정 키는 빈 문자열로 두고, risks 또는 estimateNotes에 한 줄로 기록하세요.

[현장설명회 진행 방식 분류 - 중요]
- siteBriefingStatus 키를 다음 중 하나로 정확히 채우세요:
  · "scheduled"       : 단체 현장설명회 일정이 명시되어 있음 (siteBriefingDate/Time도 채울 것)
  · "individualVisit" : 단체 현장설명회는 없지만 개별 방문 방식으로 현장 확인을 요구 (날짜 없을 수 있음)
  · "notRequired"     : 공고문에 현장 확인 자체가 명시적으로 불필요하다고 적혀 있는 경우만 (드물고 명시적일 때만)
  · "unknown"         : 현장설명회 미개최라고만 적혀 있고 개별 방문 안내가 없는 경우
- 다음 표현이 있으면 status = "individualVisit"로 분류하세요(현장확인이 사라지는 게 아니라 방식이 바뀐 것):
  "현장설명회는 개최하지 않으며 개별 방문으로 확인",
  "단체 현장설명회 없음 / 개별 방문",
  "개별 방문으로 현장 확인",
  "개별 방문 확인", "개별방문 확인"
- "individualVisit"인 경우:
  - siteBriefingDate: 명시된 날짜가 있으면 채우고, 없으면 빈 문자열
  - siteBriefingTime: 명시된 시간이 있으면 채우고, 없으면 빈 문자열
  - siteBriefingNote: "개별 방문으로 현장 확인 필요" (또는 공고문 표현)
  - scheduleEvents[]에 siteBriefing 항목을 굳이 추가할 필요는 없지만, 날짜·시간이 명시된 경우는 추가해도 됩니다.
  - risks 또는 estimateNotes에 "개별 방문으로 현장 확인 필요, 일자 자체 일정 등록 필요"를 한 줄 남기세요.
- "unknown"이면 risks에 "현장설명회 미개최 표현은 있으나 현장확인 방법이 불명확함, 발주처 확인 필요"를 남기세요.
- 절대 금지: 현장확인이 필요한 상황을 임의로 "필요 없음"으로 단정하지 말 것. 단순히 "현장설명회 없음" 만으로 notRequired로 분류하지 말 것.

[서류제출/개찰 추출 - 중요]
- "서류제출 마감일시", "서류 제출 마감", "제출 마감", "전자입찰 등록 마감",
  "입찰서류 제출 마감"이 있으면 documentSubmission 항목으로 추출하세요.
  · documentSubmissionDate / documentSubmissionTime 단일 키도 함께 채우세요.
  · scheduleEvents[]에도 {eventType:"documentSubmission", eventTypeLabel:"서류제출 마감", date, time, location, content}로 포함.
- "개찰일시", "개찰 일시", "개찰", "전자개찰", "입찰담당 PC", "관리사무소 PC"가 있으면 opening 항목으로 추출하세요.
  · openingDate / openingTime 단일 키도 함께 채우세요.
  · scheduleEvents[]에도 {eventType:"opening", eventTypeLabel:"개찰", date, time, location, content}로 포함.
- 같은 날짜·같은 시간에 서류제출 마감과 개찰이 동시에 있어도 (예: 둘 다 12:00) 서로 다른 일정이므로 병합하지 말고 2건으로 유지하세요.

[산출인원/투입인원 - 중요]
- 공고문에 산출인원, 투입인원, 배치인원, 필요인원, 운영인력 같은 표현이 있으면
  scheduleEvents[]의 각 일정과 최상위에 calculatedStaffCount(또는 requiredStaffCount) 값으로 넣으세요.
- 단순 숫자(예: 2)면 calculatedStaffCount: 2 처럼 숫자로 출력하세요.
- 혼합 표현(예: "센터장 1명, 트레이너 2명")은 그대로 문자열로 두어도 됩니다.
  파싱 단계가 숫자 추출이 가능하면 자동으로 calculatedStaffCount에 담고, 그 외는 staffCountText로 보존합니다.
- 공고문에 인원 명시가 없으면 빈 값 또는 null. 절대 추정하지 마세요.

[관리소 전화번호 - 중요]
- 공고문에 관리사무소 전화번호, 담당자 연락처, 문의처, 입찰 관련 연락처가 있으면
  최상위 키 "managementOfficePhone"에 반드시 채우고, scheduleEvents[]의 각 일정에도 같은 번호를 가능하면 동일하게 넣으세요.
- 전화번호는 가능하면 "지역번호-국번-끝번호" 하이픈 형태로 정규화 (예: 02-1234-5678, 031-000-0000, 010-1234-5678).
- 02)1234-5678, 02.1234.5678, 02 1234 5678 같은 표기는 하이픈 형태로 통일.
- 전화번호가 공고문에 없으면 managementOfficePhone은 빈 문자열로 두세요. 절대 추정·임의 보정 금지.

[금지 사항]
- 계약 시작일/계약 종료일/운영 시작일/운영 종료일은 scheduleEvents[]에 절대 넣지 마세요.
- 시간이 공고문에 없으면 time을 빈 문자열로 두세요. 절대 추정하지 마세요.
- "별도 통보", "추후 공지"는 scheduleEvents[]가 아니라 risks/estimateNotes로만 남기세요.
- 공고문에 없는 정보는 절대 추정해서 채우지 마세요. 없으면 빈 문자열/빈 배열로 두세요.

[scheduleEvents 일정표 배열 - 시간 정보 포함 / 가장 중요]
- 위 단일 키에 더해, 공고문에 등장한 모든 주요 일정을 반드시 "scheduleEvents" 배열로도 함께 출력하세요.
- 일정표(아젠다) 뷰가 이 배열을 그대로 사용합니다. 단일 키만 채우고 scheduleEvents를 빈 배열로 두지 마세요.
- 각 항목 형식 (모든 필드는 문자열, 숫자, 또는 빈 값/null 허용):
  {
    "eventType": "siteBriefing | bidDeadline | opening | businessPresentation | documentSubmission | other",
    "eventTypeLabel": "현장설명회 | 입찰마감 | 개찰 | 사업설명회/PT | 서류제출 | 기타",
    "date": "YYYY-MM-DD",
    "time": "HH:MM (24시간) 또는 빈 문자열",
    "location": "장소 또는 빈 문자열",
    "content": "내용 한 줄 또는 빈 문자열 (예: '제안서 발표', '입찰서류 제출 마감')",
    "apartmentName": "단지명 또는 빈 문자열",
    "households": 세대수 숫자 또는 null,
    "calculatedStaffCount": 산출인원 숫자 또는 null,
    "managementOfficePhone": "관리소 전화번호 또는 빈 문자열"
  }
- 반드시 date와 time을 분리해서 저장하세요. date에는 시간을 포함하지 말고, time에는 날짜를 포함하지 마세요.
- date는 "YYYY-MM-DD" 한 가지 포맷만 허용. "2026년 6월 4일", "2026.06.04." 같은 표기는 모두 "2026-06-04"로 정규화.
- time은 반드시 24시간 HH:MM으로 정규화:
  · "오전 10시" → "10:00"
  · "오후 2시" → "14:00"
  · "오후 12시" → "12:00", "오전 12시" → "00:00"
  · "14시 30분" → "14:30"
  · "17:00까지" → "17:00"
  · "10시" → "10:00", "10:30" → "10:30"
- 시간이 공고문에 있으면 반드시 time에 채우세요. (절대 빈 값으로 두지 마세요.)
- 시간이 공고문에 없으면 time은 빈 문자열로 두세요. 절대 추정하지 마세요.
- 계약 시작일/계약 종료일/운영 시작일/운영 종료일은 scheduleEvents에 넣지 마세요. 계약기간 정보는 별도의 contractPeriod 키에만 남깁니다.
- "별도 통보", "추후 공지", "미정"인 일정은 scheduleEvents에 넣지 말고 risks 또는 estimateNotes에 한 줄로 남기세요.
- 공고문에 없는 일정/시간/장소를 절대 만들지 마세요. 추출할 일정이 없으면 빈 배열 [].`
    default:
      return `payload:\n${JSON.stringify(payload, null, 2)}`
  }
}

// taskType별 최대 출력 토큰 (taskType 추가 시 여기에 항목만 더하면 됨)
// 주의: gpt-5 계열 추론 모델은 reasoning 토큰도 이 한도에 포함되므로 여유를 둬야 함
const MAX_OUTPUT_TOKENS: Record<string, number> = {
  document: 900,
  contractGenerate: 1400,
  contractReview: 1200,
  agendaPredict: 1100,
  monthlyReport: 4000,
  weeklyReport: 1600,
  bidNoticeAnalysis: 1800,
}

// ── taskType별 모델 라우팅 ────────────────────────────────────────────────
// 품질이 중요한 보고서형 task만 상위 모델을 쓰고, 나머지는 기본 모델을 유지한다.
// 모델 우선순위: task 전용 환경변수 > 코드 지정 모델 > 기본 모델
// 기본 모델 우선순위: OPENAI_MODEL_DEFAULT > OPENAI_MODEL(하위호환) > 'gpt-4.1-mini'
interface TaskModelConfig {
  // task 전용 모델 환경변수명 (예: OPENAI_MODEL_MONTHLY_REPORT)
  envVar: string
  // 환경변수 미설정 시 사용할 모델 id
  fallbackModel: string
  // gpt-5 계열 추론 강도. 서버리스 함수 타임아웃(25초) 안에 응답하도록 낮게 유지.
  reasoningEffort?: 'none' | 'low' | 'medium'
}

const TASK_MODEL_CONFIG: Record<string, TaskModelConfig> = {
  // 월간 운영 리포트: 일반 task보다 품질이 중요해 상위 모델(gpt-4.1)을 사용한다.
  // 운영진단 품질은 사전 계산 지표(monthlyReportMetrics)와 강화된 시스템 프롬프트가 보장하므로
  // 모델의 추론(reasoning) 깊이에 의존하지 않는다.
  // ⚠️ gpt-5.5(추론형)는 실측 결과 동기 호출이 25~30초+로, Netlify 동기 함수 한도(기본 10초·최대 26초)와
  //    클라이언트 25초 타임아웃을 넘겨 사용 불가였다. 추론형 모델을 쓰려면 비동기(백그라운드+폴링) 구조가 필요하다.
  // reasoningEffort는 gpt-5 계열로 라우팅될 때만 적용되며(아래 dispatch 가드), 그 경우 가장 빠른 'none'을 쓴다.
  monthlyReport: { envVar: 'OPENAI_MODEL_MONTHLY_REPORT', fallbackModel: 'gpt-4.1', reasoningEffort: 'none' },
  // 추후 확장 예시 — 입주민 공개 보고서 등 다른 보고서형 task를 별도 모델로 올릴 때 여기에 항목만 추가:
  // residentNoticeReport: { envVar: 'OPENAI_MODEL_RESIDENT_REPORT', fallbackModel: 'gpt-4.1', reasoningEffort: 'none' },
}

const resolveModelForTask = (taskType: string): { model: string; reasoningEffort?: 'none' | 'low' | 'medium' } => {
  const defaultModel = process.env.OPENAI_MODEL_DEFAULT || process.env.OPENAI_MODEL || 'gpt-4.1-mini'
  const cfg = TASK_MODEL_CONFIG[taskType]
  if (!cfg) return { model: defaultModel }
  const model = process.env[cfg.envVar] || cfg.fallbackModel
  return { model, reasoningEffort: cfg.reasoningEffort }
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
        error: `지원하지 않는 taskType입니다: ${taskType}. 지원하는 taskType: ${Object.keys(SYSTEM_PROMPTS).join(', ')}`,
      }),
    }
  }


  const userPrompt = buildUserPrompt(taskType, payload)
  const maxOutputTokens = MAX_OUTPUT_TOKENS[taskType] || 900

  const apiKey = process.env.OPENAI_API_KEY
  const { model, reasoningEffort } = resolveModelForTask(taskType)

  if (!apiKey) {
    console.error('AI function error: OPENAI_API_KEY 미설정')
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({
        success: false,
        error:
          'OPENAI_API_KEY가 설정되지 않았습니다. 로컬은 프로젝트 루트의 .env 파일에, 배포 환경은 Netlify 대시보드(Site settings → Environment variables)에 설정하세요.',
      }),
    }
  }

  // 보안: 로그에 API 키·모델명을 남기지 않는다 (taskType과 토큰 한도만 기록)
  console.log('AI request start:', { taskType, maxOutputTokens })

  try {
    const client = new OpenAI({ apiKey, timeout: 25000 })
    const response = await client.responses.create({
      model,
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_output_tokens: maxOutputTokens,
      // gpt-5 계열 추론 모델만 reasoning 강도 지정 (다른 모델에 보내면 파라미터 오류)
      ...(reasoningEffort && model.startsWith('gpt-5') ? { reasoning: { effort: reasoningEffort } } : {}),
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

    // 보안: 모델명·원본 error 객체(요청 정보 포함 가능)는 로그에 남기지 않는다
    const errorName = error instanceof Error ? error.name : 'UnknownError'
    const errorStatus = (error as { status?: number })?.status
    console.error('AI function error:', { taskType, message, errorName, errorStatus })
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ success: false, error: message }),
    }
  }
}

export { handler }
