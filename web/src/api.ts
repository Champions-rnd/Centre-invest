import { z } from 'zod'
import {
  archiveInterviewSchema, candidateDetailSchema, candidateSchema, interviewDeletionSchema, savedInterviewSchema,
  type CandidateMaterials, type CandidateProfile, type CandidateStatus, type CandidateTarget, type SavedInterview,
} from '../../shared/archive'
import { coachingResultSchema, interviewProgressType, interviewStageSchema, roleReviewSchema, vacancyImportSchema, type CoachingRequest, type InterviewStage, type Segment, type Vacancy } from '../../shared/contracts'

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

export type InterviewProgress = { stage: 'uploading'; percent: number } | { stage: InterviewStage }

export const interviewStageLabels: Record<InterviewStage, string> = {
  transcribing: 'Распознаём речь в ChatCI',
  analyzing: 'Готовим отчёт по расшифровке',
  saving: 'Сохраняем интервью',
}

export async function submitInterview(
  audio: File, vacancy: Vacancy | null, candidate: CandidateTarget,
  uploadId: string, onProgress: (progress: InterviewProgress) => void,
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
    request.setRequestHeader('Accept', interviewProgressType)
    let offset = 0
    let saved: SavedInterview | undefined
    let failure: string | undefined
    const streamed = () => request.getResponseHeader('Content-Type')?.startsWith(interviewProgressType)
    function readProgress() {
      if (!streamed()) return
      const data = request.responseText
      for (let end = data.indexOf('\n', offset); end !== -1; end = data.indexOf('\n', offset)) {
        const line = data.slice(offset, end)
        offset = end + 1
        try {
          const event = JSON.parse(line)
          const stage = interviewStageSchema.safeParse(event?.stage)
          if (stage.success) onProgress({ stage: stage.data })
          else if (typeof event?.error === 'string') failure = event.error
          else if (event?.saved) saved = savedInterviewSchema.parse(event.saved)
        } catch {
          failure = 'Сервер вернул данные в неожиданном формате.'
        }
      }
    }
    request.upload.onprogress = event => {
      if (event.lengthComputable && event.total) onProgress({ stage: 'uploading', percent: Math.min(100, Math.floor(event.loaded * 100 / event.total)) })
    }
    request.upload.onload = () => onProgress({ stage: 'uploading', percent: 100 })
    request.onprogress = readProgress
    request.onload = () => {
      if (streamed()) {
        readProgress()
      } else {
        try {
          const result = JSON.parse(request.responseText)
          if (request.status >= 200 && request.status < 300) saved = savedInterviewSchema.parse(result)
          else failure = result?.error?.message ?? `Ошибка запроса (${request.status}).`
        } catch {
          failure = 'Сервер вернул данные в неожиданном формате.'
        }
      }
      if (saved && !failure) resolve(saved)
      else reject(new Error(failure ?? 'Сервер не подтвердил сохранение интервью. Повторите загрузку.'))
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

export function requestCoaching(input: CoachingRequest, signal: AbortSignal, mode?: 'local') {
  const path = mode === 'local' ? '/api/coach?mode=local' : '/api/coach'
  return typedRequest(coachingResultSchema, path, jsonRequest('POST', input, signal))
}
