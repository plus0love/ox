import { useEffect, useState } from 'react'
import { getImage } from '../lib/imagedb'

/** imageId로 IndexedDB에서 dataURL을 읽어오는 훅 */
export function useImage(imageId) {
  const [src, setSrc] = useState(null)

  useEffect(() => {
    let alive = true
    if (!imageId) {
      setSrc(null)
      return
    }
    getImage(imageId)
      .then((v) => alive && setSrc(v || null))
      .catch(() => alive && setSrc(null))
    return () => {
      alive = false
    }
  }, [imageId])

  return src
}

/** 문제 첨부 이미지. 탭하면 전체화면으로 확대해서 본다. */
export default function ProblemImage({ imageId, className = '' }) {
  const src = useImage(imageId)
  const [zoom, setZoom] = useState(false)

  if (!imageId) return null
  if (!src) {
    return (
      <div className="flex h-24 items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-400">
        이미지 불러오는 중…
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setZoom(true)}
        className={`block w-full overflow-hidden rounded-xl border border-slate-200 bg-white ${className}`}
      >
        <img src={src} alt="문제 첨부 이미지" className="w-full object-contain" />
      </button>

      {zoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-2"
          onClick={() => setZoom(false)}
        >
          <img src={src} alt="문제 첨부 이미지 확대" className="max-h-full max-w-full object-contain" />
          <span className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 rounded-full bg-white/20 px-4 py-2 text-sm text-white">
            닫기 ✕
          </span>
        </div>
      )}
    </>
  )
}
