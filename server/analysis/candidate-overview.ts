import type { CandidateOverview, SavedInterview } from '../../shared/archive'
import type { Segment } from '../../shared/contracts'
import { coachInterview } from './coach'

export async function buildCandidateOverview(interviews: SavedInterview[], signal: AbortSignal): Promise<CandidateOverview> {
  if (!interviews.length) return { recommendations: [], sources: [] }
  const transcript: Segment[] = []
  const sources = new Map<string, CandidateOverview['sources'][number]>()
  let offset = 0

  for (const interview of [...interviews].reverse()) {
    let end = offset
    for (const segment of interview.result.transcript) {
      const id = `${interview.id}:${segment.id}`
      sources.set(id, { id, interviewId: interview.id, fileName: interview.fileName, startMs: segment.startMs })
      transcript.push({ ...segment, id, startMs: segment.startMs + offset, endMs: segment.endMs + offset })
      end = Math.max(end, segment.endMs + offset)
    }
    offset = end + 30_000
  }

  const vacancy = interviews.find(interview => interview.result.vacancy)?.result.vacancy ?? null
  const coaching = await coachInterview({ vacancy, transcript }, signal)
  const recommendations = coaching.recommendations.slice(0, 6)
  const cited = new Set(recommendations.flatMap(item => item.evidenceIds))
  return { recommendations, sources: [...cited].flatMap(id => sources.get(id) ?? []) }
}
