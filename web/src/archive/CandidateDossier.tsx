import { SelectField } from '../ui/SelectField'
import { useState } from 'react'
import { candidateStatuses, type Candidate, type CandidateDetail, type CandidateStatus, type SavedInterview } from '../../../shared/archive'
import type { Segment } from '../../../shared/contracts'
import { archiveDownload, recordingUrl, resumeUrl, saveCandidateResume } from '../api'
import { FilePicker } from '../intake/FilePicker'
import { readResume } from './resumeFile'
import { ReportView } from '../report/ReportView'
import { formatCount, formatDate } from './format'
import { InterviewSort, sortInterviews, type InterviewOrder } from './InterviewSort'
import { CandidateOverview } from './CandidateOverview'

type Props = {
  candidate: CandidateDetail
  interview?: SavedInterview
  seek?: { ms: number }
  busy: boolean
  onAdd: () => void
  onDelete: (id: string, fileName: string, candidate: Candidate) => void
  onInterview: (id: string, startMs?: number) => void
  onStatus: (status: CandidateStatus) => void
  onResume: (candidate: CandidateDetail) => void
  onTranscript: (interview: SavedInterview, transcript: Segment[]) => Promise<Segment[]>
}

export function CandidateDossier({ candidate, interview, seek, busy, onAdd, onInterview, onStatus, onResume, onTranscript, onDelete }: Props) {
  const [sort, setSort] = useState<InterviewOrder>('recent')
  const [uploadingResume, setUploadingResume] = useState(false)
  const [resumeError, setResumeError] = useState('')

  async function attachResume(file: File) {
    setUploadingResume(true)
    setResumeError('')
    try {
      onResume(await saveCandidateResume(candidate.id, await readResume(file)))
    } catch (error) {
      setResumeError(error instanceof Error ? error.message : 'Не удалось прикрепить резюме.')
    } finally {
      setUploadingResume(false)
    }
  }
  return (
    <>
      <section className="archive-intro dossier-intro" aria-labelledby="dossier-title">
        <div>
          <p className="muted">Личное дело</p>
          <span className="specialty-label">{candidate.specialty}</span>
          <h1 id="dossier-title" tabIndex={-1}>{candidate.name}</h1>
        </div>
        <div className="dossier-actions">
          <SelectField label="Статус личного дела" className="sort-field" disabled={busy} value={candidate.status}
            onChange={value => onStatus(value as CandidateStatus)}
            options={Object.entries(candidateStatuses).map(([value, label]) => ({ value, label }))} />
          {candidate.interviews.length > 0 && <a className="action-link" href={archiveDownload(candidate.id)} download>Excel кандидата</a>}
          <button type="button" disabled={busy} onClick={onAdd}>Загрузить интервью</button>
        </div>
      </section>
      <section className="panel dossier-resume" aria-label="Резюме кандидата">
        <FilePicker id="dossier-resume" label={candidate.resumeName ? 'Заменить резюме' : 'Добавить резюме'}
          help="TXT · до 128 КБ" accept=".txt,text/plain" disabled={busy || uploadingResume} onFiles={([file]) => void attachResume(file)}>
          {uploadingResume && <p role="status">Сохраняем резюме…</p>}
          {candidate.resumeName && <div className="picker-selection">
            <p className="selected-file-name">{candidate.resumeName}</p>
            <a className="action-link" href={resumeUrl(candidate.id)} download={candidate.resumeName}>Скачать резюме</a>
          </div>}
          {resumeError && <p className="error" role="alert">{resumeError}</p>}
        </FilePicker>
      </section>
      <section className="panel interview-history" aria-labelledby="history-title">
        <div className="history-heading">
          <h2 id="history-title">История интервью</h2>
          {candidate.interviews.length > 1 && <InterviewSort value={sort} onChange={setSort} />}
        </div>
        {candidate.interviews.length ? <ul>
          {sortInterviews(candidate.interviews, sort).map(item => (
            <li key={item.id} className="interview-history-row">
              <button type="button" className="secondary" disabled={busy} aria-pressed={interview?.id === item.id}
                onClick={() => onInterview(item.id)}>
                <span><strong>{item.fileName}</strong><small>{formatDate(item.createdAt)}</small></span>
                <span className="muted">{formatCount(item.segmentCount, ['реплика', 'реплики', 'реплик'])}</span>
              </button>
              <button className="secondary interview-delete" type="button" disabled={busy}
                aria-label={`Удалить интервью: ${item.fileName}`} title="Удалить интервью"
                onClick={() => onDelete(item.id, item.fileName, candidate)}>×</button>
            </li>
          ))}
        </ul> : <p className="muted">К этому кандидату пока не прикреплено ни одного интервью.</p>}
      </section>
      {candidate.interviews.length > 0 && <CandidateOverview
        key={candidate.interviews.map(item => item.id + item.updatedAt).join(';')} id={candidate.id}
        busy={busy} openInterview={onInterview} />}
      {interview && <ReportView key={interview.id} interviewId={interview.id} result={interview.result} audioUrl={recordingUrl(interview.id)}
        audioName={interview.fileName} seek={seek} onSave={transcript => onTranscript(interview, transcript)} />}
    </>
  )
}
