import { useMemo, useState } from 'react'
import { Button, Card, EmptyState, SectionTitle } from '../components/ui'
import ProblemImage from '../components/ProblemImage'
import { CHOICE_LABELS, cls, dayKey, daysUntilExam, EXAM_DATE, formatDate } from '../lib/util'

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

export default function HomeTab({ state, onGoTab, onStartWeakQuiz, onGoBackup }) {
  const { problems, logs, subjects, lastBackupAt } = state
  const dday = daysUntilExam()

  // 백업 독촉: 한 번도 안 했거나 7일 넘었으면 눈에 띄게 알린다
  const backupWarn = useMemo(() => {
    if (problems.length < 3) return null
    if (!lastBackupAt) return { text: '아직 한 번도 백업하지 않았습니다', urgent: true }
    const days = Math.floor((Date.now() - new Date(lastBackupAt).getTime()) / 86400000)
    if (days >= 7) return { text: `마지막 백업이 ${days}일 전입니다`, urgent: days >= 14 }
    return null
  }, [problems.length, lastBackupAt])

  const stats = useMemo(() => {
    const attempts = problems.reduce((s, p) => s + p.attempts, 0)
    const correct = problems.reduce((s, p) => s + p.correctCount, 0)

    const neverCorrect = problems
      .filter((p) => p.attempts > 0 && p.correctCount === 0)
      .sort((a, b) => b.attempts - a.attempts)
    const untried = problems.filter((p) => p.attempts === 0)

    const bySubject = subjects
      .map((s) => {
        const list = problems.filter((p) => p.subject === s)
        const a = list.reduce((x, p) => x + p.attempts, 0)
        const c = list.reduce((x, p) => x + p.correctCount, 0)
        return { subject: s, count: list.length, attempts: a, correct: c, rate: a ? Math.round((c / a) * 100) : null }
      })
      .filter((x) => x.count > 0)

    // 최근 7일 (오늘 포함)
    const days = []
    const today = new Date()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
      const key = dayKey(d)
      const dayLogs = logs.filter((l) => dayKey(l.t) === key)
      days.push({
        key,
        label: WEEKDAY[d.getDay()],
        total: dayLogs.length,
        correct: dayLogs.filter((l) => l.ok).length,
        isToday: i === 0,
      })
    }

    return {
      attempts,
      correct,
      rate: attempts ? Math.round((correct / attempts) * 100) : null,
      neverCorrect,
      untried,
      bySubject,
      days,
    }
  }, [problems, logs, subjects])

  return (
    <div className="space-y-4 p-4">
      {/* D-day */}
      <div className="rounded-2xl bg-slate-800 p-5 text-white shadow-sm">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[13px] font-medium tracking-wide text-slate-300">경찰공무원 필기시험</p>
            <p className="text-sm text-slate-400">{EXAM_DATE.replace(/-/g, '. ')}</p>
          </div>
          <div className="text-right">
            <p className="text-4xl leading-none font-black">
              {dday > 0 ? `D-${dday}` : dday === 0 ? 'D-DAY' : `D+${-dday}`}
            </p>
          </div>
        </div>
      </div>

      {backupWarn && (
        <button
          type="button"
          onClick={onGoBackup}
          className={cls(
            'flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left ring-1',
            backupWarn.urgent ? 'bg-amber-50 ring-amber-300' : 'bg-white ring-slate-200',
          )}
        >
          <span className="text-xl">💾</span>
          <span className="flex-1">
            <span className="block text-[15px] font-bold text-slate-800">{backupWarn.text}</span>
            <span className="block text-[13px] text-slate-500">눌러서 백업하기</span>
          </span>
          <span className="text-slate-400">›</span>
        </button>
      )}

      {problems.length === 0 ? (
        <EmptyState
          icon="🗒️"
          title="아직 등록된 문제가 없습니다"
          desc={'회독하면서 틀린 문제를 등록해 보세요.\n등록한 문제는 이 기기에 자동 저장됩니다.'}
          action={<Button onClick={() => onGoTab('add')}>첫 오답 등록하기</Button>}
        />
      ) : (
        <>
          {/* 요약 3칸 */}
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="등록 문제" value={problems.length} unit="개" />
            <StatTile label="총 정답률" value={stats.rate ?? '-'} unit={stats.rate === null ? '' : '%'} />
            <StatTile label="총 풀이" value={stats.attempts} unit="회" />
          </div>

          {/* ★ 한 번도 못 맞힌 문제 */}
          <Card noPad className={cls('overflow-hidden', stats.neverCorrect.length > 0 && 'ring-2 ring-red-300')}>
            <div
              className={cls(
                'flex items-center justify-between px-4 py-3',
                stats.neverCorrect.length > 0 ? 'bg-red-50' : 'bg-slate-50',
              )}
            >
              <h2 className="text-[17px] font-bold text-slate-800">
                🔥 아직 한 번도 못 맞힌 문제
                <span className={cls('ml-2', stats.neverCorrect.length ? 'text-red-600' : 'text-slate-400')}>
                  {stats.neverCorrect.length}개
                </span>
              </h2>
            </div>

            {stats.neverCorrect.length === 0 ? (
              <p className="px-4 py-5 text-center text-[15px] text-slate-500">
                {stats.attempts === 0
                  ? '아직 퀴즈를 풀지 않았습니다.'
                  : '모든 문제를 최소 한 번씩은 맞혔습니다. 잘하고 있어요 👏'}
              </p>
            ) : (
              <>
                <ul className="divide-y divide-slate-100">
                  {stats.neverCorrect.slice(0, 8).map((p) => (
                    <NeverCorrectRow key={p.id} problem={p} />
                  ))}
                </ul>
                {stats.neverCorrect.length > 8 && (
                  <p className="px-4 py-2 text-center text-sm text-slate-500">
                    외 {stats.neverCorrect.length - 8}개 더
                  </p>
                )}
                <div className="p-3">
                  <Button variant="danger" className="w-full" onClick={onStartWeakQuiz}>
                    취약 문제만 바로 풀기
                  </Button>
                </div>
              </>
            )}
          </Card>

          {stats.untried.length > 0 && (
            <Card noPad className="flex items-center justify-between px-4 py-3.5">
              <span className="text-[15px] text-slate-600">
                아직 한 번도 안 풀어본 문제{' '}
                <b className="text-slate-900">{stats.untried.length}개</b>
              </span>
            </Card>
          )}

          {/* 과목별 정답률 */}
          <Card>
            <SectionTitle>과목별 정답률</SectionTitle>
            <div className="space-y-3.5 pt-1">
              {stats.bySubject.map((s) => (
                <div key={s.subject}>
                  <div className="mb-1 flex items-baseline justify-between text-[15px]">
                    <span className="font-semibold text-slate-700">{s.subject}</span>
                    <span className="text-slate-500">
                      {s.rate === null ? (
                        <span className="text-slate-400">미풀이 · {s.count}문제</span>
                      ) : (
                        <>
                          <b className={rateColor(s.rate)}>{s.rate}%</b>
                          <span className="ml-1.5 text-[13px] text-slate-400">
                            {s.correct}/{s.attempts} · {s.count}문제
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={cls('h-full rounded-full transition-all', barColor(s.rate))}
                      style={{ width: `${s.rate ?? 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* 최근 7일 */}
          <Card>
            <SectionTitle
              right={
                <span className="text-[13px] text-slate-400">
                  7일 합계 {stats.days.reduce((s, d) => s + d.total, 0)}문제
                </span>
              }
            >
              최근 7일 학습
            </SectionTitle>
            <WeekChart days={stats.days} />
          </Card>
        </>
      )}
    </div>
  )
}

function StatTile({ label, value, unit }) {
  return (
    <div className="rounded-2xl bg-white p-3 text-center shadow-sm ring-1 ring-slate-200/70">
      <p className="text-[13px] text-slate-500">{label}</p>
      <p className="mt-0.5 text-2xl font-black text-slate-800">
        {value}
        <span className="ml-0.5 text-sm font-bold text-slate-400">{unit}</span>
      </p>
    </div>
  )
}

function NeverCorrectRow({ problem }) {
  const [open, setOpen] = useState(false)
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-2 px-4 py-3 text-left active:bg-slate-50"
      >
        <span className="mt-0.5 shrink-0 rounded-md bg-red-100 px-1.5 py-0.5 text-[12px] font-bold text-red-700">
          {problem.attempts}회 실패
        </span>
        <span className={cls('flex-1 text-[15px] text-slate-700', !open && 'line-clamp-2')}>
          {problem.question}
        </span>
      </button>
      {open && (
        <div className="space-y-2 bg-slate-50 px-4 py-3 text-[15px]">
          <ProblemImage imageId={problem.imageId} />
          <ol className="space-y-1">
            {problem.choices.map((c, i) =>
              c ? (
                <li
                  key={i}
                  className={cls(
                    'flex gap-1.5',
                    i === problem.answer ? 'font-bold text-emerald-700' : 'text-slate-600',
                  )}
                >
                  <span>{CHOICE_LABELS[i]}</span>
                  <span>{c}</span>
                </li>
              ) : null,
            )}
          </ol>
          {problem.explanation && (
            <p className="rounded-lg bg-white p-3 whitespace-pre-line text-slate-600">{problem.explanation}</p>
          )}
          <p className="text-[13px] text-slate-400">
            {problem.subject}
            {problem.source && ` · ${problem.source}`} · 최근 {formatDate(problem.lastAttemptedAt)}
          </p>
        </div>
      )}
    </li>
  )
}

function WeekChart({ days }) {
  const max = Math.max(1, ...days.map((d) => d.total))
  return (
    <div className="flex h-32 items-end gap-1.5 pt-2">
      {days.map((d) => (
        <div key={d.key} className="flex flex-1 flex-col items-center gap-1">
          <span className={cls('text-[12px] font-bold', d.total ? 'text-slate-600' : 'text-slate-300')}>
            {d.total || ''}
          </span>
          <div className="flex w-full flex-1 items-end">
            <div
              className={cls(
                'w-full rounded-t-md transition-all',
                d.total ? (d.isToday ? 'bg-slate-800' : 'bg-slate-400') : 'bg-slate-100',
              )}
              style={{ height: `${Math.max(4, (d.total / max) * 100)}%` }}
            />
          </div>
          <span className={cls('text-[13px]', d.isToday ? 'font-bold text-slate-800' : 'text-slate-400')}>
            {d.label}
          </span>
        </div>
      ))}
    </div>
  )
}

function rateColor(rate) {
  if (rate >= 80) return 'text-emerald-600'
  if (rate >= 50) return 'text-amber-600'
  return 'text-red-600'
}

function barColor(rate) {
  if (rate === null) return 'bg-slate-200'
  if (rate >= 80) return 'bg-emerald-500'
  if (rate >= 50) return 'bg-amber-400'
  return 'bg-red-500'
}
