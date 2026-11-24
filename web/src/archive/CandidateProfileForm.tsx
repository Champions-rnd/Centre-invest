import { useRef, useState, type FormEvent } from 'react'
import { candidateProfileSchema, type CandidateProfile } from '../../../shared/archive'

export function readCandidateProfile(fields: FormData, prefix = '') {
  return candidateProfileSchema.safeParse({
    name: fields.get(prefix + 'name'),
    specialty: fields.get(prefix + 'specialty'),
    experience: fields.get(prefix + 'experience'),
    salary: fields.get(prefix + 'salary'),
    notes: fields.get(prefix + 'notes'),
  })
}

export function CandidateProfileFields({ prefix = '' }: { prefix?: string }) {
  return <>
    <label>ФИО <input name={prefix + 'name'} autoComplete="name" maxLength={180} required /></label>
    <label>Специальность <input name={prefix + 'specialty'} maxLength={120} required /></label>
    <details className="profile-notes upload-extra">
      <summary>Опыт, зарплата и заметка</summary>
      <div className="vacancy-grid">
        <label>Опыт <input name={prefix + 'experience'} maxLength={80} /></label>
        <label>Зарплатные ожидания <input name={prefix + 'salary'} maxLength={80} /></label>
        <label className="profile-notes">Заметка <textarea name={prefix + 'notes'} maxLength={1500} rows={2} /></label>
      </div>
    </details>
  </>
}

export function CandidateProfileForm({ busy, onSave }: {
  busy: boolean
  onSave: (id: string, profile: CandidateProfile) => void
}) {
  const id = useRef<string | undefined>(undefined)
  const [error, setError] = useState('')
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = readCandidateProfile(new FormData(event.currentTarget))
    if (!parsed.success) {
      setError('Укажите ФИО и специальность кандидата.')
      return
    }
    id.current ??= crypto.randomUUID()
    setError('')
    onSave(id.current, parsed.data)
  }

  return (
    <section className="panel candidate-create" aria-labelledby="candidate-create-title">
      <h1 id="candidate-create-title" tabIndex={-1}>Новый кандидат</h1>
      <p className="muted">Запись интервью можно прикрепить после сохранения карточки.</p>
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <div className="vacancy-grid"><CandidateProfileFields /></div>
          <button type="submit">Сохранить кандидата</button>
        </fieldset>
        {error && <p role="alert">{error}</p>}
      </form>
    </section>
  )
}
