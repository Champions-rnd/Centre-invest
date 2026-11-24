import { useState } from 'react'
import { candidateStatuses, type Candidate, type CandidateStatus } from '../../../shared/archive'
import { formatDate } from './format'

type Props = {
  candidates: Candidate[]
  busy: boolean
  onOpen: (id: string) => void
  onAdd: () => void
}

const statusEntries = Object.entries(candidateStatuses) as [CandidateStatus, string][]
const collator = new Intl.Collator('ru')

export function Dashboard({ candidates, busy, onOpen, onAdd }: Props) {
  const [query, setQuery] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [status, setStatus] = useState<CandidateStatus | ''>('')
  const [sort, setSort] = useState('recent')
  const specialties = new Map<string, { candidates: number; interviews: number }>()
  for (const candidate of candidates) {
    const totals = specialties.get(candidate.specialty) ?? { candidates: 0, interviews: 0 }
    totals.candidates++
    totals.interviews += candidate.interviewCount
    specialties.set(candidate.specialty, totals)
  }
  const recentSpecialties = [...specialties.entries()].slice(0, 4)

  const search = query.trim().toLocaleLowerCase('ru')
  const filtered = candidates.filter(candidate =>
    (!specialty || candidate.specialty === specialty) && (!status || candidate.status === status)
    && [candidate.name, candidate.specialty, candidate.notes].some(value => value.toLocaleLowerCase('ru').includes(search)))
  if (sort === 'interviews') filtered.sort((a, b) => b.interviewCount - a.interviewCount)
  if (sort === 'name') filtered.sort((a, b) => collator.compare(a.name, b.name))

  const interviewCount = candidates.reduce((count, candidate) => count + candidate.interviewCount, 0)
  const reviewCount = candidates.filter(candidate => candidate.status === 'review').length

  return (
    <>
      <section className="archive-intro" aria-labelledby="archive-title">
        <div>
          <h1 id="archive-title" tabIndex={-1}>Кандидаты и интервью</h1>
          <p className="muted">Открывайте досье, сверяйте реплики с записью и выгружайте архив в Excel.</p>
        </div>
        <dl className="archive-metrics">
          <div><dt>Кандидаты</dt><dd>{candidates.length}</dd></div>
          <div><dt>Интервью</dt><dd>{interviewCount}</dd></div>
          <div><dt>На сверке</dt><dd>{reviewCount}</dd></div>
        </dl>
      </section>
      {recentSpecialties.length > 0 && <section className="specialty-overview" aria-labelledby="specialty-title">
        <h2 id="specialty-title">По специальностям</h2>
        <div className="specialty-grid">
          {recentSpecialties.map(([name, count]) => (
            <button type="button" className="secondary" key={name} aria-pressed={specialty === name}
              onClick={() => setSpecialty(specialty === name ? '' : name)}>
              <strong>{name}</strong>
              <span className="muted">Кандидаты · {count.candidates} <span aria-hidden="true">/</span> Интервью · {count.interviews}</span>
            </button>
          ))}
        </div>
      </section>}
      <div className="archive-layout">
        <section aria-labelledby="candidate-list-title" className="candidate-list">
          <div className="list-heading">
            <div>
              <h2 id="candidate-list-title">Досье кандидатов</h2>
              <p className="muted">Показано {filtered.length} из {candidates.length}</p>
            </div>
            <label className="sort-field">Сортировка
              <select value={sort} onChange={event => setSort(event.target.value)}>
                <option value="recent">Последние интервью</option>
                <option value="interviews">Количество интервью</option>
                <option value="name">Имя кандидата</option>
              </select>
            </label>
          </div>
          {filtered.length ? <ul className="candidate-grid">
            {filtered.map(candidate => {
              const initials = candidate.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('ru')
              return (
                <li key={candidate.id} className="panel candidate-card">
                  <div className="candidate-card-top">
                    <span className="specialty-label">{candidate.specialty}</span>
                    <span className="candidate-status" data-status={candidate.status}>{candidateStatuses[candidate.status]}</span>
                  </div>
                  <div className="candidate-identity">
                    <span className="tile" aria-hidden="true">{initials}</span>
                    <h3>{candidate.name}</h3>
                  </div>
                  {(candidate.experience || candidate.salary) && (
                    <p className="muted candidate-meta">
                      {[candidate.experience && `Опыт: ${candidate.experience}`, candidate.salary && `Ожидания: ${candidate.salary}`].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {candidate.notes && <p className="candidate-note">{candidate.notes}</p>}
                  <div className="candidate-card-bottom">
                    <div>
                      <strong>{candidate.interviewCount} интервью</strong>
                      {candidate.latestAt && <small className="muted">{formatDate(candidate.latestAt)}</small>}
                    </div>
                    <button type="button" className="secondary" disabled={busy} aria-label={`Открыть досье: ${candidate.name}`}
                      onClick={() => onOpen(candidate.id)}>Открыть</button>
                  </div>
                </li>
              )
            })}
          </ul> : <div className="panel archive-empty">
            <h3>{candidates.length ? 'Ничего не найдено' : 'Архив пока пуст'}</h3>
            <p className="muted">{candidates.length
              ? 'Измените запрос или сбросьте фильтры.'
              : 'Добавьте кандидата и WAV. После расшифровки запись появится в архиве.'}</p>
            {candidates.length ? <button type="button" className="secondary" onClick={() => { setQuery(''); setSpecialty(''); setStatus('') }}>
              Сбросить фильтры
            </button> : <button type="button" disabled={busy} onClick={onAdd}>Добавить интервью</button>}
          </div>}
        </section>
        <aside className="panel archive-filters" aria-label="Фильтры кандидатов">
          <h2>Фильтры</h2>
          <label className="filter-search">Поиск
            <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Имя, специальность, заметка" />
          </label>
          <div className="filter-group">
            <h3>Специальность</h3>
            <button type="button" aria-pressed={!specialty} onClick={() => setSpecialty('')}>
              <span>Все специальности</span><span>{candidates.length}</span>
            </button>
            {[...specialties.entries()].sort(([a], [b]) => collator.compare(a, b)).map(([name, count]) => (
              <button type="button" key={name} aria-pressed={specialty === name} onClick={() => setSpecialty(name)}>
                <span>{name}</span><span>{count.candidates}</span>
              </button>
            ))}
          </div>
          <div className="filter-group">
            <h3>Статус</h3>
            <button type="button" aria-pressed={!status} onClick={() => setStatus('')}>
              <span>Все статусы</span><span>{candidates.length}</span>
            </button>
            {statusEntries.map(([key, label]) => (
              <button type="button" key={key} aria-pressed={status === key} onClick={() => setStatus(key)}>
                <span>{label}</span><span>{candidates.filter(candidate => candidate.status === key).length}</span>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </>
  )
}
