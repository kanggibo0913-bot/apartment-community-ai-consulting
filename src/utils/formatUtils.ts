export const formatNumber = (value: number): string => value.toLocaleString('ko-KR')

export const formatMoney = (value: number): string => `${value.toLocaleString('ko-KR')}원`

export const formatPercent = (value: number): string => `${value.toFixed(1)}%`
