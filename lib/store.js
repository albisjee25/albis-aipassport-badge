// 工牌资料、全彩抠图资产与设备状态的存取（V1.0 v2.5，离线优先下发，无远程息屏遥控）。
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DEFAULT_PROFILE, memoMask, normalize } from './profile.js'

const ONLINE_S = 45

export function today(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

export class Store {
  constructor({ dir, now = () => new Date() } = {}) {
    this.dir = dir || null
    this.file = dir ? join(dir, 'badge.json') : null
    this.powerLogFile = dir ? join(dir, 'battery-log.jsonl') : null
    this.photoPngFile = dir ? join(dir, 'photo.png') : null
    this.photoRawFile = dir ? join(dir, 'photo.rgb565a8') : null
    this.photoPngMem = null
    this.photoRawMem = null
    this.now = now
    this.version = 1
    this.profile = normalize(DEFAULT_PROFILE)
    this.device = { touches: 0, lucky: 0, battery: -1, battery_mv: -1, fw: '', last_seen: 0, days: {} }
    this.powerSamples = []
    this.lastPowerAck = 0

    if (this.file && existsSync(this.file)) {
      try {
        const d = JSON.parse(readFileSync(this.file, 'utf8'))
        this.version = Number.isInteger(d.version) && d.version > 0 ? d.version : 1
        const old = d.profile ?? {}
        this.profile = normalize(old)
        this.device = { ...this.device, ...(d.device ?? {}), days: { ...(d.device?.days ?? {}) } }
      } catch { /* 文件坏了就用默认资料 */ }
    }
    if (this.powerLogFile && existsSync(this.powerLogFile)) {
      try {
        const lines = readFileSync(this.powerLogFile, 'utf8').trim().split('\n').filter(Boolean).slice(-500)
        for (const ln of lines) {
          try {
            const row = JSON.parse(ln)
            if (row && Number.isFinite(row.seq)) {
              this.powerSamples.push(row)
              if (row.seq > this.lastPowerAck) this.lastPowerAck = row.seq
            }
          } catch {}
        }
      } catch {}
    }
  }

  save() {
    if (!this.file) return
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify({ version: this.version, profile: this.profile, device: this.device }, null, 1))
    renameSync(tmp, this.file)
  }

  update(patch) {
    const next = normalize({ ...this.profile, ...patch }, this.profile)
    if (JSON.stringify(next) !== JSON.stringify(this.profile)) {
      this.profile = next
      this.version += 1
      this.save()
    }
    return this.profile
  }

  savePhoto({ png, rgb565a8 }) {
    this.photoPngMem = png
    this.photoRawMem = rgb565a8
    if (this.dir) {
      mkdirSync(this.dir, { recursive: true })
      writeFileSync(this.photoPngFile, png)
      writeFileSync(this.photoRawFile, rgb565a8)
    }
    const nextVer = (this.profile.photo_ver || 0) + 1
    return this.update({ avatar_mode: 2, photo_ver: nextVer })
  }

  getPhotoPng() {
    if (this.photoPngMem) return this.photoPngMem
    if (this.photoPngFile && existsSync(this.photoPngFile)) {
      this.photoPngMem = readFileSync(this.photoPngFile)
      return this.photoPngMem
    }
    return null
  }

  getPhotoRaw() {
    if (this.photoRawMem) return this.photoRawMem
    if (this.photoRawFile && existsSync(this.photoRawFile)) {
      this.photoRawMem = readFileSync(this.photoRawFile)
      return this.photoRawMem
    }
    return null
  }

  hasPhoto() {
    return Boolean(this.getPhotoPng() && this.getPhotoRaw())
  }

  deviceState(body = {}) {
    const d = this.device
    const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : null)
    const touches = num(body.touches)
    if (touches !== null) {
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
    if (Number.isFinite(Number(body.battery_mv))) d.battery_mv = Math.max(-1, Math.min(6000, Math.round(Number(body.battery_mv))))
    if (typeof body.fw === 'string') d.fw = body.fw.slice(0, 16)
    d.last_seen = this.now().getTime()

    if (Array.isArray(body.pwr) && body.pwr.length) {
      const seen = new Set(this.powerSamples.slice(-100).map((x) => `${x.fw}:${x.boot_id}:${x.seq}`))
      const toWrite = []
      let maxAck = this.lastPowerAck
      for (const raw of body.pwr.slice(0, 16)) {
        if (!raw || typeof raw !== 'object') continue
        const seq = num(raw.seq)
        const soc = Number(raw.s)
        if (seq === null || !Number.isFinite(soc) || soc < -1 || soc > 100) continue
        const row = {
          ts: d.last_seen,
          fw: d.fw || 'unknown',
          seq,
          boot_id: num(raw.b) ?? 0,
          up_min: num(raw.u) ?? 0,
          soc: Math.round(soc),
          mv: num(raw.mv) ?? 0,
          bright_s: num(raw.br) ?? 0,
          dim_s: num(raw.dm) ?? 0,
          sleep_s: num(raw.sl) ?? 0,
          wifi_s: num(raw.wf) ?? 0,
          http_n: num(raw.ht) ?? 0,
          flags: num(raw.f) ?? 0,
        }
        if (seq > maxAck) maxAck = seq
        const key = `${row.fw}:${row.boot_id}:${row.seq}`
        if (seen.has(key)) continue
        seen.add(key)
        this.powerSamples.push(row)
        toWrite.push(JSON.stringify(row))
      }
      if (this.powerSamples.length > 500) this.powerSamples = this.powerSamples.slice(-500)
      if (toWrite.length && this.powerLogFile) {
        mkdirSync(dirname(this.powerLogFile), { recursive: true })
        appendFileSync(this.powerLogFile, `${toWrite.join('\n')}\n`)
      }
      this.lastPowerAck = maxAck
    }

    const patch = {}
    if (num(body.status) !== null) patch.status = num(body.status)
    if (num(body.mood_idx) !== null) patch.mood_idx = num(body.mood_idx)
    if (num(body.style) !== null) patch.style = num(body.style)
    if (num(body.palette_idx) !== null) patch.palette_idx = num(body.palette_idx)
    if (num(body.qr_idx) !== null) patch.qr_idx = num(body.qr_idx)
    const mask = num(body.memo_done)
    if (mask !== null && mask !== memoMask(this.profile.memos)) {
      patch.memos = this.profile.memos.map((m, i) => ({
        text: m.text,
        done: Boolean(mask & (1 << i)),
        star: Boolean(m.star),
      }))
    }
    if (Object.keys(patch).length) this.update(patch)
    this.save()
    return this.version
  }

  seen() { this.device.last_seen = this.now().getTime() }

  deviceInfo() {
    const d = this.device
    const age = d.last_seen ? Math.max(0, Math.round((this.now().getTime() - d.last_seen) / 1000)) : null
    return {
      online: age !== null && age <= ONLINE_S,
      last_seen_s: age,
      battery: d.battery,
      battery_mv: d.battery_mv ?? -1,
      fw: d.fw,
      touches: d.touches,
      lucky: d.lucky,
      today: d.days[today(this.now())] ?? 0,
      days: Object.entries(d.days).sort().slice(-7).map(([day, n]) => ({ day, touches: n })),
    }
  }

  powerReport() {
    const byFw = new Map()
    const ensure = (fw) => {
      if (!byFw.has(fw)) {
        byFw.set(fw, {
          fw, samples: 0, intervals: 0,
          total_s: 0, soc_drop: 0,
          bright_s: 0, dim_s: 0, sleep_s: 0, wifi_s: 0, http_n: 0,
        })
      }
      return byFw.get(fw)
    }
    const sorted = [...this.powerSamples].sort((a, b) => (a.seq - b.seq) || (a.ts - b.ts))
    let prev = null
    for (const s of sorted) {
      const g = ensure(s.fw || 'unknown')
      g.samples += 1
      if (prev && prev.fw === s.fw && prev.boot_id === s.boot_id && s.seq > prev.seq) {
        const dt_s = (s.bright_s + s.dim_s + s.sleep_s) || Math.max(0, (s.up_min - prev.up_min) * 60)
        const drop = prev.soc - s.soc
        const charging = (s.soc > prev.soc + 1) || (prev.mv > 0 && s.mv > prev.mv + 120)
        if (!charging && dt_s > 0 && drop >= 0) {
          g.intervals += 1
          g.total_s += dt_s
          g.soc_drop += drop
          g.bright_s += s.bright_s
          g.dim_s += s.dim_s
          g.sleep_s += s.sleep_s
          g.wifi_s += s.wifi_s
          g.http_n += s.http_n
        }
      }
      prev = s
    }
    const versions = [...byFw.values()].map((g) => {
      const hours = +(g.total_s / 3600).toFixed(2)
      const rate = hours > 0 ? +(g.soc_drop / hours).toFixed(2) : null
      const est = rate && rate > 0 ? +(100 / rate).toFixed(1) : null
      const duty = g.bright_s + g.dim_s + g.sleep_s
      return {
        fw: g.fw,
        samples: g.samples,
        intervals: g.intervals,
        hours,
        soc_drop: g.soc_drop,
        pct_per_hour: rate,
        est_full_hours: est,
        bright_pct: duty ? Math.round((g.bright_s / duty) * 100) : 0,
        dim_pct: duty ? Math.round((g.dim_s / duty) * 100) : 0,
        sleep_pct: duty ? Math.round((g.sleep_s / duty) * 100) : 0,
        wifi_pct: duty ? Math.round((g.wifi_s / duty) * 100) : 0,
        http_per_hour: hours > 0 ? +(g.http_n / hours).toFixed(1) : 0,
      }
    })
    return {
      latest: this.deviceInfo(),
      total_samples: this.powerSamples.length,
      versions,
      recent: sorted.slice(-20),
    }
  }
}
