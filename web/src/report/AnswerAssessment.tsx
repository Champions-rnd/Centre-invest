import { vacancyCriteria, type AnswerObservation, type Finding, type InterviewResult, type Segment, type Vacancy } from '../../../shared/contracts'

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
  reportSource: InterviewResult['reportSource']
  refreshing: boolean
  refreshDisabled: boolean
  onRefresh: () => void
  status: 'loading' | 'ready' | 'error'
  segments: Map<string, Segment>
  onJump: (segment: Segment) => void
  formatTime: (ms: number) => string
}

export function AnswerAssessment({ observations, vacancy, findings, reportSource, refreshing, refreshDisabled, onRefresh, status, segments, onJump, formatTime }: Props) {
  const criteria = vacancy ? vacancyCriteria(vacancy) : []
  const byCriterion = new Map(findings.map(finding => [finding.criterionId, finding]))
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
              <h4 id={`assessment-${kind}-title`}><span className="assessment-sign" aria-hidden="true">{sign}</span>{title}</h4>
              <div className="assessment-scroll" role="region" aria-labelledby={`assessment-${kind}-title`} tabIndex={0}>
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
            </div>
          )
        })}
      </div>
      {criteria.length > 0 && <section className="assessment-coverage" aria-labelledby="assessment-coverage-title" aria-busy={refreshing}>
        <div className="history-heading">
          <div>
            <h4 id="assessment-coverage-title">Анализ критериев вакансии</h4>
            <p className="muted">{reportSource === 'chatci' ? 'Анализ критериев вакансии через ChatCI'
              : reportSource === 'rules' ? 'Предварительная проверка по ключевым словам. Выводы требуют сверки.'
                : 'Сохранённый отчёт. Обновите анализ, чтобы получить выводы по критериям через ChatCI.'}</p>
          </div>
          <button type="button" className="secondary" disabled={refreshDisabled} onClick={onRefresh}>
            {refreshing ? 'Анализируем…' : 'Обновить анализ'}
          </button>
        </div>
        <div className="criterion-scroll" role="region" aria-label="Рекомендации по критериям вакансии" tabIndex={0}>
          <ol className="criterion-findings">{criteria.map(({ id, label }) => {
            const finding = byCriterion.get(id)
            const citations = finding?.evidence ?? finding?.evidenceIds.flatMap(segmentId => {
              const segment = segments.get(segmentId)
              return segment ? [{ segmentId, quote: segment.text }] : []
            }) ?? []
            const badge = finding?.status === 'supported' ? 'Подтверждено репликой'
              : finding?.status === 'partial' ? (reportSource === 'chatci' ? 'Подтверждено частично' : 'Нужна сверка')
                : 'Недостаточно данных'
            return <li key={id} className="criterion-finding">
              <div className="criterion-heading">
                <h5>{label}</h5>
                <span className="criterion-status" data-status={finding?.status ?? 'missing'}>{badge}</span>
              </div>
              {finding && <>
                <p>{finding.conclusion}</p>
                {citations.map(({ segmentId, quote }) => {
                  const segment = segments.get(segmentId)
                  if (segment?.speaker !== 'candidate' || !segment.text.includes(quote)) return null
                  return <figure key={segmentId + quote}>
                    <blockquote>{quote}</blockquote>
                    <figcaption><button className="timestamp link" type="button" onClick={() => onJump(segment)}
                      aria-label={`Прослушать реплику с ${formatTime(segment.startMs)}`}>{formatTime(segment.startMs)}</button></figcaption>
                  </figure>
                })}
                {finding.gaps.length > 0 && <div className="criterion-followup" data-kind="clarify">
                  <h6>Что уточнить</h6>
                  <ul>{finding.gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul>
                </div>}
                {finding.nextQuestions.length > 0 && <div className="criterion-followup" data-kind="question">
                  <h6>Что спросить</h6>
                  <ul>{finding.nextQuestions.map((question, index) => <li key={index}>{question}</li>)}</ul>
                </div>}
              </>}
            </li>
          })}</ol>
        </div>
      </section>}
    </section>
  )
}
