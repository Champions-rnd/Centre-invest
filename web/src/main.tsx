import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Candidate, CandidateDetail, CandidateStatus, SavedInterview } from '../../shared/archive'
import type { Segment } from '../../shared/contracts'
import {
  archiveDownload, loadCandidate, loadCandidates, loadInterview,
  saveCandidateStatus, saveInterviewTranscript,
} from './api'
import { CandidateDossier } from './archive/CandidateDossier'
import { Dashboard } from './archive/Dashboard'
import { InterviewForm } from './intake/InterviewForm'
import './styles.css'
import './archive/styles.css'

type Screen =
  | { view: 'dashboard' }
  | { view: 'dossier'; candidate: CandidateDetail; interview?: SavedInterview }

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Не удалось выполнить запрос.'
}

function App() {
  const [screen, setScreen] = useState<Screen>({ view: 'dashboard' })
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [uploadCandidateId, setUploadCandidateId] = useState('')
  const [pending, setPending] = useState('')
  const [error, setError] = useState('')
  const busy = Boolean(pending)
  const heading = screen.view === 'dashboard' ? 'archive-title' : screen.interview ? 'report-title' : 'dossier-title'

  function refresh() {
    setError('')
    void loadCandidates().then(setCandidates, failure => setError(message(failure)))
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
    navigate({ view: 'dashboard' })
    if (screen.view === 'dashboard') {
      document.getElementById('archive-title')?.focus({ preventScroll: true })
      window.scrollTo(0, 0)
    }
  }

  function rememberCandidate(candidate: Candidate) {
    setCandidates(current => [...(current ?? []).filter(item => item.id !== candidate.id), candidate]
      .sort((a, b) => (b.latestAt ?? '').localeCompare(a.latestAt ?? '')))
  }

  function openCandidate(id: string, interviewId?: string) {
    if (busy) return
    void run(interviewId ? 'Открываем интервью…' : 'Открываем досье…', async () => {
      const [candidate, interview] = await Promise.all([loadCandidate(id), interviewId && loadInterview(interviewId)])
      setScreen({ view: 'dossier', candidate, interview: interview || undefined })
    })
  }

  function openInterview(candidate: CandidateDetail, id: string) {
    void run('Открываем интервью…', async () => {
      const interview = await loadInterview(id)
      setScreen({ view: 'dossier', candidate, interview })
      requestAnimationFrame(() => document.getElementById('report-title')?.focus())
    })
  }

  function openUpload(candidateId?: string) {
    if (candidateId !== undefined) setUploadCandidateId(candidateId)
    navigate({ view: 'dashboard' })
    requestAnimationFrame(() => document.getElementById('intake-title')?.focus())
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
    setScreen(current => current.view === 'dossier' && current.interview?.id === updated.id ? { ...current, interview: updated } : current)
  }

  return (
    <>
      <header className="site-header">
        <div className="frame header-inner">
          <div className="archive-brand">
            <button className="brand brand-button" type="button" disabled={busy}
              onClick={goHome} aria-label="Центр-инвест, архив кандидатов">
              <img src={`${import.meta.env.BASE_URL}brand/centrinvest-logo.svg`} alt="" width={140} height={30} />
            </button>
            <span>HR-аналитика</span>
          </div>
          <div className="header-actions">
            <button className="secondary" disabled={busy} type="button"
              onClick={goHome}>На главную</button>
            <a className="action-link" href={archiveDownload()} download>Выгрузить Excel</a>
            <button disabled={busy} type="button" onClick={() => openUpload()}>+ Кандидат / WAV</button>
          </div>
        </div>
      </header>
      <main className="frame">
        {pending && <p className="panel archive-feedback" role="status">{pending}</p>}
        {error && <div className="panel archive-feedback">
          <p role="alert">{error}</p>
          {screen.view === 'dashboard' && <button type="button" className="secondary" onClick={refresh}>Обновить архив</button>}
        </div>}
        <div hidden={screen.view !== 'dashboard'}>{candidates
          ? <Dashboard candidates={candidates} busy={busy} onOpen={openCandidate} onAdd={() => openUpload()}>
            <InterviewForm candidates={candidates} candidateId={uploadCandidateId} onCandidate={setUploadCandidateId}
              onSaved={interviewSaved} onOpen={openCandidate} />
          </Dashboard>
          : !error && <p className="archive-feedback" role="status">Загружаем архив…</p>}</div>
        {screen.view === 'dossier' && <CandidateDossier candidate={screen.candidate} interview={screen.interview} busy={busy}
          onAdd={() => openUpload(screen.candidate.id)}
          onInterview={id => openInterview(screen.candidate, id)}
          onStatus={status => updateStatus(screen.candidate, status)}
          onTranscript={updateTranscript} />}
      </main>
      <footer className="site-footer">
        <div className="frame footer-inner">
          <span>HR-аналитика интервью</span><a href="https://www.centrinvest.ru/">Сайт банка «Центр-инвест»</a>
        </div>
      </footer>
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
