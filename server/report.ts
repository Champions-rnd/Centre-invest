import {
  reportSchema, transcriptSchema, vacancyCriteria,
  type InterviewResult,
} from '../shared/contracts'
import { analyzeInterview } from './analysis'
import { ApiError } from './errors'
import { transcribeWav } from './stt'

export async function buildReport(
  input: Pick<InterviewResult, 'vacancy' | 'transcript'>,
): Promise<InterviewResult> {
  const parsed = reportSchema.safeParse(await analyzeInterview(input))
  if (!parsed.success) {
    throw new ApiError(502, 'INVALID_REPORT', 'Модель вернула отчёт в неверном формате.')
  }
  const criteria = new Set(vacancyCriteria(input.vacancy).map(criterion => criterion.id))
  const segmentIds = new Set(input.transcript.map(segment => segment.id))
  for (const finding of parsed.data) {
    if (!criteria.delete(finding.criterionId)
      || finding.evidenceIds.some(id => !segmentIds.has(id))
      || new Set(finding.evidenceIds).size !== finding.evidenceIds.length
      || (finding.status !== 'missing' && finding.evidenceIds.length === 0)
      || (finding.status === 'missing' && finding.evidenceIds.length > 0)
      || (finding.status !== 'supported' && finding.gaps.length === 0)) {
      throw new ApiError(502, 'INVALID_EVIDENCE', 'Отчёт содержит ошибочные ссылки или пропуски.')
    }
  }
  if (criteria.size > 0) {
    throw new ApiError(502, 'INCOMPLETE_REPORT', 'В отчёте не хватает результатов по критериям вакансии.')
  }

  return { mode: 'live', ...input, report: parsed.data }
}

export async function processInterview(
  audio: Express.Multer.File, vacancy: InterviewResult['vacancy'],
): Promise<InterviewResult> {
  const parsed = transcriptSchema.safeParse(await transcribeWav(audio))
  if (!parsed.success) {
    throw new ApiError(502, 'INVALID_TRANSCRIPT', 'Распознавание вернуло расшифровку в неверном формате.')
  }
  return buildReport({ vacancy, transcript: parsed.data })
}
