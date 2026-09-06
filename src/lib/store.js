import { uid } from './util.js'

export const STORAGE_KEY = 'ox-wrongnote-v1'
export const SESSION_KEY = 'ox-wrongnote-session-v1'
export const SCHEMA_VERSION = 2

/**
 * 시험(노트)별로 문제·과목·풀이기록이 완전히 분리된다.
 * 최상위 상태는 시험 목록만 들고 있고, 화면은 항상 활성 시험 하나만 본다.
 */

/**
 * v1(단일 노트) 데이터를 옮겨 담을 때 쓰는 고정 id.
 * 기기마다 랜덤 id로 옮기면 동기화할 때 같은 노트가 둘로 갈라지므로 반드시 고정값이어야 한다.
 */
export const DEFAULT_EXAM_ID = 'exam_default'
export const DEFAULT_EXAM_NAME = '경찰공무원 필기시험'
export const DEFAULT_EXAM_DATE = '2026-09-05'
export const DEFAULT_SUBJECTS = ['정보보호론', '시스템네트워크보안', '디지털포렌식']

/** 새로 만든 시험의 기본 과목 */
export const NEW_EXAM_SUBJECTS = ['미분류']

const EPOCH = new Date(0).toISOString()

/**
 * 학습 로그 보관 정책 (localStorage 용량 방어).
 * 동기화 시 통계를 로그에서 다시 계산하므로, 시험 준비 기간을 넉넉히 덮도록 잡았다.
 * 1건당 약 45바이트 → 10,000건이라도 450KB 수준.
 */
const LOG_MAX = 10000
const LOG_MAX_DAYS = 200

/** 삭제 기록 보관 기간 — 이보다 오래된 tombstone은 정리 */
const TOMBSTONE_DAYS = 90

/* ---------- 시험(노트) ---------- */

export function makeExam(patch = {}) {
  const now = new Date().toISOString()
  return normalizeExam({
    id: patch.id || uid('exam'),
    name: patch.name || '새 시험',
    examDate: patch.examDate || '',
    metaUpdatedAt: now,
    createdAt: now,
    subjects: patch.subjects?.length ? patch.subjects : NEW_EXAM_SUBJECTS,
    subjectsUpdatedAt: now,
  })
}

/**
 * 최초 실행 / v1 마이그레이션에 쓰이는 기본 노트.
 * 시각을 epoch로 두어, 다른 기기에서 이름·시험일을 이미 바꿨다면 그쪽이 항상 이긴다.
 */
export function defaultExam() {
  return normalizeExam({
    id: DEFAULT_EXAM_ID,
    name: DEFAULT_EXAM_NAME,
    examDate: DEFAULT_EXAM_DATE,
    metaUpdatedAt: EPOCH,
    createdAt: EPOCH,
    subjects: DEFAULT_SUBJECTS,
    subjectsUpdatedAt: EPOCH,
  })
}

export function emptyState() {
  const exam = defaultExam()
  return {
    version: SCHEMA_VERSION,
    activeExamId: exam.id,
    exams: [exam],
    deletedExams: {}, // { [examId]: 삭제시각ISO }
    lastBackupAt: null,
  }
}

/** 저장된 문제를 항상 완전한 형태로 보정 (구버전 데이터 마이그레이션 겸용) */
export function normalizeProblem(raw) {
  const choices = Array.isArray(raw.choices) ? raw.choices.slice(0, 4) : []
  while (choices.length < 4) choices.push('')
  return {
    id: raw.id || uid(),
    subject: raw.subject || '기타',
    question: raw.question || '',
    choices,
    answer: Number.isInteger(raw.answer) && raw.answer >= 0 && raw.answer <= 3 ? raw.answer : 0,
    explanation: raw.explanation || '',
    source: raw.source || '',
    imageId: raw.imageId || null,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
    attempts: Number(raw.attempts) || 0,
    correctCount: Number(raw.correctCount) || 0,
    streak: Number(raw.streak) || 0,
    lastAttemptedAt: raw.lastAttemptedAt || null,
    lastResult: typeof raw.lastResult === 'boolean' ? raw.lastResult : null,
  }
}

export function normalizeExam(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const problems = Array.isArray(src.problems) ? src.problems.map(normalizeProblem) : []
  let subjects = Array.isArray(src.subjects) && src.subjects.length ? [...src.subjects] : [...NEW_EXAM_SUBJECTS]
  // 문제에만 존재하는 과목도 목록에 포함시킨다 (가져오기 후 유실 방지)
  for (const p of problems) if (!subjects.includes(p.subject)) subjects.push(p.subject)
  const logs = Array.isArray(src.logs)
    ? src.logs.filter((l) => l && typeof l.t === 'number').map((l) => ({ t: l.t, id: l.id, ok: !!l.ok }))
    : []
  return {
    id: src.id || uid('exam'),
    name: src.name || '새 시험',
    examDate: typeof src.examDate === 'string' ? src.examDate : '',
    metaUpdatedAt: src.metaUpdatedAt || EPOCH,
    createdAt: src.createdAt || new Date().toISOString(),
    subjects,
    subjectsUpdatedAt: src.subjectsUpdatedAt || EPOCH,
    problems,
    logs: pruneLogs(logs),
    deleted: pruneTombstones(src.deleted),
  }
}

