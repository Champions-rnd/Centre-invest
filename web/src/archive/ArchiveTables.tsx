import { SelectField } from '../ui/SelectField'
import { useEffect, useState } from 'react'
import type { ArchiveInterview, Candidate, SavedInterview } from '../../../shared/archive'
import { loadInterview } from '../api'

function formatTime(ms: number) {
  return new Date(ms).toISOString().slice(11, 23)
}

export function ArchiveTables({ candidates, interviews }: { candidates: Candidate[]; interviews: ArchiveInterview[] }) {
  const [sheet, setSheet] = useState<'candidates' | 'transcripts'>('candidates')
  const [interviewId, setInterviewId] = useState('')
  const selected = interviews.find(interview => interview.id === interviewId) ?? interviews[0]
  const selectedId = selected?.id
  const selectedUpdatedAt = selected?.updatedAt
  const [displayed, setDisplayed] = useState<{ id: string; updatedAt: string; data?: SavedInterview; error?: string }>()
  const current = displayed?.id === selectedId && displayed?.updatedAt === selectedUpdatedAt ? displayed : undefined

  useEffect(() => {
    if (sheet !== 'transcripts' || !selectedId || !selectedUpdatedAt) return
    const controller = new AbortController()
    const key = { id: selectedId, updatedAt: selectedUpdatedAt }
    void loadInterview(selectedId, controller.signal).then(
      data => { if (!controller.signal.aborted) setDisplayed({ ...key, data }) },
      failure => {
        if (!controller.signal.aborted) setDisplayed({ ...key, error: failure instanceof Error ? failure.message : 'Не удалось загрузить расшифровку.' })
      },
    )
    return () => controller.abort()
  }, [sheet, selectedId, selectedUpdatedAt])

  return (
    <section className="archive-tables" aria-labelledby="archive-tables-title">
      <header className="directory-heading">
        <div>
          <h1 id="archive-tables-title" tabIndex={-1}>Таблицы</h1>
          <p>Кандидаты и расшифровки интервью.</p>
        </div>
      </header>
      <div className="panel archive-tables-content">
        <div className="archive-table-controls" role="group" aria-label="Листы таблицы">
          <button type="button" className="secondary" aria-pressed={sheet === 'candidates'}
            onClick={() => setSheet('candidates')}>Кандидаты</button>
          <button type="button" className="secondary" aria-pressed={sheet === 'transcripts'}
            onClick={() => setSheet('transcripts')}>Расшифровки</button>
        </div>
        {sheet === 'candidates' ? candidates.length ? (
          <div className="archive-table-scroll" tabIndex={0} role="region" aria-label="Таблица кандидатов">
            <table>
              <thead><tr><th scope="col">ID</th><th scope="col">ФИО</th><th scope="col">Специальность</th></tr></thead>
              <tbody>{candidates.map(candidate => (
                <tr key={candidate.id}><td><code>{candidate.id}</code></td><td>{candidate.name}</td><td>{candidate.specialty}</td></tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="muted">В архиве пока нет кандидатов.</p> : selected ? <>
          <SelectField label="Интервью" className="archive-interview-select" value={selected.id} onChange={setInterviewId}
            options={interviews.map(interview => ({ value: interview.id, label: `${interview.candidate.name} · ${interview.fileName}` }))} />
          <p className="muted">{selected.candidate.specialty} · ID интервью <code>{selected.id}</code></p>
          {current?.error ? <p role="alert">{current.error}</p> : current?.data ? (
            <div className="archive-table-scroll" tabIndex={0} role="region" aria-label="Таблица расшифровки">
              <table>
                <thead><tr><th scope="col">Реплика</th><th scope="col">Роль</th><th scope="col">Начало</th>
                  <th scope="col">Конец</th><th scope="col">Текст</th></tr></thead>
                <tbody>{current.data.result.transcript.map((segment, index) => (
                  <tr key={segment.id}><td>{index + 1}</td>
                    <td>{segment.speaker === 'hr' ? 'HR' : segment.speaker === 'candidate' ? 'Кандидат' : 'Не определена'}</td>
                    <td><code>{formatTime(segment.startMs)}</code></td><td><code>{formatTime(segment.endMs)}</code></td>
                    <td className="archive-transcript-text">{segment.text}</td></tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p role="status">Загружаем расшифровку…</p>}
        </> : <p className="muted">В архиве пока нет интервью.</p>}
      </div>
    </section>
  )
}
