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
  const [audioError, setAudioError] = useState('')
  const segments = new Map(result.transcript.map(segment => [segment.id, segment]))
  const criteria = new Map(vacancyCriteria(result.vacancy).map(({ id, label }) => [id, label]))

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
      {result.mode === 'demo' && <p className="eyebrow">Демоотчёт</p>}
      <h2 id="report-title" tabIndex={-1}>Разбор интервью</h2>
      <p className="muted report-description">{result.vacancy.description}</p>
      {audioUrl && (
        <div className="panel player">
          <div><strong>Запись интервью</strong><p className="muted">Таймкоды отсчитываются от начала WAV</p></div>
          <audio ref={player} src={audioUrl} controls preload="metadata" />
          {audioError && <p className="error" role="status">{audioError}</p>}
        </div>
      )}
      <div className="results">
        <section className="findings">
          <h3 className="sr-only">Отчёт для рекрутера</h3>
          {result.report.map(finding => (
            <article key={finding.criterionId} className="panel finding">
              <div className="finding-heading">
                <h4>{criteria.get(finding.criterionId)}</h4>
                <span className={`status ${finding.status}`}>{statusLabels[finding.status]}</span>
              </div>
              <p>{finding.conclusion}</p>
              {finding.evidenceIds.map(id => {
                const segment = segments.get(id)
                return segment && <blockquote key={id}>{timestamp(segment)} {segment.speaker} · «{segment.text}»</blockquote>
              })}
              {finding.gaps.length > 0 && <><h5>Что неизвестно</h5><ul>{finding.gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul></>}
              {finding.nextQuestions.length > 0 && <><h5>Что спросить</h5><ul>{finding.nextQuestions.map((question, index) => <li key={index}>{question}</li>)}</ul></>}
            </article>
          ))}
        </section>
        <section className="panel transcript-panel">
          <h3>Расшифровка</h3>
          {result.mode === 'demo' && <p className="muted">Справочный текст из кейса. Таймкоды приблизительные.</p>}
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
      </div>
      {result.mode === 'demo' && (
        <p className="credit">
          Евгений Гришаков, <a href="https://www.youtube.com/watch?v=49nRXr1_xWE&t=1048s">интервью с Михаилом Чупраковым о Potion Craft</a>.
          {' '}<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. Для кейса выделен фрагмент 17:28–20:28.
          {' '}<a href={`${import.meta.env.BASE_URL}demo/source-and-license.txt`}>Об источнике</a>
        </p>
      )}
    </section>
  )
}
