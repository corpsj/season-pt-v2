"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icon";

export function Select({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const selected = options.find((o) => o.value === value);
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-[13px] border border-ink/[0.12] bg-card px-4 py-[13px] text-[14px] font-medium text-ink focus:outline-none focus:ring-2 focus:ring-sage/40"
      >
        {placeholder && !selected && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-chevron">
        <Icon name="chevron-down" size={15} />
      </span>
    </div>
  );
}

export function Combobox({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(value.toLowerCase())
  );

  // close on outside click
  useEffect(() => {
    function handleDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleDown);
    return () => document.removeEventListener("mousedown", handleDown);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") setOpen(false);
        }}
        className="w-full rounded-[13px] border border-ink/[0.12] bg-card px-4 py-[13px] text-[14px] font-medium text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-sage/40"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-[13px] border border-ink/[0.055] bg-card shadow-card">
          {filtered.map((o) => (
            <li key={o}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault(); // keep focus so blur doesn't race
                  onChange(o);
                  setOpen(false);
                }}
                className="w-full px-4 py-[11px] text-left text-[14px] font-medium text-ink hover:bg-sage-banner"
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
