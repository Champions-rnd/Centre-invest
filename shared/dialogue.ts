import type { Segment } from './contracts'

export function groupDialogue(transcript: Segment[]) {
  const turns: Segment[][] = []
  for (const segment of transcript) {
    const turn = turns.at(-1)
    const previous = turn?.at(-1)
    if (turn && previous && (segment.speaker === 'hr' || segment.speaker === 'candidate')
      && segment.speaker === previous.speaker && segment.startMs >= previous.startMs
      && segment.startMs - previous.endMs <= 1350
      && segment.endMs - turn[0].startMs <= 42_000) {
      turn.push(segment)
    } else {
      turns.push([segment])
    }
  }
  return turns
}
