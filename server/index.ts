import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'
import { resolve } from 'node:path'
import express, { type ErrorRequestHandler } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { candidateCreateSchema, candidateStatusSchema, candidateTargetSchema, transcriptUpdateSchema } from '../shared/archive'
import { analysisRequestSchema, coachingRequestSchema, MAX_AUDIO_MB, vacancySchema } from '../shared/contracts'
import { coachInterview } from './analysis/coach'
import { buildCandidateOverview } from './analysis/candidate-overview'
import { reviewRoles } from './analysis/review-roles'
import { openArchive } from './archive'
import { ApiError } from './errors'
import { exportArchive } from './export'
import { buildReport, processInterview } from './report'

if (existsSync('.env')) loadEnvFile('.env')

const app = express()
const archive = openArchive()
const json = express.json({ limit: '5mb' })
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_MB * 1024 * 1024, files: 1, fields: 3, fieldSize: 96 * 1024 },
})

function parseId(value: unknown) {
  const id = z.uuid().safeParse(value)
  if (!id.success) throw new ApiError(400, 'INVALID_ID', 'Некорректный идентификатор.')
  return id.data
}

app.get('/api/health', (_request, response) => response.json({ status: 'ok' }))

app.get('/api/candidates', (_request, response) => response.json(archive.listCandidates()))
app.post('/api/candidates', json, (request, response) => {
  const input = candidateCreateSchema.safeParse(request.body)
  if (!input.success) throw new ApiError(400, 'INVALID_CANDIDATE', 'Проверьте имя и специальность кандидата.')
  response.status(201).json(archive.createCandidate(input.data.id, input.data.profile))
})
app.get('/api/interviews', (_request, response) => response.json(archive.listInterviews()))
app.get('/api/candidates/:id', (request, response) => response.json(archive.candidate(parseId(request.params.id))))
app.post('/api/candidates/:id/overview', async (request, response) => {
  const { id } = archive.candidate(parseId(request.params.id))
  const controller = new AbortController()
  response.once('close', () => { if (!response.writableEnded) controller.abort() })
  const overview = await buildCandidateOverview([...archive.exportInterviews(id)], controller.signal)
  if (!controller.signal.aborted) response.json(overview)
})
app.patch('/api/candidates/:id/status', json, (request, response) => {
  const status = candidateStatusSchema.safeParse(request.body?.status)
  if (!status.success) throw new ApiError(400, 'INVALID_STATUS', 'Выберите статус кандидата.')
  response.json(archive.updateStatus(parseId(request.params.id), status.data))
})

app.get('/api/export.xlsx', async (request, response) => {
  const candidateId = request.query.candidate === undefined ? undefined : parseId(request.query.candidate)
  const workbook = await exportArchive(archive, candidateId)
  response.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .attachment(candidateId ? 'candidate-interviews.xlsx' : 'hr-interviews.xlsx').send(workbook)
})

app.get('/api/interviews/:id', (request, response) => response.json(archive.interview(parseId(request.params.id))))
app.get('/api/interviews/:id/audio', (request, response) => {
  const id = parseId(request.params.id)
  const size = archive.recordingSize(id)
  const range = request.range(size)
  response.type('audio/wav').set('Accept-Ranges', 'bytes')
  if (range === -1) {
    response.set('Content-Range', `bytes */${size}`).status(416).end()
    return
  }
  if (Array.isArray(range) && range.type === 'bytes' && range.length === 1) {
    const { start, end } = range[0]
    response.set('Content-Range', `bytes ${start}-${end}/${size}`)
      .status(206).send(archive.recordingBytes(id, start, end - start + 1))
    return
  }
  response.send(archive.recordingBytes(id, 0, size))
})

app.post('/api/interviews/:id/review-roles', async (request, response) => {
  const stored = archive.interview(parseId(request.params.id))
  const controller = new AbortController()
  response.once('close', () => { if (!response.writableEnded) controller.abort() })
  const reviewed = await reviewRoles(stored.result.transcript, controller.signal)
  if (!controller.signal.aborted) response.json(reviewed)
})

app.patch('/api/interviews/:id/transcript', json, async (request, response) => {
  const input = transcriptUpdateSchema.safeParse(request.body)
  if (!input.success) throw new ApiError(400, 'INVALID_TRANSCRIPT', 'Проверьте исправленную расшифровку.')
  const stored = archive.interview(parseId(request.params.id))
  if (stored.updatedAt !== input.data.updatedAt) {
    throw new ApiError(409, 'EDIT_CONFLICT', 'Расшифровка уже изменилась. Откройте интервью заново.')
  }
  const transcript = stored.result.transcript
  if (transcript.length !== input.data.transcript.length || input.data.transcript.some((segment, index) => {
    const original = transcript[index]
    return segment.id !== original.id || segment.startMs !== original.startMs || segment.endMs !== original.endMs
  })) throw new ApiError(400, 'INVALID_TIMECODES', 'При редактировании сохраните исходные таймкоды и порядок реплик.')

  const { vacancy } = stored.result
  const reviewed = input.data.transcript.map((segment, index) => ({
    ...segment,
    speakerId: transcript[index].speakerId,
    roleReviewed: transcript[index].roleReviewed || segment.roleReviewed || segment.speaker !== transcript[index].speaker,
  }))
  const result = vacancy ? await buildReport({ vacancy, transcript: reviewed })
    : { ...stored.result, transcript: reviewed }
  response.json(archive.saveTranscript(stored.id, stored.updatedAt, result))
})

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

  if (request.body?.candidate === undefined) {
    response.json(await processInterview(audio, vacancy.data))
    return
  }

  let rawCandidate: unknown
  try {
    rawCandidate = JSON.parse(request.body.candidate)
  } catch {
    throw new ApiError(400, 'INVALID_CANDIDATE', 'Проверьте данные кандидата.')
  }
  const target = candidateTargetSchema.safeParse(rawCandidate)
  if (!target.success) throw new ApiError(400, 'INVALID_CANDIDATE', 'Укажите имя и специальность кандидата.')
  const uploadId = request.body.uploadId === undefined ? undefined : parseId(request.body.uploadId)
  const saved = uploadId ? archive.findInterview(uploadId) : undefined
  if (saved) {
    response.json(saved)
    return
  }
  if ('candidateId' in target.data) archive.candidate(target.data.candidateId)
  const result = await processInterview(audio, vacancy.data)
  response.status(201).json(archive.saveInterview(target.data, audio, result, uploadId))
})

app.post('/api/analyze', json, async (request, response) => {
  const input = analysisRequestSchema.safeParse(request.body)
  if (!input.success) {
    throw new ApiError(400, 'INVALID_INPUT', 'Проверьте вакансию и исправленную расшифровку.')
  }
  response.json(await buildReport(input.data))
})

app.post('/api/coach', json, async (request, response) => {
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
