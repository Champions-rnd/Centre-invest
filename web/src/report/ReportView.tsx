import { useEffect, useRef, useState } from 'react'
import type { InterviewResult, Segment, SpeakerRole } from '../../../shared/contracts'
import { groupDialogue } from '../../../shared/dialogue'
import { requestCoaching, reviewInterviewRoles } from '../api'
import { CoachingPanel, type CoachingState } from './CoachingPanel'

const roleLabels: Record<SpeakerRole, string> = { hr: 'HR', candidate: 'Кандидат', '': 'Нужна сверка' }

function roleOf(segment: Segment): SpeakerRole {
  return segment.speaker === 'hr' || segment.speaker === 'candidate' ? segment.speaker : ''
}

function timecode(ms: number) {
  const seconds = Math.floor(ms / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

type Props = {
  interviewId: string
  result: InterviewResult
  audioUrl: string
  audioName: string
  onSave: (transcript: Segment[]) => Promise<Segment[]>
}

export function ReportView({ interviewId, result, audioUrl, audioName, onSave }: Props) {
  const player = useRef<HTMLAudioElement>(null)
  const messages = useRef(new Map<string, HTMLLIElement>())
  const roleRequest = useRef<AbortController | null>(null)
  const [transcript, setTranscript] = useState(result.transcript)
  const [draft, setDraft] = useState<Segment[] | null>(null)
  const [active, setActive] = useState('')
  const [audioError, setAudioError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [reviewInfo, setReviewInfo] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [retry, setRetry] = useState(0)
  const [coaching, setCoaching] = useState<CoachingState>({ status: 'loading' })
  const turns = groupDialogue(transcript)
  const originals = new Map(transcript.map(segment => [segment.id, segment]))
  const drafts = draft && new Map(draft.map(segment => [segment.id, segment]))
  const uncertain = transcript.filter(segment => !roleOf(segment)).length

  useEffect(() => () => roleRequest.current?.abort(), [])

  useEffect(() => {
    const controller = new AbortController()
    setCoaching({ status: 'loading' })
    void requestCoaching({ vacancy: result.vacancy, transcript }, controller.signal).then(
      next => { if (!controller.signal.aborted) setCoaching({ status: 'ready', result: next }) },
      error => {
        if (!controller.signal.aborted) setCoaching({ status: 'error', message: errorMessage(error, 'Не удалось подготовить рекомендации.') })
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

  function timestamp(segment: Segment) {
    return <button type="button" className="timestamp link" onClick={() => play(segment)}
      aria-label={`Воспроизвести с ${timecode(segment.startMs)}`}>{timecode(segment.startMs)}</button>
  }

  function updateDraft(id: string, patch: Partial<Pick<Segment, 'text' | 'speaker' | 'roleReviewed'>>) {
    setDraft(current => current?.map(segment => segment.id === id ? { ...segment, ...patch } : segment) ?? null)
  }

  async function checkRoles() {
    if (roleRequest.current) return
    const controller = new AbortController()
    roleRequest.current = controller
    setReviewing(true)
    setReviewInfo('')
    setSaveError('')
    try {
      const review = await reviewInterviewRoles(interviewId, controller.signal)
      const changes = review.transcript.filter(segment => originals.get(segment.id)?.speaker !== segment.speaker).length
      const source = review.source === 'model' ? `ИИ проверил фрагментов: ${review.reviewedCount}.`
        : 'Проверка по структуре диалога. Текстовая модель недоступна.'
      setReviewInfo(`${source} ${changes ? `Предложено правок: ${changes}. Прослушайте выделенные фрагменты перед сохранением.`
        : 'Изменений нет.'}`)
      if (changes) setDraft(review.transcript)
    } catch (error) {
      if (!controller.signal.aborted) setSaveError(errorMessage(error, 'Не удалось проверить роли.'))
    } finally {
      roleRequest.current = null
      if (!controller.signal.aborted) setReviewing(false)
    }
  }

  async function saveDraft() {
    if (!draft || draft.some(segment => !segment.text.trim())) return
    setSaveError('')
    setSaving(true)
    try {
      const saved = await onSave(draft.map(segment => ({ ...segment, text: segment.text.trim() })))
      setTranscript(saved)
      setDraft(null)
      setReviewInfo('Диалог сохранён. Рекомендации обновятся по новой расшифровке.')
    } catch (error) {
      setSaveError(errorMessage(error, 'Не удалось сохранить расшифровку.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="report" aria-labelledby="report-title">
      <h2 id="report-title" tabIndex={-1}>Расшифровка и рекомендации</h2>
      {result.vacancy?.description && <p className="muted report-description">{result.vacancy.description}</p>}
      <div className="panel player">
        <strong className="player-recording">{audioName}</strong>
        <audio ref={player} src={audioUrl} controls preload="metadata" onTimeUpdate={event => {
          const ms = event.currentTarget.currentTime * 1000
          setActive(transcript.find(segment => segment.startMs <= ms && ms < segment.endMs)?.id ?? '')
        }} onError={() => setAudioError('Браузер не может воспроизвести этот WAV. Расшифровка доступна ниже.')} />
        {audioError && <p className="error" role="status">{audioError}</p>}
      </div>
      <div className="results">
        <section className="panel transcript-panel" aria-labelledby="dialog-title">
          <div className="dialog-heading">
            <div>
              <h3 id="dialog-title">Диалог</h3>
              <p className="muted">Роли определяются по тексту. Без роли: {uncertain} из {transcript.length} фрагментов.</p>
            </div>
            {!draft && <div className="dialog-tools">
              <button type="button" className="secondary" disabled={reviewing} onClick={() => {
                setReviewInfo('')
                setSaveError('')
                setDraft(transcript)
              }}>Редактировать</button>
              <button type="button" disabled={reviewing || transcript.every(segment => segment.roleReviewed)}
                onClick={() => void checkRoles()}>{reviewing ? 'Проверяем роли…' : 'Уточнить роли'}</button>
            </div>}
          </div>
          {reviewInfo && <p className="dialog-notice" role="status">{reviewInfo}</p>}
          {saveError && <p className="dialog-notice error" role="alert">{saveError}</p>}
          <ol className="dialog-messages" aria-label="Реплики по времени">
            {turns.map(turn => {
              const first = turn[0]
              const last = turn[turn.length - 1]
              const role = roleOf(first)
              const playing = turn.some(segment => segment.id === active)
              return (
                <li className="message" data-role={role || 'unknown'} data-active={playing}
                  ref={element => {
                    for (const segment of turn) {
                      if (element) messages.current.set(segment.id, element)
                      else messages.current.delete(segment.id)
                    }
                  }} key={first.id}>
                  <div className="message-meta">
                    <strong className="role-label">{roleLabels[role]}</strong>
                    {timestamp(first)}
                    <span className="muted message-end">– {timecode(last.endMs)}</span>
                  </div>
                  {drafts ? <div className="message-edits">
                    {turn.map(segment => {
                      const value = drafts.get(segment.id) ?? segment
                      const proposed = value.speaker !== segment.speaker
                      return <div key={segment.id} className="message-edit" data-proposed={proposed}>
                        <div className="message-meta">
                          {turn.length > 1 && timestamp(segment)}
                          <select disabled={saving} aria-label={`Роль в реплике ${timecode(segment.startMs)}`} value={roleOf(value)}
                            onChange={event => updateDraft(segment.id, { speaker: event.target.value, roleReviewed: true })}>
                            <option value="">{roleLabels['']}</option>
                            <option value="hr">HR</option>
                            <option value="candidate">Кандидат</option>
                          </select>
                          {proposed && <span className="role-change">{roleLabels[roleOf(segment)]} → {roleLabels[roleOf(value)]}</span>}
                          {!proposed && !value.roleReviewed && roleOf(value) && (
                            <button type="button" className="secondary" disabled={saving}
                              onClick={() => updateDraft(segment.id, { roleReviewed: true })}>Подтвердить роль</button>
                          )}
                        </div>
                        <textarea rows={2} disabled={saving} aria-label={`Текст реплики ${timecode(segment.startMs)}`}
                          value={value.text} onChange={event => updateDraft(segment.id, { text: event.target.value })} />
                      </div>
                    })}
                  </div> : <>
                    <p className="turn-text">{turn.map((segment, index) => <span data-current={segment.id === active}
                      key={segment.id}>{index > 0 ? ' ' : ''}{segment.text}</span>)}</p>
                    {turn.length > 1 && <details className="turn-times">
                      <summary>Таймкоды фрагментов ({turn.length})</summary>
                      <div className="turn-links">{turn.map(segment => <span key={segment.id}>{timestamp(segment)}</span>)}</div>
                    </details>}
                  </>}
                </li>
              )
            })}
          </ol>
          {draft && <div className="actions edit-actions">
            <button type="button" disabled={saving || draft.some(segment => !segment.text.trim())} onClick={() => void saveDraft()}>
              {saving ? 'Сохраняем…' : 'Сохранить и обновить рекомендации'}
            </button>
            <button type="button" className="secondary" disabled={saving} onClick={() => {
              setDraft(null)
              setReviewInfo('')
              setSaveError('')
            }}>Отмена</button>
          </div>}
        </section>
        <CoachingPanel state={coaching} segments={originals} onJump={segment => play(segment, true)}
          onRetry={() => setRetry(value => value + 1)} formatTime={timecode} />
      </div>
    </section>
  )
}
