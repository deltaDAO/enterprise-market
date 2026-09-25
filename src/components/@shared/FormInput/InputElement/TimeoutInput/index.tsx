import { ChangeEvent, ReactElement, useState } from 'react'
import { useField } from 'formik'
import InputElement from '@shared/FormInput/InputElement'
import {
  CUSTOM_TIMEOUT_OPTION,
  TIMEOUT_PRESETS,
  formatSecondsPrecise,
  isCustomTimeoutValue,
  isTimeoutPreset
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
  const isCustom = customSelected || isCustomTimeoutValue(value)

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
    helpers.setTouched(true, false)
    helpers.setValue(e.target.value.replace(/\D/g, ''))
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
            type="number"
            min="1"
            step="1"
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
