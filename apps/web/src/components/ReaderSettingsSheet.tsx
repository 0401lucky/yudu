import type { UserPreferences } from "@yudu/shared";
import type {
  FontFamilyId,
  LocalReaderPrefs,
  ReadingModeId,
} from "../hooks/useLocalReaderPrefs";
import SegmentedControl from "./SegmentedControl";
import SheetShell from "./SheetShell";

interface ReaderSettingsSheetProps {
  open: boolean;
  prefs: UserPreferences;
  localPrefs: LocalReaderPrefs;
  onClose: () => void;
  onPrefs: (partial: Partial<UserPreferences>) => void;
  onLocalPrefs: (partial: Partial<LocalReaderPrefs>) => void;
}

const MARGINS: { value: UserPreferences["pageMargin"]; label: string }[] = [
  { value: "compact", label: "紧凑" },
  { value: "normal", label: "适中" },
  { value: "relaxed", label: "宽松" },
];

const FONTS: { value: FontFamilyId; label: string }[] = [
  { value: "serif", label: "宋体" },
  { value: "sans", label: "黑体" },
];

const READING_MODES: { value: ReadingModeId; label: string }[] = [
  { value: "page", label: "翻页" },
  { value: "scroll", label: "连续滚动" },
];

/** 从底部滑入的阅读设置面板——阅读页内一站式调节，无需进设置页 */
export default function ReaderSettingsSheet({
  open,
  prefs,
  localPrefs,
  onClose,
  onPrefs,
  onLocalPrefs,
}: ReaderSettingsSheetProps) {
  return (
    <SheetShell open={open} onClose={onClose} overlayLabel="关闭设置">
      <div className="mx-auto max-w-lg space-y-5">
        {/* 主题 */}
        <Row label="主题">
          <SegmentedControl
            options={[
              { value: "night", label: "雨夜" },
              { value: "paper", label: "纸页" },
            ]}
            value={prefs.theme}
            onChange={(v) => onPrefs({ theme: v as UserPreferences["theme"] })}
          />
        </Row>

        {/* 阅读模式 */}
        <Row label="阅读模式">
          <SegmentedControl
            options={READING_MODES}
            value={localPrefs.readingMode}
            onChange={(v) =>
              onLocalPrefs({ readingMode: v as ReadingModeId })
            }
          />
        </Row>

        {/* 字号 */}
        <Row label={`字号 ${prefs.fontSize}px`}>
          <Stepper
            onMinus={() =>
              onPrefs({ fontSize: Math.max(14, prefs.fontSize - 1) })
            }
            onPlus={() =>
              onPrefs({ fontSize: Math.min(28, prefs.fontSize + 1) })
            }
          />
        </Row>

        {/* 行距 */}
        <Row label={`行距 ${prefs.lineHeight.toFixed(2)}`}>
          <Stepper
            onMinus={() =>
              onPrefs({
                lineHeight: Math.max(
                  1.4,
                  Math.round((prefs.lineHeight - 0.1) * 100) / 100,
                ),
              })
            }
            onPlus={() =>
              onPrefs({
                lineHeight: Math.min(
                  2.2,
                  Math.round((prefs.lineHeight + 0.1) * 100) / 100,
                ),
              })
            }
          />
        </Row>

        {/* 页边距 */}
        <Row label="页边距">
          <SegmentedControl
            options={MARGINS}
            value={prefs.pageMargin}
            onChange={(v) =>
              onPrefs({ pageMargin: v as UserPreferences["pageMargin"] })
            }
          />
        </Row>

        {/* 字体 */}
        <Row label="字体">
          <SegmentedControl
            options={FONTS}
            value={localPrefs.fontFamily}
            onChange={(v) =>
              onLocalPrefs({ fontFamily: v as FontFamilyId })
            }
          />
        </Row>

        {/* 亮度 */}
        <Row label={`亮度 ${Math.round(localPrefs.brightness * 100)}%`}>
          <input
            type="range"
            min={0.4}
            max={1}
            step={0.05}
            value={localPrefs.brightness}
            onChange={(e) =>
              onLocalPrefs({ brightness: Number(e.target.value) })
            }
            className="w-40 accent-[var(--accent)]"
            aria-label="亮度"
          />
        </Row>
      </div>
    </SheetShell>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="shrink-0 text-sm text-[var(--text-muted)]">{label}</span>
      {children}
    </div>
  );
}

function Stepper({
  onMinus,
  onPlus,
}: {
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onMinus}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)]"
        aria-label="减小"
      >
        −
      </button>
      <button
        type="button"
        onClick={onPlus}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)]"
        aria-label="增大"
      >
        +
      </button>
    </div>
  );
}
