import { z } from 'zod'

export const vacancySchema = z.object({
  description: z.string().trim().min(1).max(12_000),
  criteria: z.array(z.string().trim().min(1).max(300)).min(1).max(20),
})

export const segmentSchema = z.object({
  id: z.string().min(1),
  speaker: z.string().min(1),
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

export const resultSchema = analysisRequestSchema.extend({
  mode: z.enum(['demo', 'live']),
  report: reportSchema,
})

export type Vacancy = z.infer<typeof vacancySchema>
export type Segment = z.infer<typeof segmentSchema>
export type Finding = z.infer<typeof findingSchema>
export type AnalysisRequest = z.infer<typeof analysisRequestSchema>
export type InterviewResult = z.infer<typeof resultSchema>

export function vacancyCriteria(vacancy: Vacancy) {
  return vacancy.criteria.map((label, index) => ({ id: `c${index + 1}`, label }))
}
