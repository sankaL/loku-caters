"use client";

import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import ReactDOM from "react-dom";

interface PopoverPosition {
  top: number;
  left: number;
  maxWidth: number;
  maxHeight: number;
  placement: "top" | "bottom";
}

interface DescriptionPopoverProps {
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
}

const PADDING = 12;
const GAP = 8;
const MAX_WIDTH = 360;
const MAX_HEIGHT = 240;
const MIN_HEIGHT = 96;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function positionsMatch(a: PopoverPosition | null, b: PopoverPosition | null) {
  if (!a || !b) return false;
  return (
    a.top === b.top &&
    a.left === b.left &&
    a.maxWidth === b.maxWidth &&
    a.maxHeight === b.maxHeight &&
    a.placement === b.placement
  );
}

function DescriptionTrigger({
  description,
  open,
  panelId,
  className,
  triggerRef,
  onOpen,
  onClose,
  onScheduleClose,
}: {
  description: string;
  open: boolean;
  panelId: string;
  className: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onOpen: () => void;
  onClose: () => void;
  onScheduleClose: () => void;
}) {
  const lastPointerTypeRef = useRef<string | null>(null);
  return (
    <button
      ref={triggerRef}
      type="button"
      onMouseEnter={onOpen}
      onMouseLeave={onScheduleClose}
      onFocus={() => {
        if (!isTouchPointer(lastPointerTypeRef.current)) onOpen();
      }}
      onBlur={onClose}
      onTouchStart={() => {
        lastPointerTypeRef.current = "touch";
      }}
      onPointerDown={(event) => {
        lastPointerTypeRef.current = event.pointerType;
      }}
      onClick={() => {
        if (isTouchPointer(lastPointerTypeRef.current)) {
          if (open) onClose();
          else onOpen();
        }
        lastPointerTypeRef.current = null;
      }}
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      className={`block w-full max-w-full truncate text-left ${className}`}
      style={{
        border: "none",
        background: "transparent",
        padding: 0,
        margin: 0,
        color: "var(--color-muted)",
        cursor: "help",
      }}
    >
      {description}
    </button>
  );
}

function isTouchPointer(pointerType: string | null): boolean {
  return pointerType === "touch" || pointerType === "pen";
}

function DescriptionPanel({
  description,
  open,
  panelId,
  panelRef,
  position,
  onMouseEnter,
  onMouseLeave,
}: {
  description: string;
  open: boolean;
  panelId: string;
  panelRef: RefObject<HTMLDivElement | null>;
  position: PopoverPosition | null;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  if (!open || !position || typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div
      ref={panelRef}
      id={panelId}
      role="tooltip"
      className="animate-fade-in"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: "fixed",
        left: `${position.left}px`,
        top: `${position.top}px`,
        zIndex: 260,
        width: "max-content",
        maxWidth: `${position.maxWidth}px`,
        maxHeight: `${position.maxHeight}px`,
        overflowY: "auto",
        padding: "12px 14px",
        borderRadius: "16px",
        border: "1px solid var(--color-border)",
        background: "white",
        boxShadow: "0 20px 48px rgba(18,39,15,0.16)",
        transform: position.placement === "top" ? "translateY(-100%)" : "none",
        transformOrigin: position.placement === "top" ? "bottom left" : "top left",
        color: "var(--color-text)",
        fontSize: "12px",
        lineHeight: 1.55,
        whiteSpace: "normal",
        overflowWrap: "anywhere",
        pointerEvents: "auto",
      }}
    >
      {description}
    </div>,
    document.body,
  );
}

export default function DescriptionPopover({
  description,
  open,
  onOpenChange,
  className = "",
}: DescriptionPopoverProps) {
  const triggerId = useId();
  const panelId = `${triggerId}-description-popover`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const measurePosition = useCallback((): PopoverPosition | null => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === "undefined") return null;

    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxWidth = Math.min(MAX_WIDTH, Math.max(220, viewportWidth - PADDING * 2));
    const left = clamp(
      rect.left + rect.width / 2 - maxWidth / 2,
      PADDING,
      Math.max(PADDING, viewportWidth - maxWidth - PADDING)
    );

    const spaceBelow = viewportHeight - rect.bottom - GAP - PADDING;
    const spaceAbove = rect.top - GAP - PADDING;
    const placeAbove = spaceBelow < MIN_HEIGHT && spaceAbove > spaceBelow;
    const availableHeight = placeAbove ? spaceAbove : spaceBelow;
    const maxHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, availableHeight));

    return {
      top: placeAbove ? rect.top - GAP : rect.bottom + GAP,
      left,
      maxWidth,
      maxHeight,
      placement: placeAbove ? "top" : "bottom",
    };
  }, []);

  const openPopover = useCallback(() => {
    clearCloseTimer();
    onOpenChange(true);
    setPosition(measurePosition());
  }, [clearCloseTimer, measurePosition, onOpenChange]);

  const closePopover = useCallback(() => {
    clearCloseTimer();
    onOpenChange(false);
    setPosition(null);
  }, [clearCloseTimer, onOpenChange]);

  const scheduleClose = useCallback(() => {
    if (triggerRef.current && document.activeElement === triggerRef.current) {
      return;
    }

    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      closePopover();
    }, 100);
  }, [clearCloseTimer, closePopover]);

  useEffect(() => {
    if (!open) {
      clearCloseTimer();
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      const nextPosition = measurePosition();
      setPosition((current) => (positionsMatch(current, nextPosition) ? current : nextPosition));
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      closePopover();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePopover();
      }
    };

    const frameId = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("orientationchange", updatePosition);
    document.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      clearCloseTimer();
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("orientationchange", updatePosition);
      document.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, clearCloseTimer, closePopover, measurePosition]);

  useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, [clearCloseTimer]);

  return (
    <>
      <DescriptionTrigger
        description={description}
        open={open}
        panelId={panelId}
        className={className}
        triggerRef={triggerRef}
        onOpen={openPopover}
        onClose={closePopover}
        onScheduleClose={scheduleClose}
      />
      <DescriptionPanel
        description={description}
        open={open}
        panelId={panelId}
        panelRef={panelRef}
        position={position}
        onMouseEnter={clearCloseTimer}
        onMouseLeave={scheduleClose}
      />
    </>
  );
}
