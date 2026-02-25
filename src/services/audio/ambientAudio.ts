/**
 * 环境音效触发：根据 logic_results.audio_trigger 播放对应音乐。
 * 占位音频路径，后续可替换为正式资源。
 */
const AUDIO_MAP: Record<string, string> = {
  war: "assets/audio/war.mp3",
  history: "assets/audio/history.mp3",
  calm: "assets/audio/calm.mp3"
};

export function playAmbientAudio(trigger: string | undefined): void {
  if (!trigger) return;
  const src = AUDIO_MAP[trigger];
  if (!src) return;

  if (typeof wx !== "undefined" && typeof wx.createInnerAudioContext === "function") {
    try {
      const ctx = wx.createInnerAudioContext();
      ctx.src = src;
      ctx.volume = 0.5;
      ctx.onError(() => {
        ctx.destroy();
      });
      ctx.onEnded(() => {
        ctx.destroy();
      });
      ctx.play();
    } catch {
      /* 占位文件可能不存在，静默忽略 */
    }
  }
}
