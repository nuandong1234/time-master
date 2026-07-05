import switchMp3 from "@/assets/audio/switch.mp3"
import completeMp3 from "@/assets/audio/complete.mp3"

const switchAudio = new Audio(switchMp3)
const completeAudio = new Audio(completeMp3)

/**
 * 播放提示音
 * @param type 提示音类型：'switch'=切换专注/休息, 'complete'=所有轮次完成
 * @param volume 音量 0-100
 */
export function playBeep(type: 'switch' | 'complete', volume?: number) {
  const audio = type === 'complete' ? completeAudio : switchAudio
  const clone = audio.cloneNode() as HTMLAudioElement
  clone.volume = (volume ?? 30) / 100
  clone.currentTime = 0
  clone.play().catch(() => {})
}
