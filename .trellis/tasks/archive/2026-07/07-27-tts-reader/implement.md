# 执行计划：TTS 听书

纯前端任务。实施前先读 ReaderPage.tsx / ReaderViewport / ScrollReaderViewport / useChapterWindow，弄清「当前位置 → 段落列表」的既有数据通路（段落 DOM 与纯文本偏移的对应关系，复用 textAnchor.ts 口径）。

1. **lib/ttsChunks.ts**：段落→朗读块切分纯函数（按句读标点、≤160 字）+ 单测。
2. **hooks/useTts.ts**：状态机（idle/playing/paused）、utterance 队列推进、voiceschanged、localStorage 偏好、卸载清理（`speechSynthesis.cancel()`）。
3. **components/TtsControlBar.tsx**：底部控制条（样式对标 ReaderSettingsSheet 的容器语言）。
4. **接入 ReaderPage**：听书按钮（PDF 隐藏）、当前段高亮（复用 CSS Custom Highlight 机制注册 `yudu-tts` 高亮，降级为无标识）、视口跟随（滚动 scrollIntoView / 翻页跳页用现有跳转函数）。
5. **验证**：typecheck + 单测；浏览器手测 Chrome/Edge 双模式。
