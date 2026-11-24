import { useRef, useState, type FormEvent } from 'react'
import { candidateTargetSchema, type Candidate, type CandidateTarget, type SavedInterview } from '../../../shared/archive'
import { MAX_AUDIO_MB, vacancySchema, type Vacancy } from '../../../shared/contracts'
import { submitInterview } from '../api'
import { CandidateProfileFields, readCandidateProfile } from '../archive/CandidateProfileForm'
import { FilePicker } from './FilePicker'
import { createUploadId } from './uploadId'
import { isSupportedWav, wavAccept } from './wav'
import './styles.css'

type Selection = { id: string; file: File }
type Job = Selection & {
  target: CandidateTarget
  vacancy: Vacancy | null
  state: 'waiting' | 'uploading' | 'processing' | 'saved' | 'failed'
  percent?: number
  error?: string
  candidateId?: string
}

type Props = {
  candidates: Candidate[]
  candidateId: string
  attachTo?: string
  onCandidate: (id: string) => void
  onSaved: (interview: SavedInterview) => Promise<void>
  onOpen: (candidateId: string, interviewId: string) => void
}

const labels: Record<Job['state'], string> = {
  waiting: 'В очереди', uploading: 'Загрузка', processing: 'Распознавание и сохранение',
  saved: 'Сохранено', failed: 'Ошибка',
}

function CandidateFields({ candidates, prefix, value, onChange }: {
  candidates: Candidate[]
  prefix: string
  value?: string
  onChange?: (value: string) => void
}) {
  const [localId, setLocalId] = useState('')
  const selected = value ?? localId
  return (
    <div className="vacancy-grid">
      <label className="profile-notes">Кандидат
        <select name={prefix + 'candidate'} value={selected} onChange={event => {
          const id = event.target.value
          if (onChange) onChange(id)
          else setLocalId(id)
        }}>
          <option value="">Новый кандидат</option>
          {candidates.map(candidate => (
            <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.specialty}</option>
          ))}
        </select>
      </label>
      {!selected && <CandidateProfileFields prefix={prefix} />}
    </div>
  )
}

function readTarget(fields: FormData, prefix: string): CandidateTarget | undefined {
  const candidateId = fields.get(prefix + 'candidate')
  const profile = candidateId ? undefined : readCandidateProfile(fields, prefix)
  const parsed = candidateTargetSchema.safeParse(candidateId ? { candidateId }
    : { newCandidateId: createUploadId(), profile: profile?.data })
  return parsed.success ? parsed.data : undefined
}

