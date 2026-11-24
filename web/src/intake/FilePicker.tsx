import { useState, type ReactNode } from 'react'

export function FilePicker({ id, label, help, accept, multiple, disabled, onFiles, children }: {
  id: string
  label: string
  help: string
  accept: string
  multiple?: boolean
  disabled?: boolean
  onFiles: (files: File[]) => void
  children?: ReactNode
}) {
  const [dragging, setDragging] = useState(false)

  function select(files: FileList | null) {
    if (!disabled && files?.length) onFiles(Array.from(files))
  }

  return (
    <div className={dragging ? 'candidate-file-import dragging' : 'candidate-file-import'}
      onDragOver={event => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        event.dataTransfer.dropEffect = disabled ? 'none' : 'copy'
        if (!disabled) setDragging(true)
      }}
      onDragLeave={event => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false)
      }}
      onDrop={event => {
        event.preventDefault()
        setDragging(false)
        select(event.dataTransfer.files)
      }}>
      <label htmlFor={id}>{label}</label>
      <p className="muted" id={id + '-help'}>{help}</p>
      <input id={id} type="file" accept={accept} multiple={multiple} disabled={disabled} aria-describedby={id + '-help'}
        onChange={event => {
          select(event.currentTarget.files)
          event.currentTarget.value = ''
        }} />
      {children}
    </div>
  )
}
