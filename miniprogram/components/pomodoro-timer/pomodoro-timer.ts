// pomodoro-timer.ts
// 番茄计时：工作 / 休息阶段循环。震动、亮屏与「时间到」由页面统一处理，样式由页面统一下发。
import { formatHMSxx } from '../../utils/time'

const TICK_MS = 16
const DEFAULT_WORK_MS = 25 * 60 * 1000
const DEFAULT_REST_MS = 5 * 60 * 1000
const MIN_DURATION_MS = 1000

type Phase = 'work' | 'rest'

let isActive = false
let workMs = DEFAULT_WORK_MS
let restMs = DEFAULT_REST_MS
let remainingMs = DEFAULT_WORK_MS
let endAt = 0
let tickTimer: ReturnType<typeof setInterval> | undefined

const nextPhase = (phase: Phase): Phase => (phase === 'work' ? 'rest' : 'work')

const buildActions = () => [
  {
    key: 'work',
    label: '工作',
    kind: 'duration',
    title: '工作时长',
    valueMs: workMs,
    minMs: MIN_DURATION_MS,
    storageKey: 'timer.workDurationMs',
  },
  {
    key: 'rest',
    label: '休息',
    kind: 'duration',
    title: '休息时长',
    valueMs: restMs,
    minMs: MIN_DURATION_MS,
    storageKey: 'timer.restDurationMs',
  },
]

Component({
  data: {
    display: formatHMSxx(DEFAULT_WORK_MS),
    running: false,
    finished: false,
    phase: 'work' as Phase,
    completed: 0,
  },

  lifetimes: {
    attached() {
      isActive = false
      workMs = DEFAULT_WORK_MS
      restMs = DEFAULT_REST_MS
      remainingMs = workMs
      endAt = 0
      this.setData({
        display: formatHMSxx(workMs),
        running: false,
        finished: false,
        phase: 'work',
        completed: 0,
      })
      this._emitState()
    },
    detached() {
      this._stopTick()
    },
  },

  pageLifetimes: {
    show() {
      if (isActive && this.data.running) this._startTick()
    },
    hide() {
      this._stopTick()
    },
  },

  methods: {
    activate() {
      isActive = true
      if (this.data.running) this._startTick()
      this._emitState()
    },
    deactivate() {
      isActive = false
      if (this.data.running) this._pause()
      this._stopTick()
    },
    toggle() {
      if (this.data.running) this._pause()
      else this._start()
    },
    reset() {
      this._stopTick()
      remainingMs = workMs
      endAt = 0
      this.setData({
        phase: 'work',
        running: false,
        finished: false,
        completed: 0,
        display: formatHMSxx(remainingMs),
      })
      this._emitState()
    },
    /** 运行中只记录；当前阶段空闲（未运行、未结束）时立即生效 */
    setDuration(key: string, ms: number) {
      const value = Math.max(MIN_DURATION_MS, Number(ms) || 0)
      if (key === 'work') workMs = value
      else if (key === 'rest') restMs = value
      else return

      const isCurrent =
        (key === 'work' && this.data.phase === 'work') ||
        (key === 'rest' && this.data.phase === 'rest')
      if (isCurrent && !this.data.running && !this.data.finished) {
        remainingMs = value
        this.setData({ display: formatHMSxx(value) })
      }
      this._emitState()
    },

    _durationOf(phase: Phase): number {
      return phase === 'work' ? workMs : restMs
    },

    _start() {
      if (this.data.finished) {
        const phase = nextPhase(this.data.phase)
        remainingMs = this._durationOf(phase)
        this.setData({ phase, finished: false, display: formatHMSxx(remainingMs) })
      } else if (remainingMs <= 0) {
        remainingMs = this._durationOf(this.data.phase)
      }
      endAt = Date.now() + remainingMs
      this.setData({ running: true })
      this._startTick()
      this._emitState()
    },

    _pause() {
      const rem = Math.max(0, endAt - Date.now())
      if (rem <= 0) {
        this._endStage()
        return
      }
      remainingMs = rem
      endAt = 0
      this._stopTick()
      this.setData({ display: formatHMSxx(rem), running: false })
      this._emitState()
    },

    _tick() {
      const rem = Math.max(0, endAt - Date.now())
      this.setData({ display: formatHMSxx(rem) })
      if (rem <= 0) this._endStage()
    },

    _endStage() {
      const completed =
        this.data.phase === 'work' ? this.data.completed + 1 : this.data.completed
      remainingMs = 0
      endAt = 0
      this._stopTick()
      this.setData({
        running: false,
        finished: true,
        completed,
        display: '00:00:00.00',
      })
      this._emitState()
    },

    _startTick() {
      this._stopTick()
      tickTimer = setInterval(() => this._tick(), TICK_MS)
    },

    _stopTick() {
      if (tickTimer) {
        clearInterval(tickTimer)
        tickTimer = undefined
      }
    },

    _subTime(): string {
      const { phase, finished, completed } = this.data
      if (phase === 'work') {
        return finished ? `专注 · 已完成 ${completed} 个番茄` : `专注 · 第 ${completed + 1} 个番茄`
      }
      return `休息 · 已完成 ${completed} 个番茄`
    },

    _emitState() {
      this.triggerEvent('statechange', {
        running: this.data.running,
        finished: this.data.finished,
        subTime: this._subTime(),
        capabilities: { toggle: true, reset: true },
        actions: buildActions(),
      })
    },
  },
})
