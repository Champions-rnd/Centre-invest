import { resumeSchema, MAX_RESUME_BYTES } from '../../../shared/archive'
import { candidateText } from './candidateText'

export async function readResume(file: File) {
  if (!/\.txt$/iu.test(file.name) || file.name.length > 255 || file.size > MAX_RESUME_BYTES) {
    throw new Error('Выберите резюме TXT размером до 128 КБ.')
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  candidateText(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return resumeSchema.parse({ fileName: file.name, base64: btoa(binary) })
}
