import { useState } from 'react'
import type { CoachingResult, Recommendation, Segment } from '../../../shared/contracts'

const sections: { kind: Recommendation['kind']; title: string }[] = [
  { kind: 'unasked', title: 'Что ещё спросить' },
  { kind: 'rephrase', title: 'Что переформулировать' },
  { kind: 'clarify', title: 'Какие ответы уточнить' },
]

export type CoachingState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; result: CoachingResult }

type Props = {
  state: CoachingState
  segments: Map<string, Segment>
  onJump: (segment: Segment) => void
  onRetry: () => void
  formatTime: (ms: number) => string
}

export function CoachingPanel({ state, segments, onJump, onRetry, formatTime }: Props) {
  const [copyStatus, setCopyStatus] = useState('')

  async function copyQuestions(questions: string[]) {
    try {
      await navigator.clipboard.writeText(questions.join('\n'))
      setCopyStatus('Вопросы скопированы.')
    } catch {
      setCopyStatus('Не удалось скопировать вопросы.')
    }
  }

  return (
    <aside className="panel coaching" aria-labelledby="coaching-title" aria-busy={state.status === 'loading'}>
      <header className="coach-header">
        <h3 id="coaching-title">Рекомендации для HR</h3>
      </header>
      {state.status === 'loading' && <p className="muted" role="status">Готовим вопросы по расшифровке…</p>}
      {state.status === 'error' && <>
        <p role="alert">{state.message}</p>
        <button type="button" className="secondary" onClick={onRetry}>Повторить</button>
      </>}
      {state.status === 'ready' && (
        <>
          <p className="muted coach-source">
            {state.result.source === 'rules' ? 'Подсказки по структуре разговора'
              : state.result.source === 'chatci' ? 'Подготовлено ChatCI'
              : state.result.source === 'local' ? 'Подготовлено локальной ИИ-моделью' : 'Подготовлено подключённой ИИ-моделью'}
            {state.result.ruleSupplement && ' и дополнено правилами анализа диалога'}
          </p>
          {!state.result.recommendations.length && <p>По этой расшифровке нет дополнительных вопросов.</p>}
          {state.result.recommendations.length > 0 && <button type="button" className="secondary copy-questions"
            onClick={() => void copyQuestions(state.result.recommendations.map(item => item.question))}>Скопировать вопросы</button>}
          {copyStatus && <p className="muted" role="status">{copyStatus}</p>}
          {sections.map(({ kind, title }) => {
            const items = state.result.recommendations.filter(item => item.kind === kind)
            if (!items.length) return null
            return (
              <section className="coach-group" key={kind}>
                <h4>{title}</h4>
                <ul>
                  {items.map(item => (
                    <li className="coach-card" key={JSON.stringify([item.question, item.evidenceIds])}>
                      <p><strong>{item.question}</strong></p>
                      <p className="muted">{item.reason}</p>
                      {item.evidenceIds.length > 0 && (
                        <div className="coach-evidence">
                          {item.evidenceIds.map(id => {
                            const segment = segments.get(id)
                            return segment && (
                              <button type="button" className="timestamp link" key={id} onClick={() => onJump(segment)}>
                                К фрагменту {formatTime(segment.startMs)}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </>
      )}
    </aside>
  )
}
