import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { InterviewResult, Segment } from '../../shared/contracts'
import { loadDemo, rerunAnalysis, submitInterview } from './api'
import { InterviewForm } from './intake/InterviewForm'
import { ReportView } from './report/ReportView'
import './styles.css'

function App() {
  const [result, setResult] = useState<InterviewResult>()
  const [audioFile, setAudioFile] = useState<File>()
  const [audioUrl, setAudioUrl] = useState('')
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revealReport, setRevealReport] = useState(false)

  useEffect(() => {
    if (!audioFile) {
      setAudioUrl('')
      return
    }
    const url = URL.createObjectURL(audioFile)
    setAudioUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [audioFile])

  useEffect(() => {
    if (revealReport) document.getElementById('report-title')?.focus()
  }, [revision, revealReport])

  async function run(request: () => Promise<InterviewResult>, nextAudio?: File, reveal = true) {
    setBusy(true)
    setError('')
    try {
      setResult(await request())
      setAudioFile(nextAudio)
      setRevealReport(reveal)
      setRevision(previous => previous + 1)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Не удалось обработать запрос.')
    } finally {
      setBusy(false)
    }
  }

  function reanalyze(transcript: Segment[]) {
    if (result) void run(() => rerunAnalysis({ vacancy: result.vacancy, transcript }), audioFile, false)
  }

  function openDemo() {
    void run(loadDemo)
  }

  return (
    <>
      <header className="site-header">
        <div className="frame header-inner">
          <a className="brand" href="#top" aria-label="Банк Центр-инвест, начало страницы">
            <img src={`${import.meta.env.BASE_URL}brand/centrinvest-logo.svg`} alt="" width={140} height={30} />
          </a>
          <nav aria-label="Разделы страницы">
            <a href="#intake">Новый разбор</a>
            {result && <a href="#report-title">Отчёт</a>}
          </nav>
          <span className="prototype">Учебный прототип</span>
        </div>
      </header>
      <main id="top" className="frame">
        <section className="hero" aria-labelledby="headline">
          <div className="hero-content">
            <p className="eyebrow">Кейс-чемпионат ЮФУ · Кейс 11</p>
            <h1 id="headline">HR-аналитика<br />интервью</h1>
            <p className="hero-text">Сопоставьте реплики с критериями вакансии и подготовьте вопросы для следующей встречи.</p>
            <button type="button" disabled={busy} onClick={openDemo}>Открыть демоотчёт</button>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="orbit" /><div className="orbit orbit-two" />
            <div className="visual-card back-card" />
            <div className="visual-card recording-card">
              <div className="recording-top"><span className="record-symbol">●</span><span>Запись интервью</span><span className="record-duration">03:00</span></div>
              <div className="wave">
                {[24, 43, 64, 42, 76, 96, 57, 34, 51, 85, 63, 35, 55, 73, 45, 25].map((height, index) =>
                  <i key={index} style={{ height: `${height}%` }} />)}
              </div>
              <div className="recording-bottom"><span>00:00</span><span>01:30</span><span>03:00</span></div>
            </div>
            <div className="visual-card note-card"><span className="note-icon">✓</span><span><strong>Карта вакансии</strong><small>4 критерия</small></span></div>
          </div>
        </section>
        <InterviewForm busy={busy} onDemo={openDemo}
          onSubmit={(audio, vacancy) => void run(() => submitInterview(audio, vacancy), audio)} />
        {busy && <p role="status">Обрабатываем запрос…</p>}
        {error && <p className="error" role="alert">{error}</p>}
        {result && <ReportView key={revision} result={result}
          audioUrl={result.mode === 'demo' ? `${import.meta.env.BASE_URL}demo/interview.wav` : audioUrl}
          busy={busy} onReanalyze={reanalyze} />}
      </main>
      <footer className="site-footer">
        <div className="frame footer-inner">
          <span>HR-аналитика · Кейс-чемпионат ЮФУ</span>
          <a href="https://www.centrinvest.ru/">Сайт банка «Центр-инвест»</a>
        </div>
      </footer>
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
