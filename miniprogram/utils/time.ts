// time.ts
// 计时器格式化纯函数

const pad2 = (n: number): string => (n < 10 ? '0' : '') + n

/** 毫秒 → HH:MM:SS（小时可超过 2 位） */
export const formatHMS = (ms: number): string => {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
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
