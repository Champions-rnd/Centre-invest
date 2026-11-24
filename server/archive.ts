import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { ArchiveInterview, Candidate, CandidateDetail, CandidateProfile, CandidateStatus, CandidateTarget, InterviewSummary, SavedInterview } from '../shared/archive'
import { resultSchema, type InterviewResult } from '../shared/contracts'
import { ApiError } from './errors'

type InterviewRow = Omit<SavedInterview, 'result'> & { resultJson: string }
const candidateColumns = `c.id, c.name, c.specialty, c.experience, c.salary, c.notes, c.status,
  COUNT(i.id) AS interviewCount, MAX(i.created_at) AS latestAt`
const interviewColumns = `id, file_name AS fileName, created_at AS createdAt, updated_at AS updatedAt,
  segment_count AS segmentCount`
const storedColumns = `${interviewColumns}, candidate_id AS candidateId, result_json AS resultJson`

function decodeInterview({ resultJson, ...summary }: InterviewRow): SavedInterview {
  return { ...summary, result: resultSchema.parse(JSON.parse(resultJson)) }
}

function recordingName(original: string) {
  // Browsers send UTF-8 file names in the multipart header. Multer reads that header as Latin-1.
  if (/^[\u0000-\u00ff]*$/.test(original)) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(original, 'latin1')).slice(0, 255)
    } catch {
      // Keep the name sent by clients that use Latin-1.
    }
  }
  return original.slice(0, 255)
}

export function openArchive() {
  const path = resolve(process.env.HR_DB_PATH || '.hr-data/interviews.sqlite')
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(path, { timeout: 5000 })
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS candidates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL, specialty TEXT NOT NULL,
      experience TEXT NOT NULL, salary TEXT NOT NULL, notes TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'review', 'verified'))
    ) STRICT;
    CREATE TABLE IF NOT EXISTS interviews (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL REFERENCES candidates(id),
      file_name TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      segment_count INTEGER NOT NULL, result_json TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS interviews_candidate ON interviews(candidate_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS recordings (
      interview_id TEXT PRIMARY KEY REFERENCES interviews(id),
      wav BLOB NOT NULL
    ) STRICT;
  `)

  function listCandidates(): Candidate[] {
    return db.prepare(`SELECT ${candidateColumns} FROM candidates c
      LEFT JOIN interviews i ON i.candidate_id = c.id GROUP BY c.id ORDER BY latestAt DESC, c.id`).all() as unknown as Candidate[]
  }

  function candidate(id: string): CandidateDetail {
    const row = db.prepare(`SELECT ${candidateColumns} FROM candidates c
      LEFT JOIN interviews i ON i.candidate_id = c.id WHERE c.id = ? GROUP BY c.id`).get(id) as Candidate | undefined
    if (!row) throw new ApiError(404, 'CANDIDATE_NOT_FOUND', 'Кандидат не найден.')
    const interviews = db.prepare(`SELECT ${interviewColumns} FROM interviews
      WHERE candidate_id = ? ORDER BY created_at DESC, id`).all(id) as unknown as CandidateDetail['interviews']
    return { ...row, interviews }
  }

  function interview(id: string): SavedInterview {
    const saved = findInterview(id)
    if (!saved) throw new ApiError(404, 'INTERVIEW_NOT_FOUND', 'Интервью не найдено.')
    return saved
  }

  function findInterview(id: string): SavedInterview | undefined {
    const row = db.prepare(`SELECT ${storedColumns} FROM interviews WHERE id = ?`).get(id) as InterviewRow | undefined
    if (row) return decodeInterview(row)
  }

  function insertCandidate(id: string, { name, specialty, experience, salary, notes }: CandidateProfile) {
    db.prepare(`INSERT INTO candidates (id, name, specialty, experience, salary, notes)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`).run(id, name, specialty, experience, salary, notes)
  }

  function saveInterview(target: CandidateTarget, file: Express.Multer.File, result: InterviewResult, id: string = randomUUID()): SavedInterview {
    const candidateId = 'candidateId' in target ? target.candidateId : target.newCandidateId ?? randomUUID()
    const now = new Date().toISOString()
    const fileName = recordingName(file.originalname)
    db.exec('BEGIN IMMEDIATE')
    try {
      const saved = findInterview(id)
      if (saved) {
        db.exec('COMMIT')
        return saved
      }
      if ('profile' in target) {
        insertCandidate(candidateId, target.profile)
      } else {
        candidate(candidateId)
      }
      db.prepare(`INSERT INTO interviews
        (id, candidate_id, file_name, created_at, updated_at, segment_count, result_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, candidateId, fileName, now, now, result.transcript.length, JSON.stringify(result))
      db.prepare('INSERT INTO recordings (interview_id, wav) VALUES (?, ?)').run(id, file.buffer)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return { id, candidateId, fileName, createdAt: now, updatedAt: now, segmentCount: result.transcript.length, result }
  }

  return {
    listCandidates,
    createCandidate(id: string, profile: CandidateProfile) {
      insertCandidate(id, profile)
      return candidate(id)
    },
    listInterviews(): ArchiveInterview[] {
      const candidates = new Map(listCandidates().map(profile => [profile.id, profile]))
      const rows = db.prepare(`SELECT ${interviewColumns}, candidate_id AS candidateId FROM interviews
        ORDER BY created_at DESC, id`).all() as unknown as (InterviewSummary & { candidateId: string })[]
      return rows.flatMap(({ candidateId, ...summary }) => {
        const profile = candidates.get(candidateId)
        return profile ? [{ ...summary, candidate: profile }] : []
      })
    },
    candidate,
    interview,
    findInterview,
    saveInterview,
    updateStatus(id: string, status: CandidateStatus) {
      const updated = db.prepare('UPDATE candidates SET status = ? WHERE id = ?').run(status, id)
      if (!updated.changes) throw new ApiError(404, 'CANDIDATE_NOT_FOUND', 'Кандидат не найден.')
      return candidate(id)
    },
    saveTranscript(id: string, previous: string, result: InterviewResult) {
      const now = new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString()
      const updated = db.prepare(`UPDATE interviews SET result_json = ?, segment_count = ?, updated_at = ?
        WHERE id = ? AND updated_at = ?`).run(JSON.stringify(result), result.transcript.length, now, id, previous)
      if (!updated.changes) throw new ApiError(409, 'EDIT_CONFLICT', 'Расшифровка уже изменилась. Откройте интервью заново.')
      return interview(id)
    },
    recordingSize(id: string) {
      const row = db.prepare('SELECT length(wav) AS size FROM recordings WHERE interview_id = ?').get(id)
      if (!row) throw new ApiError(404, 'AUDIO_NOT_FOUND', 'Запись не найдена.')
      return Number(row.size)
    },
    recordingBytes(id: string, start: number, length: number) {
      const row = db.prepare('SELECT substr(wav, ?, ?) AS wav FROM recordings WHERE interview_id = ?').get(start + 1, length, id)
      return Buffer.from(row?.wav as Uint8Array)
    },
    *exportInterviews(candidateId?: string) {
      const statement = db.prepare(`SELECT ${storedColumns} FROM interviews
        ${candidateId ? 'WHERE candidate_id = ?' : ''} ORDER BY created_at DESC, id`)
      const rows = candidateId ? statement.iterate(candidateId) : statement.iterate()
      for (const row of rows) yield decodeInterview(row as unknown as InterviewRow)
    },
  }
}

export type Archive = ReturnType<typeof openArchive>
