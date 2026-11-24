import type { Segment, SpeakerRole } from '../../shared/contracts'

const hrOpening = /^(?:ну[, ]+|а[, ]+|так[, ]+)*(?:расскаж(?:и|ите)|приведите|объясните|как (?:вы|ты|вам|у вас|удалось|получилось)|почему (?:вы|ты)|что (?:вы|ты|для вас)|мож(?:ешь|ете) (?:рассказать|привести|уточнить)|tell me|can you|could you|what did you|how did you|why did you)/iu
const hrLanguage = /у нас в компании|мы ищем|наша вакансия|наша команда (?:ищет|предлагает)|я (?:хочу|хотел[аи]? бы) (?:спросить|уточнить)|we are hiring|our open position/iu
const candidateQuestion = /^(?:могу ли я|у меня вопрос|а у вас (?:есть|как)\s+[^?]*(?:график|удал[её]нк|отбор|ваканси)|какие у вас (?:этапы отбора|условия работы)|can i\b|should i\b|my question)/iu
const experience = /(?:^|[\s,.;:])(?:я|мы)\s+(?:(?:бы|тогда|раньше|лично|сам[а]?|обычно)\s+)*(?:учил\p{L}*|работал\p{L}*|делал\p{L}*|разработал\p{L}*|занимал\p{L}*|отвечал\p{L}*|сделал\p{L}*|проверял\p{L}*|тестировал\p{L}*|проектировал\p{L}*)|(?:^|[\s,.;:])(?:мой опыт|в моём проекте|i (?:worked|studied|built|designed|tested|developed))/iu
const secondPerson = /(?:^|[\s,.;:])(?:ты|тебя|твой|вы|вас|ваш|you|your)(?=$|[\s,.;:!?])/iu
const firstPerson = /(?:^|[\s,.;:])(?:я|мы|у меня|мой|моя|I|we|my)(?=$|[\s,.;:]|['’])/iu

function anchor(text: string): SpeakerRole {
  if (hrLanguage.test(text)) return 'hr'
  if (candidateQuestion.test(text)) return 'candidate'
  if (hrOpening.test(text) || (text.endsWith('?') && secondPerson.test(text) && !experience.test(text))) return 'hr'
  if (experience.test(text) && !text.endsWith('?')) return 'candidate'
  return ''
}

function continuation(previous: Segment, current: Segment) {
  return current.startMs - previous.endMs <= 600 && !/[.!?…»”"]$/u.test(previous.text.trim())
    && /^[\p{Ll},–—]/u.test(current.text.trim())
}

const answerCue = /^(?:(?:ну|да|нет)[, ]+)*(?:я|мы|у меня|мне|по моему опыту|i|we)(?![\p{L}\p{N}])/iu
export const shortAcknowledgement = /^(?:угу|ага|да|нет|понятно|ясно|хорошо|окей|okay|yes|no|mhm)[.!?…\s]*$/iu

function diarizedRoles(transcript: Segment[], textRoles: SpeakerRole[]) {
  const scores = new Map<string, number>()
  for (const [index, segment] of transcript.entries()) {
    if (!segment.speakerId) continue
    const explicit = anchor(segment.text) || (segment.text.endsWith('?') && !firstPerson.test(segment.text) ? 'hr' : '')
    const role = explicit || textRoles[index]
    const vote = role === 'hr' ? (explicit ? 4 : 2)
      : role === 'candidate' ? (explicit ? -4 : -1)
      : firstPerson.test(segment.text) ? -1 : secondPerson.test(segment.text) ? 2 : 0
    scores.set(segment.speakerId, (scores.get(segment.speakerId) ?? 0) + vote)
  }
  const ranking = [...scores].sort((left, right) => right[1] - left[1])
  const roles = new Map<string, SpeakerRole>()
  if (ranking.length === 2 && ranking[0][1] - ranking[1][1] >= 3) {
    roles.set(ranking[0][0], 'hr')
    roles.set(ranking[1][0], 'candidate')
  } else {
    for (const [speakerId, score] of ranking) {
      if (Math.abs(score) >= 3) roles.set(speakerId, score > 0 ? 'hr' : 'candidate')
    }
  }
  return roles
}

export function inferSpeakerRoles(transcript: Segment[]): SpeakerRole[] {
  const anchors = transcript.map(segment => anchor(segment.text))
  for (const [index, segment] of transcript.entries()) {
    if (anchors[index] || !secondPerson.test(segment.text)) continue
    const nearbyAnswer = transcript.slice(index + 1, index + 4).findIndex((next, offset) =>
      (anchors[index + offset + 1] === 'candidate' || answerCue.test(next.text)) && next.startMs - segment.endMs < 4000
      && transcript.slice(index + 1, index + offset + 1).every((part, partIndex) =>
        continuation(transcript[index + partIndex], part)))
    if (nearbyAnswer >= 0) anchors[index] = 'hr'
  }
  const roles = [...anchors]
  for (const [index, segment] of transcript.entries()) {
    if (roles[index] || index === 0 || shortAcknowledgement.test(segment.text.trim())) continue
    const prior = roles[index - 1]
    const next = anchors[index + 1]
    const previous = transcript[index - 1]
    const gap = segment.startMs - previous.endMs
    if (answerCue.test(segment.text) && ((prior === 'hr' && !continuation(previous, segment) && gap <= 3000)
      || (prior === 'candidate' && gap <= 1300))) roles[index] = 'candidate'
    else if (prior && continuation(previous, segment) && !answerCue.test(segment.text)) roles[index] = prior
    else if (prior && next === prior && segment.startMs - previous.endMs <= 1000
      && transcript[index + 1].startMs - segment.endMs <= 1000) roles[index] = prior
  }
  const voices = diarizedRoles(transcript, roles)
  return transcript.map((segment, index) => segment.speakerId ? voices.get(segment.speakerId) ?? '' : roles[index])
}

export function suggestSpeakerRoles(transcript: Segment[]): Segment[] {
  const roles = inferSpeakerRoles(transcript)
  return transcript.map((segment, index) => segment.speaker || segment.roleReviewed
    ? segment : { ...segment, speaker: roles[index] })
}
