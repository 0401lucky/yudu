/** 全站共用线稿图标：24 viewBox / strokeWidth 2 的 18px 线型语言。
 *  尺寸/颜色可经 className 覆盖（如缩小到 15px、改色），默认 18px、currentColor。 */

interface IconProps {
  className?: string;
}

/** 放大镜（ReaderChrome 入口 / SearchDrawer 空态 / StudioModelPicker 搜索框） */
export function SearchIcon({ className }: IconProps) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

/** 下箭头（展开指示；open 时旋转 180°，transition 内置） */
export function ChevronIcon({
  open = false,
  className,
}: { open?: boolean } & IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 transition-transform duration-300 ${
        open ? "rotate-180" : ""
      }${className ? ` ${className}` : ""}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
