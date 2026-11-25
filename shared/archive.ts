import { z } from 'zod'
import { recommendationSchema, resultSchema, transcriptSchema, vacancySchema } from './contracts'

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

export const MAX_RESUME_BYTES = 128 * 1024

export const resumeSchema = z.object({
  fileName: z.string().trim().max(255).regex(/^[^/\\\x00-\x1f]+\.txt$/iu),
  base64: z.base64().min(4).max(Math.ceil(MAX_RESUME_BYTES / 3) * 4)
    .refine(value => value.length / 4 * 3 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0) <= MAX_RESUME_BYTES),
})
const candidateMaterialsSchema = z.object({
  vacancy: vacancySchema.nullable(),
  resume: resumeSchema.optional(),
})

export const candidateTargetSchema = z.union([
  z.object({ candidateId: z.uuid() }),
  z.object({ profile: candidateProfileSchema, newCandidateId: z.uuid().optional(), materials: candidateMaterialsSchema.optional() }),
])
export const candidateCreateSchema = z.object({ id: z.uuid(), profile: candidateProfileSchema, materials: candidateMaterialsSchema.optional() })

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

export const candidateDetailSchema = candidateSchema.extend({
  interviews: z.array(interviewSummarySchema),
  vacancy: vacancySchema.nullable().optional(),
  resumeName: z.string().optional(),
})
export const interviewDeletionSchema = z.object({
  candidateId: z.uuid(),
  candidate: candidateDetailSchema.nullable(),
})
export const archiveInterviewSchema = interviewSummarySchema.extend({ candidate: candidateSchema })
export const savedInterviewSchema = interviewSummarySchema.extend({ candidateId: z.uuid(), result: resultSchema })
export const transcriptUpdateSchema = z.object({ transcript: transcriptSchema, updatedAt: z.string() })
export const candidateOverviewSchema = z.object({
  recommendations: z.array(recommendationSchema),
  sources: z.array(z.object({ id: z.string(), interviewId: z.uuid(), fileName: z.string(), startMs: z.number() })),
})

export type Candidate = z.infer<typeof candidateSchema>
export type CandidateDetail = z.infer<typeof candidateDetailSchema>
export type CandidateStatus = z.infer<typeof candidateStatusSchema>
export type CandidateTarget = z.infer<typeof candidateTargetSchema>
export type CandidateProfile = z.infer<typeof candidateProfileSchema>
export type SavedInterview = z.infer<typeof savedInterviewSchema>
export type InterviewSummary = z.infer<typeof interviewSummarySchema>
export type ArchiveInterview = z.infer<typeof archiveInterviewSchema>
export type CandidateOverview = z.infer<typeof candidateOverviewSchema>

export type CandidateMaterials = z.infer<typeof candidateMaterialsSchema>
