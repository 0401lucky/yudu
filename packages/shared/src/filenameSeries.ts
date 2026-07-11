/**
 * 从文件名识别「书名-序号」系列。
 * 支持：雨停之前-01.md / 雨停之前_02.md / 书名 3.txt / 书名-第04章.md
 */
export interface FilenameSeriesParts {
  /** 系列书名；无序号时为去扩展名全名 */
  seriesTitle: string;
  /** 排序用序号；无序号为 null（独立成书） */
  sequence: number | null;
  /** 是否匹配到「书名+序号」模式 */
  isSequenced: boolean;
  /** 去路径后的文件名 */
  basename: string;
}

export function parseFilenameSeries(filename: string): FilenameSeriesParts {
  const basename = filename.replace(/^.*[/\\]/, "");
  const stem =
    basename.includes(".") && !basename.startsWith(".")
      ? basename.slice(0, basename.lastIndexOf("."))
      : basename;

  const m = stem.match(/^(.+?)[-_\s]+(?:第)?(\d+)(?:[章节回集部话])?$/i);
  if (m && m[1]!.trim() && m[2]) {
    const seriesTitle = m[1]!.trim().replace(/[-_\s]+$/g, "").trim();
    const sequence = Number.parseInt(m[2], 10);
    if (seriesTitle && Number.isFinite(sequence)) {
      return {
        seriesTitle,
        sequence,
        isSequenced: true,
        basename,
      };
    }
  }

  return {
    seriesTitle: stem || basename || "未命名",
    sequence: null,
    isSequenced: false,
    basename,
  };
}

export interface SeriesGroupKey {
  /** 分组键：有序系列用小写书名；独立文件用唯一路径 */
  key: string;
  seriesTitle: string;
  isSequenced: boolean;
}

export function seriesGroupKey(filename: string): SeriesGroupKey {
  const p = parseFilenameSeries(filename);
  if (p.isSequenced) {
    return {
      key: `seq:${p.seriesTitle.toLowerCase()}`,
      seriesTitle: p.seriesTitle,
      isSequenced: true,
    };
  }
  return {
    key: `solo:${p.basename.toLowerCase()}`,
    seriesTitle: p.seriesTitle,
    isSequenced: false,
  };
}

/** 同组内按序号升序；无序号保持原序 */
export function compareBySequence(
  aName: string,
  bName: string,
): number {
  const a = parseFilenameSeries(aName);
  const b = parseFilenameSeries(bName);
  if (a.sequence != null && b.sequence != null) {
    if (a.sequence !== b.sequence) return a.sequence - b.sequence;
  }
  return aName.localeCompare(bName, "zh");
}
