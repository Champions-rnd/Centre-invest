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

  useEffect(() => {
    if (!audioFile) {
      setAudioUrl('')
      return
    }
    const url = URL.createObjectURL(audioFile)
    setAudioUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [audioFile])

  async function run(request: () => Promise<InterviewResult>, nextAudio?: File) {
    setBusy(true)
    setError('')
    try {
      setResult(await request())
      setAudioFile(nextAudio)
      setRevision(previous => previous + 1)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Не удалось обработать запрос.')
    } finally {
      setBusy(false)
    }
  }

  function reanalyze(transcript: Segment[]) {
    if (result) void run(() => rerunAnalysis({ vacancy: result.vacancy, transcript }), audioFile)
  }

  return (
    <main>
      <header><h1>HR-аналитика интервью</h1></header>
      <InterviewForm busy={busy} onDemo={() => void run(loadDemo)}
        onSubmit={(audio, vacancy) => void run(() => submitInterview(audio, vacancy), audio)} />
      {busy && <p role="status">Обрабатываем запрос…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {result && <ReportView key={revision} result={result} audioUrl={audioUrl} busy={busy} onReanalyze={reanalyze} />}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
