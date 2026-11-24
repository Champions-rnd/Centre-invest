import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Candidate, CandidateDetail, CandidateStatus, CandidateTarget, SavedInterview } from '../../shared/archive'
import type { Segment, Vacancy } from '../../shared/contracts'
import {
  archiveDownload, loadCandidate, loadCandidates, loadInterview,
  saveCandidateStatus, saveInterviewTranscript, submitInterview,
} from './api'
import { CandidateDossier } from './archive/CandidateDossier'
import { Dashboard } from './archive/Dashboard'
import { InterviewForm } from './intake/InterviewForm'
import './styles.css'
import './archive/styles.css'

type Screen =
  | { view: 'dashboard' }
  | { view: 'intake'; candidate?: CandidateDetail }
  | { view: 'dossier'; candidate: CandidateDetail; interview?: SavedInterview }

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Не удалось выполнить запрос.'
}

function App() {
  const [screen, setScreen] = useState<Screen>({ view: 'dashboard' })
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [pending, setPending] = useState('')
  const [error, setError] = useState('')
  const busy = Boolean(pending)
  const heading = screen.view === 'dashboard' ? 'archive-title' : screen.view === 'intake' ? 'intake-title'
    : screen.interview ? 'report-title' : 'dossier-title'

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

  function rememberCandidate(candidate: Candidate) {
    setCandidates(current => [...(current ?? []).filter(item => item.id !== candidate.id), candidate]
      .sort((a, b) => (b.latestAt ?? '').localeCompare(a.latestAt ?? '')))
  }

  function openCandidate(id: string) {
    void run('Открываем досье…', async () => {
      setScreen({ view: 'dossier', candidate: await loadCandidate(id) })
    })
  }

  function openInterview(candidate: CandidateDetail, id: string) {
    void run('Открываем интервью…', async () => {
      const interview = await loadInterview(id)
      setScreen({ view: 'dossier', candidate, interview })
      requestAnimationFrame(() => document.getElementById('report-title')?.focus())
    })
  }

  function upload(file: File, vacancy: Vacancy | null, target: CandidateTarget) {
    void run('Распознаём WAV и сохраняем интервью. Длинные записи могут занять несколько минут.', async () => {
      const interview = await submitInterview(file, vacancy, target)
      setScreen({ view: 'dashboard' })
      try {
        const candidate = await loadCandidate(interview.candidateId)
        rememberCandidate(candidate)
        setScreen({ view: 'dossier', candidate, interview })
      } catch {
        refresh()
        throw new Error('Интервью сохранено. Обновите архив, чтобы открыть досье.')
      }
    })
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
              onClick={() => navigate({ view: 'dashboard' })} aria-label="Центр-инвест, архив кандидатов">
              <img src={`${import.meta.env.BASE_URL}brand/centrinvest-logo.svg`} alt="" width={140} height={30} />
            </button>
            <span>HR-аналитика</span>
          </div>
          <div className="header-actions">
            <a className="action-link" href={archiveDownload()} download>Выгрузить Excel</a>
            <button disabled={busy} type="button" onClick={() => navigate({ view: 'intake' })}>+ Кандидат / WAV</button>
          </div>
        </div>
      </header>
      <main className="frame">
        {screen.view !== 'dashboard' && (
          <div className="archive-back">
            <button type="button" className="secondary" disabled={busy}
              onClick={() => navigate({ view: 'dashboard' })}>← Досье кандидатов</button>
            {screen.view === 'intake' && screen.candidate && (
              <button type="button" className="secondary" disabled={busy}
                onClick={() => navigate({ view: 'dossier', candidate: screen.candidate! })}>К досье кандидата</button>
            )}
          </div>
        )}
        {pending && <p className="panel archive-feedback" role="status">{pending}</p>}
        {error && <div className="panel archive-feedback">
          <p role="alert">{error}</p>
          {screen.view === 'dashboard' && <button type="button" className="secondary" onClick={refresh}>Обновить архив</button>}
        </div>}
        {screen.view === 'dashboard' && (candidates
          ? <Dashboard candidates={candidates} busy={busy} onOpen={openCandidate} onAdd={() => navigate({ view: 'intake' })} />
          : !error && <p className="archive-feedback" role="status">Загружаем архив…</p>)}
        {screen.view === 'intake' && <InterviewForm key={screen.candidate?.id ?? 'new'} busy={busy} candidate={screen.candidate}
          onSubmit={upload} />}
        {screen.view === 'dossier' && <CandidateDossier candidate={screen.candidate} interview={screen.interview} busy={busy}
          onAdd={() => navigate({ view: 'intake', candidate: screen.candidate })}
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
