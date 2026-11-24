import { z } from 'zod'
import { resultSchema, transcriptSchema } from './contracts'

export const candidateStatusSchema = z.enum(['new', 'review', 'verified'])
export const candidateStatuses = {
  new: 'Новый',
  review: 'Требуется сверка',
  verified: 'Проверено HR',
} as const

export const candidateProfileSchema = z.object({
  name: z.string().trim().min(1).max(180),
  specialty: z.string().trim().min(1).max(120),
  experience: z.string().trim().max(80).default(''),
  salary: z.string().trim().max(80).default(''),
  notes: z.string().trim().max(1500).default(''),
})

export const candidateTargetSchema = z.union([
  z.object({ candidateId: z.uuid() }),
  z.object({ profile: candidateProfileSchema, newCandidateId: z.uuid().optional() }),
])

export const candidateSchema = candidateProfileSchema.extend({
  id: z.uuid(),
  status: candidateStatusSchema,
  interviewCount: z.number().int().nonnegative(),
  latestAt: z.string().nullable(),
})

export const interviewSummarySchema = z.object({
  id: z.uuid(),
  fileName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  segmentCount: z.number().int().positive(),
})

export const candidateDetailSchema = candidateSchema.extend({ interviews: z.array(interviewSummarySchema) })
export const savedInterviewSchema = interviewSummarySchema.extend({ candidateId: z.uuid(), result: resultSchema })
export const transcriptUpdateSchema = z.object({ transcript: transcriptSchema, updatedAt: z.string() })

export type Candidate = z.infer<typeof candidateSchema>
export type CandidateDetail = z.infer<typeof candidateDetailSchema>
export type CandidateStatus = z.infer<typeof candidateStatusSchema>
export type CandidateTarget = z.infer<typeof candidateTargetSchema>
export type SavedInterview = z.infer<typeof savedInterviewSchema>
