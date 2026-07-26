/** 书架排序方式（记忆在 localStorage `yudu:shelf-sort`） */
export type ShelfSortBy = "recent-read" | "recent-import" | "title";

export const SHELF_SORT_KEY = "yudu:shelf-sort";

const SORT_OPTIONS: { id: ShelfSortBy; label: string }[] = [
  { id: "recent-read", label: "最近阅读" },
  { id: "recent-import", label: "最近导入" },
  { id: "title", label: "书名" },
];

export function isShelfSortBy(v: unknown): v is ShelfSortBy {
  return SORT_OPTIONS.some((o) => o.id === v);
}

interface ShelfToolbarProps {
  sortBy: ShelfSortBy;
  onSortChange: (sortBy: ShelfSortBy) => void;
  /** 分组名 → 书数（按名称排序由调用方保证） */
  groups: { name: string; count: number }[];
  totalCount: number;
  /** "all" 或分组名 */
  activeGroup: string;
  onGroupChange: (group: string) => void;
  manageMode: boolean;
  onToggleManage: () => void;
}

/** 书架工具栏：排序切换 + 分组筛选 tabs + 管理模式开关 */
export default function ShelfToolbar({
  sortBy,
  onSortChange,
  groups,
  totalCount,
  activeGroup,
  onGroupChange,
  manageMode,
  onToggleManage,
}: ShelfToolbarProps) {
  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* 排序 Segmented */}
        <div
          className="flex overflow-hidden rounded-lg border border-[var(--border)] text-sm"
          role="radiogroup"
          aria-label="排序方式"
        >
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={sortBy === opt.id}
              onClick={() => onSortChange(opt.id)}
              className={`px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] ${
                sortBy === opt.id
                  ? "bg-[var(--bg-elevated)] font-medium text-[var(--accent)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onToggleManage}
          aria-pressed={manageMode}
          className={`rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
            manageMode
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-[var(--border)] text-[var(--text)] hover:text-[var(--accent)]"
          }`}
        >
          {manageMode ? "退出管理" : "管理"}
        </button>
      </div>

      {/* 分组 tabs：全部 + 各分组（含书数） */}
      {groups.length > 0 ? (
        <div
          className="flex flex-wrap items-center gap-2 text-sm"
          role="tablist"
          aria-label="分组筛选"
        >
          <GroupTab
            label={`全部（${totalCount}）`}
            active={activeGroup === "all"}
            onClick={() => onGroupChange("all")}
          />
          {groups.map((g) => (
            <GroupTab
              key={g.name}
              label={`${g.name}（${g.count}）`}
              active={activeGroup === g.name}
              onClick={() => onGroupChange(g.name)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GroupTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
        active
          ? "border-[var(--accent)] bg-[var(--bg-elevated)] text-[var(--accent)]"
          : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
      }`}
    >
      {label}
    </button>
  );
}
