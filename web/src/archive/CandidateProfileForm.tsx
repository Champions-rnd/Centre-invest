import { useRef, useState, type FormEvent } from 'react'
import { candidateProfileSchema, type CandidateProfile } from '../../../shared/archive'
import { MAX_CANDIDATE_TEXT_BYTES, parseCandidateText } from './candidateText'

export function readCandidateProfile(fields: FormData, prefix = '') {
  return candidateProfileSchema.safeParse({
    name: fields.get(prefix + 'name'),
    specialty: fields.get(prefix + 'specialty'),
    experience: fields.get(prefix + 'experience'),
    salary: fields.get(prefix + 'salary'),
    notes: fields.get(prefix + 'notes'),
  })
}

type ImportedFields = {
  specialty: string
  notes: string
  setSpecialty: (value: string) => void
  setNotes: (value: string) => void
}

export function CandidateProfileFields({ prefix = '', imported }: { prefix?: string; imported?: ImportedFields }) {
  return <>
    <label>ФИО <input name={prefix + 'name'} autoComplete="name" maxLength={180} required /></label>
    <label>Специальность <input name={prefix + 'specialty'} maxLength={120} required
      value={imported?.specialty} onChange={imported && (event => imported.setSpecialty(event.target.value))} /></label>
    {imported && <div className="profile-notes">
      <label htmlFor={prefix + 'candidate-description'}>Описание кандидата</label>
      <textarea id={prefix + 'candidate-description'} name={prefix + 'notes'} maxLength={1500} rows={4} value={imported.notes}
        onChange={event => imported.setNotes(event.target.value)} />
    </div>}
    <details className="profile-notes upload-extra">
      <summary>{imported ? 'Опыт и зарплата' : 'Опыт, зарплата и заметка'}</summary>
      <div className="vacancy-grid">
        <label>Опыт <input name={prefix + 'experience'} maxLength={80} /></label>
        <label>Зарплатные ожидания <input name={prefix + 'salary'} maxLength={80} /></label>
        {!imported && <label className="profile-notes">Заметка <textarea name={prefix + 'notes'} maxLength={1500} rows={2} /></label>}
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
  const [specialty, setSpecialty] = useState('')
  const [notes, setNotes] = useState('')
  const [importMessage, setImportMessage] = useState('')
  const [reading, setReading] = useState(false)

  async function importText(file: File) {
    setError('')
    setImportMessage('')
    if (!/\.txt$/iu.test(file.name) || file.size > MAX_CANDIDATE_TEXT_BYTES) {
      setError('Выберите файл TXT размером до 128 КБ.')
      return
    }
    setReading(true)
    try {
      const values = parseCandidateText(new Uint8Array(await file.arrayBuffer()))
      if (values.specialty !== undefined) setSpecialty(values.specialty)
      if (values.notes !== undefined) setNotes(values.notes)
      setImportMessage(`Из ${file.name} заполнено: ${[values.specialty && 'специальность', values.notes && 'описание'].filter(Boolean).join(', ')}.`)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось прочитать TXT.')
    } finally {
      setReading(false)
    }
  }

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
        <fieldset disabled={busy || reading}>
          <div className="candidate-text-import">
            <label htmlFor="candidate-text">Импорт из TXT</label>
            <p className="muted" id="candidate-text-help">
              В файле укажите «Специальность: …» и «Описание: …» или напишите специальность в первой строке, а описание ниже.
            </p>
            <input id="candidate-text" type="file" accept=".txt,text/plain" aria-describedby="candidate-text-help"
              onChange={event => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                if (file) void importText(file)
              }} />
            {importMessage && <p role="status">{importMessage}</p>}
          </div>
          <div className="vacancy-grid"><CandidateProfileFields imported={{ specialty, notes, setSpecialty, setNotes }} /></div>
          <button type="submit">Сохранить кандидата</button>
        </fieldset>
        {error && <p role="alert">{error}</p>}
      </form>
    </section>
  )
}
