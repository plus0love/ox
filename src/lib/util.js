/** 짧고 충돌 없는 id */
export function uid(prefix = 'p') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** 조건부 className 합치기 */
export function cls(...args) {
  return args.filter(Boolean).join(' ')
}

export const CHOICE_LABELS = ['①', '②', '③', '④']

export const EXAM_DATE = '2026-09-05'

/** 시험일까지 남은 일수 (오늘 0시 기준) */
export function daysUntilExam(today = new Date()) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const [y, m, d] = EXAM_DATE.split('-').map(Number)
  const exam = new Date(y, m - 1, d)
  return Math.round((exam - t) / 86400000)
}

/** Date -> 'YYYY-MM-DD' (로컬 기준) */
export function dayKey(date) {
  const d = new Date(date)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function formatDate(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return dayKey(d).slice(2).replace(/-/g, '.')
}

/** 정답률 0~100 (시도 없으면 null) */
export function accuracy(p) {
  if (!p.attempts) return null
  return Math.round((p.correctCount / p.attempts) * 100)
}

/** 바이트 → 사람이 읽는 크기 */
export function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

/** 이미지 파일을 캔버스로 축소·압축해서 dataURL 반환 */
export async function compressImage(file, maxSide = 1280, quality = 0.72) {
  const bitmap = await loadBitmap(file)
  const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * ratio)
  const h = Math.round(bitmap.height * ratio)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bitmap, 0, 0, w, h)
  if (bitmap.close) bitmap.close()

  return canvas.toDataURL('image/jpeg', quality)
}

function loadBitmap(file) {
  // createImageBitmap이 실패하는 환경(구형 Safari/HEIC)을 위한 <img> 폴백
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file).catch(() => loadViaImgTag(file))
  }
  return loadViaImgTag(file)
}

function loadViaImgTag(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('이미지를 읽을 수 없습니다. (HEIC 형식이면 JPG로 변환해 주세요)'))
    }
    img.src = url
  })
}
