"use client";

import { Minus, Plus } from "lucide-react";

function parseValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function QuantityStepper({
  value,
  onChange,
  min = 0.01,
  step = 1,
}: {
  value: string;
  onChange: (next: string) => void;
  min?: number;
  step?: number;
}) {
  function decrement() {
    const next = Math.max(min, parseValue(value) - step);
    onChange(String(next));
  }

  function increment() {
    onChange(String(parseValue(value) + step));
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={decrement}
        aria-label="Decrease quantity"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        type="number"
        dir="ltr"
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-14 rounded-md border border-slate-300 bg-white px-1 py-1 text-center text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
      />
      <button
        type="button"
        onClick={increment}
        aria-label="Increase quantity"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
