import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useI18n } from '../i18n/I18n'

export function Segmented<T extends string | number>({
  legend,
  value,
  options,
  onChange,
  name,
}: {
  legend: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (v: T) => void
  name?: string
}) {
  const auto = useId()
  return (
    <fieldset className="segmented">
      <legend>{legend}</legend>
      {options.map((o) => (
        <label key={String(o.value)}>
          <input type="radio" name={name ?? auto} checked={o.value === value} onChange={() => onChange(o.value)} />
          <span>{o.label}</span>
        </label>
      ))}
    </fieldset>
  )
}

export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  const { t, num } = useI18n()
  const id = useId()
  return (
    <div className="row">
      <span id={id}>{label}</span>
      <div className="stepper" role="group" aria-labelledby={id}>
        <button type="button" aria-label={t.settings.fewer} disabled={value <= min} onClick={() => onChange(value - 1)}>
          −
        </button>
        <output aria-live="polite">{num(value)}</output>
        <button type="button" aria-label={t.settings.more} disabled={value >= max} onClick={() => onChange(value + 1)}>
          +
        </button>
      </div>
    </div>
  )
}

/** A modal dialog built on <dialog>, so focus and Escape behave natively. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
}: {
  open: boolean
  onClose: () => void
  title: string
  children?: ReactNode
  actions: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} className="dialog" aria-labelledby={titleId} onClose={onClose} onCancel={onClose}>
      <div className="dialog__body">
        <h2 id={titleId}>{title}</h2>
        {children}
        <div className="dialog__actions">{actions}</div>
      </div>
    </dialog>
  )
}
