import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { ArchiveInterview, CandidateDetail, CandidateStatus, SavedInterview } from '../../shared/archive'
import type { Segment } from '../../shared/contracts'
import {
  archiveDownload, loadCandidate, loadArchiveInterviews, loadInterview,
  saveCandidateStatus, saveInterviewTranscript,
} from './api'
import { CandidateDossier } from './archive/CandidateDossier'
import { Dashboard } from './archive/Dashboard'
import { InterviewForm } from './intake/InterviewForm'
import './styles.css'
import './archive/styles.css'

type Screen =
  | { view: 'dashboard' }
  | { view: 'upload' }
  | { view: 'dossier'; candidate: CandidateDetail; interview?: SavedInterview }

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Не удалось выполнить запрос.'
}

function App() {
  const [screen, setScreen] = useState<Screen>({ view: 'dashboard' })
  const [archive, setArchive] = useState<ArchiveInterview[] | null>(null)
  const [uploadCandidateId, setUploadCandidateId] = useState('')
  const [pending, setPending] = useState('')
  const [error, setError] = useState('')
  const busy = Boolean(pending)
  const heading = screen.view === 'dashboard' ? 'archive-title' : screen.view === 'upload' ? 'intake-title'
    : screen.interview ? 'report-title' : 'dossier-title'
  const uploadCandidates = [...new Map((archive ?? []).map(item => [item.candidate.id, item.candidate])).values()]

  function refresh() {
    setError('')
    void loadArchiveInterviews().then(setArchive, failure => setError(message(failure)))
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

  function rememberCandidate({ interviews, ...candidate }: CandidateDetail) {
    setArchive(current => [...(current ?? []).filter(item => item.candidate.id !== candidate.id),
      ...interviews.map(item => ({ ...item, candidate }))])
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

  function openUpload(candidateId = '') {
    setUploadCandidateId(candidateId)
    navigate({ view: 'upload' })
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
    return updated.result.transcript
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
            {screen.view !== 'dashboard' && <button className="secondary" disabled={busy} type="button"
              onClick={goHome}>На главную</button>}
            <a className="action-link" href={archiveDownload()} download>Выгрузить Excel</a>
            {screen.view !== 'upload' && <button disabled={busy} type="button" onClick={() => openUpload()}>+ Добавить кандидата</button>}
          </div>
        </div>
      </header>
      <main className="frame">
        {pending && <p className="panel archive-feedback" role="status">{pending}</p>}
        {error && <div className="panel archive-feedback">
          <p role="alert">{error}</p>
          {screen.view === 'dashboard' && <button type="button" className="secondary" onClick={refresh}>Обновить архив</button>}
        </div>}
        <div hidden={screen.view !== 'dashboard'}>{archive
          ? <Dashboard interviews={archive} busy={busy} onOpen={openCandidate} onAdd={() => openUpload()} />
          : !error && <p className="archive-feedback" role="status">Загружаем архив…</p>}</div>
        <div className="upload-screen" hidden={screen.view !== 'upload'}>
          <InterviewForm candidates={uploadCandidates} candidateId={uploadCandidateId} onCandidate={setUploadCandidateId}
            onSaved={interviewSaved} onOpen={openCandidate} />
        </div>
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
