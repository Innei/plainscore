import { Slider } from '@lobehub/ui'

export interface SliderRowProps {
  label: string
  min: number
  max: number
  step: number
  value: number
  show: (v: number) => string
  onChange: (v: number) => void
  disabled?: boolean
}

export const SliderRow = ({ label, min, max, step, value, show, onChange, disabled }: SliderRowProps) => (
  <label className="slider-row">
    <span>{label}</span>
    <Slider min={min} max={max} step={step} value={value} disabled={disabled} onChange={onChange} aria-label={label} />
    <b className="mono">{show(value)}</b>
  </label>
)
