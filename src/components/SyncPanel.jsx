import { useState } from 'react'
import { Button, Card, ConfirmDialog, Field, SectionTitle, inputCls } from './ui'
import { cls, formatDate } from '../lib/util'
import { verifyConnection } from '../lib/sync'

/**
 * GitHub 동기화 설정 화면.
 * 토큰은 이 기기의 브라우저에만 저장되고, JSON 백업에는 포함되지 않는다.
 */
export default function SyncPanel({ config, meta, syncing, syncStatus, onSave, onDisconnect, onSyncNow, toast }) {
  const [form, setForm] = useState(() => ({
    owner: config?.owner || '',
    repo: config?.repo || 'ox-data',
    branch: config?.branch || 'main',
    token: config?.token || '',
  }))
  const [checking, setChecking] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [showToken, setShowToken] = useState(false)

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  async function saveAndVerify() {
    const cfg = {
      owner: form.owner.trim().replace(/^@/, ''),
      repo: form.repo.trim(),
      branch: form.branch.trim() || 'main',
      token: form.token.trim(),
    }
    if (!cfg.owner || !cfg.repo || !cfg.token) {
      toast('사용자명 · 저장소 · 토큰을 모두 입력해 주세요.', 'error')
      return
    }
    setChecking(true)
    try {
      const info = await verifyConnection(cfg)
      onSave(cfg)
      toast(
        info.private
          ? '연결되었습니다. (비공개 저장소 확인됨)'
          : '연결되었습니다. 다만 이 저장소는 공개 상태입니다.',
        info.private ? 'ok' : 'error',
      )
    } catch (e) {
      toast(e.message || '연결에 실패했습니다.', 'error')
    } finally {
      setChecking(false)
    }
  }

  const connected = !!config

  return (
    <Card className="space-y-4">
      <SectionTitle
        right={
          connected ? (
            <span className="text-[13px] font-bold text-emerald-600">연결됨</span>
          ) : (
            <span className="text-[13px] text-slate-400">미연결</span>
          )
        }
      >
        기기 간 동기화
      </SectionTitle>

      {connected ? (
        <>
          <div className="space-y-1 rounded-xl bg-slate-50 px-3.5 py-3 text-[13.5px] leading-relaxed text-slate-600">
            <p>
              저장소{' '}
              <b className="text-slate-800">
                {config.owner}/{config.repo}
              </b>
            </p>
            <p>
              마지막 동기화{' '}
              <b className="text-slate-800">{meta?.lastSyncAt ? formatDate(meta.lastSyncAt) : '없음'}</b>
              {meta?.dirty && <span className="ml-1.5 text-amber-600">· 올릴 변경 있음</span>}
            </p>
            {syncStatus && <p className="text-slate-500">{syncStatus}</p>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button disabled={syncing} onClick={onSyncNow}>
              {syncing ? '동기화 중…' : '지금 동기화'}
            </Button>
            <Button variant="ghost" disabled={syncing} onClick={() => setConfirmDisconnect(true)}>
              연결 해제
            </Button>
          </div>

          <p className="text-[13px] leading-relaxed text-slate-500">
            등록·수정 후 잠시 뒤, 그리고 앱을 벗어날 때 자동으로 올라갑니다. 인터넷이 없으면 로컬에만 저장했다가
            연결되면 자동으로 맞춥니다.
          </p>
        </>
      ) : (
        <>
          <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-[13.5px] leading-relaxed text-slate-600">
            비공개 저장소에 데이터를 보관해 어느 기기에서든 이어서 풀 수 있게 합니다. 토큰은 이 기기에만
            저장되고 백업 파일에도 들어가지 않습니다.
          </p>

          <Field label="GitHub 사용자명" required>
            <input
              value={form.owner}
              onChange={(e) => set({ owner: e.target.value })}
              placeholder="예: seona"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={inputCls}
            />
          </Field>

          <Field label="데이터 저장소 이름" required hint="비공개(private)여야 합니다">
            <input
              value={form.repo}
              onChange={(e) => set({ repo: e.target.value })}
              placeholder="ox-data"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={inputCls}
            />
          </Field>

          <Field label="액세스 토큰" required hint="github_pat_ 로 시작">
            <div className="flex gap-2">
              <input
                type={showToken ? 'text' : 'password'}
                value={form.token}
                onChange={(e) => set({ token: e.target.value })}
                placeholder="github_pat_..."
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className={cls(inputCls, 'flex-1')}
              />
              <Button
                type="button"
                variant="subtle"
                className="px-3 text-sm"
                onClick={() => setShowToken((v) => !v)}
              >
                {showToken ? '숨기기' : '보기'}
              </Button>
            </div>
          </Field>

          <Button className="w-full" disabled={checking} onClick={saveAndVerify}>
            {checking ? '확인 중…' : '연결하고 동기화 시작'}
          </Button>
        </>
      )}

      <ConfirmDialog
        open={confirmDisconnect}
        danger
        title="동기화를 해제할까요?"
        desc={'이 기기에서 토큰을 지웁니다.\n문제 데이터는 이 기기와 저장소 양쪽에 그대로 남습니다.'}
        confirmLabel="해제"
        onCancel={() => setConfirmDisconnect(false)}
        onConfirm={() => {
          onDisconnect()
          setConfirmDisconnect(false)
        }}
      />
    </Card>
  )
}
