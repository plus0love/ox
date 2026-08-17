import { useEffect, useRef, useState } from 'react'
import { CHOICE_LABELS, cls, compressImage, humanSize } from '../lib/util'
import { getImage } from '../lib/imagedb'
import { Button, ChipGroup, Field, inputCls } from './ui'

const emptyDraft = (subject) => ({
  subject,
  question: '',
  choices: ['', '', '', ''],
  answer: 0,
  explanation: '',
  source: '',
})

/**
 * 오답 등록/수정 폼.
 * 이미지는 dataURL 상태로만 들고 있고, 실제 IndexedDB 반영은 onSubmit을 받는 쪽에서 처리한다.
 */
export default function ProblemForm({ subjects, initial, onSubmit, onCancel, submitLabel = '등록하기' }) {
  const [draft, setDraft] = useState(() => (initial ? { ...initial } : emptyDraft(subjects[0] || '기타')))
  const [image, setImage] = useState(null) // dataURL | null
  const [imageBusy, setImageBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)
  const questionRef = useRef(null)

  // 수정 모드일 때 기존 이미지 로드
  useEffect(() => {
    let alive = true
    if (initial?.imageId) {
      getImage(initial.imageId).then((v) => alive && setImage(v || null))
    }
    return () => {
      alive = false
    }
  }, [initial?.imageId])

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))

  const setChoice = (i, value) =>
    setDraft((d) => {
      const choices = [...d.choices]
      choices[i] = value
      return { ...d, choices }
    })

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // 같은 파일 재선택 허용
    if (!file) return
    setImageBusy(true)
    setError('')
    try {
      const dataUrl = await compressImage(file)
      setImage(dataUrl)
    } catch (err) {
      setError(err.message || '이미지를 처리하지 못했습니다.')
    } finally {
      setImageBusy(false)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!draft.question.trim()) {
      setError('문제 본문을 입력해 주세요.')
      questionRef.current?.focus()
      return
    }
    const filled = draft.choices.filter((c) => c.trim()).length
    if (filled < 2) {
      setError('선택지를 최소 2개 이상 입력해 주세요.')
      return
    }
    if (!draft.choices[draft.answer]?.trim()) {
      setError('정답으로 고른 선택지가 비어 있습니다.')
      return
    }
    setError('')
    onSubmit({
      ...draft,
      question: draft.question.trim(),
      choices: draft.choices.map((c) => c.trim()),
      explanation: draft.explanation.trim(),
      source: draft.source.trim(),
      _image: image, // null이면 이미지 없음/삭제
    })
    if (!initial) {
      // 연속 등록 편의: 과목은 유지하고 나머지만 초기화
      setDraft(emptyDraft(draft.subject))
      setImage(null)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Field label="과목" required>
        <ChipGroup options={subjects} value={draft.subject} onChange={(v) => set({ subject: v })} />
      </Field>

      <Field label="문제 본문" required hint="여러 줄 입력 가능">
        <textarea
          ref={questionRef}
          value={draft.question}
          onChange={(e) => set({ question: e.target.value })}
          rows={5}
          placeholder="다음 중 옳지 않은 것은?"
          className={cls(inputCls, 'resize-y')}
        />
      </Field>

      <Field label="이미지 첨부" hint="표·그림 지문용 (선택)">
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
        {image ? (
          <div className="space-y-2">
            <img
              src={image}
              alt="첨부 미리보기"
              className="w-full rounded-xl border border-slate-200 object-contain"
            />
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-slate-500">약 {humanSize(Math.round(image.length * 0.75))}</span>
              <div className="flex-1" />
              <Button
                type="button"
                variant="subtle"
                className="min-h-[44px] px-3 text-sm"
                onClick={() => fileRef.current?.click()}
              >
                교체
              </Button>
              <Button
                type="button"
                variant="subtle"
                className="min-h-[44px] px-3 text-sm text-red-600"
                onClick={() => setImage(null)}
              >
                삭제
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={imageBusy}
            onClick={() => fileRef.current?.click()}
          >
            {imageBusy ? '압축하는 중…' : '📷 사진 선택 / 촬영'}
          </Button>
        )}
      </Field>

      <Field label="선택지" required hint="정답인 번호를 눌러 표시">
        <div className="space-y-2">
          {draft.choices.map((c, i) => {
            const isAnswer = draft.answer === i
            return (
              <div key={i} className="flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => set({ answer: i })}
                  aria-label={`${i + 1}번을 정답으로 지정`}
                  className={cls(
                    'w-14 shrink-0 rounded-xl text-xl font-bold transition',
                    isAnswer
                      ? 'bg-emerald-500 text-white ring-2 ring-emerald-600'
                      : 'bg-slate-100 text-slate-400 active:bg-slate-200',
                  )}
                >
                  {CHOICE_LABELS[i]}
                </button>
                <textarea
                  value={c}
                  onChange={(e) => setChoice(i, e.target.value)}
                  rows={1}
                  placeholder={`${i + 1}번 선택지`}
                  className={cls(
                    inputCls,
                    'min-h-[52px] resize-y py-3',
                    isAnswer && 'border-emerald-400 bg-emerald-50/60',
                  )}
                />
              </div>
            )
          })}
        </div>
      </Field>

      <Field label="해설" hint="선택 · 여러 줄">
        <textarea
          value={draft.explanation}
          onChange={(e) => set({ explanation: e.target.value })}
          rows={4}
          placeholder="왜 틀렸는지, 헷갈린 개념 정리"
          className={cls(inputCls, 'resize-y')}
        />
      </Field>

      <Field label="출처 메모" hint="선택">
        <input
          type="text"
          value={draft.source}
          onChange={(e) => set({ source: e.target.value })}
          placeholder="2024 기출 15번 / ○○문제집 p.123"
          className={inputCls}
        />
      </Field>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-[15px] font-semibold text-red-600">{error}</p>
      )}

      <div className="flex gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="ghost" className="flex-1" onClick={onCancel}>
            취소
          </Button>
        )}
        <Button type="submit" className="flex-[2]">
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
