import type { AspectId, BgPreset, SensorId } from './types'

export const SENSORS: Record<SensorId, { label: string; width: number; height: number }> = {
  ff: { label: '全画幅 36×24', width: 36, height: 24 },
  s35: { label: 'Super 35 24.9×18.7', width: 24.89, height: 18.66 },
  mft: { label: 'M4/3 17.3×13', width: 17.3, height: 13 },
  inch1: { label: '1 英寸 13.2×8.8', width: 13.2, height: 8.8 },
}

export const ASPECTS: Record<AspectId, { label: string; ratio: number; width: number; height: number }> = {
  '16:9': { label: '16 : 9', ratio: 16 / 9, width: 1920, height: 1080 },
  '9:16': { label: '9 : 16', ratio: 9 / 16, width: 1080, height: 1920 },
  '4:3': { label: '4 : 3', ratio: 4 / 3, width: 1440, height: 1080 },
  '3:4': { label: '3 : 4', ratio: 3 / 4, width: 1080, height: 1440 },
  '21:9': { label: '21 : 9', ratio: 21 / 9, width: 2560, height: 1080 },
}

export const ASPECT_ORDER: AspectId[] = ['16:9', '9:16', '4:3', '3:4', '21:9']

export const BG_PRESETS: { id: Exclude<BgPreset, 'custom'>; label: string; color: string }[] = [
  { id: 'white', label: '白膜', color: '#eef0f2' },
  { id: 'green', label: '绿幕', color: '#00b140' },
  { id: 'blue', label: '蓝幕', color: '#0047bb' },
]

export const CAMERA_NEAR = 0.05
export const CAMERA_FAR = 600
