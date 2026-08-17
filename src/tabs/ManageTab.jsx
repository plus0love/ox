import { useEffect, useMemo, useRef, useState } from 'react'
import ProblemForm from '../components/ProblemForm'
import ProblemImage from '../components/ProblemImage'
import SyncPanel from '../components/SyncPanel'
import { Button, Card, ChipGroup, ConfirmDialog, EmptyState, SectionTitle, inputCls } from '../components/ui'
import { CHOICE_LABELS, accuracy, cls, formatDate, humanSize } from '../lib/util'
import { getStorageInfo, usedBytes } from '../lib/store'

export default function ManageTab({
  state,
  initialPanel,
  onUpdate,
  onDelete,
  onSubjectsChange,
  onExport,
  onImport,
  onResetStats,
  toast,
  syncProps,
}) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('전체')
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [panel, setPanel] = useState(initialPanel ?? null) // 'backup' | 'subjects' | null

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return state.problems
      .filter((p) => filter === '전체' || p.subject === filter)
      .filter((p) => {
        if (!kw) return true
        return (
          p.question.toLowerCase().includes(kw) ||
          p.explanation.toLowerCase().includes(kw) ||
          p.source.toLowerCase().includes(kw) ||
          p.choices.some((c) => c.toLowerCase().includes(kw))
        )
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }, [state.problems, q, filter])

  if (editing) {
    return (
      <div className="p-4">
        <h1 className="mb-5 text-2xl font-black text-slate-800">문제 수정</h1>
        <ProblemForm
          subjects={state.subjects}
          initial={editing}
          submitLabel="저장하기"
          onCancel={() => setEditing(null)}
          onSubmit={(data) => {
            onUpdate(editing.id, data)
            setEditing(null)
          }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-slate-800">문제 관리</h1>
        <span className="text-[15px] text-slate-500">{state.problems.length}개</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Button
          variant="ghost"
          className="px-2 text-[14px]"
          onClick={() => setPanel(panel === 'sync' ? null : 'sync')}
        >
          ☁️ 동기화
          {syncProps?.config && <span className="ml-1 text-emerald-600">●</span>}
        </Button>
        <Button
          variant="ghost"
          className="px-2 text-[14px]"
          onClick={() => setPanel(panel === 'backup' ? null : 'backup')}
        >
          💾 백업
        </Button>
        <Button
          variant="ghost"
          className="px-2 text-[14px]"
          onClick={() => setPanel(panel === 'subjects' ? null : 'subjects')}
        >
          🏷️ 과목
        </Button>
      </div>

      {panel === 'sync' && syncProps && <SyncPanel {...syncProps} toast={toast} />}
      {panel === 'backup' && (
        <BackupPanel state={state} onExport={onExport} onImport={onImport} onResetStats={onResetStats} toast={toast} />
      )}
      {panel === 'subjects' && <SubjectPanel state={state} onSubjectsChange={onSubjectsChange} toast={toast} />}

      {state.problems.length === 0 ? (
        <EmptyState icon="📂" title="등록된 문제가 없습니다" desc="등록 탭에서 오답을 추가해 주세요." />
      ) : (
        <>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="문제 · 선택지 · 해설 · 출처 검색"
            className={inputCls}
          />
          <ChipGroup options={['전체', ...state.subjects]} value={filter} onChange={setFilter} />

          <p className="text-[14px] text-slate-500">검색 결과 {filtered.length}개</p>

          <div className="space-y-2.5">
            {filtered.map((p) => (
              <ProblemRow
                key={p.id}
                problem={p}
                onEdit={() => setEditing(p)}
                onDelete={() => setConfirmDelete(p)}
              />
            ))}
            {filtered.length === 0 && (
              <p className="py-10 text-center text-[15px] text-slate-400">일치하는 문제가 없습니다.</p>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        danger
        title="문제를 삭제할까요?"
        desc={confirmDelete ? `"${confirmDelete.question.slice(0, 40)}…"\n삭제하면 되돌릴 수 없습니다.` : ''}
        confirmLabel="삭제"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          onDelete(confirmDelete.id)
          setConfirmDelete(null)
        }}
      />
    </div>
  )
}

function ProblemRow({ problem, onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  const acc = accuracy(problem)

  return (
    <Card noPad className="overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full p-4 text-left active:bg-slate-50">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[12px] font-bold text-slate-600">
            {problem.subject}
          </span>
          {problem.imageId && <span className="text-[12px] text-slate-400">🖼️</span>}
          <span
            className={cls(
              'rounded-full px-2 py-0.5 text-[12px] font-bold',
              acc === null
                ? 'bg-slate-100 text-slate-400'
                : acc >= 80
                  ? 'bg-emerald-100 text-emerald-700'
                  : acc >= 50
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-red-100 text-red-700',
            )}
          >
            {acc === null ? '미풀이' : `${acc}% (${problem.correctCount}/${problem.attempts})`}
          </span>
          {problem.source && <span className="text-[12px] text-slate-400">{problem.source}</span>}
        </div>
        <p className={cls('text-[16px] leading-relaxed text-slate-800', !open && 'line-clamp-2')}>
          {problem.question}
        </p>
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50 p-4">
          <ProblemImage imageId={problem.imageId} />
          <ol className="space-y-1.5 text-[15px]">
            {problem.choices.map((c, i) =>
              c ? (
                <li
                  key={i}
                  className={cls('flex gap-2', i === problem.answer ? 'font-bold text-emerald-700' : 'text-slate-600')}
                >
                  <span>{CHOICE_LABELS[i]}</span>
                  <span className="whitespace-pre-line">{c}</span>
                </li>
              ) : null,
            )}
          </ol>
          {problem.explanation && (
            <p className="rounded-xl bg-white p-3 text-[15px] leading-relaxed whitespace-pre-line text-slate-600">
              {problem.explanation}
            </p>
          )}
          <p className="text-[13px] text-slate-400">
            등록 {formatDate(problem.createdAt)}
            {problem.lastAttemptedAt && ` · 최근 풀이 ${formatDate(problem.lastAttemptedAt)}`}
            {problem.streak > 0 && ` · 연속 정답 ${problem.streak}회`}
          </p>
          <div className="flex gap-2">
            <Button variant="subtle" className="flex-1" onClick={onEdit}>
              수정
            </Button>
            <Button variant="subtle" className="flex-1 text-red-600" onClick={onDelete}>
              삭제
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

/* ---------------- 백업 / 복원 ---------------- */

function BackupPanel({ state, onExport, onImport, onResetStats, toast }) {
  const [withImages, setWithImages] = useState(true)
  const [mode, setMode] = useState('skip')
  const [pasted, setPasted] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [storage, setStorage] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    getStorageInfo().then(setStorage)
  }, [])

  async function run(fn) {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => run(() => onImport(String(reader.result), mode))
    reader.onerror = () => toast('파일을 읽지 못했습니다.', 'error')
    reader.readAsText(file)
  }

  return (
    <Card className="space-y-4">
      <SectionTitle right={<span className="text-[13px] text-slate-400">{humanSize(usedBytes())} 사용</span>}>
        백업 / 복원
      </SectionTitle>

      <div className="space-y-1 rounded-xl bg-slate-50 px-3.5 py-3 text-[13.5px] leading-relaxed text-slate-600">
        <p>
          마지막 백업{' '}
          <b className={state.lastBackupAt ? 'text-slate-800' : 'text-amber-600'}>
            {state.lastBackupAt ? formatDate(state.lastBackupAt) : '없음'}
          </b>
        </p>
        {storage && (
          <p>
            저장소 영구 보관{' '}
            <b className={storage.persisted ? 'text-emerald-600' : 'text-slate-500'}>
              {storage.persisted === null ? '알 수 없음' : storage.persisted ? '적용됨' : '미적용'}
            </b>
            {storage.quota && (
              <span className="text-slate-400">
                {' '}
                · {humanSize(storage.usage || 0)} / {humanSize(storage.quota)}
              </span>
            )}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label className="flex min-h-[44px] items-center gap-2.5 text-[15px] text-slate-700">
          <input
            type="checkbox"
            checked={withImages}
            onChange={(e) => setWithImages(e.target.checked)}
            className="h-5 w-5 accent-slate-800"
          />
          첨부 이미지도 함께 내보내기 (파일 커짐)
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={busy} onClick={() => run(() => onExport(withImages, 'download'))}>
            파일로 저장
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => run(() => onExport(withImages, 'clipboard'))}>
            클립보드 복사
          </Button>
        </div>
        <p className="text-[13px] leading-relaxed text-slate-500">
          iOS에서 파일 저장이 안 되면 클립보드로 복사한 뒤 메모앱에 붙여넣어 보관하세요.
        </p>
      </div>

      <hr className="border-slate-100" />

      <div className="space-y-2">
        <p className="text-[15px] font-bold text-slate-700">가져오기</p>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { v: 'skip', l: '병합\n(중복 유지)' },
            { v: 'overwrite', l: '병합\n(덮어쓰기)' },
            { v: 'replace', l: '전체 교체' },
          ].map((m) => (
            <button
              key={m.v}
              type="button"
              onClick={() => setMode(m.v)}
              className={cls(
                'min-h-[52px] rounded-xl px-1 text-[13px] leading-tight font-bold whitespace-pre-line transition',
                mode === m.v
                  ? m.v === 'replace'
                    ? 'bg-red-600 text-white'
                    : 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 active:bg-slate-200',
              )}
            >
              {m.l}
            </button>
          ))}
        </div>

        <input ref={fileRef} type="file" accept="application/json,.json" onChange={handleFile} className="hidden" />
        <Button variant="ghost" className="w-full" disabled={busy} onClick={() => fileRef.current?.click()}>
          JSON 파일 선택
        </Button>

        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={3}
          placeholder="또는 백업 JSON을 여기에 붙여넣기"
          className={cls(inputCls, 'resize-y text-[14px]')}
        />
        <Button
          variant="ghost"
          className="w-full"
          disabled={busy || !pasted.trim()}
          onClick={() => run(async () => {
            await onImport(pasted, mode)
            setPasted('')
          })}
        >
          붙여넣은 내용 가져오기
        </Button>
      </div>

      <hr className="border-slate-100" />

      <Button variant="subtle" className="w-full text-red-600" onClick={() => setConfirmReset(true)}>
        모든 풀이 기록 초기화 (문제는 유지)
      </Button>

      <ConfirmDialog
        open={confirmReset}
        danger
        title="풀이 기록을 초기화할까요?"
        desc={`문제 ${state.problems.length}개는 그대로 두고\n시도 횟수 · 정답률 · 학습 기록만 지웁니다.`}
        confirmLabel="초기화"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          onResetStats()
          setConfirmReset(false)
        }}
      />
    </Card>
  )
}

/* ---------------- 과목 편집 ---------------- */

function SubjectPanel({ state, onSubjectsChange, toast }) {
  const [newSubject, setNewSubject] = useState('')
  const [renaming, setRenaming] = useState(null)
  const [renameTo, setRenameTo] = useState('')

  const counts = useMemo(() => {
    const m = {}
    for (const p of state.problems) m[p.subject] = (m[p.subject] || 0) + 1
    return m
  }, [state.problems])

  function add() {
    const name = newSubject.trim()
    if (!name) return
    if (state.subjects.includes(name)) {
      toast('이미 있는 과목입니다.', 'error')
      return
    }
    onSubjectsChange([...state.subjects, name])
    setNewSubject('')
  }

  function remove(name) {
    if (counts[name]) {
      toast(`"${name}"에 문제 ${counts[name]}개가 있어 삭제할 수 없습니다.`, 'error')
      return
    }
    if (state.subjects.length <= 1) {
      toast('과목은 최소 1개 필요합니다.', 'error')
      return
    }
    onSubjectsChange(state.subjects.filter((s) => s !== name))
  }

  function commitRename() {
    const to = renameTo.trim()
    if (!to || to === renaming) {
      setRenaming(null)
      return
    }
    if (state.subjects.includes(to)) {
      toast('이미 있는 과목입니다.', 'error')
      return
    }
    onSubjectsChange(
      state.subjects.map((s) => (s === renaming ? to : s)),
      { from: renaming, to },
    )
    setRenaming(null)
  }

  return (
    <Card className="space-y-3">
      <SectionTitle>과목 편집</SectionTitle>
      <ul className="space-y-2">
        {state.subjects.map((s) => (
          <li key={s} className="flex items-center gap-2">
            {renaming === s ? (
              <>
                <input
                  autoFocus
                  value={renameTo}
                  onChange={(e) => setRenameTo(e.target.value)}
                  className={cls(inputCls, 'flex-1 py-2.5')}
                />
                <Button variant="primary" className="min-h-[44px] px-3 text-sm" onClick={commitRename}>
                  저장
                </Button>
                <Button variant="subtle" className="min-h-[44px] px-3 text-sm" onClick={() => setRenaming(null)}>
                  취소
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-[16px] font-semibold text-slate-700">
                  {s} <span className="text-[13px] font-normal text-slate-400">{counts[s] || 0}개</span>
                </span>
                <Button
                  variant="subtle"
                  className="min-h-[44px] px-3 text-sm"
                  onClick={() => {
                    setRenaming(s)
                    setRenameTo(s)
                  }}
                >
                  이름변경
                </Button>
                <Button
                  variant="subtle"
                  className="min-h-[44px] px-3 text-sm text-red-600"
                  onClick={() => remove(s)}
                >
                  삭제
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          value={newSubject}
          onChange={(e) => setNewSubject(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="새 과목 이름"
          className={cls(inputCls, 'flex-1')}
        />
        <Button className="px-5" onClick={add}>
          추가
        </Button>
      </div>
    </Card>
  )
}
