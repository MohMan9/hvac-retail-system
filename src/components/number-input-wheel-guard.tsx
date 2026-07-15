"use client";

import { useEffect } from "react";

// Chromium-based browsers silently increment/decrement a focused
// <input type="number"> by its `step` when the mouse wheel scrolls over it
// (e.g. the user idly scrolling the page while the field has focus). There is
// no visual indicator, so a price/quantity field can change value mid-typing
// without the user noticing. Every numeric input in this app uses
// type="number", so this is handled once, globally, instead of per-field.
export function NumberInputWheelGuard() {
  useEffect(() => {
    function handleWheel(event: WheelEvent) {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type === "number") {
        event.preventDefault();
      }
    }

    document.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    return () => document.removeEventListener("wheel", handleWheel, { capture: true });
  }, []);

  return null;
}
