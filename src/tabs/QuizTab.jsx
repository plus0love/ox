import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, ChipGroup, EmptyState, SectionTitle } from '../components/ui'
import ProblemImage from '../components/ProblemImage'
import { CHOICE_LABELS, cls } from '../lib/util'
import { buildQueue, filterByScope, SCOPES } from '../lib/quiz'
import { loadSession, saveSession } from '../lib/store'

const COUNTS = [
  { value: 10, label: '10문제' },
  { value: 20, label: '20문제' },
  { value: 'all', label: '전체' },
]

export default function QuizTab({ state, onAnswer, onFocusMode, onGoTab, request, onRequestHandled }) {
  const { problems, subjects } = state

  const [session, setSession] = useState(() => loadSession())
  const [showSetup, setShowSetup] = useState(false)
  const [scope, setScope] = useState('all')
  const [subject, setSubject] = useState(subjects[0] || '')
  const [count, setCount] = useState(10)

  const byId = useMemo(() => new Map(problems.map((p) => [p.id, p])), [problems])

  const update = useCallback((next) => {
    setSession(next)
    saveSession(next)
  }, [])

  const start = useCallback(
    (opts) => {
      const queue = buildQueue(problems, opts)
      if (!queue.length) return false
      update({
        queue,
        idx: 0,
        results: [],
        scope: opts.scope,
        subject: opts.subject || null,
        startedAt: new Date().toISOString(),
        finished: false,
      })
      setShowSetup(false)
      return true
    },
    [problems, update],
  )

  // 홈에서 "취약 문제만 바로 풀기"로 들어온 경우
  useEffect(() => {
    if (!request) return
    start({ scope: request.scope, subject: request.subject, count: request.count })
    onRequestHandled()
  }, [request, start, onRequestHandled])

  // 삭제된 문제가 큐에 남아 있으면 제거 (관리 탭에서 지운 경우)
  useEffect(() => {
    if (!session) return
    const cleaned = session.queue.filter((id) => byId.has(id))
    if (cleaned.length === session.queue.length) return
    // 지워진 문제 수만큼 현재 위치를 앞으로 당긴다 (queue와 results의 정렬 유지)
    const removedBefore = session.queue.slice(0, session.idx).filter((id) => !byId.has(id)).length
    update({
      ...session,
      queue: cleaned,
      results: session.results.filter((r) => byId.has(r.id)),
      idx: Math.max(0, session.idx - removedBefore),
    })
  }, [session, byId, update])

  const finished = !!session && (session.finished || session.idx >= session.queue.length)
  const inQuestion = !!session && !finished && !showSetup

  // 문제를 푸는 동안에는 하단 탭을 숨겨 집중도를 높인다
  useEffect(() => {
    onFocusMode(inQuestion)
    return () => onFocusMode(false)
  }, [inQuestion, onFocusMode])

  if (problems.length === 0) {
    return (
      <EmptyState
        icon="🧩"
        title="풀 문제가 없습니다"
        desc={'먼저 오답을 등록해 주세요.\n등록한 문제로 바로 퀴즈를 시작할 수 있습니다.'}
        action={<Button onClick={() => onGoTab('add')}>오답 등록하러 가기</Button>}
      />
    )
  }

  if (session && finished) {
    return (
      <ResultView
        session={session}
        byId={byId}
        onClose={() => {
          update(null)
          setShowSetup(false)
        }}
        onRetryWrong={() => {
          const wrongIds = session.results.filter((r) => !r.ok).map((r) => r.id).filter((id) => byId.has(id))
          if (!wrongIds.length) return
          update({
            queue: wrongIds,
            idx: 0,
            results: [],
            scope: 'retry',
            subject: null,
            startedAt: new Date().toISOString(),
            finished: false,
          })
        }}
      />
    )
  }

  if (session && !showSetup) {
    return (
      <QuestionView
        session={session}
        byId={byId}
        onPick={(picked) => {
          const problem = byId.get(session.queue[session.idx])
          if (!problem) return
          const ok = picked === problem.answer
          // 선택하는 즉시 결과를 확정 저장 → 새로고침해도 중복 집계되지 않음
          update({ ...session, results: [...session.results, { id: problem.id, picked, ok }] })
          onAnswer(problem.id, ok)
        }}
        onNext={() => update({ ...session, idx: session.idx + 1 })}
        onExit={() => setShowSetup(true)}
        onFinishNow={() => update({ ...session, finished: true })}
      />
    )
  }

  // ---- 설정 화면 ----
  const candidateCount = filterByScope(problems, scope, subject).length

  return (
    <div className="space-y-4 p-4">
      {session && (
        <Card className="ring-2 ring-amber-300">
          <p className="text-[15px] font-bold text-slate-800">진행 중인 퀴즈가 있습니다</p>
          <p className="mt-0.5 text-sm text-slate-500">
            {session.results.length} / {session.queue.length} 문제 완료
          </p>
          <div className="mt-3 flex gap-2">
            <Button className="flex-1" onClick={() => setShowSetup(false)}>
              이어서 풀기
            </Button>
            <Button variant="ghost" className="flex-1" onClick={() => update(null)}>
              그만두기
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <SectionTitle>출제 범위</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setScope(s.key)}
              className={cls(
                'min-h-[64px] rounded-xl px-3 py-2 text-left transition',
                scope === s.key
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200 active:bg-slate-100',
              )}
            >
              <span className="block text-[16px] font-bold">{s.label}</span>
              <span className={cls('block text-[12.5px]', scope === s.key ? 'text-slate-300' : 'text-slate-500')}>
                {s.desc}
              </span>
            </button>
          ))}
        </div>

        {scope === 'subject' && (
          <div className="mt-3">
            <ChipGroup options={subjects} value={subject} onChange={setSubject} />
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>문제 수</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          {COUNTS.map((c) => (
            <button
              key={String(c.value)}
              type="button"
              onClick={() => setCount(c.value)}
              className={cls(
                'min-h-[52px] rounded-xl text-[16px] font-bold transition',
                count === c.value
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200 active:bg-slate-100',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[14px] text-slate-500">
          조건에 맞는 문제 <b className="text-slate-800">{candidateCount}개</b>
          {scope !== 'recent' && candidateCount > 0 && ' · 자주 틀린 문제가 더 자주 출제됩니다'}
        </p>
      </Card>

      <Button
        className="w-full"
        disabled={candidateCount === 0}
        onClick={() => start({ scope, subject, count })}
      >
        {candidateCount === 0 ? '해당 조건에 문제가 없습니다' : '퀴즈 시작'}
      </Button>
    </div>
  )
}

/* ---------------- 문제 풀이 화면 ---------------- */

function QuestionView({ session, byId, onPick, onNext, onExit, onFinishNow }) {
  const problem = byId.get(session.queue[session.idx])
  const answered = session.results.length > session.idx
  const result = answered ? session.results[session.idx] : null
  const isLast = session.idx === session.queue.length - 1

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [session.idx])

  if (!problem) {
    return (
      <div className="p-4">
        <Card>
          <p className="text-slate-600">문제를 불러올 수 없습니다.</p>
          <Button className="mt-3 w-full" onClick={onFinishNow}>
            결과 보기
          </Button>
        </Card>
      </div>
    )
  }

  const progress = ((session.idx + (answered ? 1 : 0)) / session.queue.length) * 100
  const correctSoFar = session.results.filter((r) => r.ok).length

  return (
    <div className="pb-[calc(96px+env(safe-area-inset-bottom))]">
      {/* 진행 헤더 */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <button
            type="button"
            onClick={onExit}
            className="-ml-2 min-h-[44px] px-2 text-[15px] font-semibold text-slate-500"
          >
            나가기
          </button>
          <div className="flex-1 text-center text-[15px] font-bold text-slate-700">
            {session.idx + 1} / {session.queue.length}
          </div>
          <span className="min-h-[44px] px-2 text-[15px] leading-[44px] font-bold text-emerald-600">
            {correctSoFar}○
          </span>
        </div>
        <div className="h-1 bg-slate-100">
          <div className="h-full bg-slate-800 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[13px] font-bold text-slate-600">
            {problem.subject}
          </span>
          {problem.source && <span className="text-[13px] text-slate-400">{problem.source}</span>}
        </div>

        <p className="text-[19px] leading-relaxed font-semibold whitespace-pre-line text-slate-900">
          {problem.question}
        </p>

        <ProblemImage imageId={problem.imageId} />

        <div className="space-y-2.5">
          {problem.choices.map((c, i) => {
            if (!c) return null
            const isAnswer = i === problem.answer
            const isPicked = result?.picked === i

            let style = 'bg-white ring-1 ring-slate-300 text-slate-800 active:bg-slate-100'
            if (answered) {
              if (isAnswer) style = 'bg-emerald-50 ring-2 ring-emerald-500 text-emerald-900'
              else if (isPicked) style = 'bg-red-50 ring-2 ring-red-500 text-red-900'
              else style = 'bg-white ring-1 ring-slate-200 text-slate-400'
            }

            return (
              <button
                key={i}
                type="button"
                disabled={answered}
                onClick={() => onPick(i)}
                className={cls(
                  'flex w-full items-start gap-3 rounded-2xl px-4 py-4 text-left transition',
                  style,
                )}
              >
                <span className="text-[19px] leading-snug font-bold">{CHOICE_LABELS[i]}</span>
                <span className="flex-1 text-[17px] leading-relaxed whitespace-pre-line">{c}</span>
                {answered && isAnswer && <span className="text-xl">✓</span>}
                {answered && isPicked && !isAnswer && <span className="text-xl">✕</span>}
              </button>
            )
          })}
        </div>

        {answered && (
          <div className="space-y-3">
            <div
              className={cls(
                'rounded-2xl px-4 py-3.5 text-[17px] font-bold',
                result.ok ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white',
              )}
            >
              {result.ok ? '정답입니다 ✓' : `오답입니다 ✕ — 정답은 ${CHOICE_LABELS[problem.answer]}`}
            </div>

            {problem.explanation && (
              <Card>
                <p className="mb-1.5 text-[14px] font-bold text-slate-500">해설</p>
                <p className="text-[16px] leading-relaxed whitespace-pre-line text-slate-700">
                  {problem.explanation}
                </p>
              </Card>
            )}

            <p className="text-center text-[13px] text-slate-400">
              누적 {problem.attempts}회 시도 · {problem.correctCount}회 정답
            </p>
          </div>
        )}
      </div>

      {/* 하단 고정 액션 */}
      {answered && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          <Button className="w-full" onClick={isLast ? onFinishNow : onNext}>
            {isLast ? '결과 보기' : '다음 문제 →'}
          </Button>
        </div>
      )}
    </div>
  )
}

/* ---------------- 결과 화면 ---------------- */

function ResultView({ session, byId, onClose, onRetryWrong }) {
  const total = session.results.length
  const correct = session.results.filter((r) => r.ok).length
  const wrong = session.results.filter((r) => !r.ok)
  const rate = total ? Math.round((correct / total) * 100) : 0

  return (
    <div className="space-y-4 p-4 pb-8">
      <Card className="text-center">
        <p className="text-[15px] text-slate-500">이번 세션 결과</p>
        <p className="my-1 text-5xl font-black text-slate-800">
          {correct}
          <span className="text-2xl font-bold text-slate-400"> / {total}</span>
        </p>
        <p
          className={cls(
            'text-lg font-bold',
            rate >= 80 ? 'text-emerald-600' : rate >= 50 ? 'text-amber-600' : 'text-red-600',
          )}
        >
          정답률 {rate}%
        </p>
        {session.queue.length > total && (
          <p className="mt-1 text-[13px] text-slate-400">
            {session.queue.length - total}문제는 풀지 않고 종료했습니다
          </p>
        )}
      </Card>

      {wrong.length > 0 ? (
        <Card noPad className="overflow-hidden">
          <div className="bg-red-50 px-4 py-3">
            <h2 className="text-[17px] font-bold text-slate-800">
              틀린 문제 <span className="text-red-600">{wrong.length}개</span>
            </h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {wrong.map((r, i) => {
              const p = byId.get(r.id)
              if (!p) return null
              return (
                <li key={`${r.id}_${i}`} className="space-y-2 px-4 py-3.5">
                  <p className="text-[16px] leading-relaxed font-semibold whitespace-pre-line text-slate-800">
                    {p.question}
                  </p>
                  <div className="space-y-1 text-[15px]">
                    <p className="text-red-600">
                      내 답 {CHOICE_LABELS[r.picked]} {p.choices[r.picked]}
                    </p>
                    <p className="font-bold text-emerald-700">
                      정답 {CHOICE_LABELS[p.answer]} {p.choices[p.answer]}
                    </p>
                  </div>
                  {p.explanation && (
                    <p className="rounded-lg bg-slate-50 p-3 text-[15px] leading-relaxed whitespace-pre-line text-slate-600">
                      {p.explanation}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      ) : (
        total > 0 && (
          <Card className="text-center">
            <p className="text-[17px] font-bold text-emerald-600">전부 맞혔습니다 🎉</p>
          </Card>
        )
      )}

      <div className="flex gap-2">
        {wrong.length > 0 && (
          <Button variant="danger" className="flex-1" onClick={onRetryWrong}>
            틀린 문제 다시 풀기
          </Button>
        )}
        <Button variant="ghost" className="flex-1" onClick={onClose}>
          종료
        </Button>
      </div>
    </div>
  )
}
