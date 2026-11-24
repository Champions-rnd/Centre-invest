import { useState } from 'react'
import { candidateStatuses, type Candidate } from '../../../shared/archive'
import { formatDate } from './format'

type Props = {
  candidates: Candidate[]
  busy: boolean
  onOpen: (id: string) => void
  onBatch: () => void
}

export function CandidateDirectory({ candidates, busy, onOpen, onBatch }: Props) {
  const [query, setQuery] = useState('')
  const search = query.trim().toLocaleLowerCase('ru')
  const matches = candidates.filter(candidate => [candidate.name, candidate.specialty, candidate.notes]
    .some(value => value.toLocaleLowerCase('ru').includes(search)))

  return (
    <section className="interview-dashboard" aria-labelledby="candidate-directory-title">
      <div className="list-heading">
        <div>
          <h2 id="candidate-directory-title">Личные дела</h2>
          <p className="muted">Показано {matches.length} из {candidates.length}</p>
        </div>
        <div className="directory-actions">
          <label className="filter-search directory-search">Поиск
            <input type="search" placeholder="ФИО или специальность" value={query} onChange={event => setQuery(event.target.value)} />
          </label>
          <button className="secondary" type="button" disabled={busy} onClick={onBatch}>Пакетная загрузка</button>
        </div>
      </div>
      {matches.length ? <ul className="candidate-grid">
        {matches.map(candidate => (
          <li key={candidate.id} className="panel candidate-card">
            <div className="candidate-card-top">
              <span className="specialty-label">{candidate.specialty}</span>
              <span className="candidate-status" data-status={candidate.status}>{candidateStatuses[candidate.status]}</span>
            </div>
            <h3 className="interview-card-title">{candidate.name}</h3>
            {(candidate.experience || candidate.salary) && <p className="muted candidate-meta">
              {[candidate.experience && `Опыт: ${candidate.experience}`, candidate.salary && `Ожидания: ${candidate.salary}`].filter(Boolean).join(' · ')}
            </p>}
            <div className="candidate-card-bottom">
              <div><strong>{candidate.interviewCount ? `${candidate.interviewCount} интервью` : 'Без интервью'}</strong>
                {candidate.latestAt && <small className="muted">{formatDate(candidate.latestAt)}</small>}</div>
              <div className="interview-card-actions">
                <button className="secondary" type="button" disabled={busy} aria-label={`Открыть личное дело: ${candidate.name}`}
                  onClick={() => onOpen(candidate.id)}>Личное дело</button>
              </div>
            </div>
          </li>
        ))}
      </ul> : <div className="panel archive-empty">
        <h3>Кандидаты не найдены</h3>
        <button className="secondary" type="button" onClick={() => setQuery('')}>Сбросить поиск</button>
      </div>}
    </section>
  )
}
