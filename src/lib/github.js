/**
 * GitHub REST API 래퍼 (Git Data API 기반).
 *
 * contents API 대신 Git Data API를 쓰는 이유:
 *  - data.json과 이미지 여러 장을 "한 번의 커밋"으로 묶을 수 있다
 *  - ref 업데이트 시 force를 끄면 GitHub이 충돌을 거부해 준다 → 조용한 덮어쓰기 방지
 */
const API = 'https://api.github.com'
const DATA_PATH = 'data.json'
const IMAGE_DIR = 'images'

export class GitHubError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'GitHubError'
    this.status = status
  }
}

async function req(cfg, path, options = {}) {
  let res
  try {
    res = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new GitHubError('네트워크에 연결할 수 없습니다.', 0)
  }

  if (!res.ok) {
    let msg = `요청 실패 (${res.status})`
    try {
      const body = await res.json()
      if (body?.message) msg = body.message
    } catch {
      /* 본문 없음 */
    }
    if (res.status === 401) msg = '토큰이 올바르지 않거나 만료되었습니다.'
    if (res.status === 403 && /rate limit/i.test(msg)) msg = 'GitHub 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.'
    if (res.status === 404) msg = '저장소를 찾을 수 없습니다. 소유자/저장소 이름과 토큰 권한을 확인하세요.'
    throw new GitHubError(msg, res.status)
  }
  return res.status === 204 ? null : res.json()
}

/* ---------- base64 (UTF-8 안전) ---------- */

export function toBase64(str) {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  const CHUNK = 0x8000 // 인자 개수 제한 회피
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

export function fromBase64(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

/* ---------- 저장소 조회 ---------- */

/** 접근 가능 여부 확인. 기본 브랜치 이름을 돌려준다. */
export async function checkAccess(cfg) {
  const repo = await req(cfg, `/repos/${cfg.owner}/${cfg.repo}`)
  if (!repo.permissions?.push) {
    throw new GitHubError('이 저장소에 쓸 권한이 없습니다. 토큰 권한을 Contents: Read and write로 설정하세요.', 403)
  }
  return { defaultBranch: repo.default_branch || 'main', private: repo.private }
}

/** 현재 브랜치 머리 커밋. 커밋이 하나도 없으면 null. */
export async function getHead(cfg) {
  try {
    const ref = await req(cfg, `/repos/${cfg.owner}/${cfg.repo}/git/ref/heads/${cfg.branch}`)
    const commit = await req(cfg, `/repos/${cfg.owner}/${cfg.repo}/git/commits/${ref.object.sha}`)
    return { commitSha: ref.object.sha, treeSha: commit.tree.sha }
  } catch (e) {
    if (e.status === 404 || e.status === 409) return null // 빈 저장소
    throw e
  }
}

/** 경로 → blob sha 맵 */
export async function getTreeMap(cfg, treeSha) {
  const tree = await req(cfg, `/repos/${cfg.owner}/${cfg.repo}/git/trees/${treeSha}?recursive=1`)
  const map = {}
  for (const entry of tree.tree || []) {
    if (entry.type === 'blob') map[entry.path] = entry.sha
  }
  return map
}

export async function getBlobBase64(cfg, sha) {
  const blob = await req(cfg, `/repos/${cfg.owner}/${cfg.repo}/git/blobs/${sha}`)
  return String(blob.content || '').replace(/\s/g, '')
}

/** 원격 data.json 읽기 (없으면 null) */
export async function readRemoteState(cfg, treeMap) {
  const sha = treeMap[DATA_PATH]
  if (!sha) return null
  const b64 = await getBlobBase64(cfg, sha)
  try {
    return JSON.parse(fromBase64(b64))
  } catch {
    throw new GitHubError('원격 data.json을 해석할 수 없습니다. 손상되었을 수 있습니다.', 0)
  }
}

/** 원격 이미지 하나를 dataURL로 */
export async function readRemoteImage(cfg, treeMap, imageId) {
  const sha = treeMap[imagePath(imageId)]
  if (!sha) return null
  const b64 = await getBlobBase64(cfg, sha)
  return `data:image/jpeg;base64,${b64}`
}

export function imagePath(imageId) {
  return `${IMAGE_DIR}/${imageId}.jpg`
}

export function hasRemoteImage(treeMap, imageId) {
  return !!treeMap[imagePath(imageId)]
}

/* ---------- 쓰기 ---------- */

/**
 * 여러 파일을 한 커밋으로 올린다.
 * @param files [{ path, content, encoding: 'utf-8' | 'base64' }]
 * @param head  getHead() 결과 (null이면 최초 커밋)
 * @returns 새 커밋 sha
 * @throws GitHubError status 409 — 그 사이 원격이 바뀐 경우(충돌)
 */
export async function commitFiles(cfg, files, message, head) {
  const base = `/repos/${cfg.owner}/${cfg.repo}`

  // 1) blob 생성
  const treeEntries = []
  for (const f of files) {
    const blob = await req(cfg, `${base}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify(
        f.encoding === 'base64'
          ? { content: f.content, encoding: 'base64' }
          : { content: f.content, encoding: 'utf-8' },
      ),
    })
    treeEntries.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha })
  }

  // 2) 트리 생성 (기존 트리 위에 얹기)
  const tree = await req(cfg, `${base}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      ...(head ? { base_tree: head.treeSha } : {}),
      tree: treeEntries,
    }),
  })

  // 3) 커밋 생성
  const commit = await req(cfg, `${base}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message,
      tree: tree.sha,
      parents: head ? [head.commitSha] : [],
    }),
  })

  // 4) 브랜치 이동 (force 없음 → 원격이 앞서 있으면 GitHub이 거부)
  try {
    if (head) {
      await req(cfg, `${base}/git/refs/heads/${cfg.branch}`, {
        method: 'PATCH',
        body: JSON.stringify({ sha: commit.sha, force: false }),
      })
    } else {
      await req(cfg, `${base}/git/refs`, {
        method: 'POST',
        body: JSON.stringify({ ref: `refs/heads/${cfg.branch}`, sha: commit.sha }),
      })
    }
  } catch (e) {
    // fast-forward 불가 = 다른 기기가 먼저 올렸다는 뜻
    if (e.status === 422 || e.status === 409) {
      throw new GitHubError('다른 기기에서 먼저 변경했습니다. 다시 합치는 중입니다.', 409)
    }
    throw e
  }

  return commit.sha
}

export { DATA_PATH, IMAGE_DIR }
