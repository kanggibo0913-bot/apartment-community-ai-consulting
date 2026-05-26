// 입주민 공개용 보고서. 화이트리스트 필드만 담는다.
// 매출/수익/인건비/원가/계약금액/내부메모/민원 개인정보는 이 객체에 절대 포함하지 않는다.

export interface PublishedSection {
  title: string
  body: string
}

export interface PublishedReport {
  v: number
  apartmentName: string
  reportMonth: string
  publishedAt: string
  sections: PublishedSection[]
  title?: string
}

// 입주민에게 공개해도 되는 섹션 정의 (편집기/렌더 공용)
export const RESIDENT_SECTIONS: Array<{ key: string; title: string; placeholder: string }> = [
  { key: 'complaints', title: '민원 처리 현황', placeholder: '접수·처리된 민원 현황을 개인정보 없이 요약해 주세요.' },
  { key: 'facility', title: '시설 보수 내역', placeholder: '점검·보수한 시설 내역을 적어 주세요.' },
  { key: 'improvements', title: '개선 완료 사항', placeholder: '완료된 개선 사항을 적어 주세요.' },
  { key: 'ongoing', title: '진행 중 조치', placeholder: '현재 진행 중인 조치/계획을 적어 주세요.' },
  { key: 'notices', title: '이용자 안내사항', placeholder: '운영시간 변경, 휴관, 프로그램 등 안내사항을 적어 주세요.' },
]

// UTF-8 안전 base64url 인코딩
export function encodeReport(report: PublishedReport): string {
  const json = JSON.stringify(report)
  const bytes = new TextEncoder().encode(json)
  let bin = ''
  bytes.forEach((b) => {
    bin += String.fromCharCode(b)
  })
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeReport(encoded: string): PublishedReport | null {
  try {
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    const json = new TextDecoder().decode(bytes)
    const obj = JSON.parse(json) as PublishedReport
    if (obj && typeof obj === 'object' && Array.isArray(obj.sections)) {
      return obj
    }
    return null
  } catch {
    return null
  }
}

// 입력값으로 PublishedReport를 안전하게 구성 (빈 섹션 제외, 화이트리스트만)
export function buildPublishedReport(input: {
  apartmentName: string
  reportMonth: string
  sections: Array<{ title: string; body: string }>
  title?: string
}): PublishedReport {
  const title = input.title?.trim()
  return {
    v: 1,
    apartmentName: input.apartmentName.trim(),
    reportMonth: input.reportMonth.trim(),
    publishedAt: new Date().toISOString(),
    sections: input.sections
      .map((s) => ({ title: s.title, body: s.body.trim() }))
      .filter((s) => s.body.length > 0),
    ...(title ? { title } : {}),
  }
}

// 현재 origin 기준 공개 보고서 링크 생성 (#/report/<encoded>)
export function buildShareUrl(report: PublishedReport): string {
  const encoded = encodeReport(report)
  const base = `${window.location.origin}${window.location.pathname}`
  return `${base}#/report/${encoded}`
}
