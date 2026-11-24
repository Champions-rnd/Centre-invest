import { useState, type FormEvent } from 'react'
import { vacancySchema, type Vacancy } from '../../../shared/contracts'

type Props = {
  busy: boolean
  onSubmit: (audio: File, vacancy: Vacancy) => void
  onDemo: () => void
}

export function InterviewForm({ busy, onSubmit, onDemo }: Props) {
  const [error, setError] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const audio = fields.get('audio')
    const vacancy = vacancySchema.safeParse({
      description: fields.get('description'),
      criteria: String(fields.get('criteria')).split(/\r?\n/).map(line => line.trim()).filter(Boolean),
    })
    if (!(audio instanceof File) || audio.size === 0 || audio.size > 50 * 1024 * 1024) {
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
    <form className="panel form" onSubmit={handleSubmit}>
      <h2>Материалы интервью</h2>
      <fieldset disabled={busy}>
        <label>Запись интервью, WAV
          <input type="file" name="audio" accept=".wav,audio/wav,audio/x-wav" required />
        </label>
        <label>Описание вакансии
          <textarea name="description" placeholder="Младший геймдизайнер для интерактивных тренажёров" required maxLength={12000} rows={3} />
        </label>
        <label>Критерии вакансии, по одному на строку
          <textarea name="criteria" placeholder={'Проектирование сценариев\nПроверка сценариев с пользователями'} required rows={3} />
        </label>
        <div className="actions">
          <button type="submit">Разобрать интервью</button>
          <button type="button" className="secondary" onClick={() => { setError(''); onDemo() }}>Открыть демо</button>
        </div>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
