import type { Segment } from '../../shared/contracts'

const questionOpening = /^(?:ну[, ]+|а[, ]+|так[, ]+)*(?:расскаж(?:и|ите)|приведите|объясните|подскажите|я (?:хочу|хотел бы|хотела бы) (?:спросить|уточнить)|как (?:вы|ты|вам|у вас|удалось|получилось)|почему (?:вы|ты|так)|что (?:вы|ты|для вас|было)|мож(?:ешь|ете) (?:ли |рассказать|привести|уточнить)|tell me|can you|could you|what did you|how did you|why did you|what was your)/iu
const candidateQuestion = /^(?:могу ли я|мне нужно|у меня вопрос|правильно ли я|а у вас|can i\b|should i\b|do i\b|my question)/iu
const firstPerson = /(?:^|[\s,.;:])(?:я|мы|у меня|мой|моя|I|we|my)(?=$|[\s,.;:]|['’])/iu
const secondPerson = /(?:^|[\s,.;:])(?:ты|тебя|вы|вас|you|your)(?=$|[\s,.;:])/iu

export function suggestSpeakerRoles(transcript: Segment[]): Segment[] {
  let previous: Segment | undefined
  return transcript.map((segment, index) => {
    const gap = previous ? segment.startMs - previous.endMs : Infinity
    const text = segment.text.trim()
    const next = transcript[index + 1]
    let speaker = segment.speaker
    if (!speaker) {
      if (candidateQuestion.test(text)) speaker = 'candidate'
      else if (questionOpening.test(text) || (text.endsWith('?') && !firstPerson.test(text))) speaker = 'hr'
      else if (!firstPerson.test(text) && secondPerson.test(text) && transcript.slice(index + 1, index + 3).some(reply =>
        reply.startMs - segment.endMs < 6500 && firstPerson.test(reply.text))) speaker = 'hr'
      else if (!firstPerson.test(text) && previous?.speaker === 'hr' && gap < 2500
        && next && next.startMs - segment.endMs < 2500 && firstPerson.test(next.text)) speaker = 'hr'
      else if (firstPerson.test(text) || (previous?.speaker === 'hr' && gap < 7000)
        || (previous?.speaker === 'candidate' && gap < 2500)) speaker = 'candidate'
    }
    previous = { ...segment, speaker }
    return previous
  })
}
