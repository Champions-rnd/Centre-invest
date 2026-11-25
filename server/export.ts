import ExcelJS from 'exceljs'
import type { Archive } from './archive'

function formatSheet(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1)
  header.height = 24
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.alignment = { vertical: 'middle', wrapText: true }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF006B40' } }
  for (const column of sheet.columns.slice(1)) {
    column.border = { left: { style: 'thin', color: { argb: 'FFDCE8DE' } } }
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } }
}

function styleRow(row: ExcelJS.Row) {
  row.font = { size: 10, color: { argb: 'FF22342B' } }
  row.alignment = { vertical: 'top', wrapText: true }
  if (row.number % 2 === 0) {
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F7F3' } }
  }
}

export async function exportArchive(archive: Archive, candidateId?: string) {
  const candidates = candidateId ? [archive.candidate(candidateId)] : archive.listCandidates()
  const profiles = new Map(candidates.map(candidate => [candidate.id, candidate]))
  const workbook = new ExcelJS.Workbook()
  const directory = workbook.addWorksheet('Кандидаты', { views: [{ state: 'frozen', ySplit: 1 }] })
  const excerpts = workbook.addWorksheet('Расшифровки', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' },
  })

  directory.columns = [
    { header: 'ID', width: 39 }, { header: 'ФИО', width: 34 }, { header: 'Специальность', width: 31 },
  ]
  excerpts.columns = [
    { header: 'ID интервью', width: 39 }, { header: 'ФИО', width: 25 }, { header: 'Специальность', width: 21 },
    { header: 'Реплика', width: 9 }, { header: 'Часть', width: 7 }, { header: 'Роль', width: 17 },
    { header: 'Начало', width: 14 }, { header: 'Конец', width: 14 }, { header: 'Текст', width: 59 },
  ]
  formatSheet(directory)
  formatSheet(excerpts)
  excerpts.getColumn(7).numFmt = '[h]:mm:ss.000'
  excerpts.getColumn(8).numFmt = '[h]:mm:ss.000'

  for (const candidate of candidates) {
    styleRow(directory.addRow([candidate.id, candidate.name, candidate.specialty]))
  }
  for (const interview of archive.exportInterviews(candidateId)) {
    const candidate = profiles.get(interview.candidateId)!
    for (const [index, segment] of interview.result.transcript.entries()) {
      const role = segment.speaker === 'hr' ? 'HR' : segment.speaker === 'candidate' ? 'Кандидат' : 'Не определена'
      const parts = segment.text.match(/[\s\S]{1,16000}/gu) ?? ['']
      for (const [part, text] of parts.entries()) {
        styleRow(excerpts.addRow([interview.id, candidate.name, candidate.specialty, index + 1, part + 1, role,
          segment.startMs / 86_400_000, segment.endMs / 86_400_000, text]))
      }
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer())
}