/** 어떤 형태의 데이터든 현재 스키마로 보정한다 (v1 단일 노트 → 기본 시험으로 이관) */
export function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return emptyState()

  let list
  if (Array.isArray(raw.exams)) {
    list = raw.exams.map(normalizeExam)
  } else if (Array.isArray(raw.problems)) {
    // v1 데이터 — 통째로 기본 시험에 담는다
    list = [
      normalizeExam({
        id: DEFAULT_EXAM_ID,
        name: DEFAULT_EXAM_NAME,
        examDate: DEFAULT_EXAM_DATE,
        metaUpdatedAt: EPOCH,
        createdAt: EPOCH,
        subjects: raw.subjects,
        subjectsUpdatedAt: raw.subjectsUpdatedAt,
        problems: raw.problems,
        logs: raw.logs,
        deleted: raw.deleted,
      }),
    ]
  } else {
    list = []
  }

  // id 중복 제거 (손상된 파일 방어)
  const byId = new Map()
  for (const e of list) if (!byId.has(e.id)) byId.set(e.id, e)
  let exams = sortExams([...byId.values()])
  if (!exams.length) exams = [defaultExam()]

  const activeExamId = exams.some((e) => e.id === raw.activeExamId) ? raw.activeExamId : exams[0].id

  return {
    version: SCHEMA_VERSION,
    activeExamId,
    exams,
    deletedExams: pruneTombstones(raw.deletedExams),
    lastBackupAt: raw.lastBackupAt || null,
  }
}

/** 만든 순서 고정 — 기기가 달라도 탭 순서가 같도록 */
function sortExams(exams) {
  return [...exams].sort((a, b) => {
    const d = new Date(a.createdAt) - new Date(b.createdAt)
    return d || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  })
}

export function activeExam(state) {
  return state.exams.find((e) => e.id === state.activeExamId) || state.exams[0] || null
}

/** 시험 하나만 바꾼 새 상태 */
export function updateExamIn(state, examId, fn) {
  return { ...state, exams: state.exams.map((e) => (e.id === examId ? fn(e) : e)) }
}

export function pruneLogs(logs) {
  const cutoff = Date.now() - LOG_MAX_DAYS * 86400000
  const recent = logs.filter((l) => l.t >= cutoff)
  return recent.length > LOG_MAX ? recent.slice(recent.length - LOG_MAX) : recent
}

export function pruneTombstones(deleted) {
  if (!deleted || typeof deleted !== 'object') return {}
  const cutoff = Date.now() - TOMBSTONE_DAYS * 86400000
  const out = {}
  for (const [id, iso] of Object.entries(deleted)) {
    const t = new Date(iso).getTime()
    if (!Number.isNaN(t) && t >= cutoff) out[id] = iso
  }
  return out
}

/**
 * 학습 로그로부터 문제별 통계를 다시 계산한다.
 * 두 기기에서 각각 퀴즈를 풀었을 때, 문제 객체를 통째로 last-write-wins 하면
 * 한쪽 풀이 기록이 사라진다. 로그는 합집합으로 안전하게 합쳐지므로
 * 로그를 통계의 원본으로 삼는다.
 */
export function recomputeStats(problems, logs) {
  const stats = new Map()
  for (const l of [...logs].sort((a, b) => a.t - b.t)) {
    let s = stats.get(l.id)
    if (!s) {
      s = { attempts: 0, correctCount: 0, streak: 0, lastAttemptedAt: null, lastResult: null }
      stats.set(l.id, s)
    }
    s.attempts += 1
    if (l.ok) {
      s.correctCount += 1
      s.streak += 1
    } else {
      s.streak = 0
    }
    s.lastAttemptedAt = new Date(l.t).toISOString()
    s.lastResult = !!l.ok
  }
  const blank = { attempts: 0, correctCount: 0, streak: 0, lastAttemptedAt: null, lastResult: null }
  return problems.map((p) => ({ ...p, ...(stats.get(p.id) || blank) }))
}

/**
 * 같은 시험(노트) 하나를 합친다.
 *  - 이름/시험일: metaUpdatedAt이 최신인 쪽 채택
 *  - 문제 내용: updatedAt이 최신인 쪽 채택
 *  - 삭제: tombstone이 문제의 updatedAt보다 나중이면 삭제 확정
 *  - 통계: 합쳐진 로그로부터 재계산
 *  - 과목 목록: subjectsUpdatedAt이 최신인 쪽 채택 (이름 변경이 되살아나지 않도록)
 */
