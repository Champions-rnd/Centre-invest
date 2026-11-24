import { z } from 'zod'
import {
  candidateDetailSchema, candidateSchema, savedInterviewSchema,
  type CandidateStatus, type CandidateTarget, type SavedInterview,
} from '../../shared/archive'
import { coachingResultSchema, type CoachingRequest, type Segment, type Vacancy } from '../../shared/contracts'

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, init)
  const result = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(result?.error?.message ?? `Ошибка запроса (${response.status}).`)
  }
  return result
}

async function typedRequest<T>(schema: z.ZodType<T>, path: string, init?: RequestInit): Promise<T> {
  const parsed = schema.safeParse(await requestJson(path, init))
  if (!parsed.success) throw new Error('Сервер вернул данные в неожиданном формате.')
  return parsed.data
}

function jsonRequest(method: 'PATCH' | 'POST', input: unknown, signal?: AbortSignal): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal }
}

export function submitInterview(audio: File, vacancy: Vacancy | null, candidate: CandidateTarget) {
  const body = new FormData()
  body.append('audio', audio)
  body.append('candidate', JSON.stringify(candidate))
  if (vacancy) body.append('vacancy', JSON.stringify(vacancy))
  return typedRequest(savedInterviewSchema, '/api/interviews', { method: 'POST', body })
}

export function loadCandidates() {
  return typedRequest(z.array(candidateSchema), '/api/candidates')
}

export function loadCandidate(id: string) {
  return typedRequest(candidateDetailSchema, `/api/candidates/${id}`)
}

export function saveCandidateStatus(id: string, status: CandidateStatus) {
  return typedRequest(candidateDetailSchema, `/api/candidates/${id}/status`, jsonRequest('PATCH', { status }))
}

export function loadInterview(id: string) {
  return typedRequest(savedInterviewSchema, `/api/interviews/${id}`)
}

export function saveInterviewTranscript(interview: SavedInterview, transcript: Segment[]) {
  return typedRequest(savedInterviewSchema, `/api/interviews/${interview.id}/transcript`,
    jsonRequest('PATCH', { transcript, updatedAt: interview.updatedAt }))
}

export function recordingUrl(id: string) {
  return `/api/interviews/${id}/audio`
}

export function archiveDownload(candidateId?: string) {
  return candidateId ? `/api/export.xlsx?candidate=${candidateId}` : '/api/export.xlsx'
}

export function requestCoaching(input: CoachingRequest, signal: AbortSignal) {
  return typedRequest(coachingResultSchema, '/api/coach', jsonRequest('POST', input, signal))
}
