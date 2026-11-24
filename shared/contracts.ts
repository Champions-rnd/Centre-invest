import { z } from 'zod'

export const MAX_AUDIO_MB = 50
export const MAX_AUDIO_SECONDS = 60 * 60

export const vacancySchema = z.object({
  description: z.string().trim().max(12_000),
  criteria: z.array(z.string().trim().min(1).max(300)).max(20),
}).refine(vacancy => Boolean(vacancy.description || vacancy.criteria.length), {
  message: 'Добавьте описание или тему для проверки',
})

export const segmentSchema = z.object({
  id: z.string().min(1),
  speaker: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  text: z.string().trim().min(1),
}).refine(segment => segment.endMs > segment.startMs, {
  message: 'Конец реплики должен быть после начала',
})

export const transcriptSchema = z.array(segmentSchema).min(1).refine(
  segments => new Set(segments.map(segment => segment.id)).size === segments.length,
  { message: 'ID реплик должны быть уникальны' },
)

export const findingSchema = z.object({
  criterionId: z.string().min(1),
  status: z.enum(['supported', 'partial', 'missing']),
  conclusion: z.string().trim().min(1),
  evidenceIds: z.array(z.string().min(1)),
  gaps: z.array(z.string().trim().min(1)),
  nextQuestions: z.array(z.string().trim().min(1)),
})

export const reportSchema = z.array(findingSchema)
export const analysisRequestSchema = z.object({
  vacancy: vacancySchema,
  transcript: transcriptSchema,
})

export const speakerRoleSchema = z.enum(['hr', 'candidate', ''])
export const coachingRequestSchema = analysisRequestSchema.extend({ vacancy: vacancySchema.nullable() })
export const recommendationSchema = z.object({
  kind: z.enum(['unasked', 'rephrase', 'clarify']),
  question: z.string().trim().min(8).max(360),
  reason: z.string().trim().min(8).max(360),
  evidenceIds: z.array(z.string().min(1)).max(3),
})
export const coachingResultSchema = z.object({
  source: z.enum(['local', 'configured', 'rules']),
  ruleSupplement: z.boolean().default(false),
  recommendations: z.array(recommendationSchema).max(12),
})

export const resultSchema = z.object({
  mode: z.literal('live'),
  vacancy: vacancySchema.nullable(),
  transcript: transcriptSchema,
  report: reportSchema,
})

export type Vacancy = z.infer<typeof vacancySchema>
export type Segment = z.infer<typeof segmentSchema>
export type Finding = z.infer<typeof findingSchema>
export type AnalysisRequest = z.infer<typeof analysisRequestSchema>
export type InterviewResult = z.infer<typeof resultSchema>
export type SpeakerRole = z.infer<typeof speakerRoleSchema>
export type CoachingRequest = z.infer<typeof coachingRequestSchema>
export type Recommendation = z.infer<typeof recommendationSchema>
export type CoachingResult = z.infer<typeof coachingResultSchema>

export function vacancyCriteria(vacancy: Vacancy) {
  return vacancy.criteria.map((label, index) => ({ id: `c${index + 1}`, label }))
}
