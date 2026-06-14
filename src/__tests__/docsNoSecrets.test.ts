import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Phase C-3: 운영 문서에 "실제 운영 접근코드 평문"이나 "실제 sha256 해시"가 새지 않았는지 가드한다.
// 허용되는 것은 placeholder('YOUR_LONG_RANDOM_ACCESS_CODE')와 합성 예시뿐이다.
// ⚠️ 실제 코드/해시는 문서·커밋·로그에 절대 남기지 않는다(원칙은 SUPABASE_SETUP.md 9-2 참고).

// 이 테스트 파일(<root>/src/__tests__/...) 기준 두 단계 위가 저장소 루트.
const readDocFromRoot = (relPath: string): string => {
  const url = new URL(`../../${relPath}`, import.meta.url)
  return readFileSync(fileURLToPath(url), 'utf8')
}

describe('문서 시크릿 스캔 — SUPABASE_SETUP.md', () => {
  const doc = readDocFromRoot('SUPABASE_SETUP.md')

  it('실제 sha256 해시처럼 보이는 긴 hex(40자 이상 연속)가 없다', () => {
    const longHex = doc.match(/\b[0-9a-fA-F]{40,}\b/g)
    expect(longHex).toBeNull()
  })

  it("digest('...','sha256') 예시는 placeholder만 사용한다", () => {
    const re = /digest\(\s*'([^']*)'\s*,\s*'sha256'\s*\)/g
    const found: string[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(doc)) !== null) found.push(m[1])
    // 예시 SQL이 실제로 문서에 존재해야 한다(가드가 빈 통과되는 것 방지).
    expect(found.length).toBeGreaterThan(0)
    for (const code of found) {
      expect(code).toBe('YOUR_LONG_RANDOM_ACCESS_CODE')
    }
  })

  it("구버전 placeholder('실제접근코드')가 남아있지 않다", () => {
    expect(doc.includes("'실제접근코드'")).toBe(false)
  })
})