export function mergeExams(local, remote) {
  const a = normalizeExam(local)
  if (!remote) return a
  const b = normalizeExam(remote)

  const deleted = { ...b.deleted }
  for (const [id, iso] of Object.entries(a.deleted)) {
    if (!deleted[id] || new Date(iso) > new Date(deleted[id])) deleted[id] = iso
  }

  const map = new Map(b.problems.map((p) => [p.id, p]))
  for (const p of a.problems) {
    const other = map.get(p.id)
    if (!other || new Date(p.updatedAt) >= new Date(other.updatedAt)) map.set(p.id, p)
  }

  const problems = [...map.values()].filter((p) => {
    const t = deleted[p.id]
    return !t || new Date(t) < new Date(p.updatedAt)
  })

  const seen = new Set()
  const logs = []
  for (const l of [...b.logs, ...a.logs].sort((x, y) => x.t - y.t)) {
    const key = `${l.t}|${l.id}|${l.ok ? 1 : 0}`
    if (seen.has(key)) continue
    seen.add(key)
    logs.push(l)
  }
  const mergedLogs = pruneLogs(logs)

  const subjectSource = new Date(a.subjectsUpdatedAt) >= new Date(b.subjectsUpdatedAt) ? a : b
  const subjects = [...subjectSource.subjects]
  for (const p of problems) if (!subjects.includes(p.subject)) subjects.push(p.subject)

  const metaSource = new Date(a.metaUpdatedAt) >= new Date(b.metaUpdatedAt) ? a : b

  return {
    id: a.id,
    name: metaSource.name,
    examDate: metaSource.examDate,
    metaUpdatedAt: metaSource.metaUpdatedAt,
    createdAt: new Date(a.createdAt) <= new Date(b.createdAt) ? a.createdAt : b.createdAt,
    subjects,
    subjectsUpdatedAt: subjectSource.subjectsUpdatedAt,
    problems: recomputeStats(problems, mergedLogs),
    logs: mergedLogs,
    deleted: pruneTombstones(deleted),
  }
}

/** 시험을 마지막으로 손댄 시각 — 삭제 기록과 비교해 되살릴지 판단하는 기준 */
function examTouchedAt(exam) {
  let t = Math.max(new Date(exam.metaUpdatedAt).getTime() || 0, new Date(exam.subjectsUpdatedAt).getTime() || 0)
  for (const p of exam.problems) t = Math.max(t, new Date(p.updatedAt).getTime() || 0)
  for (const iso of Object.values(exam.deleted)) t = Math.max(t, new Date(iso).getTime() || 0)
  return t
}

/**
 * 로컬 전체와 원격 전체를 합친다.
 * 시험은 id로 짝지어 각각 합치고, 한쪽에만 있으면 그대로 가져온다.
 * 단 삭제된 시험은 그 뒤로 손댄 흔적이 없으면 되살리지 않는다.
 */
export function mergeStates(local, remote) {
  const a = normalizeState(local)
  if (!remote) return a
  const b = normalizeState(remote)

  const deletedExams = { ...b.deletedExams }
  for (const [id, iso] of Object.entries(a.deletedExams)) {
    if (!deletedExams[id] || new Date(iso) > new Date(deletedExams[id])) deletedExams[id] = iso
  }

  const localById = new Map(a.exams.map((e) => [e.id, e]))
  const remoteById = new Map(b.exams.map((e) => [e.id, e]))
  const merged = []
  for (const id of new Set([...localById.keys(), ...remoteById.keys()])) {
    const l = localById.get(id)
    const exam = l ? mergeExams(l, remoteById.get(id)) : normalizeExam(remoteById.get(id))
    const tomb = deletedExams[id]
    if (tomb && new Date(tomb).getTime() > examTouchedAt(exam)) continue // 삭제 확정
    merged.push(exam)
  }

  let exams = sortExams(merged)
  if (!exams.length) exams = [defaultExam()]
  const activeExamId = exams.some((e) => e.id === a.activeExamId) ? a.activeExamId : exams[0].id

  return {
    version: SCHEMA_VERSION,
    activeExamId, // 보고 있는 탭은 기기마다 다르므로 로컬 것을 유지
    exams,
    deletedExams: pruneTombstones(deletedExams),
    lastBackupAt: a.lastBackupAt || b.lastBackupAt || null,
  }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyState()
    return normalizeState(JSON.parse(raw))
  } catch (e) {
    console.error('저장된 데이터를 읽지 못했습니다.', e)
    return emptyState()
  }
}

