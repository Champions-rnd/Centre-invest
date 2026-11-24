import { coachingResultSchema, resultSchema, type CoachingRequest, type Vacancy } from '../../shared/contracts'

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, init)
  const result = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(result?.error?.message ?? `Ошибка запроса (${response.status}).`)
  }
  return result
}

export async function submitInterview(audio: File, vacancy: Vacancy | null) {
  const body = new FormData()
  body.append('audio', audio)
  if (vacancy) body.append('vacancy', JSON.stringify(vacancy))
  const parsed = resultSchema.safeParse(await requestJson('/api/interviews', { method: 'POST', body }))
  if (!parsed.success) throw new Error('Сервер вернул расшифровку в неожиданном формате.')
  return parsed.data
}

export async function requestCoaching(input: CoachingRequest, signal: AbortSignal) {
  const response = await requestJson('/api/coach', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const parsed = coachingResultSchema.safeParse(response)
  if (!parsed.success) throw new Error('Сервер вернул рекомендации в неожиданном формате.')
  return parsed.data
}
