import { useState, type FormEvent } from 'react'
import { MAX_AUDIO_MB, vacancySchema, type Vacancy } from '../../../shared/contracts'

type Props = {
  busy: boolean
  onSubmit: (audio: File, vacancy: Vacancy | null) => void
}

export function InterviewForm({ busy, onSubmit }: Props) {
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
    setError('')
    onSubmit(audio, vacancy.data)
  }

  return (
    <form id="intake" className="intake" onSubmit={handleSubmit}>
      <div className="section-head">
        <div><h1>Разбор собеседования</h1><p className="muted">Загрузите запись, чтобы получить расшифровку и вопросы для следующей встречи.</p></div>
      </div>
      <fieldset disabled={busy}>
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
          <button type="submit">Расшифровать запись</button>
        </div>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
