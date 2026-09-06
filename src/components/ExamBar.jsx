import { useEffect, useRef, useState } from 'react'
import { Button, Field, inputCls } from './ui'
import { cls, daysUntilExam } from '../lib/util'

/**
 * 화면 맨 위의 시험(노트) 전환 탭.
 * 시험이 늘어나도 가로 스크롤로 감당하고, 활성 탭은 자동으로 보이는 위치로 옮긴다.
 */
export default function ExamBar({ exams, activeExamId, onSelect, onAdd }) {
  const activeRef = useRef(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [activeExamId])

  return (
    <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="flex items-center gap-2 overflow-x-auto px-3 py-2">
        {exams.map((e) => {
          const active = e.id === activeExamId
          const dday = daysUntilExam(e.examDate)
          return (
            <button
              key={e.id}
              ref={active ? activeRef : null}
              type="button"
              onClick={() => onSelect(e.id)}
              className={cls(
                'flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[15px] font-bold whitespace-nowrap transition',
                active
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-500 active:bg-slate-200',
              )}
            >
              <span>{e.name}</span>
              {dday !== null && (
                <span
                  className={cls(
                    'rounded-full px-1.5 py-0.5 text-[11.5px] font-bold',
                    active ? 'bg-white/20 text-white' : 'bg-white text-slate-400',
                  )}
                >
                  {ddayLabel(dday)}
                </span>
              )}
            </button>
          )
        })}
        <button
          type="button"
          onClick={onAdd}
          aria-label="새 시험 추가"
          className="min-h-[44px] shrink-0 rounded-full px-3.5 text-[19px] font-bold text-slate-400 ring-1 ring-slate-300 ring-inset active:bg-slate-100"
        >
          ＋
        </button>
      </div>
    </div>
  )
}

export function ddayLabel(dday) {
  if (dday === null) return ''
  return dday > 0 ? `D-${dday}` : dday === 0 ? 'D-DAY' : `D+${-dday}`
}

/**
 * 시험 추가 / 이름·시험일 수정 다이얼로그.
 * 과목은 만들 때만 함께 받는다 (이후에는 관리 탭의 과목 편집에서).
 */
export function ExamFormDialog({ open, initial, onSubmit, onCancel }) {
  const editing = !!initial
  const [name, setName] = useState('')
  const [examDate, setExamDate] = useState('')
  const [subjects, setSubjects] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setName(initial?.name || '')
    setExamDate(initial?.examDate || '')
    setSubjects('')
    setError('')
  }, [open, initial])

  if (!open) return null

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('시험 이름을 입력해 주세요.')
      return
    }
    onSubmit({
      name: trimmed,
      examDate: examDate || '',
      subjects: subjects
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-sm space-y-3.5 rounded-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:pb-5">
        <h3 className="text-lg font-bold">{editing ? '시험 정보 수정' : '새 시험 추가'}</h3>

        <Field label="시험 이름" required>
          <input
            autoFocus={!editing}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예) 정보보안기사 필기"
            className={inputCls}
          />
        </Field>

        <Field label="시험일" hint="비워두면 D-day를 표시하지 않습니다">
          <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} className={inputCls} />
        </Field>

        {!editing && (
          <Field label="과목" hint="쉼표로 구분 · 나중에 바꿀 수 있습니다">
            <input
              value={subjects}
              onChange={(e) => setSubjects(e.target.value)}
              placeholder="정보보호론, 네트워크보안, 애플리케이션보안"
              className={inputCls}
            />
          </Field>
        )}

        {error && <p className="text-[14px] font-semibold text-red-600">{error}</p>}

        <div className="flex gap-2 pt-1">
          <Button variant="ghost" className="flex-1" onClick={onCancel}>
            취소
          </Button>
          <Button className="flex-1" onClick={submit}>
            {editing ? '저장' : '추가하기'}
          </Button>
        </div>
      </div>
    </div>
  )
}
