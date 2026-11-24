import { resultSchema, type AnalysisRequest, type Vacancy } from '../../shared/contracts'

async function requestResult(path: string, init?: RequestInit) {
  const response = await fetch(path, init)
  const result = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(result?.error?.message ?? `Ошибка запроса (${response.status}).`)
  }
  const parsed = resultSchema.safeParse(result)
  if (!parsed.success) throw new Error('Сервер вернул данные в неожиданном формате.')
  return parsed.data
}

export function submitInterview(audio: File, vacancy: Vacancy | null) {
  const body = new FormData()
  body.append('audio', audio)
  if (vacancy) body.append('vacancy', JSON.stringify(vacancy))
  return requestResult('/api/interviews', { method: 'POST', body })
}

export function rerunAnalysis(input: AnalysisRequest) {
  return requestResult('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}
