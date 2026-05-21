import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import FormGroup from '../components/FormGroup'
import Button from '../components/Button'
import StatBox from '../components/StatBox'
import { CostInfoData, LaborCostData, UtilityForecastData, EmployeeData } from '../types/CommunityData'
import { formatMoney } from '../utils/formatUtils'
import './Pages.css'

interface CostInfoProps {
  data: CostInfoData
  laborCost: LaborCostData
  utilityForecast: UtilityForecastData
  onChange: (next: Partial<CostInfoData>) => void
  onChangeLaborCost: (next: Partial<LaborCostData>) => void
  onChangeUtilityForecast: (next: Partial<UtilityForecastData>) => void
}

const defaultCostData: CostInfoData = {
  salaries: 0,
  electricity: 0,
  water: 0,
  hvac: 0,
  supplies: 0,
  maintenance: 0,
  cleaning: 0,
  other: 0,
}

const CostInfo: React.FC<CostInfoProps> = ({ data, laborCost, utilityForecast, onChange, onChangeLaborCost, onChangeUtilityForecast }) => {
  const totalCost = Object.values(data).reduce((sum, value) => sum + value, 0)

  const getEmployeeCost = (employee: EmployeeData) => {
    const basicSalary = employee.payType === '시급제' ? employee.hourlyWage * employee.monthlyHours : employee.monthlySalary
    const weeklyHoliday = employee.payType === '시급제' && employee.weeklyHolidayIncluded ? employee.hourlyWage * 8 * 4.345 : 0
    const indirectCost = basicSalary * (employee.indirectRate / 100)
    return {
      basicSalary,
      weeklyHoliday,
      indirectCost,
      total: basicSalary + weeklyHoliday + indirectCost,
    }
  }

  const laborTotal = laborCost.employees.reduce((sum, employee) => sum + getEmployeeCost(employee).total, 0)

  const seasonAdjustments = {
    봄: { electricity: 0, water: 0, gas: 0 },
    여름: { electricity: 0.15, water: 0.05, gas: -0.1 },
    가을: { electricity: 0, water: 0, gas: 0 },
    겨울: { electricity: 0.05, water: 0, gas: 0.2 },
  }

  const intensityAdjustments = {
    낮음: -0.05,
    보통: 0,
    높음: 0.1,
  }

  const averageElectric = (utilityForecast.electricPrev2Month + utilityForecast.electricLastMonth) / 2
  const averageWater = (utilityForecast.waterPrev2Month + utilityForecast.waterLastMonth) / 2
  const averageGas = (utilityForecast.gasPrev2Month + utilityForecast.gasLastMonth) / 2
  const seasonAdj = seasonAdjustments[utilityForecast.season]
  const intensityAdj = intensityAdjustments[utilityForecast.intensity]

  const estimatedElectric = Math.round(averageElectric * (1 + seasonAdj.electricity) * (1 + intensityAdj))
  const estimatedWater = Math.round(averageWater * (1 + seasonAdj.water) * (1 + intensityAdj))
  const estimatedGas = Math.round(averageGas * (1 + seasonAdj.gas) * (1 + intensityAdj))
  const estimatedUtilityTotal = estimatedElectric + estimatedWater + estimatedGas
  const lastMonthTotal = utilityForecast.electricLastMonth + utilityForecast.waterLastMonth + utilityForecast.gasLastMonth
  const utilityDiff = estimatedUtilityTotal - lastMonthTotal
  const utilityRate = lastMonthTotal > 0 ? (utilityDiff / lastMonthTotal) * 100 : 0

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    onChange({ [name]: value === '' ? 0 : parseFloat(value) } as Partial<CostInfoData>)
  }

  const handleUtilityChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    onChangeUtilityForecast({ [name]: name === 'season' || name === 'intensity' ? value : value === '' ? 0 : parseFloat(value) } as Partial<UtilityForecastData>)
  }

  const handleLaborChange = (id: number, field: keyof EmployeeData, value: string | boolean) => {
    const updated = laborCost.employees.map(employee => {
      if (employee.id !== id) return employee
      if (field === 'weeklyHolidayIncluded') {
        return { ...employee, [field]: value as boolean }
      }
      if (field === 'payType' || field === 'name') {
        return { ...employee, [field]: value as string }
      }
      return { ...employee, [field]: typeof value === 'string' ? parseFloat(value) || 0 : value }
    }) as EmployeeData[]
    onChangeLaborCost({ employees: updated })
  }

  const addEmployee = () => {
    const nextId = laborCost.employees.length > 0 ? Math.max(...laborCost.employees.map(item => item.id)) + 1 : 1
    onChangeLaborCost({
      employees: [
        ...laborCost.employees,
        {
          id: nextId,
          name: '',
          payType: '시급제',
          hourlyWage: 0,
          monthlySalary: 0,
          monthlyHours: 160,
          monthlyWorkDays: 22,
          weeklyHolidayIncluded: false,
          indirectRate: 10,
        },
      ],
    })
  }

  const removeEmployee = (id: number) => {
    onChangeLaborCost({ employees: laborCost.employees.filter(employee => employee.id !== id) })
  }

  const handleReset = () => {
    onChange(defaultCostData)
    onChangeLaborCost({ employees: [] })
    onChangeUtilityForecast({
      electricPrev2Month: 0,
      electricLastMonth: 0,
      waterPrev2Month: 0,
      waterLastMonth: 0,
      gasPrev2Month: 0,
      gasLastMonth: 0,
      season: '봄',
      intensity: '보통',
    })
  }

  return (
    <div className="page">
      <PageHeader
        title="비용 정보"
        description="월별 운영비와 인건비, 공과금 예측을 함께 입력하세요."
      />

      <Card title="📊 월간 운영비 합계">
        <div className="stats-grid">
          <StatBox label="총 운영비" value={formatMoney(totalCost)} icon="💳" />
          <StatBox label="총 인건비" value={formatMoney(laborTotal)} icon="👥" />
          <StatBox label="예상 공과금" value={formatMoney(estimatedUtilityTotal)} icon="🏠" />
          <StatBox label="전월 공과금" value={formatMoney(lastMonthTotal)} icon="🕒" />
        </div>
      </Card>

      <Card title="✏️ 비용 항목 입력">
        <form>
          <div className="form-row">
            <FormGroup label="인건비 (원)">
              <input type="number" name="salaries" value={data.salaries || ''} onChange={handleChange} placeholder="예: 9500000" />
            </FormGroup>
            <FormGroup label="전기세 (원)">
              <input type="number" name="electricity" value={data.electricity || ''} onChange={handleChange} placeholder="예: 2100000" />
            </FormGroup>
          </div>

          <div className="form-row">
            <FormGroup label="수도세 (원)">
              <input type="number" name="water" value={data.water || ''} onChange={handleChange} placeholder="예: 700000" />
            </FormGroup>
            <FormGroup label="냉난방비 (원)">
              <input type="number" name="hvac" value={data.hvac || ''} onChange={handleChange} placeholder="예: 1800000" />
            </FormGroup>
          </div>

          <div className="form-row">
            <FormGroup label="소모품비 (원)">
              <input type="number" name="supplies" value={data.supplies || ''} onChange={handleChange} placeholder="예: 500000" />
            </FormGroup>
            <FormGroup label="유지보수비 (원)">
              <input type="number" name="maintenance" value={data.maintenance || ''} onChange={handleChange} placeholder="예: 900000" />
            </FormGroup>
          </div>

          <div className="form-row">
            <FormGroup label="청소비 (원)">
              <input type="number" name="cleaning" value={data.cleaning || ''} onChange={handleChange} placeholder="예: 1200000" />
            </FormGroup>
            <FormGroup label="기타 비용 (원)">
              <input type="number" name="other" value={data.other || ''} onChange={handleChange} placeholder="예: 300000" />
            </FormGroup>
          </div>
        </form>
      </Card>

      <Card title="👤 인건비 산출">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12 }}>
          <p style={{ margin: 0 }}>직원별 급여 정보를 입력하고 총 인건비를 자동 계산합니다.</p>
          <Button type="button" variant="primary" onClick={addEmployee}>직원 추가</Button>
        </div>

        {laborCost.employees.length === 0 ? (
          <p className="placeholder-content">직원 데이터를 추가하면 인건비 계산을 시작할 수 있습니다.</p>
        ) : (
          <div className="employee-grid">
            {laborCost.employees.map(employee => {
              const employeeCosts = getEmployeeCost(employee)
              return (
                <div key={employee.id} className="result-card employee-card">
                  <div className="employee-card-header">
                    <h4>{employee.name || `직원 ${employee.id}`}</h4>
                    <Button type="button" variant="secondary" onClick={() => removeEmployee(employee.id)}>삭제</Button>
                  </div>

                  <div className="form-row">
                    <FormGroup label="직원명">
                      <input type="text" value={employee.name} onChange={(e) => handleLaborChange(employee.id, 'name', e.target.value)} placeholder="이름" />
                    </FormGroup>
                    <FormGroup label="급여 형태">
                      <select value={employee.payType} onChange={(e) => handleLaborChange(employee.id, 'payType', e.target.value)}>
                        <option value="시급제">시급제</option>
                        <option value="월급제">월급제</option>
                      </select>
                    </FormGroup>
                  </div>

                  <div className="form-row">
                    <FormGroup label="시급 (원)">
                      <input type="number" value={employee.hourlyWage || ''} onChange={(e) => handleLaborChange(employee.id, 'hourlyWage', e.target.value)} placeholder="0" />
                    </FormGroup>
                    <FormGroup label="월급 (원)">
                      <input type="number" value={employee.monthlySalary || ''} onChange={(e) => handleLaborChange(employee.id, 'monthlySalary', e.target.value)} placeholder="0" />
                    </FormGroup>
                  </div>

                  <div className="form-row">
                    <FormGroup label="월 근무시간">
                      <input type="number" value={employee.monthlyHours || ''} onChange={(e) => handleLaborChange(employee.id, 'monthlyHours', e.target.value)} placeholder="160" />
                    </FormGroup>
                    <FormGroup label="월 근무일수">
                      <input type="number" value={employee.monthlyWorkDays || ''} onChange={(e) => handleLaborChange(employee.id, 'monthlyWorkDays', e.target.value)} placeholder="22" />
                    </FormGroup>
                  </div>

                  <div className="form-row">
                    <FormGroup label="주휴수당 포함 여부">
                      <label className="checkbox-label">
                        <input type="checkbox" checked={employee.weeklyHolidayIncluded} onChange={(e) => handleLaborChange(employee.id, 'weeklyHolidayIncluded', e.target.checked)} />
                        포함
                      </label>
                    </FormGroup>
                    <FormGroup label="4대보험/간접비율 (%)">
                      <input type="number" value={employee.indirectRate || ''} onChange={(e) => handleLaborChange(employee.id, 'indirectRate', e.target.value)} placeholder="10" />
                    </FormGroup>
                  </div>

                  <div className="stats-grid">
                    <div className="result-card">
                      <p className="result-label">기본급</p>
                      <p className="result-value">{formatMoney(employeeCosts.basicSalary)}</p>
                    </div>
                    <div className="result-card">
                      <p className="result-label">주휴수당</p>
                      <p className="result-value">{formatMoney(employeeCosts.weeklyHoliday)}</p>
                    </div>
                    <div className="result-card">
                      <p className="result-label">간접비</p>
                      <p className="result-value">{formatMoney(employeeCosts.indirectCost)}</p>
                    </div>
                    <div className="result-card positive">
                      <p className="result-label">직원별 총 인건비</p>
                      <p className="result-value">{formatMoney(employeeCosts.total)}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Card title="💧 공과금 예상 산출">
        <div className="form-row">
          <FormGroup label="전전월 전기세 (원)">
            <input type="number" name="electricPrev2Month" value={utilityForecast.electricPrev2Month || ''} onChange={handleUtilityChange} placeholder="예: 2100000" />
          </FormGroup>
          <FormGroup label="전월 전기세 (원)">
            <input type="number" name="electricLastMonth" value={utilityForecast.electricLastMonth || ''} onChange={handleUtilityChange} placeholder="예: 2200000" />
          </FormGroup>
        </div>

        <div className="form-row">
          <FormGroup label="전전월 수도세 (원)">
            <input type="number" name="waterPrev2Month" value={utilityForecast.waterPrev2Month || ''} onChange={handleUtilityChange} placeholder="예: 700000" />
          </FormGroup>
          <FormGroup label="전월 수도세 (원)">
            <input type="number" name="waterLastMonth" value={utilityForecast.waterLastMonth || ''} onChange={handleUtilityChange} placeholder="예: 720000" />
          </FormGroup>
        </div>

        <div className="form-row">
          <FormGroup label="전전월 가스비 (원)">
            <input type="number" name="gasPrev2Month" value={utilityForecast.gasPrev2Month || ''} onChange={handleUtilityChange} placeholder="예: 480000" />
          </FormGroup>
          <FormGroup label="전월 가스비 (원)">
            <input type="number" name="gasLastMonth" value={utilityForecast.gasLastMonth || ''} onChange={handleUtilityChange} placeholder="예: 500000" />
          </FormGroup>
        </div>

        <div className="form-row">
          <FormGroup label="계절 선택">
            <select name="season" value={utilityForecast.season} onChange={handleUtilityChange}>
              <option value="봄">봄</option>
              <option value="여름">여름</option>
              <option value="가을">가을</option>
              <option value="겨울">겨울</option>
            </select>
          </FormGroup>
          <FormGroup label="냉난방 사용 강도">
            <select name="intensity" value={utilityForecast.intensity} onChange={handleUtilityChange}>
              <option value="낮음">낮음</option>
              <option value="보통">보통</option>
              <option value="높음">높음</option>
            </select>
          </FormGroup>
        </div>

        <div className="stats-grid">
          <div className="result-card">
            <p className="result-label">예상 전기세</p>
            <p className="result-value">{formatMoney(estimatedElectric)}</p>
          </div>
          <div className="result-card">
            <p className="result-label">예상 수도세</p>
            <p className="result-value">{formatMoney(estimatedWater)}</p>
          </div>
          <div className="result-card">
            <p className="result-label">예상 가스비</p>
            <p className="result-value">{formatMoney(estimatedGas)}</p>
          </div>
          <div className="result-card positive">
            <p className="result-label">예상 총 공과금</p>
            <p className="result-value">{formatMoney(estimatedUtilityTotal)}</p>
          </div>
        </div>

        <div className="form-row">
          <div className={`result-card ${utilityDiff < 0 ? 'negative' : 'positive'}`}>
            <p className="result-label">전월 대비 증감액</p>
            <p className="result-value">{formatMoney(Math.abs(utilityDiff))} {utilityDiff >= 0 ? '증가' : '감소'}</p>
          </div>
          <div className="result-card">
            <p className="result-label">전월 대비 증감률</p>
            <p className="result-value">{utilityRate.toFixed(1)}%</p>
          </div>
        </div>
      </Card>

      <div style={{ marginTop: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <Button type="button" variant="primary" onClick={() => alert('입력값이 자동 저장됩니다.')}>저장</Button>
        <Button type="button" variant="secondary" onClick={handleReset}>초기화</Button>
      </div>
    </div>
  )
}

export default CostInfo
