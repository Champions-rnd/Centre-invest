import type { AnswerObservation, Segment } from '../../shared/contracts'

const fillerPattern = /(?:^|[^\p{L}])(э(?:[-‑]?э)+|эм+|м(?:[-‑]?м)+)(?=$|[^\p{L}])/giu

export function speechCues(transcript: Segment[]) {
  const cues: AnswerObservation[] = []
  for (const [index, segment] of transcript.entries()) {
    if (segment.speaker !== 'candidate') continue
    const count = [...segment.text.matchAll(fillerPattern)].length
    if (count >= 2) cues.push({
      kind: 'improvement', aspect: 'fillers', evidenceIds: [segment.id],
      text: `В этом фрагменте распознаны повторяющиеся междометия («э-э», «эм» или «м-м»): ${count}. Сверьте с аудио.`,
    })
    const previous = transcript[index - 1]
    if (!previous || previous.speaker !== 'candidate' || !segment.speakerId || previous.speakerId !== segment.speakerId) continue
    const gap = segment.startMs - previous.endMs
    if (gap >= 1500 && gap <= 15_000) cues.push({
      kind: 'improvement', aspect: 'pauses', evidenceIds: [previous.id, segment.id],
      text: `Между соседними фрагментами ответа по таймкодам ${(gap / 1000).toLocaleString('ru', { maximumFractionDigits: 1 })} с. Сверьте паузу с аудио.`,
    })
  }
  return cues
}
