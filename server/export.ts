import ExcelJS from 'exceljs'
import { candidateStatuses } from '../shared/archive'
import type { Archive } from './archive'

export async function exportArchive(archive: Archive, candidateId?: string) {
  const candidates = candidateId ? [archive.candidate(candidateId)] : archive.listCandidates()
  const profiles = new Map(candidates.map(candidate => [candidate.id, candidate]))
  const workbook = new ExcelJS.Workbook()
  const interviews = workbook.addWorksheet('Интервью', { views: [{ state: 'frozen', ySplit: 1 }] })
  const excerpts = workbook.addWorksheet('Расшифровки', { views: [{ state: 'frozen', ySplit: 1 }] })

  interviews.columns = [
    ['ID интервью', 38], ['Кандидат', 32], ['Специальность', 27], ['Статус', 23], ['Дата записи в архиве (UTC)', 27],
    ['Последнее обновление (UTC)', 27], ['Исходный WAV', 35], ['Реплик', 10], ['Опыт', 18], ['Ожидания', 18],
    ['Заметка о кандидате', 42], ['Описание вакансии', 48], ['Темы вакансии', 42],
  ].map(([header, width]) => ({ header: String(header), width: Number(width) }))
  excerpts.columns = [
    ['ID интервью', 38], ['Кандидат', 32], ['Специальность', 27], ['Реплика', 11],
    ['Часть', 9], ['Роль', 17], ['Начало', 17], ['Конец', 17], ['Текст', 95],
  ].map(([header, width]) => ({ header: String(header), width: Number(width) }))

  for (const sheet of [interviews, excerpts]) {
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF006B40' } }
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } }
  }
  excerpts.getColumn(7).numFmt = '[h]:mm:ss.000'
  excerpts.getColumn(8).numFmt = '[h]:mm:ss.000'
  excerpts.getColumn(9).alignment = { wrapText: true, vertical: 'top' }

  for (const interview of archive.exportInterviews(candidateId)) {
    const candidate = profiles.get(interview.candidateId)!
    interviews.addRow([
      interview.id, candidate.name, candidate.specialty, candidateStatuses[candidate.status],
      interview.createdAt, interview.updatedAt, interview.fileName, interview.segmentCount,
      candidate.experience, candidate.salary, candidate.notes, interview.result.vacancy?.description ?? '',
      interview.result.vacancy?.criteria.join('\n') ?? '',
    ])
    for (const [index, segment] of interview.result.transcript.entries()) {
      const role = segment.speaker === 'hr' ? 'HR' : segment.speaker === 'candidate' ? 'Кандидат' : 'Не определена'
      const parts = segment.text.match(/[\s\S]{1,16000}/gu) ?? ['']
      for (const [part, text] of parts.entries()) {
        excerpts.addRow([interview.id, candidate.name, candidate.specialty, index + 1, part + 1, role,
          segment.startMs / 86_400_000, segment.endMs / 86_400_000, text])
      }
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer())
}
