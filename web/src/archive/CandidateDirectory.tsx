import { SelectField } from '../ui/SelectField'
import { useState } from 'react'
import { candidateStatuses, type Candidate } from '../../../shared/archive'
import { formatDate } from './format'

type Props = {
  candidates: Candidate[]
  busy: boolean
  onOpen: (id: string) => void
  onAdd: () => void
  onDelete: (candidate: Candidate) => void
}

const byName = new Intl.Collator('ru')
const sortLabels = { recent: 'По последнему интервью', interviews: 'По числу интервью', name: 'По имени' } as const
type CandidateOrder = keyof typeof sortLabels

export function initials(name: string) {
  return name.split(/\s+/u).slice(0, 2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase('ru')
}

export function CandidateDirectory({ candidates, busy, onOpen, onAdd, onDelete }: Props) {
  const [query, setQuery] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState<CandidateOrder>('recent')
  const search = query.trim().toLocaleLowerCase('ru')
  const groups = new Map<string, number>()
  for (const candidate of candidates) groups.set(candidate.specialty, (groups.get(candidate.specialty) ?? 0) + 1)
  const specialties = [...groups.entries()].sort(([a], [b]) => byName.compare(a, b))
  const matches = candidates.filter(candidate =>
    (!specialty || candidate.specialty === specialty)
    && (!status || (status === 'no-interview' ? !candidate.interviewCount : candidate.status === status))
    && [candidate.name, candidate.specialty, candidate.notes].some(value => value.toLocaleLowerCase('ru').includes(search)))
  matches.sort((a, b) => {
    const names = byName.compare(a.name, b.name)
    if (sort === 'name') return names
    if (sort === 'interviews') return b.interviewCount - a.interviewCount || names
    return (b.latestAt ?? '').localeCompare(a.latestAt ?? '') || names
  })

  const totalInterviews = candidates.reduce((total, candidate) => total + candidate.interviewCount, 0)
  const needsReview = candidates.filter(candidate => candidate.status === 'review').length

  return (
    <section aria-labelledby="candidate-directory-title" className="workspace-directory">
      <header className="directory-heading">
        <div>
          <h1 id="candidate-directory-title" tabIndex={-1}>Кандидаты</h1>
          <p>Личные дела, записи интервью и результаты сверки.</p>
        </div>
        <button type="button" disabled={busy} onClick={onAdd}>+ Добавить кандидата</button>
      </header>
      <dl className="workspace-metrics">
        <div><dt>Кандидаты</dt><dd>{candidates.length}</dd></div>
        <div><dt>Интервью</dt><dd>{totalInterviews}</dd></div>
        <div><dt>Требуют сверки</dt><dd>{needsReview}</dd></div>
      </dl>
      <section className="panel workspace-roster" aria-labelledby="roster-title">
        <div className="roster-heading">
          <h2 id="roster-title">Личные дела</h2>
        </div>
        {!!candidates.length && <div className="roster-tools">
          <label>Поиск<input type="search" placeholder="Имя, специальность или заметка" value={query} onChange={event => setQuery(event.target.value)} /></label>
          <SelectField label="Специальность" value={specialty} onChange={setSpecialty}
            options={[{ value: '', label: 'Все специальности' }, ...specialties.map(([value, count]) => ({ value, label: `${value} (${count})` }))]} />
          <SelectField label="Статус" value={status} onChange={setStatus}
            options={[{ value: '', label: 'Все статусы' }, ...Object.entries(candidateStatuses).map(([value, label]) => ({ value, label })),
              { value: 'no-interview', label: 'Без интервью' }]} />
          <SelectField label="Сортировка" value={sort} onChange={value => setSort(value as CandidateOrder)}
            options={Object.entries(sortLabels).map(([value, label]) => ({ value, label }))} />
        </div>}
        {matches.length ? <table className="roster-table">
          <thead><tr><th scope="col">Кандидат</th><th scope="col">Статус</th><th scope="col">Интервью</th><th scope="col">Действие</th></tr></thead>
          <tbody>{matches.map(candidate => (
            <tr key={candidate.id}>
              <th scope="row">
                <div className="roster-person">
                  <span className="roster-avatar" aria-hidden="true">{initials(candidate.name)}</span>
                  <span><strong>{candidate.name}</strong><small>{candidate.specialty}</small></span>
                </div>
              </th>
              <td><span className="candidate-status" data-status={candidate.status}>{candidateStatuses[candidate.status]}</span></td>
              <td><strong>{candidate.interviewCount}</strong><small>{candidate.latestAt ? formatDate(candidate.latestAt) : 'Записей пока нет'}</small></td>
              <td><div className="roster-row-actions">
                <button className="secondary roster-open" disabled={busy} type="button"
                  aria-label={`Открыть личное дело: ${candidate.name}`} onClick={() => onOpen(candidate.id)}>Открыть <span aria-hidden="true">›</span></button>
                <button className="secondary interview-delete" disabled={busy} type="button"
                  aria-label={`Удалить кандидата: ${candidate.name}`} title="Удалить кандидата"
                  onClick={() => onDelete(candidate)}>×</button>
              </div></td>
            </tr>
          ))}</tbody>
        </table> : <div className="workspace-empty">
          <h3>{candidates.length ? 'Ничего не найдено' : 'Пока нет кандидатов'}</h3>
          <p className="muted">{candidates.length ? 'Проверьте запрос или фильтры.' : 'Добавьте кандидата, чтобы создать личное дело и прикрепить запись.'}</p>
          {candidates.length > 0 && <button className="secondary" type="button" onClick={() => { setQuery(''); setSpecialty(''); setStatus('') }}>Сбросить фильтры</button>}
        </div>}
      </section>
    </section>
  )
}
