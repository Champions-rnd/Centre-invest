import type { CoachingRequest, Recommendation, Segment } from '../../shared/contracts'
import { words } from './index'

const themes = [
  {
    cues: /личн\p{L}* вклад|отвечал\p{L}* за|я отвечал|я отвечала|personal contribution|responsible for/iu,
    question: 'За какую часть задачи вы отвечали лично? Как выглядел ваш результат?',
    reason: 'Раздельно уточните личный вклад и результат команды.',
  },
  {
    cues: /измер\p{L}* результат|по каким показател|метрик\p{L}*|каков был результат|изменилось|measur\w*|metric\w*/iu,
    question: 'Как вы поняли, что решение сработало? Приведите показатель или пример обратной связи.',
    reason: 'В расшифровке нет явного обсуждения того, как проверяли результат.',
  },
  {
    cues: /ошиб\p{L}*|не получилось|что бы вы сдел|mistake\w*|what would you change/iu,
    question: 'Что в одном из ваших проектов пришлось переделать и почему?',
    reason: 'В расшифровке нет явного обсуждения того, как кандидат пересматривал своё решение.',
  },
]

function proposedQuestions(transcript: Segment[]) {
  const recommendations: Recommendation[] = []
  for (const [index, segment] of transcript.entries()) {
    if (segment.speaker !== 'hr') continue
    const question = segment.text
    if (/расскаж(?:и|ите) о себе|что-нибудь|как вообще|вы ведь|tell me about yourself|you (?:surely|obviously)/iu.test(question)
        || (question.match(/\?/gu)?.length ?? 0) > 1) {
      const topic = question.split('?').slice(0, -1)
        .map(part => part.trim().replace(/^(?:и|а)\s+/iu, ''))
        .find(part => part.length > 8 && !/о себе|about yourself|что-нибудь/iu.test(part))
      recommendations.push({
        kind: 'rephrase',
        reason: 'Вопрос широкий, наводящий или объединяет несколько тем. Конкретный пример упростит ответ.',
        question: topic
          ? `${topic[0].toUpperCase() + topic.slice(1, 150)}? Можете привести один конкретный пример?`
          : 'Можете описать одну конкретную задачу, ваши действия и результат?',
        evidenceIds: [segment.id],
      })
    }

    const next = transcript[index + 1]
    const continuation = transcript[index + 2]
    if (next?.speaker !== 'candidate' || next.startMs - segment.endMs > 15_000) continue
    const hasContinuation = continuation?.speaker === 'candidate' && continuation.startMs - next.endMs < 2500
    if (!hasContinuation && next.text.split(/\s+/u).length < 13) {
      recommendations.push({
        kind: 'clarify',
        reason: 'Ответ короткий. Уточнение поможет получить конкретные действия, детали или результат.',
        question: `Вы сказали «${next.text.slice(0, 150).replace(/[.!?]+$/u, '')}». Можете пояснить, что именно вы сделали и каким был результат?`,
        evidenceIds: [segment.id, next.id],
      })
    }
  }
  return recommendations
}

export function coachingRules({ transcript, vacancy }: CoachingRequest): Recommendation[] {
  const covered = new Set(transcript.flatMap(segment => [...words(segment.text)]))
  const unasked: Recommendation[] = []
  for (const criterion of vacancy?.criteria ?? []) {
    const terms = [...words(criterion)]
    if (!terms.length || terms.some(term => covered.has(term))) continue
    unasked.push({
      kind: 'unasked',
      reason: 'В расшифровке нет явного упоминания этой темы из контекста вакансии.',
      question: `Приведите пример по теме «${criterion.slice(0, 200)}». Что вы сделали лично и каким был результат?`,
      evidenceIds: [],
    })
  }
  const text = transcript.map(segment => segment.text).join(' ')
  for (const theme of themes) {
    if (theme.cues.test(text)) continue
    unasked.push({ kind: 'unasked', reason: theme.reason, question: theme.question, evidenceIds: [] })
  }
  const dialogue = proposedQuestions(transcript)
  return [...unasked.slice(0, 3), ...dialogue.filter(item => item.kind === 'rephrase').slice(0, 2),
    ...dialogue.filter(item => item.kind === 'clarify').slice(0, 2)]
}
