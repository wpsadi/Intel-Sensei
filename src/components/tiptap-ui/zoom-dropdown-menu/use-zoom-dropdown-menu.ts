"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

export const ZOOM_MIN = 40
export const ZOOM_MAX = 200
export const ZOOM_DEFAULT = 100
export const ZOOM_PRESETS = [40, 50, 75, 90, 100, 125, 150, 175, 200] as const

export type ZoomLevel = number

/** Clamps a zoom value between min and max, rounded to nearest integer */
export function clampZoom(
  value: number,
  min = ZOOM_MIN,
  max = ZOOM_MAX
): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

/** Parses a percentage string (e.g., "100%", "100") to a number, or null if invalid */
export function parsePercent(input: string): number | null {
  const match = input.trim().match(/^(\d+(?:\.\d+)?)%?$/)
  if (!match) return null

  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

/** Finds the next preset zoom level in a given direction */
export function getNextPresetZoom(
  currentZoom: number,
  direction: "up" | "down",
  presets: readonly number[] = ZOOM_PRESETS,
  min = ZOOM_MIN,
  max = ZOOM_MAX
): number {
  if (direction === "down") {
    for (let i = presets.length - 1; i >= 0; i--) {
      const preset = presets[i]
      if (preset !== undefined && preset < currentZoom) return preset
    }
    return min
  }

  for (const preset of presets) {
    if (preset > currentZoom) return preset
  }
  return max
}

export interface UseZoomDropdownMenuConfig {
  /**
   * The current zoom level (percentage). Controlled by the consumer.
   * @default 100
   */
  currentZoom?: ZoomLevel
  /**
   * Called with the next zoom level whenever the user changes it.
   */
  onZoomChange?: (zoom: ZoomLevel) => void
  /**
   * Called when the user triggers "fit to page". Omit to hide that action.
   */
  onFitToPage?: () => void
  /**
   * Smallest selectable zoom level.
   * @default ZOOM_MIN
   */
  min?: number
  /**
   * Largest selectable zoom level.
   * @default ZOOM_MAX
   */
  max?: number
  /**
   * Preset levels offered in the picker and used for stepping.
   * @default ZOOM_PRESETS
   */
  presets?: readonly number[]
}

/**
 * Headless state and handlers for a zoom control.
 *
 * The consumer owns the zoom value (`currentZoom` / `onZoomChange`); this hook
 * derives everything a UI needs — the clamped value, min/max flags, the text
 * field's controlled value with parse-and-commit, keyboard handling, preset
 * stepping, and the fit-to-page passthrough. The built-in `ZoomDropdownMenu` is
 * one renderer over this; bring your own UI by reading these fields directly.
 *
 * @example
 * ```tsx
 * function MyZoomControl(props: UseZoomDropdownMenuConfig) {
 *   const { zoom, zoomIn, zoomOut, isMinZoom, isMaxZoom } =
 *     useZoomDropdownMenu(props)
 *   return (
 *     <div>
 *       <button onClick={zoomOut} disabled={isMinZoom}>-</button>
 *       <span>{zoom}%</span>
 *       <button onClick={zoomIn} disabled={isMaxZoom}>+</button>
 *     </div>
 *   )
 * }
 * ```
 */
export function useZoomDropdownMenu(config?: UseZoomDropdownMenuConfig) {
  const {
    currentZoom = ZOOM_DEFAULT,
    onZoomChange,
    onFitToPage,
    min = ZOOM_MIN,
    max = ZOOM_MAX,
    presets = ZOOM_PRESETS,
  } = config || {}

  const zoom = useMemo(
    () => clampZoom(currentZoom, min, max),
    [currentZoom, min, max]
  )

  // Controlled text for an input field; kept in sync with the committed zoom
  // but free to hold an in-progress (possibly invalid) value while typing.
  const [inputValue, setInputValue] = useState<string>(`${zoom}%`)

  useEffect(() => {
    setInputValue(`${zoom}%`)
  }, [zoom])

  // Emits a clamped value and reflects it in the input. Skips the callback when
  // the value is unchanged so consumers don't see redundant updates.
  const applyZoom = useCallback(
    (value: number) => {
      const next = clampZoom(value, min, max)
      setInputValue(`${next}%`)
      if (next !== currentZoom) onZoomChange?.(next)
      return next
    },
    [currentZoom, min, max, onZoomChange]
  )

  const setZoom = useCallback(
    (value: number) => {
      applyZoom(value)
    },
    [applyZoom]
  )

  const zoomIn = useCallback(
    () => applyZoom(getNextPresetZoom(zoom, "up", presets, min, max)),
    [applyZoom, zoom, presets, min, max]
  )

  const zoomOut = useCallback(
    () => applyZoom(getNextPresetZoom(zoom, "down", presets, min, max)),
    [applyZoom, zoom, presets, min, max]
  )

  // Parses the current input text and applies it, reverting to the committed
  // zoom when the text isn't a valid percentage.
  const commitInput = useCallback(() => {
    const parsed = parsePercent(inputValue)
    applyZoom(parsed ?? currentZoom)
  }, [inputValue, currentZoom, applyZoom])

  // Enter commits (via blur); Escape reverts the text, then blurs.
  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" || event.key === "Escape") {
        if (event.key === "Escape") setInputValue(`${zoom}%`)
        event.currentTarget.blur()
      }
    },
    [zoom]
  )

  const fitToPage = useCallback(() => {
    onFitToPage?.()
  }, [onFitToPage])

  return {
    /** Clamped current zoom level. */
    zoom,
    min,
    max,
    presets,
    isMinZoom: zoom <= min,
    isMaxZoom: zoom >= max,
    /** Whether a fit-to-page action is available. */
    canFitToPage: Boolean(onFitToPage),
    /** Step to the next preset above / below the current zoom. */
    zoomIn,
    zoomOut,
    /** Apply an arbitrary level (clamped). */
    setZoom,
    /** Controlled value + setter for a percentage text field. */
    inputValue,
    setInputValue,
    /** Parse + apply the text field (revert if invalid); wire to `onBlur`. */
    commitInput,
    /** Enter/Escape handling for the text field; wire to `onKeyDown`. */
    handleInputKeyDown,
    /** Invoke the consumer's fit-to-page handler. */
    fitToPage,
  }
}
