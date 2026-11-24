import { useEffect, useRef, useState } from 'react'
import type { CandidateOverview as Overview } from '../../../shared/archive'
import { requestCandidateOverview } from '../api'

type Props = { id: string; busy: boolean; openInterview: (id: string, startMs?: number) => void }
type State = { view: 'idle' | 'loading' } | { view: 'ready'; data: Overview } | { view: 'error'; message: string }

export function CandidateOverview({ id, busy, openInterview }: Props) {
  const [state, setState] = useState<State>({ view: 'idle' })
  const running = useRef<AbortController | null>(null)

  useEffect(() => () => running.current?.abort(), [])

  async function prepare() {
    if (running.current) return
    const controller = new AbortController()
    running.current = controller
    setState({ view: 'loading' })
    try {
      const data = await requestCandidateOverview(id, controller.signal)
      if (!controller.signal.aborted) setState({ view: 'ready', data })
    } catch (error) {
      if (!controller.signal.aborted) setState({ view: 'error', message: error instanceof Error ? error.message : 'Не удалось подготовить сводку.' })
    } finally {
      running.current = null
    }
  }

  const sources = state.view === 'ready' ? new Map(state.data.sources.map(source => [source.id, source])) : undefined

  return (
    <section className="panel candidate-overview" aria-labelledby="overview-title">
      <div className="history-heading">
        <h2 id="overview-title">Сводка по этапам</h2>
        <button type="button" className="secondary" disabled={busy || state.view === 'loading'} onClick={() => void prepare()}>
          {state.view === 'ready' ? 'Обновить сводку' : 'Подготовить сводку'}
        </button>
      </div>
      {state.view === 'loading' && <p role="status">Проверяем расшифровки интервью…</p>}
      {state.view === 'error' && <p role="alert">{state.message}</p>}
      {state.view === 'ready' && (state.data.recommendations.length ? <ul>
        {state.data.recommendations.map(item => {
          return <li key={item.question}>
            <strong>{item.question}</strong>
            <p className="muted">{item.reason}</p>
            {item.evidenceIds.map(id => {
              const source = sources?.get(id)
              if (!source) return null
              const seconds = Math.floor(source.startMs / 1000)
              const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
              return <button key={id} className="link timestamp" type="button"
                onClick={() => openInterview(source.interviewId, source.startMs)} disabled={busy}>{source.fileName} · {time}</button>
            })}
          </li>
        })}
      </ul> : <p className="muted">По этим расшифровкам нет дополнительных вопросов.</p>)}
    </section>
  )
}
