import { useEffect, useRef } from 'react'
import type { Candidate } from '../../../shared/archive'

export function DeleteArchiveDialog({ fileName, candidate, onCancel, onConfirm }: {
  fileName?: string
  candidate: Candidate
  onCancel: () => void
  onConfirm: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const deletingCandidate = fileName === undefined
  const lastInterview = !deletingCandidate && candidate.interviewCount === 1
  const title = deletingCandidate ? 'Удалить кандидата?'
    : lastInterview ? 'Удалить интервью и личное дело?' : 'Удалить интервью?'
  const confirmLabel = deletingCandidate ? 'Удалить кандидата'
    : lastInterview ? 'Удалить вместе с кандидатом' : 'Удалить интервью'

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    const trigger = document.activeElement
    element.showModal()
    cancel.current?.focus()
    return () => {
      element.close()
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus()
    }
  }, [])

  return (
    <dialog ref={dialog} className="delete-dialog" aria-labelledby="delete-archive-title"
      aria-describedby="delete-archive-description" onCancel={event => { event.preventDefault(); onCancel() }}>
      <span className="delete-dialog-flower" aria-hidden="true">✿</span>
      <h2 id="delete-archive-title">{title}</h2>
      <div id="delete-archive-description">
        {deletingCandidate
          ? <p>Личное дело кандидата <strong>{candidate.name}</strong>, резюме и все его интервью с записями и расшифровками будут удалены.</p>
          : <p>Запись <strong>«{fileName}»</strong> и её расшифровка будут удалены.</p>}
        {lastInterview && <p>Это последнее интервью кандидата <strong>{candidate.name}</strong>. Личное дело и прикреплённое резюме тоже будут удалены. Кандидат исчезнет из таблиц и новых выгрузок Excel.</p>}
        <p className="muted">Восстановить удалённые данные из приложения нельзя.</p>
      </div>
      <div className="delete-dialog-actions">
        <button ref={cancel} className="secondary" type="button" onClick={onCancel}>Отмена</button>
        <button className="delete-confirm" type="button" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </dialog>
  )
}
