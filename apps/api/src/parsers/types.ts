export interface ParsedChapter {
  title: string;
  /** 纯文本，段落用 \n\n 分隔 */
  text: string;
}

export interface ParseCover {
  bytes: Uint8Array;
  contentType: string;
}

export interface ParseResult {
  title: string;
  author: string | null;
  chapters: ParsedChapter[];
  /** EPUB 等格式可选封面 */
  cover?: ParseCover;
}
