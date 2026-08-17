import { cls } from '../lib/util'

/** noPad을 주면 내부 패딩 없이 (목록/헤더를 가장자리까지 붙일 때) */
export function Card({ className, noPad, children, ...rest }) {
  return (
    <div
      className={cls('rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70', !noPad && 'p-4', className)}
      {...rest}
    >
      {children}
    </div>
  )
}

export function SectionTitle({ children, right }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h2 className="text-lg font-bold text-slate-800">{children}</h2>
      {right}
    </div>
  )
}

/** 큰 터치 영역을 가진 기본 버튼 */
export function Button({ variant = 'primary', className, ...rest }) {
  const styles = {
    primary: 'bg-slate-800 text-white active:bg-slate-900',
    ghost: 'bg-white text-slate-700 ring-1 ring-slate-300 active:bg-slate-100',
    danger: 'bg-red-600 text-white active:bg-red-700',
    subtle: 'bg-slate-100 text-slate-700 active:bg-slate-200',
  }[variant]
  return (
    <button
      className={cls(
        'min-h-[52px] rounded-xl px-4 text-base font-semibold transition disabled:opacity-40',
        styles,
        className,
      )}
      {...rest}
    />
  )
}

/** 가로 스크롤되는 칩 선택 그룹 */
export function ChipGroup({ options, value, onChange, className }) {
  return (
    <div className={cls('-mx-4 flex gap-2 overflow-x-auto px-4 pb-1', className)}>
      {options.map((opt) => {
        const v = typeof opt === 'string' ? opt : opt.value
        const label = typeof opt === 'string' ? opt : opt.label
        const active = v === value
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={cls(
              'min-h-[44px] shrink-0 rounded-full px-4 text-[15px] font-semibold whitespace-nowrap transition',
              active
                ? 'bg-slate-800 text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-300 active:bg-slate-100',
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function Field({ label, hint, children, required }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-[15px] font-bold text-slate-700">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </span>
        {hint && <span className="text-[13px] text-slate-400">{hint}</span>}
      </div>
      {children}
    </label>
  )
}

export const inputCls =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 outline-none focus:border-slate-800 focus:ring-2 focus:ring-slate-800/10'

/** 빈 상태 안내 */
export function EmptyState({ icon = '📝', title, desc, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-3 text-5xl">{icon}</div>
      <h3 className="mb-1.5 text-lg font-bold text-slate-700">{title}</h3>
      {desc && <p className="mb-5 text-[15px] leading-relaxed whitespace-pre-line text-slate-500">{desc}</p>}
      {action}
    </div>
  )
}

/** 확인 모달 (window.confirm 대신 — iOS 전체화면 모드에서도 일관되게 보임) */
export function ConfirmDialog({ open, title, desc, confirmLabel = '확인', danger, onConfirm, onCancel }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:pb-5">
        <h3 className="mb-1.5 text-lg font-bold">{title}</h3>
        {desc && <p className="mb-4 text-[15px] whitespace-pre-line text-slate-600">{desc}</p>}
        <div className="mt-4 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onCancel}>
            취소
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} className="flex-1" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
