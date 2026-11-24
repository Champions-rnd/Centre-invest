import { useState } from 'react'
import { candidateStatuses, type ArchiveInterview, type CandidateStatus } from '../../../shared/archive'
import { formatCount, formatDate } from './format'
import { InterviewSort, sortInterviews, type InterviewOrder } from './InterviewSort'

type Props = {
  interviews: ArchiveInterview[]
  busy: boolean
  onOpen: (candidateId: string, interviewId?: string) => void
  onAdd: () => void
}

export function Dashboard({ interviews, busy, onOpen, onAdd }: Props) {
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
      <div className="list-heading">
        <div>
          <h1 id="archive-title" tabIndex={-1}>Интервью</h1>
          <p className="muted">Показано {filtered.length} из {interviews.length}</p>
        </div>
        <InterviewSort value={sort} onChange={setSort} />
      </div>
      {interviews.length > 0 && <div className="archive-toolbar">
        <label className="filter-search">Поиск
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Кандидат, специальность или файл" />
        </label>
        <label className="sort-field">Специальность
          <select value={specialty} onChange={event => setSpecialty(event.target.value)}>
            <option value="">Все специальности</option>
            {specialties.map(name => <option key={name}>{name}</option>)}
          </select>
        </label>
        <label className="sort-field">Статус досье
          <select value={status} onChange={event => setStatus(event.target.value as CandidateStatus | '')}>
            <option value="">Все статусы</option>
            {Object.entries(candidateStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
      </div>}
      {filtered.length ? <ul className="candidate-grid">
        {filtered.map(({ candidate, id, fileName, segmentCount, createdAt }) => (
          <li key={id} className="panel candidate-card">
            <div className="candidate-card-top">
              <span className="specialty-label">{candidate.specialty}</span>
              <span className="candidate-status" data-status={candidate.status}>{candidateStatuses[candidate.status]}</span>
            </div>
            <div>
              <h3 className="interview-card-title">{fileName}</h3>
              <p className="muted candidate-meta">{candidate.name}</p>
            </div>
            <div className="candidate-card-bottom">
              <div>
                <strong>{formatCount(segmentCount, ['фрагмент', 'фрагмента', 'фрагментов'])}</strong>
                <small className="muted">{formatDate(createdAt)}</small>
              </div>
              <div className="interview-card-actions">
                <button className="secondary" type="button" disabled={busy} aria-label={`Открыть досье: ${candidate.name}`}
                  onClick={() => onOpen(candidate.id)}>Досье</button>
                <button type="button" disabled={busy} aria-label={`Открыть интервью: ${fileName}`}
                  onClick={() => onOpen(candidate.id, id)}>Открыть</button>
              </div>
            </div>
          </li>
        ))}
      </ul> : <div className="panel archive-empty">
        <h3>{interviews.length ? 'Ничего не найдено' : 'Интервью пока нет'}</h3>
        {interviews.length ? <button type="button" className="secondary" onClick={() => { setQuery(''); setSpecialty(''); setStatus('') }}>
          Сбросить фильтры
        </button> : <button type="button" disabled={busy} onClick={onAdd}>Добавить первое интервью</button>}
      </div>}
    </section>
  )
}
