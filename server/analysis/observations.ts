import type { AnswerObservation, Segment } from '../../shared/contracts'
import { groupDialogue } from '../../shared/dialogue'

const questionCue = /\?|^(?:расскажите|опишите|объясните|приведите|как\s|почему\s|что\s|сколько\s)/iu
const outcomeCue = /результат|метрик|эффект|показател|как оценивал/iu
const exampleCue = /пример|что (?:именно )?вы сделали|в ч[её]м (?:был )?ваш вклад/iu
const noOutcome = /(?:результат\p{L}*|эффект\p{L}*|показател\p{L}*) (?:мы )?не (?:измерял\p{L}*|фиксировал\p{L}*|отслеживал\p{L}*)|не (?:измерял\p{L}*|фиксировал\p{L}*|отслеживал\p{L}*) (?:результат\p{L}*|эффект\p{L}*|показател\p{L}*)/iu
const noExample = /не могу (?:назвать|привести|вспомнить) (?:конкретный )?пример|не помню (?:конкретный )?пример/iu
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

    const questions = (links.get(first.id) ?? []).map(id => byId.get(id)!)
    const outcomeQuestion = questions.find(segment => outcomeCue.test(segment.text))
    const outcomeAnswer = turn.find(segment => noOutcome.test(segment.text))
    if (outcomeQuestion && outcomeAnswer) add({
      kind: 'improvement', aspect: 'outcome', evidenceIds: [outcomeQuestion.id, outcomeAnswer.id],
      text: 'На вопрос о результате кандидат сообщил, что его не измеряли или не отслеживали. В этом примере неясно, как проверяли эффект работы.',
    })
    const exampleQuestion = questions.find(segment => exampleCue.test(segment.text))
    const exampleAnswer = turn.find(segment => noExample.test(segment.text))
    if (exampleQuestion && exampleAnswer) add({
      kind: 'improvement', aspect: 'detail', evidenceIds: [exampleQuestion.id, exampleAnswer.id],
      text: 'HR попросил конкретный пример, но кандидат сказал, что не может его привести или вспомнить.',
    })
  }
  return observations
}
