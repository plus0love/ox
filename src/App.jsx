import { useCallback, useEffect, useRef, useState } from 'react'
import HomeTab from './tabs/HomeTab'
import QuizTab from './tabs/QuizTab'
import AddTab from './tabs/AddTab'
import ManageTab from './tabs/ManageTab'
import { cls, dayKey, uid } from './lib/util'
import {
  clearGitHubConfig,
  loadGitHubConfig,
  loadState,
  loadSyncMeta,
  markDirty,
  normalizeProblem,
  normalizeState,
  pruneLogs,
  requestPersistentStorage,
  saveGitHubConfig,
  saveState,
  saveSession,
  SCHEMA_VERSION,
} from './lib/store'
import { syncOnce } from './lib/sync'
import { clearImages, deleteImage, getAllImages, putImage, putImages } from './lib/imagedb'

const TABS = [
  { key: 'home', label: '홈', icon: '📊' },
  { key: 'quiz', label: '퀴즈', icon: '✏️' },
  { key: 'add', label: '등록', icon: '➕' },
  { key: 'manage', label: '관리', icon: '🗂️' },
]

export default function App() {
  const [state, setState] = useState(loadState)
  const [tab, setTab] = useState('home')
  const [focusMode, setFocusMode] = useState(false)
  const [quizRequest, setQuizRequest] = useState(null)
  const [managePanel, setManagePanel] = useState(null)
  const [toastMsg, setToastMsg] = useState(null)
  const firstRender = useRef(true)

  /* GitHub 동기화 */
  const [ghConfig, setGhConfig] = useState(loadGitHubConfig)
  const [syncMeta, setSyncMeta] = useState(loadSyncMeta)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState('')
  const stateRef = useRef(state)
  const syncingRef = useRef(false)
  const syncTimer = useRef(null)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  /* 브라우저의 저장소 자동 삭제 대상에서 제외되도록 최초 1회 요청 */
  useEffect(() => {
    requestPersistentStorage()
  }, [])

  /* 상태가 바뀔 때마다 localStorage에 저장 */
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const res = saveState(state)
    if (!res.ok) setToastMsg({ text: res.error, kind: 'error' })
  }, [state])

  const toast = useCallback((text, kind = 'ok') => setToastMsg({ text, kind }), [])

  useEffect(() => {
    if (!toastMsg) return
    const t = setTimeout(() => setToastMsg(null), 3200)
    return () => clearTimeout(t)
  }, [toastMsg])

  const goTab = useCallback((key, opts) => {
    setManagePanel(opts?.panel ?? null)
    setTab(key)
    window.scrollTo({ top: 0 })
  }, [])

  const onFocusMode = useCallback((v) => setFocusMode(v), [])
  const onRequestHandled = useCallback(() => setQuizRequest(null), [])

  /* ---------- 동기화 ---------- */

  const runSync = useCallback(
    async ({ notify = false } = {}) => {
      const cfg = loadGitHubConfig()
      if (!cfg || syncingRef.current) return
      syncingRef.current = true
      setSyncing(true)
      setSyncStatus('')
      try {
        const res = await syncOnce(cfg, stateRef.current, { onProgress: setSyncStatus })
        setState(res.state)
        setSyncMeta(loadSyncMeta())
        if (notify) {
          toast(
            res.pushed
              ? `동기화 완료${res.pulledImages ? ` · 이미지 ${res.pulledImages}장 받음` : ''}`
              : '이미 최신 상태입니다.',
          )
        }
      } catch (e) {
        // 자동 동기화 실패는 조용히 넘긴다 (오프라인일 수 있음) — 수동 실행일 때만 알림
        if (notify) toast(e?.message || '동기화에 실패했습니다.', 'error')
        else console.warn('자동 동기화 실패:', e?.message || e)
      } finally {
        setSyncStatus('')
        syncingRef.current = false
        setSyncing(false)
      }
    },
    [toast],
  )

  /** 사용자가 데이터를 바꿨을 때 — 표시해두고 잠시 뒤 한 번에 올린다 */
  const scheduleSync = useCallback(() => {
    markDirty()
    setSyncMeta(loadSyncMeta())
    if (!loadGitHubConfig()) return
    clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => runSync(), 6000)
  }, [runSync])

  /* 앱을 열 때, 그리고 앱을 벗어나거나 인터넷이 돌아올 때 맞춘다 */
  useEffect(() => {
    if (loadGitHubConfig()) runSync()
  }, [runSync])

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && loadSyncMeta().dirty) runSync()
    }
    const onOnline = () => {
      if (loadSyncMeta().dirty) runSync()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('online', onOnline)
      clearTimeout(syncTimer.current)
    }
  }, [runSync])

  const connectSync = useCallback(
    (cfg) => {
      saveGitHubConfig(cfg)
      setGhConfig(cfg)
      markDirty()
      setSyncMeta(loadSyncMeta())
      runSync({ notify: true })
    },
    [runSync],
  )

  const disconnectSync = useCallback(() => {
    clearGitHubConfig()
    setGhConfig(null)
    setSyncMeta(loadSyncMeta())
    toast('동기화를 해제했습니다.')
  }, [toast])

  /* ---------- 문제 CRUD ---------- */

  const createProblem = useCallback(
    async (data) => {
      const { _image, ...rest } = data
      let imageId = null
      if (_image) {
        imageId = uid('img')
        try {
          await putImage(imageId, _image)
        } catch {
          imageId = null
          toast('이미지 저장에 실패해 이미지 없이 등록했습니다.', 'error')
        }
      }
      const now = new Date().toISOString()
      const problem = normalizeProblem({ ...rest, id: uid(), imageId, createdAt: now, updatedAt: now })
      setState((s) => ({ ...s, problems: [...s.problems, problem] }))
      scheduleSync()
      toast('등록되었습니다.')
    },
    [scheduleSync, toast],
  )

  const updateProblem = useCallback(
    async (id, data) => {
      const { _image, ...rest } = data
      const prev = state.problems.find((p) => p.id === id)
      if (!prev) return

      let imageId = prev.imageId
      try {
        if (!_image && prev.imageId) {
          await deleteImage(prev.imageId)
          imageId = null
        } else if (_image) {
          imageId = prev.imageId || uid('img')
          await putImage(imageId, _image)
        }
      } catch {
        toast('이미지 처리에 실패했습니다.', 'error')
      }

      setState((s) => ({
        ...s,
        problems: s.problems.map((p) =>
          p.id === id
            ? normalizeProblem({ ...p, ...rest, imageId, updatedAt: new Date().toISOString() })
            : p,
        ),
      }))
      scheduleSync()
      toast('수정되었습니다.')
    },
    [state.problems, scheduleSync, toast],
  )

  const deleteProblem = useCallback(
    async (id) => {
      const target = state.problems.find((p) => p.id === id)
      if (target?.imageId) await deleteImage(target.imageId).catch(() => {})
      // 삭제 기록을 남겨야 다른 기기와 합칠 때 지운 문제가 되살아나지 않는다.
      // 학습 로그는 남긴다 — 7일 학습량 그래프는 "그날 얼마나 풀었나"의 기록이므로.
      setState((s) => ({
        ...s,
        problems: s.problems.filter((p) => p.id !== id),
        deleted: { ...s.deleted, [id]: new Date().toISOString() },
      }))
      scheduleSync()
      toast('삭제되었습니다.')
    },
    [state.problems, scheduleSync, toast],
  )

  /* ---------- 채점 기록 ---------- */

  const recordAnswer = useCallback((id, ok) => {
    const now = new Date().toISOString()
    setState((s) => ({
      ...s,
      problems: s.problems.map((p) =>
        p.id === id
          ? {
              ...p,
              attempts: p.attempts + 1,
              correctCount: p.correctCount + (ok ? 1 : 0),
              streak: ok ? (p.streak || 0) + 1 : 0,
              lastAttemptedAt: now,
              lastResult: ok,
            }
          : p,
      ),
      logs: pruneLogs([...s.logs, { t: Date.now(), id, ok }]),
    }))
    scheduleSync()
  }, [scheduleSync])

  /* ---------- 과목 ---------- */

  const changeSubjects = useCallback(
    (subjects, rename) => {
      const now = new Date().toISOString()
      setState((s) => ({
        ...s,
        subjects,
        subjectsUpdatedAt: now,
        problems: rename
          ? s.problems.map((p) =>
              p.subject === rename.from ? { ...p, subject: rename.to, updatedAt: now } : p,
            )
          : s.problems,
      }))
      scheduleSync()
    },
    [scheduleSync],
  )

  /* ---------- 백업 / 복원 ---------- */

  const exportData = useCallback(
    async (withImages, target) => {
      const fileName = `오답노트-${dayKey(new Date()).replace(/-/g, '')}.json`

      // 저장 위치를 직접 고를 수 있는 브라우저(PC 크롬/엣지)에서는 먼저 대화상자를 띄운다.
      // 데이터를 모으느라 시간이 흐르면 사용자 제스처가 만료되므로 반드시 이 순서로.
      let fileHandle = null
      if (target === 'download' && typeof window.showSaveFilePicker === 'function') {
        try {
          fileHandle = await window.showSaveFilePicker({
            suggestedName: fileName,
            types: [{ description: '오답노트 백업', accept: { 'application/json': ['.json'] } }],
          })
        } catch (e) {
          if (e?.name === 'AbortError') return // 사용자가 취소
          fileHandle = null // 미지원/차단 시 기존 다운로드 방식으로
        }
      }

      const payload = {
        app: 'ox-wrongnote',
        version: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        subjects: state.subjects,
        subjectsUpdatedAt: state.subjectsUpdatedAt,
        problems: state.problems,
        logs: state.logs,
        deleted: state.deleted,
        images: {},
      }
      if (withImages) {
        try {
          const all = await getAllImages()
          const used = new Set(state.problems.map((p) => p.imageId).filter(Boolean))
          payload.images = Object.fromEntries(Object.entries(all).filter(([k]) => used.has(k)))
        } catch {
          toast('이미지를 불러오지 못해 텍스트만 내보냅니다.', 'error')
        }
      }
      const json = JSON.stringify(payload)

      const markBackedUp = () => setState((s) => ({ ...s, lastBackupAt: new Date().toISOString() }))

      if (target === 'clipboard') {
        const ok = await copyText(json)
        if (ok) markBackedUp()
        toast(ok ? '클립보드에 복사했습니다.' : '복사에 실패했습니다.', ok ? 'ok' : 'error')
        return
      }

      if (fileHandle) {
        try {
          const writable = await fileHandle.createWritable()
          await writable.write(json)
          await writable.close()
          markBackedUp()
          toast(`저장했습니다 — ${fileHandle.name}`)
          return
        } catch {
          toast('선택한 위치에 저장하지 못해 다운로드 폴더로 저장합니다.', 'error')
        }
      }

      try {
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        markBackedUp()
        toast('다운로드 폴더에 백업했습니다.')
      } catch {
        toast('파일 저장에 실패했습니다. 클립보드 복사를 이용해 주세요.', 'error')
      }
    },
    [state, toast],
  )

  const importData = useCallback(
    async (text, mode) => {
      let payload
      try {
        payload = JSON.parse(text)
      } catch {
        toast('JSON 형식이 올바르지 않습니다.', 'error')
        return
      }
      if (!payload || !Array.isArray(payload.problems)) {
        toast('오답노트 백업 파일이 아닙니다.', 'error')
        return
      }

      const incoming = payload.problems.map(normalizeProblem)
      const images = payload.images && typeof payload.images === 'object' ? payload.images : {}

      if (mode === 'replace') {
        const next = normalizeState({
          subjects: payload.subjects,
          subjectsUpdatedAt: payload.subjectsUpdatedAt,
          problems: incoming,
          logs: payload.logs,
          deleted: payload.deleted,
        })
        try {
          await clearImages()
          await putImages(images)
        } catch {
          toast('이미지 복원에 실패했습니다.', 'error')
        }
        setState(next)
        saveSession(null) // 진행 중 세션은 데이터와 어긋나므로 폐기
        scheduleSync()
        toast(`전체 교체 완료 — 문제 ${incoming.length}개`)
        return
      }

      // 집계는 setState 밖에서 (업데이터가 두 번 호출돼도 개수가 어긋나지 않도록)
      let added = 0
      let updated = 0
      const acceptedImageIds = new Set()
      const map = new Map(state.problems.map((p) => [p.id, p]))
      for (const p of incoming) {
        if (map.has(p.id)) {
          if (mode !== 'overwrite') continue
          map.set(p.id, p)
          updated++
        } else {
          map.set(p.id, p)
          added++
        }
        if (p.imageId) acceptedImageIds.add(p.imageId)
      }
      const merged = normalizeState({
        subjects: [...new Set([...state.subjects, ...(payload.subjects || [])])],
        subjectsUpdatedAt: new Date().toISOString(),
        deleted: { ...(payload.deleted || {}), ...state.deleted },
        problems: [...map.values()],
        logs: pruneLogs(
          [...state.logs, ...(Array.isArray(payload.logs) ? payload.logs : [])]
            .filter((l) => l && typeof l.t === 'number')
            .sort((a, b) => a.t - b.t),
        ),
      })
      setState(merged)

      try {
        await putImages(Object.fromEntries(Object.entries(images).filter(([k]) => acceptedImageIds.has(k))))
      } catch {
        toast('이미지 복원에 실패했습니다.', 'error')
      }
      scheduleSync()
      toast(`가져오기 완료 — 추가 ${added}개${mode === 'overwrite' ? `, 갱신 ${updated}개` : ''}`)
    },
    [state, scheduleSync, toast],
  )

  const resetStats = useCallback(() => {
    setState((s) => ({
      ...s,
      problems: s.problems.map((p) => ({
        ...p,
        attempts: 0,
        correctCount: 0,
        streak: 0,
        lastAttemptedAt: null,
        lastResult: null,
      })),
      logs: [],
    }))
    saveSession(null)
    scheduleSync()
    toast('풀이 기록을 초기화했습니다.')
  }, [scheduleSync, toast])

  /* ---------- 렌더 ---------- */

  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-slate-100">
      <main className={cls(focusMode ? 'pb-0' : 'pb-[calc(72px+env(safe-area-inset-bottom))]')}>
        {tab === 'home' && (
          <HomeTab
            state={state}
            onGoTab={goTab}
            onStartWeakQuiz={() => {
              setQuizRequest({ scope: 'weak', count: 'all' })
              goTab('quiz')
            }}
            onGoBackup={() => goTab('manage', { panel: 'backup' })}
          />
        )}
        {tab === 'quiz' && (
          <QuizTab
            state={state}
            onAnswer={recordAnswer}
            onFocusMode={onFocusMode}
            onGoTab={goTab}
            request={quizRequest}
            onRequestHandled={onRequestHandled}
          />
        )}
        {tab === 'add' && <AddTab state={state} onCreate={createProblem} />}
        {tab === 'manage' && (
          <ManageTab
            state={state}
            initialPanel={managePanel}
            onUpdate={updateProblem}
            onDelete={deleteProblem}
            onSubjectsChange={changeSubjects}
            onExport={exportData}
            onImport={importData}
            onResetStats={resetStats}
            toast={toast}
            syncProps={{
              config: ghConfig,
              meta: syncMeta,
              syncing,
              syncStatus,
              onSave: connectSync,
              onDisconnect: disconnectSync,
              onSyncNow: () => runSync({ notify: true }),
            }}
          />
        )}
      </main>

      {!focusMode && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto flex max-w-2xl">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => goTab(t.key)}
                className={cls(
                  'flex min-h-[64px] flex-1 flex-col items-center justify-center gap-0.5 transition active:bg-slate-100',
                  tab === t.key ? 'text-slate-900' : 'text-slate-400',
                )}
              >
                <span className={cls('text-xl', tab !== t.key && 'opacity-50')}>{t.icon}</span>
                <span className="text-[12.5px] font-bold">{t.label}</span>
              </button>
            ))}
          </div>
        </nav>
      )}

      {toastMsg && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
          <div
            className={cls(
              'max-w-md rounded-xl px-4 py-3 text-[15px] font-semibold text-white shadow-lg',
              toastMsg.kind === 'error' ? 'bg-red-600' : 'bg-slate-800',
            )}
          >
            {toastMsg.text}
          </div>
        </div>
      )}
    </div>
  )
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* 아래 폴백 사용 */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}
