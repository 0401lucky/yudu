/** 分段控件：overflow-hidden rounded-lg 容器 + 选中项 accent 实底。
 *  传入 ariaLabel 时容器渲染 radiogroup 语义（按钮带 radio/aria-checked）。 */
export default function SegmentedControl({
  options,
  value,
  onChange,
  className = "",
  ariaLabel,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      className={`flex overflow-hidden rounded-lg border border-[var(--border)] ${className}`}
      role={ariaLabel ? "radiogroup" : undefined}
      aria-label={ariaLabel}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role={ariaLabel ? "radio" : undefined}
          aria-checked={ariaLabel ? value === opt.value : undefined}
          onClick={() => onChange(opt.value)}
          className={`min-w-[3rem] px-3 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] ${
            value === opt.value
              ? "bg-[var(--accent)] text-[var(--bg)]"
              : "text-[var(--text)] hover:bg-[var(--bg)]"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
