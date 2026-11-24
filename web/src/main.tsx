import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { InterviewResult, Vacancy } from '../../shared/contracts'
import { submitInterview } from './api'
import { InterviewForm } from './intake/InterviewForm'
import { ReportView } from './report/ReportView'
import './styles.css'

function App() {
  const [interview, setInterview] = useState<{ result: InterviewResult; name: string; url: string }>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!interview) return
    document.getElementById('report-title')?.focus()
    return () => URL.revokeObjectURL(interview.url)
  }, [interview])

  async function loadInterview(file: File, vacancy: Vacancy | null) {
    setBusy(true)
    setError('')
    try {
      const result = await submitInterview(file, vacancy)
      setInterview({ result, name: file.name, url: URL.createObjectURL(file) })
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Не удалось обработать запись.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <header className="site-header">
        <div className="frame header-inner">
          <a className="brand" href="#top" aria-label="Банк Центр-инвест, начало страницы">
            <img src={`${import.meta.env.BASE_URL}brand/centrinvest-logo.svg`} alt="" width={140} height={30} />
          </a>
          {interview && <nav aria-label="Разделы страницы">
            <a href="#intake">Новый разбор</a>
            <a href="#report-title">Расшифровка</a>
          </nav>}
        </div>
      </header>
      <main id="top" className="frame">
        <InterviewForm busy={busy} onSubmit={(audio, vacancy) => void loadInterview(audio, vacancy)} />
        {busy && <p role="status">Распознаём запись. Длинные файлы могут занять несколько минут.</p>}
        {error && <p className="error" role="alert">{error}</p>}
        {interview && <ReportView key={interview.url} result={interview.result}
          audioUrl={interview.url} audioName={interview.name} />}
      </main>
      <footer className="site-footer">
        <div className="frame footer-inner">
          <a href="https://www.centrinvest.ru/">Сайт банка «Центр-инвест»</a>
        </div>
      </footer>
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
