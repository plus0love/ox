/**
 * 가중치 랜덤 출제 로직.
 *
 * 원칙
 *  1) 한 번도 못 맞힌 문제가 가장 자주 나온다.
 *  2) 정답률이 낮을수록 자주 나온다.
 *  3) 연속 2회 이상 맞힌 문제는 급격히 덜 나온다.
 *  4) 최근에 틀린 문제일수록 더 자주 나온다.
 */

export function weightOf(problem, now = Date.now()) {
  const attempts = problem.attempts || 0
  const correct = problem.correctCount || 0

  // 아직 안 풀어본 문제: 꽤 높게 (단, "못 맞힌 문제"보다는 낮게)
  if (attempts === 0) return 8

  const acc = correct / attempts
  let w = 1 + (1 - acc) * 9 // 정답률 0% → 10, 100% → 1

  // 한 번도 정답을 못 낸 문제는 무조건 최우선
  if (correct === 0) w = Math.max(w, 14)

  // 연속 정답 → 출제 빈도 하락
  const streak = problem.streak || 0
  if (streak >= 4) w *= 0.12
  else if (streak >= 3) w *= 0.25
  else if (streak >= 2) w *= 0.4

  // 최근에 틀렸으면 가산
  if (problem.lastResult === false && problem.lastAttemptedAt) {
    const days = (now - new Date(problem.lastAttemptedAt).getTime()) / 86400000
    if (days <= 1) w *= 2
    else if (days <= 3) w *= 1.6
    else if (days <= 7) w *= 1.3
    else w *= 1.1
  }

  return Math.max(w, 0.15)
}

/** 가중치 기반 비복원 추출 (같은 문제가 한 세션에 두 번 나오지 않음) */
export function weightedSample(problems, count) {
  const pool = problems.map((p) => ({ p, w: weightOf(p) }))
  const n = Math.min(count, pool.length)
  const picked = []

  for (let i = 0; i < n; i++) {
    let total = 0
    for (const item of pool) total += item.w
    let r = Math.random() * total
    let idx = 0
    for (; idx < pool.length - 1; idx++) {
      r -= pool[idx].w
      if (r <= 0) break
    }
    picked.push(pool[idx].p)
    pool.splice(idx, 1)
  }
  return picked
}

export const SCOPES = [
  { key: 'all', label: '전체', desc: '가중치 랜덤' },
  { key: 'subject', label: '과목별', desc: '선택 과목만' },
  { key: 'weak', label: '취약 문제', desc: '정답률 50% 미만 · 미시도' },
  { key: 'recent', label: '최근 등록순', desc: '새로 넣은 문제부터' },
]

export function isWeak(p) {
  if (!p.attempts) return true
  return p.correctCount / p.attempts < 0.5
}

/** 범위 조건에 맞는 문제 후보 */
export function filterByScope(problems, scope, subject) {
  switch (scope) {
    case 'subject':
      return problems.filter((p) => p.subject === subject)
    case 'weak':
      return problems.filter(isWeak)
    case 'recent':
      return [...problems].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    default:
      return problems
  }
}

/**
 * 실제 출제 목록 생성.
 * '최근 등록순'은 의도적으로 랜덤을 적용하지 않고 등록 역순 그대로 낸다.
 */
export function buildQueue(problems, { scope, subject, count }) {
  const pool = filterByScope(problems, scope, subject)
  if (!pool.length) return []
  const n = count === 'all' ? pool.length : Math.min(Number(count), pool.length)
  if (scope === 'recent') return pool.slice(0, n).map((p) => p.id)
  return weightedSample(pool, n).map((p) => p.id)
}