/** @returns {{ok: boolean, error?: string}} */
export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    return { ok: true }
  } catch (e) {
    const quota =
      e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22)
    return {
      ok: false,
      error: quota
        ? '저장 공간이 가득 찼습니다. 관리 탭에서 백업 후 오래된 문제를 정리해 주세요.'
        : '저장에 실패했습니다: ' + (e && e.message ? e.message : String(e)),
    }
  }
}

/** 현재 localStorage 사용량(byte) 추정 */
export function usedBytes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || ''
    return new Blob([raw]).size
  } catch {
    return 0
  }
}

/**
 * 브라우저에 "이 사이트 저장소는 함부로 지우지 말라"고 요청한다.
 * 사파리는 방치된 사이트의 localStorage/IndexedDB를 자동 삭제하는데,
 * 이 권한을 받으면 자동 정리 대상에서 제외된다. (지원하지 않는 브라우저는 무시)
 */
export async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return false
    if (navigator.storage.persisted && (await navigator.storage.persisted())) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

/** 저장소 상태 (영구 보관 여부 / 사용량 / 한도) */
export async function getStorageInfo() {
  const info = { supported: !!navigator.storage?.estimate, persisted: null, usage: null, quota: null }
  try {
    if (navigator.storage?.persisted) info.persisted = await navigator.storage.persisted()
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate()
      info.usage = e.usage ?? null
      info.quota = e.quota ?? null
    }
  } catch {
    /* 지원하지 않는 브라우저 */
  }
  return info
}

/* ---------- GitHub 동기화 설정 ---------- */

/**
 * 토큰은 앱 데이터와 별도 키에 보관한다.
 * 이렇게 해야 JSON 백업을 내보내거나 남에게 보낼 때 토큰이 딸려 나가지 않는다.
 */
const GH_KEY = 'ox-wrongnote-github-v1'
const SYNC_META_KEY = 'ox-wrongnote-syncmeta-v1'

export function loadGitHubConfig() {
  try {
    const raw = localStorage.getItem(GH_KEY)
    if (!raw) return null
    const c = JSON.parse(raw)
    if (!c?.token || !c?.owner || !c?.repo) return null
    return { token: c.token, owner: c.owner, repo: c.repo, branch: c.branch || 'main' }
  } catch {
    return null
  }
}

export function saveGitHubConfig(cfg) {
  try {
    localStorage.setItem(GH_KEY, JSON.stringify(cfg))
  } catch (e) {
    console.error('동기화 설정 저장 실패', e)
  }
}

export function clearGitHubConfig() {
  try {
    localStorage.removeItem(GH_KEY)
    localStorage.removeItem(SYNC_META_KEY)
  } catch {
    /* 무시 */
  }
}

export function loadSyncMeta() {
  try {
    const raw = localStorage.getItem(SYNC_META_KEY)
    return raw ? JSON.parse(raw) : { dirty: false, lastSyncAt: null, lastCommit: null }
  } catch {
    return { dirty: false, lastSyncAt: null, lastCommit: null }
  }
}

export function saveSyncMeta(meta) {
  try {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta))
  } catch {
    /* 무시 */
  }
}

/** 올려야 할 변경이 있음을 표시 (새로고침해도 유지되어야 하므로 localStorage에) */
export function markDirty() {
  saveSyncMeta({ ...loadSyncMeta(), dirty: true })
}

/* ---------- 퀴즈 세션 (시험별로 따로 보관) ---------- */

function sessionKey(examId) {
  return `${SESSION_KEY}:${examId}`
}

export function loadSession(examId) {
  if (!examId) return null
  try {
    let raw = localStorage.getItem(sessionKey(examId))
    // v1 세션(단일 노트)은 기본 시험 것으로 옮긴다
    if (!raw && examId === DEFAULT_EXAM_ID) {
      const old = localStorage.getItem(SESSION_KEY)
      if (old) {
        localStorage.setItem(sessionKey(examId), old)
        localStorage.removeItem(SESSION_KEY)
        raw = old
      }
    }
    if (!raw) return null
    const s = JSON.parse(raw)
    if (!s || !Array.isArray(s.queue) || !Array.isArray(s.results)) return null
    return s
  } catch {
    return null
  }
}

export function saveSession(examId, session) {
  if (!examId) return
  try {
    if (!session) localStorage.removeItem(sessionKey(examId))
    else localStorage.setItem(sessionKey(examId), JSON.stringify(session))
  } catch (e) {
    console.error('세션 저장 실패', e)
  }
}

/** 진행 중 세션을 한꺼번에 폐기 (복원·초기화 뒤에는 데이터와 어긋나므로) */
export function clearSessions(examIds) {
  for (const id of examIds) saveSession(id, null)
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    /* 무시 */
  }
}
