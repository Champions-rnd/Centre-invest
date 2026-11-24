import type { AnswerObservation, Segment } from '../../../shared/contracts'

const topics: Record<AnswerObservation['aspect'], string> = {
  clarity: 'Ясность речи', relevance: 'Ответ по существу', detail: 'Конкретика', outcome: 'Результат',
}
const groups = [
  { kind: 'strength', title: 'Что получилось', sign: '+' },
  { kind: 'improvement', title: 'Что стоит уточнить', sign: '−' },
] as const

type Props = {
  observations: AnswerObservation[]
  segments: Map<string, Segment>
  onJump: (segment: Segment) => void
  formatTime: (ms: number) => string
}

export function AnswerAssessment({ observations, segments, onJump, formatTime }: Props) {
  return (
    <section className="panel answer-assessment" aria-labelledby="assessment-title">
      <h3 id="assessment-title">Плюсы и минусы ответов</h3>
      <p className="muted">Ясность формулировок и содержание по расшифровке интервью.</p>
      <div className="assessment-grid">
        {groups.map(({ kind, title, sign }) => {
          const items = observations.filter(item => item.kind === kind)
          return (
            <div className="assessment-group" data-kind={kind} key={kind}>
              <h4><span className="assessment-sign" aria-hidden="true">{sign}</span>{title}</h4>
              {items.length === 0 ? <p className="muted">Недостаточно данных для вывода.</p> : (
                <ul>{items.map(item => (
                  <li key={item.aspect}>
                    <strong>{topics[item.aspect]}</strong>
                    <p>{item.text}</p>
                    <div className="coach-evidence">
                      {item.evidenceIds.map(id => {
                        const segment = segments.get(id)
                        if (!segment) return null
                        const label = segment.speaker === 'hr' ? 'Вопрос HR' : 'Ответ кандидата'
                        return <button className="timestamp link" type="button" key={id} onClick={() => onJump(segment)}
                          title={segment.text}>{label} · {formatTime(segment.startMs)}</button>
                      })}
                    </div>
                  </li>
                ))}</ul>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
