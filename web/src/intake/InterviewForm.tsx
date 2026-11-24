import { useState, type FormEvent } from 'react'
import { candidateProfileSchema, type Candidate, type CandidateTarget } from '../../../shared/archive'
import { MAX_AUDIO_MB, vacancySchema, type Vacancy } from '../../../shared/contracts'

type Props = {
  busy: boolean
  candidate?: Candidate
  onSubmit: (audio: File, vacancy: Vacancy | null, target: CandidateTarget) => void
}

export function InterviewForm({ busy, candidate, onSubmit }: Props) {
  const [error, setError] = useState('')
  const [audio, setAudio] = useState<File>()
  const [dragging, setDragging] = useState(false)

  function selectAudio(file?: File) {
    setAudio(file)
    setError('')
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const description = String(fields.get('description') ?? '').trim()
    const criteria = String(fields.get('criteria') ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    const vacancy = vacancySchema.nullable().safeParse(description || criteria.length ? { description, criteria } : null)
    if (!audio || !/\.wav$/i.test(audio.name) || audio.size === 0 || audio.size > MAX_AUDIO_MB * 1024 * 1024) {
      setError(`Выберите WAV до ${MAX_AUDIO_MB} МБ.`)
      return
    }
    if (!vacancy.success) {
      setError('Тема может содержать до 300 символов. Укажите не больше 20 тем, по одной на строку.')
      return
    }
    if (candidate) {
      setError('')
      onSubmit(audio, vacancy.data, { candidateId: candidate.id })
      return
    }
    const profile = candidateProfileSchema.safeParse({
      name: fields.get('candidateName'),
      specialty: fields.get('specialty'),
      experience: fields.get('experience'),
      salary: fields.get('salary'),
      notes: fields.get('notes'),
    })
    if (!profile.success) {
      setError('Укажите имя и специальность кандидата.')
      return
    }
    setError('')
    onSubmit(audio, vacancy.data, { profile: profile.data })
  }

  return (
    <form id="intake" className="intake" onSubmit={handleSubmit}>
      <div className="section-head">
        <div>
          <h1 id="intake-title" tabIndex={-1}>{candidate ? 'Новое интервью' : 'Кандидат и интервью'}</h1>
          <p className="muted">{candidate ? `${candidate.name} · ${candidate.specialty}`
            : 'Интервью появится в досье после расшифровки записи.'}</p>
        </div>
      </div>
      <fieldset disabled={busy}>
        {!candidate && <div className="panel profile-fields">
          <h2>Данные кандидата</h2>
          <div className="vacancy-grid">
            <label>ФИО <input name="candidateName" maxLength={180} required /></label>
            <label>Специальность <input name="specialty" maxLength={120} required /></label>
            <label>Опыт <input name="experience" maxLength={80} placeholder="Например, 2 года" /></label>
            <label>Зарплатные ожидания <input name="salary" maxLength={80} placeholder="Например, 120 000 ₽" /></label>
            <label className="profile-notes">Заметка <textarea name="notes" maxLength={1500} rows={2} /></label>
          </div>
        </div>}
        <div className="intake-panels">
          <div className="panel">
            <div className="card-heading"><span className="tile" aria-hidden="true">♫</span><h3>Запись интервью</h3></div>
            <label className={dragging ? 'drop dragging' : 'drop'}
              onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={event => {
                event.preventDefault()
                setDragging(false)
                if (!busy && event.dataTransfer.files.length) selectAudio(event.dataTransfer.files[0])
              }}>
              <input type="file" name="audio" accept=".wav,audio/wav,audio/x-wav"
                onChange={event => {
                  const file = event.currentTarget.files?.[0]
                  if (file) selectAudio(file)
                  event.currentTarget.value = ''
                }} />
              <span className="upload-icon" aria-hidden="true">↑</span>
              <strong>{audio?.name ?? 'Выберите или перетащите файл'}</strong>
              <span className="muted">WAV до {MAX_AUDIO_MB} МБ и 60 минут</span>
            </label>
          </div>
          <details className="panel vacancy-fields">
            <summary>Добавить контекст вакансии <span className="muted">Необязательно</span></summary>
            <p className="muted">Укажите роль или важные темы, чтобы получить более конкретные вопросы.</p>
            <div className="vacancy-grid">
              <label>Описание вакансии
                <textarea name="description" placeholder="Роль и основные задачи" maxLength={12000} rows={3} />
              </label>
              <label>Что важно проверить
                <textarea name="criteria" placeholder={'По одной теме на строку\nНапример, работа с обращениями клиентов'} rows={3} />
              </label>
            </div>
          </details>
        </div>
        <div className="actions">
          <button type="submit">Расшифровать и сохранить</button>
        </div>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
