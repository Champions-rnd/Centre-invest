import { SelectField } from '../ui/SelectField'
import { useState } from 'react'
import { candidateStatuses, type ArchiveInterview, type Candidate, type CandidateStatus } from '../../../shared/archive'
import { formatCount, formatDate } from './format'
import { InterviewSort, sortInterviews, type InterviewOrder } from './InterviewSort'

type Props = {
  interviews: ArchiveInterview[]
  busy: boolean
  onOpen: (candidateId: string, interviewId?: string) => void
  onAdd: () => void
  onDelete: (id: string, fileName: string, candidate: Candidate) => void
}

export function Dashboard({ interviews, busy, onOpen, onAdd, onDelete }: Props) {
  const [query, setQuery] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [status, setStatus] = useState<CandidateStatus | ''>('')
  const [sort, setSort] = useState<InterviewOrder>('recent')
  const specialties = [...new Set(interviews.map(item => item.candidate.specialty))].sort((a, b) => a.localeCompare(b, 'ru'))
  const search = query.trim().toLocaleLowerCase('ru')
  const filtered = sortInterviews(interviews.filter(({ candidate, fileName }) =>
    (!specialty || candidate.specialty === specialty) && (!status || candidate.status === status)
    && [fileName, candidate.name, candidate.specialty, candidate.notes].some(value => value.toLocaleLowerCase('ru').includes(search))), sort)

  return (
    <section className="interview-dashboard" aria-labelledby="archive-title">
      <header className="directory-heading">
        <div>
          <h1 id="archive-title" tabIndex={-1}>Интервью</h1>
          <p>Записи и расшифровки собеседований.</p>
        </div>
        {interviews.length > 0 && <InterviewSort value={sort} onChange={setSort} />}
      </header>
      {interviews.length > 0 && <div className="archive-toolbar">
        <label className="filter-search">Поиск
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Кандидат, специальность или файл" />
        </label>
        <SelectField className="sort-field" label="Специальность" value={specialty} onChange={setSpecialty}
          options={[{ value: '', label: 'Все специальности' }, ...specialties.map(name => ({ value: name, label: name }))]} />
        <SelectField className="sort-field" label="Статус личного дела" value={status}
          onChange={value => setStatus(value as CandidateStatus | '')}
          options={[{ value: '', label: 'Все статусы' }, ...Object.entries(candidateStatuses).map(([value, label]) => ({ value, label }))]} />
      </div>}
      {filtered.length ? <ul className="candidate-grid">
        {filtered.map(({ candidate, id, fileName, segmentCount, createdAt }) => (
          <li key={id} className="panel candidate-card interview-card">
            <div className="interview-card-header">
              <div>
                <h3 className="interview-card-title">{fileName}</h3>
                <p className="muted candidate-meta">{candidate.name}</p>
              </div>
              <button className="secondary interview-delete" type="button" disabled={busy}
                aria-label={`Удалить интервью: ${fileName}`} title="Удалить интервью"
                onClick={() => onDelete(id, fileName, candidate)}>×</button>
            </div>
            <div className="interview-card-details">
              <span className="specialty-label">{candidate.specialty}</span>
              <span className="candidate-status" data-status={candidate.status}>{candidateStatuses[candidate.status]}</span>
            </div>
            <div className="candidate-card-bottom">
              <p className="interview-card-meta">
                <strong>{formatCount(segmentCount, ['фрагмент', 'фрагмента', 'фрагментов'])}</strong>
                <time className="muted" dateTime={createdAt}>{formatDate(createdAt)}</time>
              </p>
              <div className="interview-card-actions">
                <button type="button" disabled={busy} aria-label={`Открыть интервью: ${fileName}`}
                  onClick={() => onOpen(candidate.id, id)}>Открыть</button>
                <button className="secondary" type="button" disabled={busy} aria-label={`Открыть личное дело: ${candidate.name}`}
                  onClick={() => onOpen(candidate.id)}>Личное дело</button>
              </div>
            </div>
          </li>
        ))}
      </ul> : <div className="panel archive-empty">
        <h3>{interviews.length ? 'Ничего не найдено' : 'Интервью пока нет'}</h3>
        {interviews.length ? <button type="button" className="secondary" onClick={() => { setQuery(''); setSpecialty(''); setStatus('') }}>
          Сбросить фильтры
        </button> : <button type="button" disabled={busy} onClick={onAdd}>Создать или открыть личное дело</button>}
      </div>}
    </section>
  )
}
