/**
 * 첨부 이미지 전용 IndexedDB 래퍼.
 * localStorage(약 5MB)에 base64 이미지를 넣으면 문제 몇 개 만에 용량이 터지므로
 * 이미지는 전부 여기에 저장하고, 문제 객체는 imageId만 들고 있는다.
 */
const DB_NAME = 'ox-wrongnote'
const STORE = 'images'

let dbPromise = null
const memCache = new Map() // imageId -> dataURL (재렌더링 시 IDB 재조회 방지)

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('이 브라우저는 IndexedDB를 지원하지 않습니다.'))
      return
    }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function tx(mode, fn) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const store = t.objectStore(STORE)
    let result
    try {
      result = fn(store)
    } catch (e) {
      reject(e)
      return
    }
    t.oncomplete = () => resolve(result && result.__req ? result.__req.result : result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

export async function putImage(id, dataUrl) {
  memCache.set(id, dataUrl)
  await tx('readwrite', (store) => store.put(dataUrl, id))
  return id
}

export async function getImage(id) {
  if (!id) return null
  if (memCache.has(id)) return memCache.get(id)
  const req = await tx('readonly', (store) => ({ __req: store.get(id) }))
  const value = req ?? null
  if (value) memCache.set(id, value)
  return value
}

export async function deleteImage(id) {
  if (!id) return
  memCache.delete(id)
  await tx('readwrite', (store) => store.delete(id))
}

/** 백업용: { imageId: dataURL } 전체 반환 */
export async function getAllImages() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const out = {}
    const t = db.transaction(STORE, 'readonly')
    const cursorReq = t.objectStore(STORE).openCursor()
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result
      if (cursor) {
        out[cursor.key] = cursor.value
        cursor.continue()
      }
    }
    t.oncomplete = () => resolve(out)
    t.onerror = () => reject(t.error)
  })
}

/** 복원용: 여러 이미지 한 번에 저장 */
export async function putImages(map) {
  const entries = Object.entries(map || {})
  if (!entries.length) return
  await tx('readwrite', (store) => {
    for (const [id, dataUrl] of entries) {
      memCache.set(id, dataUrl)
      store.put(dataUrl, id)
    }
  })
}

/** 문제에서 참조하지 않는 이미지 정리 */
export async function pruneImages(usedIds) {
  const used = new Set(usedIds.filter(Boolean))
  const all = await getAllImages()
  const orphans = Object.keys(all).filter((id) => !used.has(id))
  for (const id of orphans) await deleteImage(id)
  return orphans.length
}

export async function clearImages() {
  memCache.clear()
  await tx('readwrite', (store) => store.clear())
}
