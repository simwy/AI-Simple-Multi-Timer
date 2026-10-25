// app.ts
import { TIMER_FONTS } from './utils/font'

App<IAppOption>({
  globalData: {},
  onLaunch() {
    // 注册三款计时器数字字体（WebView 与 Skyline 各占一条路径，任一成功即可）
    TIMER_FONTS.forEach(({ family, source }) => {
      wx.loadFontFace({
        family,
        source: `url("${source}")`,
        global: true,
        scopes: ['webview', 'skyline'],
        fail: err => console.warn(`[font] ${family} 加载失败`, err),
      })
    })

    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 登录
    wx.login({
      success: res => {
        console.log(res.code)
        // 发送 res.code 到后台换取 openId, sessionKey, unionId
      },
    })
  },
})