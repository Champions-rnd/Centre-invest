import type { AnswerObservation, Segment } from '../../shared/contracts'
import { groupDialogue } from '../../shared/dialogue'

const questionCue = /\?|^(?:расскажите|опишите|объясните|приведите|как\s|почему\s|что\s|сколько\s)/iu
const openQuestion = /^(?:а\s+)?(?:расскажите|опишите|объясните|приведите|как\s|почему\s|что\s|каким\s)/iu
const outcomeCue = /результат|метрик|обратн\p{L}* связ|удалось|изменил|эффект/iu
const metric = /\d+[.,]?\d*\s*(?:%|процент|пользовател|участник|сценари|час|дне(?:й|в)|минут|клиент|заяв)/iu
const sequence = /сначала[^.!?]{0,140}(?:затем|потом|после этого)|потому что|в результате|поэтому/iu

export function questionLinks(transcript: Segment[]) {
  const links = new Map<string, string[]>()
  const turns = groupDialogue(transcript)
  for (let index = 1; index < turns.length; index++) {
    const question = turns[index - 1]
    const answer = turns[index]
    if (question[0].speaker !== 'hr' || answer[0].speaker !== 'candidate'
      || answer[0].startMs - question.at(-1)!.endMs > 15_000) continue
    const ids = question.filter(segment => questionCue.test(segment.text.trim())).map(segment => segment.id)
    if (ids.length) for (const segment of answer) links.set(segment.id, ids)
  }
  return links
}

export function transcriptObservations(transcript: Segment[]): AnswerObservation[] {
  const observations: AnswerObservation[] = []
  const byId = new Map(transcript.map(segment => [segment.id, segment]))
  const links = questionLinks(transcript)
  const add = (item: AnswerObservation) => {
    if (!observations.some(other => other.kind === item.kind && other.aspect === item.aspect)) observations.push(item)
  }

  for (const turn of groupDialogue(transcript)) {
    const first = turn[0]
    if (first.speaker !== 'candidate') continue
    const text = turn.map(segment => segment.text).join(' ')
    const metrics = turn.find(segment => metric.test(segment.text))
    if (metrics) add({ kind: 'strength', aspect: 'detail', evidenceIds: [metrics.id],
      text: 'Кандидат приводит числовую деталь. Её можно уточнить и сопоставить с описанным примером.' })
    const structured = turn.find(segment => sequence.test(segment.text))
    if (structured && text.split(/\s+/u).length >= 12) add({
      kind: 'strength', aspect: 'clarity', evidenceIds: [structured.id],
      text: 'Кандидат связывает мысли в ответе с помощью последовательности действий или объяснения причины.',
    })

    const linked = links.get(first.id)
    const question = linked && byId.get(linked[0])
    if (!question) continue
    const count = text.split(/\s+/u).length
    if (count <= 10 && openQuestion.test(question.text.trim())) add({
      kind: 'improvement', aspect: 'relevance', evidenceIds: [question.id, first.id],
      text: 'Ответ на открытый вопрос короткий. Попросите раскрыть, что именно кандидат сделал и почему.',
    })
    if (outcomeCue.test(question.text) && !metric.test(text) && !outcomeCue.test(text)) add({
      kind: 'improvement', aspect: 'outcome', evidenceIds: [question.id, first.id],
      text: 'Стоит уточнить, чем закончилась работа и по каким признакам кандидат оценивал результат.',
    })
  }
  return observations
}
