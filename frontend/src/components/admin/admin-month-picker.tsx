import { useEffect, useMemo, useState } from "react";
import { CalendarIcon, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type AdminMonthPickerProps = {
  value: string;
  onChange: (value: string) => void;
  localeTag: string;
  ariaLabel: string;
  placeholder: string;
};

function padMonth(month: number) {
  return String(month).padStart(2, "0");
}

function parseMonthValue(value: string) {
  const [yearStr, monthStr] = value.split("-");
  const year = Number(yearStr) || new Date().getFullYear();
  const month = Number(monthStr) || new Date().getMonth() + 1;
  return { year, month };
}

function currentMonthBounds() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  };
}

function isFutureMonth(year: number, month: number) {
  const { year: currentYear, month: currentMonth } = currentMonthBounds();
  return year > currentYear || (year === currentYear && month > currentMonth);
}

function clampToCurrentMonth(value: string) {
  const { year, month } = parseMonthValue(value);
  const { year: currentYear, month: currentMonth } = currentMonthBounds();
  if (isFutureMonth(year, month)) {
    return `${currentYear}-${padMonth(currentMonth)}`;
  }
  return value;
}

export function AdminMonthPicker({
  value,
  onChange,
  localeTag,
  ariaLabel,
  placeholder,
}: AdminMonthPickerProps) {
  const safeValue = clampToCurrentMonth(value);
  const { year: selectedYear, month: selectedMonth } = parseMonthValue(safeValue);
  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(selectedYear);
  const { year: currentYear } = currentMonthBounds();

  useEffect(() => {
    if (safeValue !== value) onChange(safeValue);
  }, [onChange, safeValue, value]);

  useEffect(() => {
    if (open) setPickerYear(selectedYear);
  }, [open, selectedYear]);

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => ({
        month: index + 1,
        label: String(index + 1).padStart(2, "0"),
        disabled: isFutureMonth(pickerYear, index + 1),
      })),
    [pickerYear],
  );

  const displayLabel = useMemo(() => {
    if (!safeValue) return placeholder;
    try {
      return new Intl.DateTimeFormat(localeTag, { month: "long", year: "numeric" }).format(
        new Date(selectedYear, selectedMonth - 1, 1),
      );
    } catch {
      return safeValue;
    }
  }, [localeTag, placeholder, safeValue, selectedMonth, selectedYear]);

  const minYear = currentYear - 2;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="admin-month-picker-trigger" aria-label={ariaLabel}>
          <CalendarIcon className="admin-month-picker-trigger-icon" strokeWidth={1.5} aria-hidden />
          <span className="admin-month-picker-trigger-label">{displayLabel}</span>
          <ChevronDown
            className="admin-month-picker-trigger-chevron"
            strokeWidth={1.5}
            aria-hidden
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="admin-month-picker-popover p-0"
        align="start"
        side="bottom"
        sideOffset={6}
        collisionPadding={12}
        avoidCollisions
      >
        <div className="admin-month-picker">
          <div className="admin-month-picker-nav">
            <button
              type="button"
              className="admin-month-picker-nav-btn"
              disabled={pickerYear <= minYear}
              onClick={() => setPickerYear((year) => year - 1)}
              aria-label={`${pickerYear - 1}`}
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <span className="admin-month-picker-year">{pickerYear}</span>
            <button
              type="button"
              className="admin-month-picker-nav-btn"
              disabled={pickerYear >= currentYear}
              onClick={() => setPickerYear((year) => year + 1)}
              aria-label={`${pickerYear + 1}`}
            >
              <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
          <div className="admin-month-picker-grid">
            {monthOptions.map((option) => {
              const isSelected = pickerYear === selectedYear && option.month === selectedMonth;
              return (
                <button
                  key={option.month}
                  type="button"
                  disabled={option.disabled}
                  className={`admin-month-picker-cell${isSelected ? " is-selected" : ""}`}
                  onClick={() => {
                    onChange(`${pickerYear}-${padMonth(option.month)}`);
                    setOpen(false);
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
