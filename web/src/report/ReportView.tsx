import { useEffect, useRef, useState } from 'react'
import type { InterviewResult, Segment, SpeakerRole } from '../../../shared/contracts'
import { requestCoaching } from '../api'
import { CoachingPanel, type CoachingState } from './CoachingPanel'

const roleLabels: Record<SpeakerRole, string> = { hr: 'HR', candidate: 'Кандидат', '': 'Роль не определена' }

function timecode(ms: number) {
  const seconds = Math.floor(ms / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`
}

type Props = {
  result: InterviewResult
  audioUrl: string
  audioName: string
}

export function ReportView({ result, audioUrl, audioName }: Props) {
  const player = useRef<HTMLAudioElement>(null)
  const messages = useRef(new Map<string, HTMLLIElement>())
  const [transcript, setTranscript] = useState(result.transcript)
  const [draft, setDraft] = useState<Segment[] | null>(null)
  const [active, setActive] = useState('')
  const [audioError, setAudioError] = useState('')
  const [retry, setRetry] = useState(0)
  const [coaching, setCoaching] = useState<CoachingState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    setCoaching({ status: 'loading' })
    void requestCoaching({ vacancy: result.vacancy, transcript }, controller.signal).then(
      next => { if (!controller.signal.aborted) setCoaching({ status: 'ready', result: next }) },
      error => {
        if (!controller.signal.aborted) setCoaching({ status: 'error', message: error instanceof Error
          ? error.message : 'Не удалось подготовить рекомендации.' })
      },
    )
    return () => controller.abort()
  }, [result.vacancy, transcript, retry])

  function play(segment: Segment, reveal = false) {
    setActive(segment.id)
    if (reveal) messages.current.get(segment.id)?.scrollIntoView({ block: 'nearest' })
    const audio = player.current
    if (!audio) return
    setAudioError('')
    audio.currentTime = segment.startMs / 1000
    void audio.play().catch(error => {
      if (error.name !== 'AbortError') setAudioError('Не удалось воспроизвести запись. Попробуйте запустить её в плеере.')
    })
  }

  function updateDraft(index: number, patch: Partial<Pick<Segment, 'text' | 'speaker'>>) {
    setDraft(current => current?.map((segment, position) => position === index ? { ...segment, ...patch } : segment) ?? null)
  }

  function saveDraft() {
    if (!draft || draft.some(segment => !segment.text.trim())) return
    setTranscript(draft.map(segment => ({ ...segment, text: segment.text.trim() })))
    setDraft(null)
  }

  return (
    <section className="report" aria-labelledby="report-title">
      <h2 id="report-title" tabIndex={-1}>Расшифровка и рекомендации</h2>
      {result.vacancy?.description && <p className="muted report-description">{result.vacancy.description}</p>}
      <div className="panel player">
        <strong className="player-recording">{audioName}</strong>
        <audio ref={player} src={audioUrl} controls preload="metadata"
          onError={() => setAudioError('Браузер не может воспроизвести этот WAV. Расшифровка доступна ниже.')} />
        {audioError && <p className="error" role="status">{audioError}</p>}
      </div>
      <div className="results">
        <section className="panel transcript-panel" aria-labelledby="dialog-title">
          <div className="dialog-heading">
            <div>
              <h3 id="dialog-title">Диалог</h3>
              <p className="muted">Роли предположены по тексту. Их можно исправить.</p>
            </div>
            {!draft && <button type="button" className="secondary" onClick={() => setDraft(transcript)}>Редактировать</button>}
          </div>
          <ol className="dialog-messages" aria-label="Реплики по времени">
            {(draft ?? transcript).map((segment, index) => {
              const role: SpeakerRole = segment.speaker === 'hr' || segment.speaker === 'candidate' ? segment.speaker : ''
              return (
                <li className="message" data-role={role || 'unknown'} data-active={active === segment.id}
                  ref={element => {
                    if (element) messages.current.set(segment.id, element)
                    else messages.current.delete(segment.id)
                  }} key={segment.id}>
                  <div className="message-meta">
                    {draft ? (
                      <select aria-label={`Роль в реплике ${timecode(segment.startMs)}`} value={role}
                        onChange={event => updateDraft(index, { speaker: event.target.value })}>
                        <option value="">Роль не определена</option>
                        <option value="hr">HR</option>
                        <option value="candidate">Кандидат</option>
                      </select>
                    ) : <strong>{roleLabels[role]}</strong>}
                    <button type="button" className="timestamp link" onClick={() => play(segment)}
                      title={`До ${timecode(segment.endMs)}`}
                      aria-label={`Воспроизвести с ${timecode(segment.startMs)}`}>{timecode(segment.startMs)}</button>
                    <span className="muted message-end">– {timecode(segment.endMs)}</span>
                  </div>
                  {draft ? (
                    <textarea rows={2} aria-label={`Текст реплики ${timecode(segment.startMs)}`}
                      value={segment.text} onChange={event => updateDraft(index, { text: event.target.value })} />
                  ) : <p>{segment.text}</p>}
                </li>
              )
            })}
          </ol>
          {draft && <div className="actions edit-actions">
            <button type="button" disabled={draft.some(segment => !segment.text.trim())} onClick={saveDraft}>Сохранить и обновить рекомендации</button>
            <button type="button" className="secondary" onClick={() => setDraft(null)}>Отмена</button>
          </div>}
        </section>
        <CoachingPanel state={coaching} segments={new Map(transcript.map(segment => [segment.id, segment]))}
          onJump={segment => play(segment, true)} onRetry={() => setRetry(value => value + 1)} formatTime={timecode} />
      </div>
    </section>
  )
}
