import { uid } from './util.js'

export const STORAGE_KEY = 'ox-wrongnote-v1'
export const SESSION_KEY = 'ox-wrongnote-session-v1'
export const SCHEMA_VERSION = 1

export const DEFAULT_SUBJECTS = ['정보보호론', '시스템네트워크보안', '디지털포렌식']

/**
 * 학습 로그 보관 정책 (localStorage 용량 방어).
 * 동기화 시 통계를 로그에서 다시 계산하므로, 시험 준비 기간을 넉넉히 덮도록 잡았다.
 * 1건당 약 45바이트 → 10,000건이라도 450KB 수준.
 */
const LOG_MAX = 10000
const LOG_MAX_DAYS = 200

/** 삭제 기록 보관 기간 — 이보다 오래된 tombstone은 정리 */
const TOMBSTONE_DAYS = 90

export function emptyState() {
  return {
    version: SCHEMA_VERSION,
    subjects: [...DEFAULT_SUBJECTS],
    subjectsUpdatedAt: new Date(0).toISOString(),
    problems: [],
    logs: [], // { t: epochMs, id, ok }
    deleted: {}, // { [problemId]: 삭제시각ISO } — 동기화 시 삭제가 되살아나지 않도록
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

export function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return emptyState()
  const problems = Array.isArray(raw.problems) ? raw.problems.map(normalizeProblem) : []
  let subjects = Array.isArray(raw.subjects) && raw.subjects.length ? raw.subjects : [...DEFAULT_SUBJECTS]
  // 문제에만 존재하는 과목도 목록에 포함시킨다 (가져오기 후 유실 방지)
  for (const p of problems) if (!subjects.includes(p.subject)) subjects = [...subjects, p.subject]
  const logs = Array.isArray(raw.logs)
    ? raw.logs.filter((l) => l && typeof l.t === 'number').map((l) => ({ t: l.t, id: l.id, ok: !!l.ok }))
    : []
  return {
    version: SCHEMA_VERSION,
    subjects,
    subjectsUpdatedAt: raw.subjectsUpdatedAt || new Date(0).toISOString(),
    problems,
    logs: pruneLogs(logs),
    deleted: pruneTombstones(raw.deleted),
    lastBackupAt: raw.lastBackupAt || null,
  }
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
 * 로컬 상태와 원격 상태를 합친다.
 *  - 문제 내용: updatedAt이 최신인 쪽 채택
 *  - 삭제: tombstone이 문제의 updatedAt보다 나중이면 삭제 확정
 *  - 통계: 합쳐진 로그로부터 재계산
 *  - 과목 목록: subjectsUpdatedAt이 최신인 쪽 채택 (이름 변경이 되살아나지 않도록)
 */
export function mergeStates(local, remote) {
  if (!remote) return normalizeState(local)
  const a = normalizeState(local)
  const b = normalizeState(remote)

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

  const localNewer = new Date(a.subjectsUpdatedAt) >= new Date(b.subjectsUpdatedAt)
  const subjectSource = localNewer ? a : b
  const subjects = [...subjectSource.subjects]
  for (const p of problems) if (!subjects.includes(p.subject)) subjects.push(p.subject)

  return {
    version: SCHEMA_VERSION,
    subjects,
    subjectsUpdatedAt: subjectSource.subjectsUpdatedAt,
    problems: recomputeStats(problems, mergedLogs),
    logs: mergedLogs,
    deleted: pruneTombstones(deleted),
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

/* ---------- 퀴즈 세션 ---------- */

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    if (!s || !Array.isArray(s.queue) || !Array.isArray(s.results)) return null
    return s
  } catch {
    return null
  }
}

export function saveSession(session) {
  try {
    if (!session) localStorage.removeItem(SESSION_KEY)
    else localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch (e) {
    console.error('세션 저장 실패', e)
  }
}
