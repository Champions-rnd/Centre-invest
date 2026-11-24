import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'
import { resolve } from 'node:path'
import express, { type ErrorRequestHandler } from 'express'
import multer from 'multer'
import { analysisRequestSchema, vacancySchema } from '../shared/contracts'
import { demo } from './demo'
import { ApiError } from './errors'
import { buildReport, processInterview } from './report'

if (existsSync('.env')) loadEnvFile('.env')

const app = express()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 1, fieldSize: 96 * 1024 },
})

app.get('/api/health', (_request, response) => response.json({ status: 'ok' }))
app.get('/api/demo', (_request, response) => response.json(demo))

app.post('/api/interviews', upload.single('audio'), async (request, response) => {
  const audio = request.file
  if (!audio || audio.buffer.toString('ascii', 0, 4) !== 'RIFF'
    || audio.buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new ApiError(400, 'INVALID_WAV', 'Добавьте файл WAV в формате RIFF/WAVE.')
  }

  let rawVacancy: unknown
  try {
    rawVacancy = JSON.parse(request.body?.vacancy)
  } catch {
    throw new ApiError(400, 'INVALID_VACANCY', 'Передайте вакансию в формате JSON.')
  }
  const vacancy = vacancySchema.safeParse(rawVacancy)
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

app.use('/api', (_request, _response, next) =>
  next(new ApiError(404, 'NOT_FOUND', 'Маршрут API не найден.')))

const handleError: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ApiError) {
    response.status(error.status).json({ error: { code: error.code, message: error.message } })
  } else if (error instanceof multer.MulterError) {
    const tooLarge = error.code === 'LIMIT_FILE_SIZE'
    response.status(tooLarge ? 413 : 400).json({
      error: { code: error.code, message: tooLarge ? 'Лимит WAV — 50 МБ.' : 'Проверьте поля загрузки.' },
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
app.listen(3001, '127.0.0.1', () => console.log('HR-аналитика API: http://127.0.0.1:3001'))
