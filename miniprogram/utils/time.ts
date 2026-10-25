// time.ts
// 计时器格式化纯函数

export const pad2 = (n: number): string => (n < 10 ? '0' : '') + n

/** 毫秒 → { 时, 分, 秒 }（向下取整到秒） */
export const splitHMS = (ms: number): { h: number; m: number; s: number } => {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  return {
    h: Math.floor(totalSec / 3600),
    m: Math.floor((totalSec % 3600) / 60),
    s: totalSec % 60,
  }
}

/** 毫秒 → HH:MM:SS（小时可超过 2 位） */
export const formatHMS = (ms: number): string => {
  const { h, m, s } = splitHMS(ms)
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`
}

/** 毫秒 → HH:MM:SS.xx（xx 为百分秒） */
export const formatHMSxx = (ms: number): string => {
  const cs = Math.floor((ms % 1000) / 10)
  return `${formatHMS(ms)}.${pad2(cs)}`
}

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六']

/** Date → YYYY年MM月DD日 周X */
export const formatDateCN = (d: Date): string => {
  const week = WEEK_CN[d.getDay()]
  return `${d.getFullYear()}年${pad2(d.getMonth() + 1)}月${pad2(d.getDate())}日 周${week}`
}

/** Date → HH:MM:SS */
export const formatClockHMS = (d: Date): string =>
  `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`

/** 毫秒 → MM:SS；满 1 小时 → H:MM:SS（用于胶囊标签） */
export const formatDurationLabel = (ms: number): string => {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`
}

/** Date → HH:MM:SS.xx（xx 为百分秒） */
export const formatClockHMSxx = (d: Date): string => {
  const cs = Math.floor(d.getMilliseconds() / 10)
  return `${formatClockHMS(d)}.${pad2(cs)}`
}

/** 毫秒 → MM:SS.xx（满 1 小时 → H:MM:SS.xx），用于计次列表 */
export const formatLapTime = (ms: number): string => {
  const totalMs = Math.max(0, ms)
  const h = Math.floor(totalMs / 3600000)
  const m = Math.floor((totalMs % 3600000) / 60000)
  const s = Math.floor((totalMs % 60000) / 1000)
  const cs = Math.floor((totalMs % 1000) / 10)
  const hms = h > 0 ? `${pad2(h)}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`
  return `${hms}.${pad2(cs)}`
}

/** Date → YYYY年MM月DD日 HH:MM（正计时 / 倒计时子时间） */
export const formatDateMinuteCN = (d: Date): string =>
  `${d.getFullYear()}年${pad2(d.getMonth() + 1)}月${pad2(d.getDate())}日 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`

/** Date → 上午 / 下午（12 小时制标识） */
export const meridiemOf = (d: Date): string => (d.getHours() < 12 ? '上午' : '下午')

/** 时钟主时间显示：24/12 小时制 × 是否显示秒 × 是否显示百分秒 */
export const formatClock = (
  d: Date,
  hour12: boolean,
  showSeconds: boolean,
  showCentis: boolean
): string => {
  let h = d.getHours()
  if (hour12) {
    h = h % 12
    if (h === 0) h = 12
  }
  const hh = pad2(h)
  const mm = pad2(d.getMinutes())
  if (!showSeconds) return `${hh}:${mm}`
  const ss = pad2(d.getSeconds())
  if (!showCentis) return `${hh}:${mm}:${ss}`
  return `${hh}:${mm}:${ss}.${pad2(Math.floor(d.getMilliseconds() / 10))}`
}

/** 当天累计毫秒 → HH:MM:SS（时钟模式计次） */
export const formatClockLap = (msOfDay: number): string => {
  const t = splitHMS(msOfDay)
  return `${pad2(t.h)}:${pad2(t.m)}:${pad2(t.s)}`
}
