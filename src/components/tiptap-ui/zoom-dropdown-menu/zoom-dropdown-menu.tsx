import { useState } from "react"

import type { ButtonProps } from "@/components/tiptap-ui-primitive/button"
import { Button } from "@/components/tiptap-ui-primitive/button"
import { Input } from "@/components/tiptap-ui-primitive/input"
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/tiptap-ui-primitive/popover"
import {
  Card,
  CardBody,
  CardItemGroup,
} from "@/components/tiptap-ui-primitive/card"
import { Separator } from "@/components/tiptap-ui-primitive/separator"
import { FullscreenIcon } from "@/components/tiptap-icons/fullscreen-icon"
import { MinusIcon } from "@/components/tiptap-icons/minus-icon"
import { PlusIcon } from "@/components/tiptap-icons/plus-icon"
import "./zoom-dropdown-menu.scss"
import type { UseZoomDropdownMenuConfig } from "./use-zoom-dropdown-menu"
import { useZoomDropdownMenu } from "./use-zoom-dropdown-menu"
import { ButtonGroup } from "@/components/tiptap-ui-primitive/button-group"

export interface ZoomDropdownMenuProps
  extends Omit<ButtonProps, "type">, UseZoomDropdownMenuConfig {}

/**
 * Built-in zoom control: zoom-out/zoom-in steppers around a percentage trigger
 * whose popover offers a numeric input, presets, and an optional "Fit to page".
 *
 * This is a thin renderer over {@link useZoomDropdownMenu} — every bit of zoom
 * logic lives in the hook. To build a different UI, call that hook directly.
 */
export function ZoomDropdownMenu({
  currentZoom,
  onZoomChange,
  onFitToPage,
  min,
  max,
  presets: presetsProp,
  ...props
}: ZoomDropdownMenuProps) {
  const {
    zoom,
    presets,
    isMinZoom,
    isMaxZoom,
    canFitToPage,
    zoomIn,
    zoomOut,
    setZoom,
    inputValue,
    setInputValue,
    commitInput,
    handleInputKeyDown,
    fitToPage,
  } = useZoomDropdownMenu({
    currentZoom,
    onZoomChange,
    onFitToPage,
    min,
    max,
    presets: presetsProp,
  })

  const [open, setOpen] = useState(false)

  const handleSelectPreset = (preset: number) => {
    setZoom(preset)
    setOpen(false)
  }

  const handleFitToPage = () => {
    fitToPage()
    setOpen(false)
  }

  return (
    <ButtonGroup>
      <ButtonGroup>
        <Button
          type="button"
          data-style="ghost"
          data-active-state="off"
          tabIndex={-1}
          aria-label="Zoom out"
          tooltip="Zoom out"
          onClick={zoomOut}
          disabled={isMinZoom}
          data-weight="small"
        >
          <MinusIcon className="tiptap-button-icon" />
        </Button>
      </ButtonGroup>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <ButtonGroup>
            <Button
              type="button"
              data-style="ghost"
              data-active-state="off"
              aria-label="Zoom level"
              tooltip="Zoom level"
              data-state={open ? "open" : "closed"}
              {...props}
            >
              {zoom}%
            </Button>
          </ButtonGroup>
        </PopoverTrigger>
        <PopoverContent align="center" collisionPadding={4}>
          <Card>
            <CardBody>
              <label
                htmlFor="zoom-percentage-input"
                style={{
                  position: "absolute",
                  width: "1px",
                  height: "1px",
                  padding: 0,
                  margin: "-1px",
                  overflow: "hidden",
                  clip: "rect(0, 0, 0, 0)",
                  whiteSpace: "nowrap",
                  border: 0,
                }}
              >
                Zoom percentage
              </label>
              <Input
                id="zoom-percentage-input"
                aria-label="Zoom percentage"
                name="zoom-percentage"
                inputMode="numeric"
                pattern="[0-9]*"
                className="zoom-input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onBlur={commitInput}
                onKeyDown={handleInputKeyDown}
                placeholder="Enter zoom %"
                style={{ width: "100%", textAlign: "center" }}
              />

              <Separator orientation="horizontal" />

              <CardItemGroup>
                {canFitToPage && (
                  <Button
                    data-style="ghost"
                    type="button"
                    onClick={handleFitToPage}
                  >
                    <FullscreenIcon className="tiptap-button-icon" />
                    <span className="tiptap-button-text">Fit to page</span>
                  </Button>
                )}
              </CardItemGroup>

              <Separator orientation="horizontal" />

              <CardItemGroup>
                {presets.map((preset) => (
                  <Button
                    data-style="ghost"
                    key={preset}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                  >
                    <span className="tiptap-button-text">{preset}%</span>
                  </Button>
                ))}
              </CardItemGroup>
            </CardBody>
          </Card>
        </PopoverContent>
      </Popover>

      <ButtonGroup>
        <Button
          type="button"
          data-style="ghost"
          data-active-state="off"
          tabIndex={-1}
          aria-label="Zoom in"
          tooltip="Zoom in"
          onClick={zoomIn}
          disabled={isMaxZoom}
          data-weight="small"
        >
          <PlusIcon className="tiptap-button-icon" />
        </Button>
      </ButtonGroup>
    </ButtonGroup>
  )
}

export default ZoomDropdownMenu
