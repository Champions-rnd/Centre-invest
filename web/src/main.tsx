import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { ArchiveInterview, Candidate, CandidateDetail, CandidateProfile, CandidateStatus, SavedInterview } from '../../shared/archive'
import type { Segment } from '../../shared/contracts'
import {
  archiveDownload, createCandidate, loadCandidate, loadCandidates, loadArchiveInterviews, loadInterview,
  saveCandidateStatus, saveInterviewTranscript, submitInterview,
} from './api'
import { CandidateDossier } from './archive/CandidateDossier'
import { CandidateDirectory } from './archive/CandidateDirectory'
import { CandidateProfileForm, type CandidateRecording } from './archive/CandidateProfileForm'
import { Dashboard } from './archive/Dashboard'
import { InterviewForm } from './intake/InterviewForm'
import './styles.css'
import './archive/styles.css'
import './workspace.css'

type Screen =
  | { view: 'candidates' }
  | { view: 'dashboard' }
  | { view: 'new-candidate' }
  | { view: 'upload'; attachTo?: string }
  | { view: 'dossier'; candidate: CandidateDetail; interview?: SavedInterview; seek?: { ms: number } }

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Не удалось выполнить запрос.'
}

function App() {
  const [screen, setScreen] = useState<Screen>({ view: 'candidates' })
  const [archive, setArchive] = useState<ArchiveInterview[] | null>(null)
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [uploadCandidateId, setUploadCandidateId] = useState('')
  const [pending, setPending] = useState('')
  const [error, setError] = useState('')
  const busy = Boolean(pending)
  const heading = screen.view === 'candidates' ? 'candidate-directory-title' : screen.view === 'dashboard' ? 'archive-title' : screen.view === 'upload' ? 'intake-title'
    : screen.view === 'new-candidate' ? 'candidate-create-title'
    : screen.interview ? 'report-title' : 'dossier-title'

  function refresh() {
    setError('')
    void Promise.all([loadArchiveInterviews(), loadCandidates()]).then(([interviews, profiles]) => {
      setArchive(interviews)
      setCandidates(profiles)
    }, failure => setError(message(failure)))
  }

  useEffect(refresh, [])

  useEffect(() => {
    document.getElementById(heading)?.focus({ preventScroll: heading !== 'report-title' })
    if (heading !== 'report-title') window.scrollTo(0, 0)
  }, [heading])

  async function run(label: string, operation: () => Promise<void>) {
    setPending(label)
    setError('')
    try {
      await operation()
    } catch (failure) {
      setError(message(failure))
    } finally {
      setPending('')
    }
  }

  function navigate(next: Screen) {
    setError('')
    setScreen(next)
  }

  function goHome() {
    navigate({ view: 'candidates' })
    if (screen.view === 'candidates') {
      document.getElementById('candidate-directory-title')?.focus({ preventScroll: true })
      window.scrollTo(0, 0)
    }
  }

  function rememberCandidate({ interviews, ...candidate }: CandidateDetail) {
    setArchive(current => [...(current ?? []).filter(item => item.candidate.id !== candidate.id),
      ...interviews.map(item => ({ ...item, candidate }))])
    setCandidates(current => [...(current ?? []).filter(item => item.id !== candidate.id), candidate]
      .sort((a, b) => a.name.localeCompare(b.name, 'ru')))
  }

  function saveCandidate(id: string, profile: CandidateProfile, recording?: CandidateRecording) {
    if (busy) return
    void run(recording ? 'Загружаем WAV…' : 'Сохраняем карточку…', async () => {
      const interview = recording && await submitInterview(recording.file, null, { profile, newCandidateId: id }, recording.uploadId,
        percent => setPending(percent === null ? 'Распознаём интервью…' : `Загружаем WAV · ${percent}%`))
      const candidate = interview ? await loadCandidate(interview.candidateId) : await createCandidate(id, profile)
      rememberCandidate(candidate)
      setScreen({ view: 'dossier', candidate, interview })
    })
  }

  function openCandidate(id: string, interviewId?: string) {
    if (busy) return
    void run(interviewId ? 'Открываем интервью…' : 'Открываем личное дело…', async () => {
      const [candidate, interview] = await Promise.all([loadCandidate(id), interviewId && loadInterview(interviewId)])
      setScreen({ view: 'dossier', candidate, interview: interview || undefined })
    })
  }

  function openInterview(candidate: CandidateDetail, id: string, startMs?: number) {
    void run('Открываем интервью…', async () => {
      const interview = await loadInterview(id)
      setScreen({ view: 'dossier', candidate, interview, seek: startMs === undefined ? undefined : { ms: startMs } })
      requestAnimationFrame(() => document.getElementById('report-title')?.focus())
    })
  }

  function openUpload(candidateId = '') {
    setUploadCandidateId(candidateId)
    navigate({ view: 'upload', attachTo: candidateId || undefined })
  }

  async function interviewSaved(interview: SavedInterview) {
    try {
      const candidate = await loadCandidate(interview.candidateId)
      rememberCandidate(candidate)
      setScreen(current => current.view === 'dossier' && current.candidate.id === candidate.id ? { ...current, candidate } : current)
    } catch {
      refresh()
    }
  }

  function updateStatus(candidate: CandidateDetail, status: CandidateStatus) {
    void run('Сохраняем статус…', async () => {
      const next = await saveCandidateStatus(candidate.id, status)
      rememberCandidate(next)
      setScreen(current => current.view === 'dossier' && current.candidate.id === next.id ? { ...current, candidate: next } : current)
    })
  }

  async function updateTranscript(interview: SavedInterview, transcript: Segment[]) {
    const updated = await saveInterviewTranscript(interview, transcript)
    setScreen(current => current.view === 'dossier' && current.candidate.id === updated.candidateId ? {
      ...current,
      interview: current.interview?.id === updated.id ? updated : current.interview,
      candidate: {
        ...current.candidate,
        interviews: current.candidate.interviews.map(item => item.id === updated.id
          ? { ...item, updatedAt: updated.updatedAt } : item),
      },
    } : current)
    return updated.result.transcript
  }

  return (
    <div className="studio">
      <aside className="studio-sidebar">
        <button type="button" className="studio-brand" disabled={busy} onClick={goHome}>
          <img src={`${import.meta.env.BASE_URL}brand/centrinvest-logo.svg`} alt="Банк Центр-инвест" width={140} height={30} />
          <span>HR-аналитика</span>
        </button>
        <nav className="studio-navigation" aria-label="Основное меню">
          <button type="button" disabled={busy} onClick={goHome} aria-current={screen.view === 'candidates' ? 'page' : undefined}>Кандидаты</button>
          <button type="button" disabled={busy} onClick={() => navigate({ view: 'dashboard' })}
            aria-current={screen.view === 'dashboard' ? 'page' : undefined}>Интервью</button>
        </nav>
        <a className="studio-link" href="https://www.centrinvest.ru/">Сайт банка «Центр-инвест»</a>
      </aside>
      <div className="studio-content">
        <header className="studio-bar">
          <div className="studio-context">
            {(screen.view === 'new-candidate' || screen.view === 'dossier') &&
              <button className="secondary" type="button" disabled={busy} onClick={goHome}>← К списку кандидатов</button>}
            {(screen.view === 'candidates' || screen.view === 'dashboard' || screen.view === 'upload') &&
              <span>Подбор персонала</span>}
          </div>
          {(screen.view === 'candidates' || screen.view === 'dashboard') &&
            <a className="action-link" href={archiveDownload()} download>Экспорт Excel</a>}
        </header>
        <main className="frame">
          {pending && <p className="panel archive-feedback" role="status">{pending}</p>}
          {error && <div className="panel archive-feedback">
            <p role="alert">{error}</p>
            {(screen.view === 'dashboard' || screen.view === 'candidates') && (!archive || !candidates) &&
              <button type="button" className="secondary" onClick={refresh}>Обновить архив</button>}
          </div>}
          <div hidden={screen.view !== 'candidates'}>{candidates
            ? <CandidateDirectory candidates={candidates} busy={busy} onOpen={openCandidate} onAdd={() => navigate({ view: 'new-candidate' })} />
            : !error && <p role="status">Загружаем кандидатов…</p>}</div>
          <div hidden={screen.view !== 'dashboard'}>{archive
            ? <Dashboard interviews={archive} busy={busy} onOpen={openCandidate} onAdd={() => navigate({ view: 'new-candidate' })} />
            : !error && <p className="archive-feedback" role="status">Загружаем архив…</p>}</div>
          <div className="upload-screen" hidden={screen.view !== 'upload'}>
            <InterviewForm candidates={candidates ?? []} candidateId={uploadCandidateId}
              attachTo={screen.view === 'upload' ? screen.attachTo : undefined} onCandidate={setUploadCandidateId}
              onSaved={interviewSaved} onOpen={openCandidate} />
          </div>
          {screen.view === 'new-candidate' && <CandidateProfileForm busy={busy} onSave={saveCandidate} />}
          {screen.view === 'dossier' && <CandidateDossier candidate={screen.candidate} interview={screen.interview}
            seek={screen.seek} busy={busy}
            onAdd={() => openUpload(screen.candidate.id)}
            onInterview={(id, startMs) => openInterview(screen.candidate, id, startMs)}
            onStatus={status => updateStatus(screen.candidate, status)}
            onTranscript={updateTranscript} />}
        </main>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
