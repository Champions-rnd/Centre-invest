import { z } from 'zod'
import {
  archiveInterviewSchema, candidateDetailSchema, candidateSchema, interviewDeletionSchema, savedInterviewSchema,
  type CandidateMaterials, type CandidateProfile, type CandidateStatus, type CandidateTarget, type SavedInterview,
} from '../../shared/archive'
import { coachingResultSchema, roleReviewSchema, vacancyImportSchema, type CoachingRequest, type Segment, type Vacancy } from '../../shared/contracts'

import { validateWav } from './intake/wav'

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

export async function submitInterview(
  audio: File, vacancy: Vacancy | null, candidate: CandidateTarget,
  uploadId: string, onUpload: (percent: number | null) => void,
) {
  await validateWav(audio)
  const body = new FormData()
  body.append('audio', audio)
  body.append('candidate', JSON.stringify(candidate))
  body.append('uploadId', uploadId)
  if (vacancy) body.append('vacancy', JSON.stringify(vacancy))
  return new Promise<SavedInterview>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', '/api/interviews')
    request.responseType = 'json'
    request.upload.onprogress = event => {
      if (event.lengthComputable && event.total) onUpload(Math.min(100, Math.floor(event.loaded * 100 / event.total)))
    }
    request.upload.onload = () => onUpload(null)
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(request.response?.error?.message ?? `Ошибка запроса (${request.status}).`))
        return
      }
      const saved = savedInterviewSchema.safeParse(request.response)
      if (saved.success) resolve(saved.data)
      else reject(new Error('Сервер вернул данные в неожиданном формате.'))
    }
    request.onerror = () => reject(new Error('Связь с сервером прервалась. Повторите загрузку.'))
    request.send(body)
  })
}

export function loadArchiveInterviews() {
  return typedRequest(z.array(archiveInterviewSchema), '/api/interviews')
}

export function loadCandidates() {
  return typedRequest(z.array(candidateSchema), '/api/candidates')
}

export function createCandidate(id: string, profile: CandidateProfile, materials: CandidateMaterials) {
  return typedRequest(candidateDetailSchema, '/api/candidates', jsonRequest('POST', { id, profile, materials }))
}

export function loadCandidate(id: string) {
  return typedRequest(candidateDetailSchema, `/api/candidates/${id}`)
}

export function saveCandidateStatus(id: string, status: CandidateStatus) {
  return typedRequest(candidateDetailSchema, `/api/candidates/${id}/status`, jsonRequest('PATCH', { status }))
}

export async function deleteCandidate(id: string) {
  await requestJson(`/api/candidates/${id}`, { method: 'DELETE' })
}

export function deleteInterview(id: string, removeCandidate: boolean) {
  return typedRequest(interviewDeletionSchema, `/api/interviews/${id}?removeCandidate=${removeCandidate ? '1' : '0'}`,
    { method: 'DELETE' })
}

export function loadInterview(id: string, signal?: AbortSignal) {
  return typedRequest(savedInterviewSchema, `/api/interviews/${id}`, { signal })
}

export function saveInterviewTranscript(interview: SavedInterview, transcript: Segment[]) {
  return typedRequest(savedInterviewSchema, `/api/interviews/${interview.id}/transcript`,
    jsonRequest('PATCH', { transcript, updatedAt: interview.updatedAt }))
}

export function reviewInterviewRoles(id: string, signal: AbortSignal) {
  return typedRequest(roleReviewSchema, `/api/interviews/${id}/review-roles`, { method: 'POST', signal })
}

export function importVacancy(text: string, signal: AbortSignal) {
  return typedRequest(vacancyImportSchema, '/api/vacancies/import', jsonRequest('POST', { text }, signal))
}

export function saveCandidateResume(id: string, resume: NonNullable<CandidateMaterials['resume']>) {
  return typedRequest(candidateDetailSchema, resumeUrl(id), jsonRequest('POST', resume))
}

export function resumeUrl(id: string) {
  return `/api/candidates/${id}/resume`
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
