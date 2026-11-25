import { SelectField } from '../ui/SelectField'
import { useRef, useState, type FormEvent } from 'react'
import { candidateTargetSchema, type Candidate, type CandidateTarget, type SavedInterview } from '../../../shared/archive'
import { MAX_AUDIO_MB, MAX_AUDIO_MINUTES, type Vacancy } from '../../../shared/contracts'
import { interviewStageLabels, submitInterview, type InterviewProgress } from '../api'
import { CandidateProfileFields, readCandidateProfile } from '../archive/CandidateProfileForm'
import { FilePicker } from './FilePicker'
import { readVacancy, VacancyFields, vacancyError } from './VacancyFields'
import { createUploadId } from './uploadId'
import { isSupportedWav, wavAccept } from './wav'
import './styles.css'

type Selection = { id: string; file: File }
type Job = Selection & {
  target: CandidateTarget
  vacancy: Vacancy | null
  state: 'waiting' | 'uploading' | 'processing' | 'saved' | 'failed'
  progress?: InterviewProgress
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

const completedStages = { transcribing: 1, analyzing: 2, saving: 3 } as const

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
      <SelectField className="profile-notes" label="Кандидат" name={prefix + 'candidate'} value={selected}
        onChange={onChange ?? setLocalId}
        options={[{ value: '', label: 'Новый кандидат' },
          ...candidates.map(candidate => ({ value: candidate.id, label: `${candidate.name} · ${candidate.specialty}` }))]} />
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
        updateJob(job.id, { state: 'uploading', progress: { stage: 'uploading', percent: 0 } })
        let saved: SavedInterview
        try {
          saved = await submitInterview(job.file, job.vacancy, job.target, job.id, progress => {
            updateJob(job.id, { state: progress.stage === 'uploading' ? 'uploading' : 'processing', progress })
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
    const vacancy = readVacancy(fields)
    if (!vacancy.success) {
      setError(vacancyError)
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
    setJobs(current => current.map(job => job.state === 'failed' ? { ...job, state: 'waiting', progress: undefined, error: undefined } : job))
    void processJobs(failures)
  }

  return (
    <section className="home-upload" aria-labelledby="intake-title">
      <header className="directory-heading"><div>
        <h1 id="intake-title" tabIndex={-1}>Загрузка интервью</h1>
        {selectedCandidate && <p><strong>{selectedCandidate.name}</strong> · {selectedCandidate.specialty}</p>}
      </div></header>
      <form className="panel" onSubmit={handleSubmit}>
        <fieldset disabled={active}>
          <FilePicker id="interview-wav" label="Интервью из WAV" accept={wavAccept} multiple disabled={active}
            help={`WAV · до ${MAX_AUDIO_MB} МБ · до ${MAX_AUDIO_MINUTES} минут на файл`} onFiles={selectFiles} />
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
              <VacancyFields />
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
          {jobs.map(job => {
            const progress = job.progress
            const completed = job.state === 'saved' ? 4 : !progress ? 0
              : progress.stage === 'uploading' ? progress.percent / 100 : completedStages[progress.stage]
            const status = job.state === 'processing' && progress && progress.stage !== 'uploading'
              ? interviewStageLabels[progress.stage] : labels[job.state]
            return (
              <li key={job.id} data-state={job.state}>
                <div className="upload-line">
                  <strong>{job.file.name}</strong>
                  <span>{status}{job.state === 'uploading' && progress?.stage === 'uploading' ? ` · ${progress.percent}%` : ''}</span>
                </div>
                {job.state !== 'waiting' && <div className="upload-progress" role="progressbar"
                  aria-label={`Обработка ${job.file.name}`} aria-valuemin={0} aria-valuemax={4} aria-valuenow={completed}
                  aria-valuetext={`${status}. Завершено этапов: ${Math.floor(completed)} из 4`}>
                  <span style={{ width: `${completed * 25}%` }} />
                </div>}
                {job.state === 'failed' && <p className="error">{job.error}</p>}
                {job.state === 'saved' && job.candidateId && <button type="button" className="secondary upload-remove"
                  onClick={() => onOpen(job.candidateId!, job.id)}>Открыть интервью</button>}
              </li>
            )
          })}
        </ul>
        {!active && failures.length > 0 && <button type="button" onClick={retry}>Повторить неудавшиеся ({failures.length})</button>}
      </section>}
    </section>
  )
}
