import { vacancyCriteria, type AnswerObservation, type Finding, type Segment, type Vacancy } from '../../../shared/contracts'

const topics: Record<AnswerObservation['aspect'], string> = {
  clarity: 'Ясность речи', relevance: 'Ответ по существу', detail: 'Конкретика', outcome: 'Результат',
  fillers: 'Слова-паразиты', pauses: 'Паузы в речи', vacancy: 'Критерии вакансии',
}
const groups = [
  { kind: 'strength', title: 'Сильные стороны', sign: '+' },
  { kind: 'improvement', title: 'Слабые стороны', sign: '−' },
] as const

type Props = {
  observations: AnswerObservation[]
  vacancy: Vacancy | null
  findings: Finding[]
  status: 'loading' | 'ready' | 'error'
  segments: Map<string, Segment>
  onJump: (segment: Segment) => void
  formatTime: (ms: number) => string
}

export function AnswerAssessment({ observations, vacancy, findings, status, segments, onJump, formatTime }: Props) {
  const criteria = vacancy ? vacancyCriteria(vacancy) : []
  const unchecked = criteria.filter(criterion => !findings.some(finding => finding.criterionId === criterion.id && finding.status === 'supported'))
  return (
    <section className="panel answer-assessment" aria-labelledby="assessment-title">
      <h3 id="assessment-title">Оценка ответов</h3>
      <div className="assessment-grid">
        {groups.map(({ kind, title, sign }) => {
          const items = observations.filter(item => item.kind === kind)
          const emptyMessage = status === 'loading' ? 'Разбираем ответы…'
            : status === 'error' ? 'Оценка ответов недоступна.'
            : kind === 'improvement' ? 'В разобранных ответах нет подтверждённых пробелов.' : 'Недостаточно данных для вывода.'
          return (
            <div className="assessment-group" data-kind={kind} key={kind}>
              <h4><span className="assessment-sign" aria-hidden="true">{sign}</span>{title}</h4>
              {items.length === 0 ? <p className="muted">{emptyMessage}</p> : (
                <ul>{items.map(item => (
                  <li key={item.aspect}>
                    <strong>{topics[item.aspect]}</strong>
                    <p>{item.text}</p>
                    {kind === 'strength' && item.evidenceIds.some(id => segments.get(id)?.speaker === 'candidate') &&
                      <div className="assessment-examples">
                        {item.evidenceIds.flatMap(id => {
                          const segment = segments.get(id)
                          if (segment?.speaker !== 'candidate') return []
                          const excerpt = segment.text.trim()
                          return <blockquote key={id}>{excerpt.length > 190 ? excerpt.slice(0, 190).trimEnd() + '…' : excerpt}</blockquote>
                        })}
                      </div>}
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
      {unchecked.length > 0 && <section className="assessment-coverage" aria-labelledby="assessment-coverage-title">
        <h4 id="assessment-coverage-title">Рекомендация ИИ</h4>
        <ul>{unchecked.map(({ id, label }) => {
          const finding = findings.find(item => item.criterionId === id)
          const evidence = finding?.evidenceIds.flatMap(evidenceId => {
            const segment = segments.get(evidenceId)
            return segment?.speaker === 'candidate' ? [segment] : []
          }) ?? []
          return <li key={id}>
            <strong>{label}</strong>
            <span className="muted"> · {evidence.length ? 'Есть совпадения в ответах, нужна сверка' : 'Не проверено'}</span>
            {evidence.map(segment => <button className="timestamp link" type="button" key={segment.id} onClick={() => onJump(segment)}
              title={segment.text}>{formatTime(segment.startMs)}</button>)}
          </li>
        })}</ul>
      </section>}
    </section>
  )
}
