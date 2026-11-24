import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'
import { resolve } from 'node:path'
import express, { type ErrorRequestHandler } from 'express'
import multer from 'multer'
import { analysisRequestSchema, coachingRequestSchema, MAX_AUDIO_MB, vacancySchema } from '../shared/contracts'
import { coachInterview } from './analysis/coach'
import { ApiError } from './errors'
import { buildReport, processInterview } from './report'

if (existsSync('.env')) loadEnvFile('.env')

const app = express()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_MB * 1024 * 1024, files: 1, fields: 1, fieldSize: 96 * 1024 },
})

app.get('/api/health', (_request, response) => response.json({ status: 'ok' }))

app.post('/api/interviews', upload.single('audio'), async (request, response) => {
  const audio = request.file
  if (!audio || !['RIFF', 'RIFX', 'RF64', 'BW64'].includes(audio.buffer.toString('ascii', 0, 4))
    || audio.buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new ApiError(400, 'INVALID_WAV', 'Добавьте корректный файл WAV.')
  }

  let rawVacancy: unknown = null
  try {
    if (request.body?.vacancy !== undefined) rawVacancy = JSON.parse(request.body.vacancy)
  } catch {
    throw new ApiError(400, 'INVALID_VACANCY', 'Передайте вакансию в формате JSON.')
  }
  const vacancy = vacancySchema.nullable().safeParse(rawVacancy)
  if (!vacancy.success) {
    throw new ApiError(400, 'INVALID_VACANCY', 'Проверьте описание вакансии и критерии.')
  }

  response.json(await processInterview(audio, vacancy.data))
})

app.post('/api/analyze', express.json({ limit: '5mb' }), async (request, response) => {
  const input = analysisRequestSchema.safeParse(request.body)
  if (!input.success) {
    throw new ApiError(400, 'INVALID_INPUT', 'Проверьте вакансию и исправленную расшифровку.')
  }
  response.json(await buildReport(input.data))
})

app.post('/api/coach', express.json({ limit: '5mb' }), async (request, response) => {
  const input = coachingRequestSchema.safeParse(request.body)
  if (!input.success) throw new ApiError(400, 'INVALID_INPUT', 'Проверьте расшифровку и контекст вакансии.')
  const controller = new AbortController()
  response.once('close', () => { if (!response.writableEnded) controller.abort() })
  const result = await coachInterview(input.data, controller.signal)
  if (!controller.signal.aborted) response.json(result)
})

app.use('/api', (_request, _response, next) =>
  next(new ApiError(404, 'NOT_FOUND', 'Маршрут API не найден.')))

const handleError: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ApiError) {
    response.status(error.status).json({ error: { code: error.code, message: error.message } })
  } else if (error instanceof multer.MulterError) {
    const tooLarge = error.code === 'LIMIT_FILE_SIZE'
    response.status(tooLarge ? 413 : 400).json({
      error: { code: error.code, message: tooLarge ? `Лимит WAV — ${MAX_AUDIO_MB} МБ.` : 'Проверьте поля загрузки.' },
    })
  } else if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') {
    response.status(error.status).json({ error: { code: 'INVALID_JSON', message: 'Проверьте формат и размер JSON.' } })
  } else {
    console.error('Ошибка API', error instanceof Error ? error.name : 'UnknownError')
    response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Ошибка обработки запроса.' } })
  }
}

app.use(handleError)
app.use(express.static(resolve('dist')))
const port = Number(process.env.HR_API_PORT || 3001)
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('Некорректный порт HR_API_PORT.')
app.listen(port, '127.0.0.1', error => {
  if (error) {
    console.error(`Не удалось запустить сервер на порту ${port}: ${error.message}`)
    process.exitCode = 1
    return
  }
  console.log(`HR-аналитика: http://127.0.0.1:${port}`)
})
