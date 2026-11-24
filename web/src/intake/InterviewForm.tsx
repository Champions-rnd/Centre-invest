import { useState, type FormEvent } from 'react'
import { vacancySchema, type Vacancy } from '../../../shared/contracts'

type Props = {
  busy: boolean
  onSubmit: (audio: File, vacancy: Vacancy) => void
  onDemo: () => void
}

export function InterviewForm({ busy, onSubmit, onDemo }: Props) {
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
    const vacancy = vacancySchema.safeParse({
      description: fields.get('description'),
      criteria: String(fields.get('criteria')).split(/\r?\n/).map(line => line.trim()).filter(Boolean),
    })
    if (!audio || !/\.wav$/i.test(audio.name) || audio.size === 0 || audio.size > 50 * 1024 * 1024) {
      setError('Выберите WAV до 50 МБ.')
      return
    }
    if (!vacancy.success) {
      setError('Добавьте описание вакансии и от 1 до 20 критериев, по одному на строку.')
      return
    }
    setError('')
    onSubmit(audio, vacancy.data)
  }

  return (
    <form id="intake" className="intake" onSubmit={handleSubmit}>
      <div className="section-head">
        <div><h2>Новый разбор</h2><p className="muted">Выберите запись интервью и добавьте описание вакансии.</p></div>
        <button type="button" className="secondary" disabled={busy} onClick={() => { setError(''); onDemo() }}>Открыть демо</button>
      </div>
      <fieldset disabled={busy}>
        <div className="input-grid">
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
              <span className="muted">WAV до 50 МБ</span>
            </label>
          </div>
          <div className="panel vacancy-fields">
            <div className="card-heading"><span className="tile" aria-hidden="true">≡</span><h3><label htmlFor="description">Описание вакансии</label></h3></div>
            <textarea id="description" name="description" placeholder="Младший геймдизайнер для интерактивных тренажёров" required maxLength={12000} rows={3} />
            <label>Критерии вакансии, по одному на строку
              <textarea name="criteria" placeholder={'Проектирование сценариев\nПроверка сценариев с пользователями'} required rows={3} />
            </label>
          </div>
        </div>
        <div className="actions">
          <button type="submit">Разобрать интервью</button>
        </div>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
