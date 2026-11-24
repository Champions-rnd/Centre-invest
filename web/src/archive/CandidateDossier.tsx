import { candidateStatuses, type CandidateDetail, type CandidateStatus, type SavedInterview } from '../../../shared/archive'
import type { Segment } from '../../../shared/contracts'
import { archiveDownload, recordingUrl } from '../api'
import { ReportView } from '../report/ReportView'
import { formatCount, formatDate } from './format'

type Props = {
  candidate: CandidateDetail
  interview?: SavedInterview
  busy: boolean
  onAdd: () => void
  onInterview: (id: string) => void
  onStatus: (status: CandidateStatus) => void
  onTranscript: (interview: SavedInterview, transcript: Segment[]) => Promise<Segment[]>
}

export function CandidateDossier({ candidate, interview, busy, onAdd, onInterview, onStatus, onTranscript }: Props) {
  return (
    <>
      <section className="archive-intro dossier-intro" aria-labelledby="dossier-title">
        <div>
          <span className="specialty-label">{candidate.specialty}</span>
          <h1 id="dossier-title" tabIndex={-1}>{candidate.name}</h1>
          {(candidate.experience || candidate.salary) && <p className="muted">
            {[candidate.experience && `Опыт: ${candidate.experience}`, candidate.salary && `Ожидания: ${candidate.salary}`].filter(Boolean).join(' · ')}
          </p>}
          {candidate.notes && <p className="dossier-notes">{candidate.notes}</p>}
        </div>
        <div className="dossier-actions">
          <label className="sort-field">Статус досье
            <select disabled={busy} value={candidate.status} onChange={event => onStatus(event.target.value as CandidateStatus)}>
              {Object.entries(candidateStatuses).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <a className="action-link" href={archiveDownload(candidate.id)} download>Excel кандидата</a>
          <button type="button" disabled={busy} onClick={onAdd}>Добавить WAV</button>
        </div>
      </section>
      <section className="panel interview-history" aria-labelledby="history-title">
        <h2 id="history-title">История интервью</h2>
        <ul>
          {candidate.interviews.map(item => (
            <li key={item.id}>
              <button type="button" className="secondary" disabled={busy} aria-pressed={interview?.id === item.id}
                onClick={() => onInterview(item.id)}>
                <span><strong>{item.fileName}</strong><small>{formatDate(item.createdAt)}</small></span>
                <span className="muted">{formatCount(item.segmentCount, ['реплика', 'реплики', 'реплик'])}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      {interview && <ReportView key={interview.id} interviewId={interview.id} result={interview.result} audioUrl={recordingUrl(interview.id)}
        audioName={interview.fileName} onSave={transcript => onTranscript(interview, transcript)} />}
    </>
  )
}
