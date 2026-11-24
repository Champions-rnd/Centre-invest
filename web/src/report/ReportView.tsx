import { useRef, useState } from 'react'
import { vacancyCriteria, type InterviewResult, type Segment } from '../../../shared/contracts'

const statusLabels = {
  supported: 'Подтверждено',
  partial: 'Частично подтверждено',
  missing: 'Нет данных',
}

function timecode(ms: number) {
  const seconds = Math.floor(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`
}

type Props = {
  result: InterviewResult
  audioUrl: string
  busy: boolean
  onReanalyze: (transcript: Segment[]) => void
}

export function ReportView({ result, audioUrl, busy, onReanalyze }: Props) {
  const player = useRef<HTMLAudioElement>(null)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const segments = new Map(result.transcript.map(segment => [segment.id, segment]))
  const criteria = new Map(vacancyCriteria(result.vacancy).map(({ id, label }) => [id, label]))

  function timestamp(segment: Segment) {
    const time = timecode(segment.startMs)
    if (!audioUrl) return <span className="timestamp">{time}</span>

    return (
      <button className="timestamp link" type="button" aria-label={`К записи на ${time}`} onClick={() => {
        if (player.current) {
          player.current.currentTime = segment.startMs / 1000
          void player.current.play().catch(() => {})
        }
      }}>{time}</button>
    )
  }

  const updatedTranscript = result.transcript.map(segment => ({
    ...segment, text: (edits[segment.id] ?? segment.text).trim(),
  }))
  const canReanalyze = updatedTranscript.every(segment => segment.text.length > 0)
    && updatedTranscript.some((segment, index) => segment.text !== result.transcript[index].text)

  return (
    <div className="results">
      <section className="panel">
        <h2>Расшифровка</h2>
        {audioUrl && <audio ref={player} src={audioUrl} controls preload="metadata" />}
        {result.mode === 'demo' && <p className="muted">Учебный пример с вымышленными репликами. Аудио для него отсутствует.</p>}
        <ul className="transcript">
          {result.transcript.map(segment => (
            <li key={segment.id}>
              <div className="speaker">{timestamp(segment)} <strong>{segment.speaker}</strong></div>
              {result.mode === 'demo' ? <p>{segment.text}</p> : (
                <textarea rows={2} aria-label={`Реплика ${segment.speaker} на ${timecode(segment.startMs)}`}
                  value={edits[segment.id] ?? segment.text} disabled={busy}
                  onChange={event => setEdits({ ...edits, [segment.id]: event.target.value })} />
              )}
            </li>
          ))}
        </ul>
        {result.mode === 'live' && (
          <button type="button" disabled={busy || !canReanalyze} onClick={() => onReanalyze(updatedTranscript)}>
            Пересобрать отчёт
          </button>
        )}
      </section>
      <section className="panel">
        <h2>Отчёт для рекрутера</h2>
        <p className="muted">{result.vacancy.description}</p>
        {result.report.map(finding => (
          <article key={finding.criterionId} className="finding">
            <div className="finding-heading">
              <h3>{criteria.get(finding.criterionId)}</h3>
              <span className={`status ${finding.status}`}>{statusLabels[finding.status]}</span>
            </div>
            <p>{finding.conclusion}</p>
            {finding.evidenceIds.map(id => {
              const segment = segments.get(id)
              return segment && <blockquote key={id}>{timestamp(segment)} {segment.speaker} · «{segment.text}»</blockquote>
            })}
            {finding.gaps.length > 0 && <><h4>Что неизвестно</h4><ul>{finding.gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul></>}
            {finding.nextQuestions.length > 0 && <><h4>Что спросить</h4><ul>{finding.nextQuestions.map((question, index) => <li key={index}>{question}</li>)}</ul></>}
          </article>
        ))}
      </section>
    </div>
  )
}
