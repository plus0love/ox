/**
 * 로컬(localStorage + IndexedDB) ↔ 원격(GitHub 저장소) 동기화.
 *
 * 설계
 *  - 로컬 우선: 화면은 항상 로컬 데이터를 보여준다. 인터넷이 없어도 앱은 그대로 동작한다.
 *  - 합치기: 올리기 전에 항상 원격을 읽어 병합한다. 덮어쓰지 않는다.
 *  - 충돌: 그 사이 원격이 바뀌면 GitHub이 거부한다(409). 다시 읽어 합치고 재시도한다.
 */
import {
  checkAccess,
  commitFiles,
  getHead,
  getTreeMap,
  GitHubError,
  hasRemoteImage,
  imagePath,
  readRemoteImage,
  readRemoteState,
  DATA_PATH,
} from './github'
import { getImage, putImage } from './imagedb'
import { loadSyncMeta, mergeStates, saveSyncMeta } from './store'

const MAX_RETRY = 2

/** 앱 데이터만 추출 (토큰 등 기기별 설정은 절대 올리지 않는다) */
function toRemotePayload(state) {
  return {
    app: 'ox-wrongnote',
    version: state.version,
    updatedAt: new Date().toISOString(),
    subjects: state.subjects,
    subjectsUpdatedAt: state.subjectsUpdatedAt,
    problems: state.problems,
    logs: state.logs,
    deleted: state.deleted,
  }
}

export async function verifyConnection(cfg) {
  const info = await checkAccess(cfg)
  return info
}

/**
 * 한 번의 동기화 사이클: 원격 읽기 → 병합 → (변경 있으면) 올리기 → 이미지 맞추기.
 *
 * @param cfg    GitHub 설정
 * @param state  현재 로컬 상태
 * @param opts.force  변경이 없어도 올리기
 * @param opts.onProgress 진행 상황 문자열 콜백
 * @returns { state, pushed, commit, pulledImages }
 */
export async function syncOnce(cfg, state, opts = {}) {
  const { onProgress = () => {}, force = false } = opts
  const meta = loadSyncMeta()

  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    onProgress('원격 데이터 확인 중…')
    const head = await getHead(cfg)
    const treeMap = head ? await getTreeMap(cfg, head.treeSha) : {}
    const remote = head ? await readRemoteState(cfg, treeMap) : null

    onProgress('합치는 중…')
    const merged = mergeStates(state, remote)

    // 올릴 필요가 있는지 판단: 원격과 내용이 같으면 빈 커밋을 만들지 않는다.
    // 원격도 병합과 똑같은 정규화·통계재계산을 거치게 해서 공정하게 비교한다.
    const contentChanged = !remote || comparable(merged) !== comparable(mergeStates(remote, remote))

    // 아직 원격에 없는 이미지 모으기
    const newImages = []
    for (const p of merged.problems) {
      if (!p.imageId || hasRemoteImage(treeMap, p.imageId)) continue
      const dataUrl = await getImage(p.imageId)
      if (!dataUrl) continue
      newImages.push({
        path: imagePath(p.imageId),
        content: dataUrl.replace(/^data:[^;]+;base64,/, ''),
        encoding: 'base64',
      })
    }

    let pushed = false
    let commit = head?.commitSha || null

    if (contentChanged || newImages.length > 0 || force || meta.dirty) {
      onProgress(newImages.length ? `올리는 중… (이미지 ${newImages.length}장 포함)` : '올리는 중…')
      const files = [
        { path: DATA_PATH, content: JSON.stringify(toRemotePayload(merged), null, 2), encoding: 'utf-8' },
        ...newImages,
      ]
      try {
        commit = await commitFiles(cfg, files, commitMessage(merged, newImages.length), head)
        pushed = true
      } catch (e) {
        // 다른 기기가 먼저 올림 → 다시 읽어서 합치고 재시도
        if (e instanceof GitHubError && e.status === 409 && attempt < MAX_RETRY) {
          onProgress('다른 기기의 변경을 반영하는 중…')
          state = merged
          continue
        }
        throw e
      }
    }

    // 원격에만 있는 이미지 내려받기 (오프라인에서도 보이도록)
    onProgress('이미지 확인 중…')
    let pulledImages = 0
    for (const p of merged.problems) {
      if (!p.imageId) continue
      if (await getImage(p.imageId)) continue
      const dataUrl = await readRemoteImage(cfg, treeMap, p.imageId)
      if (dataUrl) {
        await putImage(p.imageId, dataUrl)
        pulledImages++
      }
    }

    saveSyncMeta({ dirty: false, lastSyncAt: new Date().toISOString(), lastCommit: commit })
    return { state: merged, pushed, commit, pulledImages }
  }

  throw new GitHubError('동기화 충돌이 반복되어 중단했습니다. 잠시 후 다시 시도하세요.', 409)
}

/** 비교용 문자열 — 매번 바뀌는 updatedAt은 빼고, 순서 차이도 없앤다 */
function comparable(state) {
  return JSON.stringify({
    subjects: state.subjects,
    subjectsUpdatedAt: state.subjectsUpdatedAt,
    problems: [...state.problems].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    logs: state.logs,
    deleted: Object.fromEntries(Object.entries(state.deleted || {}).sort()),
  })
}

function commitMessage(state, imageCount) {
  const parts = [`문제 ${state.problems.length}개`]
  if (imageCount) parts.push(`이미지 +${imageCount}`)
  return `오답노트 동기화 — ${parts.join(', ')}`
}
