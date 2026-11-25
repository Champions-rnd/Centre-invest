import {
  reportSchema, transcriptSchema, vacancyCriteria,
  type AnalysisRequest, type InterviewResult, type Vacancy,
} from '../shared/contracts'
import { analyzeInterview } from './analysis'
import { analyzeCriteriaWithChatCI } from './analysis/criterion-report'
import { modelFailure } from './analysis/structured-model'
import { chatciTextProvider } from './chatci'
import { suggestSpeakerRoles } from './analysis/roles'
import { ApiError } from './errors'
import { transcribeWav } from './stt'

export async function buildReport(input: AnalysisRequest): Promise<InterviewResult> {
  const provider = chatciTextProvider()
  if (provider && input.vacancy.criteria.length && input.transcript.some(segment => segment.speaker === 'candidate')) {
    try {
      const report = await analyzeCriteriaWithChatCI(input, provider)
      return { mode: 'live', ...input, report, reportSource: 'chatci' }
    } catch (error) {
      console.error(`Не удалось получить отчёт по критериям от ChatCI: ${modelFailure(error)}.`)
    }
  }
  const parsed = reportSchema.safeParse(analyzeInterview(input))
  if (!parsed.success) {
    throw new ApiError(502, 'INVALID_REPORT', 'Не удалось сформировать отчёт в ожидаемом формате.')
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

  return { mode: 'live', ...input, report: parsed.data, reportSource: 'rules' }
}

export async function processInterview(
  audio: Express.Multer.File, vacancy: Vacancy | null,
): Promise<InterviewResult> {
  const parsed = transcriptSchema.safeParse(await transcribeWav(audio))
  if (!parsed.success) {
    throw new ApiError(502, 'INVALID_TRANSCRIPT', 'Распознавание вернуло расшифровку в неверном формате.')
  }
  const transcript = suggestSpeakerRoles(parsed.data)
  return vacancy
    ? buildReport({ vacancy, transcript })
    : { mode: 'live', vacancy: null, transcript, report: [] }
}
