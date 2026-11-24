import { execFile } from 'node:child_process'
import { access, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { z } from 'zod'
import { MAX_AUDIO_SECONDS } from '../../shared/contracts'
import type { Segment } from '../../shared/contracts'
import { ApiError } from '../errors'

const run = promisify(execFile)
const options = { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }
const whisperResult = z.object({
  transcription: z.array(z.object({
    offsets: z.object({ from: z.number().int().nonnegative(), to: z.number().int().nonnegative() }),
    text: z.string(),
  })),
})
let transcribing = false

function speechPaths() {
  const directory = join(process.cwd(), '.speech')
  const windows = process.platform === 'win32'
  return {
    ffmpeg: process.env.FFMPEG_COMMAND || (windows ? join(directory, 'ffmpeg.exe') : 'ffmpeg'),
    whisper: process.env.WHISPER_COMMAND || (windows ? join(directory, 'whisper-cli.exe') : 'whisper-cli'),
    model: process.env.WHISPER_MODEL_PATH || join(directory, 'ggml-base.bin'),
    vad: process.env.WHISPER_VAD_MODEL_PATH || join(directory, 'ggml-silero-v6.2.0.bin'),
  }
}

function missingRuntime() {
  return new ApiError(503, 'SPEECH_UNAVAILABLE', 'Движок распознавания недоступен. Проверьте установку FFmpeg, Whisper и моделей.')
}

function processError(error: unknown, failure: ApiError) {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return missingRuntime()
  if (error && typeof error === 'object' && 'killed' in error && error.killed) {
    return new ApiError(504, 'SPEECH_TIMEOUT', 'Обработка заняла слишком много времени. Попробуйте загрузить более короткий фрагмент.')
  }
  return failure
}

async function normalizeAudio(command: string, input: string, output: string) {
  try {
    await run(command, [
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-f', 'wav', '-i', input, '-map', '0:a:0',
      '-t', String(MAX_AUDIO_SECONDS + 1), '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', output,
    ], { ...options, timeout: 120_000 })
  } catch (error) {
    throw processError(error, new ApiError(400, 'INVALID_WAV', 'Не удалось прочитать аудио. Проверьте, что WAV содержит звуковую дорожку.'))
  }
  const { size } = await stat(output)
  const bytesPerSecond = 16_000 * 2
  if (size > MAX_AUDIO_SECONDS * bytesPerSecond + 4096) {
    throw new ApiError(413, 'AUDIO_TOO_LONG', 'Длительность записи превышает 60 минут.')
  }
}

async function recognize(paths: ReturnType<typeof speechPaths>, input: string, output: string) {
  try {
    await run(paths.whisper, [
      '-m', paths.model, '-f', input, '-l', 'auto', '-ng', '-np', '-oj', '-of', output,
      '--vad', '-vm', paths.vad, '-ml', '120', '-sow',
    ], { ...options, timeout: 20 * 60_000 })
  } catch (error) {
    throw processError(error, new ApiError(502, 'TRANSCRIPTION_FAILED', 'Движок распознавания не смог обработать запись.'))
  }

  let result: unknown
  try {
    result = JSON.parse(await readFile(output + '.json', 'utf8'))
  } catch {
    throw new ApiError(502, 'INVALID_TRANSCRIPT', 'Движок не вернул читаемую расшифровку.')
  }
  const parsed = whisperResult.safeParse(result)
  if (!parsed.success) {
    throw new ApiError(502, 'INVALID_TRANSCRIPT', 'Движок вернул расшифровку в неожиданном формате.')
  }
  const segments: Segment[] = []
  for (const { offsets, text } of parsed.data.transcription) {
    const trimmed = text.trim()
    if (!trimmed || offsets.to <= offsets.from || /^(?:\[[^\]]*\]|\([^()]*\))$/u.test(trimmed)) continue
    segments.push({ id: `s${segments.length + 1}`, speaker: '', startMs: offsets.from, endMs: offsets.to, text: trimmed })
  }
  if (!segments.length) throw new ApiError(422, 'NO_SPEECH', 'Разборчивой речи в записи не обнаружено.')
  return segments
}

export async function transcribeWav(audio: Express.Multer.File): Promise<Segment[]> {
  if (transcribing) {
    throw new ApiError(429, 'SPEECH_BUSY', 'Уже обрабатывается другая запись. Повторите загрузку после её завершения.')
  }
  transcribing = true
  let directory: string | undefined
  try {
    const paths = speechPaths()
    await Promise.all([access(paths.model), access(paths.vad)]).catch(() => { throw missingRuntime() })
    directory = await mkdtemp(join(tmpdir(), 'hr-speech-'))
    const input = join(directory, 'original.wav')
    const normalized = join(directory, 'speech.wav')
    await writeFile(input, audio.buffer)
    await normalizeAudio(paths.ffmpeg, input, normalized)
    return await recognize(paths, normalized, join(directory, 'transcript'))
  } finally {
    transcribing = false
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {
      console.error('Не удалось очистить временную папку распознавания.')
    })
  }
}
