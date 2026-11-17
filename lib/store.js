// 工牌资料和设备数据的存取（数据目录里的 badge.json）。资料每改一次，版本号加一，设备据此判断要不要更新。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DEFAULT_PROFILE, memoMask, normalize } from './profile.js'

const ONLINE_S = 45          // 设备空闲时每 15 秒联系一次；超过这个时间没联系就算离线

export function today(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

export class Store {
  constructor({ dir, now = () => new Date() } = {}) {
    this.file = dir ? join(dir, 'badge.json') : null
    this.now = now
    this.version = 1
    this.profile = normalize(DEFAULT_PROFILE)
    this.device = { touches: 0, lucky: 0, battery: -1, fw: '', last_seen: 0, days: {} }
    if (this.file && existsSync(this.file)) {
      try {
        const d = JSON.parse(readFileSync(this.file, 'utf8'))
        this.version = Number.isInteger(d.version) && d.version > 0 ? d.version : 1
        // 0.1 版的默认状态“专注中 勿扰”有 5 个字，现在状态竖着写、最多 4 个字
        const old = d.profile ?? {}
        if (Array.isArray(old.statuses)) old.statuses = old.statuses.map((x) => (x === '专注中 勿扰' ? '专注勿扰' : x))
        this.profile = normalize(old)
        this.device = { ...this.device, ...(d.device ?? {}), days: { ...(d.device?.days ?? {}) } }
      } catch { /* 文件坏了就用默认资料，下次保存时覆盖 */ }
    }
  }

  save() {
    if (!this.file) return
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify({ version: this.version, profile: this.profile, device: this.device }, null, 1))
    renameSync(tmp, this.file)
  }

  /** 改资料：patch 里只放要改的字段。内容真的变了才加版本号。返回整理后的资料。 */
  update(patch) {
    const next = normalize({ ...this.profile, ...patch }, this.profile)
    if (JSON.stringify(next) !== JSON.stringify(this.profile)) {
      this.profile = next
      this.version += 1
      this.save()
    }
    return this.profile
  }

  /** 设备上报：在设备上切的状态和皮肤、划掉的便签、摸鱼次数、电量。 */
  deviceState(body = {}) {
    const d = this.device
    const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : null)
    const touches = num(body.touches)
    if (touches !== null) {
      // 设备只报累计数；和上次的差记到今天头上（设备重刷后累计数会变小，不倒扣）
      const delta = touches - d.touches
      if (delta > 0 && d.last_seen) {
        const day = today(this.now())
        d.days[day] = (d.days[day] ?? 0) + delta
        const keep = Object.keys(d.days).sort().slice(-30)
        d.days = Object.fromEntries(keep.map((k) => [k, d.days[k]]))
      }
      d.touches = touches
    }
    const lucky = num(body.lucky)
    if (lucky !== null) d.lucky = lucky
    if (Number.isFinite(Number(body.battery))) d.battery = Math.max(-1, Math.min(100, Math.round(Number(body.battery))))
    if (typeof body.fw === 'string') d.fw = body.fw.slice(0, 16)
    d.last_seen = this.now().getTime()
    const patch = {}
    if (num(body.status) !== null) patch.status = num(body.status)
    if (num(body.theme) !== null) patch.theme = num(body.theme)
    // 在工牌上划掉的便签：只在和电脑上的不一样时才改
    const mask = num(body.memo_done)
    if (mask !== null && mask !== memoMask(this.profile.memos)) patch.memos = this.profile.memos.map((m, i) => ({ text: m.text, done: Boolean(mask & (1 << i)) }))
    if (Object.keys(patch).length) this.update(patch)
    this.save()
    return this.version
  }

  /** 设备每次来拿资料也算联系过一次。 */
  seen() { this.device.last_seen = this.now().getTime() }

  deviceInfo() {
    const d = this.device
    const age = d.last_seen ? Math.max(0, Math.round((this.now().getTime() - d.last_seen) / 1000)) : null
    return {
      online: age !== null && age <= ONLINE_S, last_seen_s: age, battery: d.battery, fw: d.fw,
      touches: d.touches, lucky: d.lucky, today: d.days[today(this.now())] ?? 0,
      days: Object.entries(d.days).sort().slice(-7).map(([day, n]) => ({ day, touches: n })),
    }
  }
}
