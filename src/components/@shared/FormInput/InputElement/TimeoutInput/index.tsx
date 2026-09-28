import { ChangeEvent, ReactElement, useEffect, useState } from 'react'
import { useField } from 'formik'
import InputElement from '@shared/FormInput/InputElement'
import {
  CUSTOM_TIMEOUT_OPTION,
  TIMEOUT_PRESETS,
  formatSecondsPrecise,
  isCustomTimeoutValue,
  isTimeoutPreset,
  normalizeCustomTimeoutInput
} from '@utils/ddo'
import styles from './index.module.css'

const options = [
  ...TIMEOUT_PRESETS.map((preset) => preset.label),
  CUSTOM_TIMEOUT_OPTION
]

export default function TimeoutInput({
  name,
  disabled,
  placeholder
}: {
  name: string
  disabled?: boolean
  placeholder?: string
}): ReactElement {
  const [field, , helpers] = useField<string>(name)
  const value = field.value ?? ''
  const [customSelected, setCustomSelected] = useState(
    value !== '' && !isTimeoutPreset(value)
  )
  // Keep the "Custom" selection in sync with the field value, e.g. when
  // Formik reinitialises the form with a preset.
  useEffect(() => {
    if (isTimeoutPreset(value)) setCustomSelected(false)
    else if (value !== '') setCustomSelected(true)
  }, [value])
  const isCustom = !isTimeoutPreset(value) && (customSelected || value !== '')

  function handleSelectChange(e: ChangeEvent<HTMLSelectElement>) {
    const selected = e.target.value
    helpers.setTouched(true, false)
    if (selected === CUSTOM_TIMEOUT_OPTION) {
      setCustomSelected(true)
      helpers.setValue(isCustomTimeoutValue(value) ? value : '')
      return
    }
    setCustomSelected(false)
    helpers.setValue(selected)
  }

  function handleSecondsChange(e: ChangeEvent<HTMLInputElement>) {
    const seconds = normalizeCustomTimeoutInput(e.target.value)
    // ignore keystrokes that are not digits instead of altering the number
    if (seconds === undefined) return
    helpers.setTouched(true, false)
    helpers.setValue(seconds)
  }

  return (
    <div className={styles.timeout}>
      <InputElement
        name={name}
        type="select"
        options={options}
        sortOptions={false}
        placeholder={placeholder || 'Select a duration'}
        disabled={disabled}
        field={field}
        value={isCustom ? CUSTOM_TIMEOUT_OPTION : value}
        onChange={handleSelectChange}
      />
      {isCustom && (
        <div className={styles.custom}>
          <InputElement
            name={`${name}-seconds`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="e.g. 5400"
            postfix="seconds"
            disabled={disabled}
            value={value}
            onChange={handleSecondsChange}
          />
          {isCustomTimeoutValue(value) && (
            <span className={styles.preview}>
              ≈ {formatSecondsPrecise(Number(value))}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
