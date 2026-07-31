/** 错误横幅：统一消费 --danger 语义色（border/text 用 danger、背景 danger-weak），
 *  role="alert" 让屏幕阅读器即时播报。 */
export default function ErrorBanner({
  message,
  className = "",
}: {
  message: string;
  className?: string;
}) {
  return (
    <p
      role="alert"
      className={`rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[var(--danger-weak)] px-3 py-2 text-sm text-[var(--danger)] ${className}`}
    >
      {message}
    </p>
  );
}
