// @ts-nocheck
'use client'
// ============================================================
// One control for choosing a currency, everywhere.
//
// It is a text box with a suggestion list attached, not a dropdown. A dropdown
// says these are your options; this says here are the likely ones and you can
// type anything. That is the difference between a platform that works for the
// countries somebody thought of and one that works for a client anywhere.
//
// Browsers render the suggestions themselves through the datalist element, so
// there is no custom menu to keyboard-navigate, nothing to trap focus, and it
// behaves the way every other autocomplete on the machine behaves.
//
// Empty is a real answer and is preserved as such. It means the currency has
// not been decided, and amounts print as plain numbers until it is. Nothing
// here fills in a default, because a figure labelled with a currency nobody
// chose is worse than one with no currency at all.
// ============================================================
import { useId } from 'react'
import { MAX_CURRENCY_LENGTH, SUGGESTED_CURRENCIES } from '@/lib/currency'

export default function CurrencyField({
  value,
  onChange,
  id,
  label = 'Currency',
  hideLabel = false,
  disabled = false,
  style,
  placeholder = 'Any code',
}) {
  const generated = useId()
  const inputId = id || `currency-${generated}`
  const listId = `currency-options-${generated}`

  return (
    <>
      {hideLabel ? null : <label htmlFor={inputId}>{label}</label>}
      <input
        id={inputId}
        list={listId}
        aria-label={hideLabel ? label : undefined}
        value={value || ''}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={MAX_CURRENCY_LENGTH}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        style={style}
      />
      <datalist id={listId}>
        {SUGGESTED_CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>{c.name}</option>
        ))}
      </datalist>
    </>
  )
}
