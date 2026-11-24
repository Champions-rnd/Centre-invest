import { useRef, useState } from 'react'
import { vacancyCriteria, type InterviewResult, type Segment } from '../../../shared/contracts'

const statusLabels = {
  supported: 'Подтверждено',
  partial: 'Есть совпадения',
  missing: 'Совпадений нет',
}

function timecode(ms: number) {
  const seconds = Math.floor(ms / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`
}

type Props = {
  result: InterviewResult
  audioUrl: string
  audioName?: string
  busy: boolean
  onReanalyze: (transcript: Segment[]) => void
}

export function ReportView({ result, audioUrl, audioName, busy, onReanalyze }: Props) {
  const player = useRef<HTMLAudioElement>(null)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [audioError, setAudioError] = useState('')
  const segments = new Map(result.transcript.map(segment => [segment.id, segment]))
  const criteria = new Map(result.vacancy ? vacancyCriteria(result.vacancy).map(({ id, label }) => [id, label]) : [])

  function timestamp(segment: Segment) {
    const time = timecode(segment.startMs)
    if (!audioUrl) return <span className="timestamp">{time}</span>

    return (
      <button className="timestamp link" type="button" aria-label={`К записи на ${time}`} onClick={() => {
        if (!player.current) return
        setAudioError('')
        player.current.currentTime = segment.startMs / 1000
        void player.current.play().catch(error => {
          if (error.name !== 'AbortError') setAudioError('Не удалось воспроизвести запись. Попробуйте запустить её в плеере.')
        })
      }}>{time}</button>
    )
  }

  const updatedTranscript = result.transcript.map(segment => ({
    ...segment, text: (edits[segment.id] ?? segment.text).trim(),
  }))
  const canReanalyze = updatedTranscript.every(segment => segment.text.length > 0)
    && updatedTranscript.some((segment, index) => segment.text !== result.transcript[index].text)

  return (
    <section className="report" aria-labelledby="report-title">
      <h2 id="report-title" tabIndex={-1}>Разбор интервью</h2>
      {result.vacancy && <p className="muted report-description">{result.vacancy.description}</p>}
      {audioUrl && (
        <div className="panel player">
          <div className="player-recording">
            <strong>{audioName ?? 'Запись интервью'}</strong>
            <p className="muted">Таймкоды отсчитываются от начала WAV</p>
          </div>
          <audio ref={player} src={audioUrl} controls preload="metadata"
            onError={() => setAudioError('Браузер не может воспроизвести этот WAV. Расшифровка доступна ниже.')} />
          {audioError && <p className="error" role="status">{audioError}</p>}
        </div>
      )}
      <div className={result.vacancy ? 'results' : 'results transcript-only'}>
        {result.vacancy && <section className="findings">
          <div><h3>Отчёт по критериям</h3><p className="muted">Поиск по ключевым словам в расшифровке</p></div>
          {result.report.map(finding => (
            <article key={finding.criterionId} className="panel finding">
              <div className="finding-heading">
                <h4>{criteria.get(finding.criterionId)}</h4>
                <span className={`status ${finding.status}`}>{statusLabels[finding.status]}</span>
              </div>
              <p>{finding.conclusion}</p>
              {finding.evidenceIds.map(id => {
                const segment = segments.get(id)
                return segment && <blockquote key={id}>{timestamp(segment)} {segment.speaker && `${segment.speaker} · `}«{segment.text}»</blockquote>
              })}
              {finding.gaps.length > 0 && <><h5>Что неизвестно</h5><ul>{finding.gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul></>}
              {finding.nextQuestions.length > 0 && <><h5>Что спросить</h5><ul>{finding.nextQuestions.map((question, index) => <li key={index}>{question}</li>)}</ul></>}
            </article>
          ))}
        </section>}
        <section className="panel transcript-panel">
          <h3>Расшифровка</h3>
          <ul className="transcript">
            {result.transcript.map(segment => (
              <li key={segment.id}>
                <div className="speaker">
                  {timestamp(segment)} <span className="muted">– {timecode(segment.endMs)}</span>
                  {segment.speaker && <strong>{segment.speaker}</strong>}
                </div>
                <textarea rows={2} aria-label={`Фрагмент с ${timecode(segment.startMs)}`}
                  value={edits[segment.id] ?? segment.text} disabled={busy}
                  onChange={event => setEdits({ ...edits, [segment.id]: event.target.value })} />
              </li>
            ))}
          </ul>
          {result.vacancy && (
            <button type="button" disabled={busy || !canReanalyze} onClick={() => onReanalyze(updatedTranscript)}>
              Пересобрать отчёт
            </button>
          )}
        </section>
      </div>
    </section>
  )
}
