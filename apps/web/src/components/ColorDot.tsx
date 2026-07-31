/** 高亮三色小圆点：消费 --hl-solid-* 实色变量（半透明 --hl-* 是文字底色，8px 圆点用实色保证辨识度）。
 *  默认 8px 圆点，尺寸/间距可经 className 覆盖。 */
export default function ColorDot({
  color,
  className = "",
}: {
  color: "yellow" | "green" | "blue";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`h-2 w-2 shrink-0 rounded-full ${className}`}
      style={{ backgroundColor: `var(--hl-solid-${color})` }}
    />
  );
}
