import { z } from 'zod'
import type { Segment } from '../../shared/contracts'
import { ApiError } from '../errors'
import { CHATCI_BASE_URL, chatciKey } from '../chatci'

const MODEL = 'elevenlabs/scribe-v2'
const span = { start: z.number().finite().nonnegative(), end: z.number().finite().nonnegative() }
const responseSchema = z.object({
  text: z.string(),
  words: z.array(z.object({
    ...span,
    word: z.string(),
    speaker: z.number().int().nonnegative().nullish(),
    speaker_label: z.string().trim().min(1).max(64).nullish(),
  })).default([]),
  segments: z.array(z.object({ ...span, text: z.string() })).default([]),
})

function appendWord(text: string, word: string) {
  if (!text || /^[,.!?;:%…»)}\]]/u.test(word) || /[«({\[]$/u.test(text)) return text + word
  return text + ' ' + word
}

export function parseScribeTranscript(payload: unknown): Segment[] {
  const parsed = responseSchema.safeParse(payload)
  if (!parsed.success) throw new ApiError(502, 'INVALID_TRANSCRIPT', 'ChatCI вернул расшифровку в неожиданном формате.')
  const { words, segments, text } = parsed.data
  const result: Segment[] = []
  let current: Omit<Segment, 'id'> | undefined
  function finish() {
    if (current && current.endMs > current.startMs) result.push({ id: `s${result.length + 1}`, ...current })
  }

  for (const item of [...words].sort((left, right) => left.start - right.start)) {
    const word = item.word.trim()
    if (!word || item.end < item.start) continue
    const startMs = Math.round(item.start * 1000)
    const endMs = Math.round(item.end * 1000)
    const speakerId = item.speaker_label ?? (item.speaker == null ? undefined : `speaker_${item.speaker}`)
    if (!current || current.speakerId !== speakerId || startMs - current.endMs > 1100
      || startMs - current.startMs >= 25_000 || (current.text.length >= 130 && /[.!?…]$/u.test(current.text))) {
      finish()
      current = { speaker: '', ...(speakerId ? { speakerId } : {}), startMs, endMs, text: word }
    } else {
      current.text = appendWord(current.text, word)
      current.endMs = Math.max(current.endMs, endMs)
    }
  }
  finish()

  if (result.length) return result
  for (const segment of [...segments].sort((left, right) => left.start - right.start)) {
    const startMs = Math.round(segment.start * 1000)
    const endMs = Math.round(segment.end * 1000)
    if (endMs > startMs && segment.text.trim()) {
      result.push({ id: `s${result.length + 1}`, speaker: '', startMs, endMs, text: segment.text.trim() })
    }
  }
  if (result.length) return result
  if (!text.trim()) throw new ApiError(422, 'NO_SPEECH', 'ChatCI не обнаружил разборчивую речь.')
  throw new ApiError(502, 'MISSING_TIMESTAMPS', 'ChatCI вернул текст без таймкодов.')
}

export async function transcribeWav(audio: Express.Multer.File): Promise<Segment[]> {
  const key = chatciKey()
  if (!key) throw new ApiError(503, 'CHATCI_NOT_CONFIGURED', 'Укажите HR_CHATCI_API_KEY в файле .env и перезапустите сервер.')

  const body = new FormData()
  body.set('model', MODEL)
  body.set('response_format', 'verbose_json')
  body.set('diarize', 'true')
  body.set('timestamps_granularity', 'word')
  body.set('file', new Blob([new Uint8Array(audio.buffer)], { type: 'audio/wav' }), 'interview.wav')

  let response: Response
  try {
    response = await fetch(CHATCI_BASE_URL + '/audio/transcriptions', {
      method: 'POST',
      body,
      headers: { Authorization: `Bearer ${key}` },
      redirect: 'error',
      signal: AbortSignal.timeout(180_000),
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new ApiError(504, 'SPEECH_TIMEOUT', 'ChatCI слишком долго обрабатывает запись. Попробуйте ещё раз.')
    }
    throw new ApiError(503, 'CHATCI_UNAVAILABLE', 'Не удалось подключиться к ChatCI. Попробуйте позже.')
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new ApiError(503, 'CHATCI_AUTH_FAILED', 'ChatCI отклонил ключ или доступ к модели.')
    }
    if (response.status === 413) throw new ApiError(413, 'FILE_TOO_LARGE', 'ChatCI отклонил размер файла.')
    if (response.status === 429) throw new ApiError(429, 'CHATCI_RATE_LIMIT', 'Достигнут лимит ChatCI. Повторите запрос позже.')
    if (response.status === 400 || response.status === 415 || response.status === 422) {
      throw new ApiError(400, 'INVALID_WAV', 'ChatCI не смог обработать этот WAV. Проверьте запись.')
    }
    throw new ApiError(502, 'TRANSCRIPTION_FAILED', 'ChatCI не смог расшифровать запись. Попробуйте позже.')
  }
  const payload = await response.json().catch(() => {
    throw new ApiError(502, 'INVALID_TRANSCRIPT', 'ChatCI вернул нечитаемую расшифровку.')
  })
  return parseScribeTranscript(payload)
}
