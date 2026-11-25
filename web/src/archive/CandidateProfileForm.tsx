import { useEffect, useRef, useState, type FormEvent } from 'react'
import { candidateProfileSchema, type CandidateMaterials, type CandidateProfile } from '../../../shared/archive'
import { MAX_AUDIO_MB, MAX_AUDIO_MINUTES, MAX_VACANCY_TEXT_BYTES } from '../../../shared/contracts'
import { createUploadId } from '../intake/uploadId'
import { FilePicker } from '../intake/FilePicker'
import { readVacancy, VacancyFields, vacancyError } from '../intake/VacancyFields'
import { isSupportedWav, wavAccept } from '../intake/wav'
import { importVacancy } from '../api'
import { candidateText } from './candidateText'

export function readCandidateProfile(fields: FormData, prefix = '') {
  return candidateProfileSchema.safeParse({
    name: fields.get(prefix + 'name'),
    specialty: fields.get(prefix + 'specialty'),
  })
}

export function CandidateProfileFields({ prefix = '', specialty, onSpecialty }: {
  prefix?: string
  specialty?: string
  onSpecialty?: (value: string) => void
}) {
  return <>
    <label>ФИО <input name={prefix + 'name'} autoComplete="name" maxLength={180} required /></label>
    <label>Специальность <input name={prefix + 'specialty'} maxLength={120} required value={specialty}
      onChange={onSpecialty && (event => onSpecialty(event.target.value))} /></label>
  </>
}

export type CandidateRecording = { file: File; uploadId: string }

export function CandidateProfileForm({ busy, onSave }: {
  busy: boolean
  onSave: (id: string, profile: CandidateProfile, materials: CandidateMaterials, recording?: CandidateRecording) => void
}) {
  const id = useRef<string | undefined>(undefined)
  const [error, setError] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [fields, setFields] = useState({ criteria: '', description: '' })
  const [vacancyFilename, setVacancyFilename] = useState('')
  const [reading, setReading] = useState(false)
  const importRequest = useRef<AbortController>(null)
  const [recording, setRecording] = useState<CandidateRecording>()
  const wavError = recording && !isSupportedWav(recording.file) ? `Выберите непустой WAV до ${MAX_AUDIO_MB} МБ.` : ''

  useEffect(() => () => importRequest.current?.abort(), [])

  async function analyzeVacancy(file: File) {
    setError('')
    if (!/\.txt$/iu.test(file.name) || file.size > MAX_VACANCY_TEXT_BYTES) {
      setError('Выберите файл вакансии TXT размером до 128 КБ.')
      return
    }
    const controller = new AbortController()
    importRequest.current = controller
    setReading(true)
    try {
      const result = await importVacancy(candidateText(new Uint8Array(await file.arrayBuffer())), controller.signal)
      if (controller.signal.aborted) return
      if (!result.specialty && !result.description && !result.criteria.length) {
        setError('В файле не найдены данные вакансии. Заполните поля вручную.')
        return
      }
      setSpecialty(result.specialty)
      setFields({ criteria: result.criteria.join('\n'), description: result.description })
      setVacancyFilename(file.name)
      if (!result.specialty || !result.description || !result.criteria.length) {
        setError('Часть полей не найдена в TXT. Проверьте результат и заполните пустые поля.')
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Не удалось разобрать вакансию.')
    } finally {
      if (!controller.signal.aborted) setReading(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || reading || wavError) return
    const fields = new FormData(event.currentTarget)
    const parsed = readCandidateProfile(fields)
    if (!parsed.success) {
      setError('Укажите ФИО и специальность кандидата.')
      return
    }
    const vacancy = readVacancy(fields)
    if (!vacancy.success) {
      setError(vacancyError)
      return
    }
    id.current ??= createUploadId()
    setError('')
    onSave(id.current, parsed.data, { vacancy: vacancy.data }, recording)
  }

  return (
    <section className="candidate-create" aria-labelledby="candidate-create-title">
      <header className="directory-heading"><h1 id="candidate-create-title" tabIndex={-1}>Новый кандидат</h1></header>
      <form className="panel" onSubmit={submit}>
        <fieldset disabled={busy || reading}>
          <div className="vacancy-grid"><CandidateProfileFields specialty={specialty} onSpecialty={setSpecialty} /></div>
          <div className="candidate-attachments">
            <FilePicker id="candidate-text" label="Добавить вакансию" accept=".txt,text/plain" disabled={busy || reading}
              help="TXT · до 128 КБ" onFiles={([file]) => void analyzeVacancy(file)}>
              {reading ? <p role="status">ChatCI разбирает вакансию…</p>
                : vacancyFilename && <p className="selected-file-name" role="status">{vacancyFilename}</p>}
            </FilePicker>
            <FilePicker id="candidate-wav" label="Добавьте запись интервью" accept={wavAccept} disabled={busy || reading}
              help={`WAV · до ${MAX_AUDIO_MB} МБ · до ${MAX_AUDIO_MINUTES} минут`} onFiles={([file]) => setRecording({ file, uploadId: createUploadId() })}>
              {wavError && <p className="error" role="alert">{wavError}</p>}
              {recording && <div className="picker-selection">
                <p className="selected-file-name" role="status">{recording.file.name}</p>
                <button className="secondary upload-remove" type="button" onClick={() => setRecording(undefined)}>Убрать</button>
              </div>}
            </FilePicker>
          </div>
          <VacancyFields values={fields} onChange={(field, value) => setFields(previous => ({ ...previous, [field]: value }))} />
          <button type="submit" disabled={Boolean(wavError)}>
            {recording ? 'Сохранить кандидата и расшифровать WAV' : 'Сохранить кандидата'}
          </button>
        </fieldset>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </section>
  )
}