export function InterviewForm({ candidates, candidateId, attachTo, onCandidate, onSaved, onOpen }: Props) {
  const [files, setFiles] = useState<Selection[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [separate, setSeparate] = useState(false)
  const [active, setActive] = useState(false)
  const running = useRef(false)
  const [error, setError] = useState('')
  const savedCount = jobs.filter(job => job.state === 'saved').length
  const failures = jobs.filter(job => job.state === 'failed')
  const separateTargets = !attachTo && separate && files.length > 1
  const selectedCandidate = candidates.find(candidate => candidate.id === (attachTo || candidateId))

  function selectFiles(incoming: File[]) {
    if (running.current) return
    const valid = incoming.filter(isSupportedWav)
    const added = valid.map(file => ({ id: createUploadId(), file }))
    setFiles(current => [...current, ...added])
    const rejected = incoming.length - valid.length
    setError(rejected ? `Пропущено файлов: ${rejected}. Поддерживаются WAV до ${MAX_AUDIO_MB} МБ.` : '')
  }

  function updateJob(id: string, patch: Partial<Job>) {
    setJobs(current => current.map(job => job.id === id ? { ...job, ...patch } : job))
  }

  async function processJobs(queue: Job[]) {
    if (running.current) return
    running.current = true
    setActive(true)
    try {
      for (const job of queue) {
        updateJob(job.id, { state: 'uploading', percent: 0 })
        let saved: SavedInterview
        try {
          saved = await submitInterview(job.file, job.vacancy, job.target, job.id, percent => {
            updateJob(job.id, percent === null ? { state: 'processing' } : { percent })
          })
        } catch (failure) {
          updateJob(job.id, { state: 'failed', error: failure instanceof Error ? failure.message : 'Не удалось обработать файл.' })
          continue
        }
        updateJob(job.id, { state: 'saved', candidateId: saved.candidateId, error: undefined })
        await onSaved(saved)
      }
    } finally {
      running.current = false
      setActive(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (running.current || !files.length) return
    const fields = new FormData(event.currentTarget)
    const description = String(fields.get('description') ?? '').trim()
    const criteria = String(fields.get('criteria') ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    const vacancy = vacancySchema.nullable().safeParse(description || criteria.length ? { description, criteria } : null)
    if (!vacancy.success) {
      setError('Укажите до 20 тем по одному пункту на строку. Максимум 300 символов на тему.')
      return
    }
    const common = attachTo ? { candidateId: attachTo } : separateTargets ? undefined : readTarget(fields, 'batch-')
    const queue: Job[] = []
    for (const selection of files) {
      const target = separateTargets ? readTarget(fields, selection.id + '-') : common
      if (!target) {
        setError('Укажите имя и специальность для каждого нового кандидата.')
        return
      }
      queue.push({ ...selection, target, vacancy: vacancy.data, state: 'waiting' })
    }
    event.currentTarget.reset()
    setError('')
    setFiles([])
    setSeparate(false)
    setJobs(current => [...current, ...queue])
    void processJobs(queue)
  }

  function retry() {
    if (running.current) return
    setJobs(current => current.map(job => job.state === 'failed' ? { ...job, state: 'waiting', error: undefined } : job))
    void processJobs(failures)
  }

  return (
    <section className="panel home-upload" aria-labelledby="intake-title">
      <div className="section-head">
        <h2 id="intake-title" tabIndex={-1}>Загрузка интервью</h2>
        {selectedCandidate && <p><strong>{selectedCandidate.name}</strong> · {selectedCandidate.specialty}</p>}
        <p className="muted">Выберите один или несколько WAV. Расшифровки сохранятся в личных делах кандидатов.</p>
      </div>
      <form onSubmit={handleSubmit}>
        <fieldset disabled={active}>
          <FilePicker id="interview-wav" label="Интервью из WAV" accept={wavAccept} multiple disabled={active}
            help={`До ${MAX_AUDIO_MB} МБ на файл. Можно перетащить WAV сюда.`} onFiles={selectFiles} />
          {files.length > 0 && <>
            {!attachTo && files.length > 1 && <label className="upload-mode">
              <input type="checkbox" checked={separateTargets} onChange={event => setSeparate(event.target.checked)} />
              Выбрать кандидата отдельно для каждого файла
            </label>}
            <ul className="upload-selection">
              {files.map(selection => (
                <li key={selection.id}>
                  <div className="upload-line">
                    <strong>{selection.file.name}</strong>
                    <button type="button" className="secondary upload-remove" aria-label={`Убрать ${selection.file.name}`}
                      onClick={() => setFiles(current => current.filter(item => item.id !== selection.id))}>Убрать</button>
                  </div>
                  {separateTargets && <CandidateFields candidates={candidates} prefix={selection.id + '-'} />}
                </li>
              ))}
            </ul>
            {!attachTo && !separateTargets && <CandidateFields candidates={candidates} prefix="batch-" value={candidateId} onChange={onCandidate} />}
            <details className="upload-extra">
              <summary>Общий контекст вакансии <span className="muted">Необязательно</span></summary>
              <div className="vacancy-grid">
                <label>Описание вакансии <textarea name="description" maxLength={12000} rows={3} /></label>
                <label>Темы для проверки <textarea name="criteria" placeholder="По одной теме на строку" rows={3} /></label>
              </div>
            </details>
            <button type="submit">Расшифровать и сохранить ({files.length})</button>
          </>}
        </fieldset>
      </form>
      {error && <p role="alert">{error}</p>}
      {!!jobs.length && <section className="upload-queue" aria-labelledby="queue-title">
        <div className="upload-line">
          <h3 id="queue-title">Очередь интервью</h3>
          {!active && <button type="button" className="secondary upload-remove" onClick={() => setJobs([])}>Очистить очередь</button>}
        </div>
        <p className="muted" role="status">Сохранено {savedCount} из {jobs.length}{failures.length > 0 ? ` · Ошибок: ${failures.length}` : ''}</p>
        <ul>
          {jobs.map(job => (
            <li key={job.id} data-state={job.state}>
              <div className="upload-line">
                <strong>{job.file.name}</strong>
                <span>{labels[job.state]}{job.state === 'uploading' ? ` · ${job.percent ?? 0}%` : ''}</span>
              </div>
              {job.state === 'uploading' && <progress value={job.percent ?? 0} max={100} aria-label={`Загрузка ${job.file.name}`} />}
              {job.state === 'processing' && <progress aria-label={`Распознавание ${job.file.name}`} />}
              {job.state === 'failed' && <p className="error">{job.error}</p>}
              {job.state === 'saved' && job.candidateId && <button type="button" className="secondary upload-remove"
                onClick={() => onOpen(job.candidateId!, job.id)}>Открыть интервью</button>}
            </li>
          ))}
        </ul>
        {!active && failures.length > 0 && <button type="button" onClick={retry}>Повторить неудавшиеся ({failures.length})</button>}
      </section>}
    </section>
  )
}
