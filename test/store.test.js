// V1.0 (v2.5) 资料保存、版本号、设备上报与照片资产（离线优先，无远程息屏遥控）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../lib/store.js'

const dir = () => mkdtempSync(join(tmpdir(), 'cb-store-'))

test('改了才加版本号，重开后还在', () => {
  const d = dir()
  const s = new Store({ dir: d })
  assert.equal(s.version, 1)
  s.update({ name: '高鸣' })
  assert.equal(s.version, 2)
  s.update({ name: '高鸣' })
  assert.equal(s.version, 2)
  const again = new Store({ dir: d })
  assert.equal(again.version, 2)
  assert.equal(again.profile.name, '高鸣')
})

test('只改一个字段，其他字段不变', () => {
  const s = new Store({})
  s.update({ name: '高鸣', handle: 'ALBIS', memos: ['工位 12F'] })
  s.update({ tagline: '新签名' })
  assert.equal(s.profile.name, '高鸣')
  assert.equal(s.profile.handle, 'ALBIS')
  assert.deepEqual(s.profile.memos, [{ text: '工位 12F', done: false, star: false }])
})

test('坏掉的数据文件不会让插件起不来', () => {
  const d = dir()
  writeFileSync(join(d, 'badge.json'), '{ not json')
  const s = new Store({ dir: d })
  assert.equal(s.version, 1)
  assert.ok(s.profile.name)
})

test('设备上报：切状态、心情与配色会改资料并加版本号', () => {
  const s = new Store({})
  const v = s.version
  s.deviceState({ status: 2, mood_idx: 3, style: 2, palette_idx: 2, touches: 5, lucky: 1, battery: 77, fw: '1.0.0' })
  assert.equal(s.profile.status, 2)
  assert.equal(s.profile.mood_idx, 3)
  assert.equal(s.profile.style, 2)
  assert.equal(s.profile.palette_idx, 2)
  assert.equal(s.version, v + 1)
  s.deviceState({ touches: 6, lucky: 1, battery: 76 })
  assert.equal(s.version, v + 1)
})

test('在工牌上划掉 10 条便签中的任意项：电脑端同步更新', () => {
  const s = new Store({})
  s.update({ memos: ['a', 'b', 'c', 'd', 'e', 'f'] })
  const v = s.version
  s.deviceState({ status: 0, style: 0, memo_done: 0b100101 })
  assert.deepEqual(s.profile.memos.map((m) => m.done), [true, false, true, false, false, true])
  assert.equal(s.version, v + 1)
})

test('保存照片资产递增版本号与 photo_ver', () => {
  const d = dir()
  const s = new Store({ dir: d })
  s.deviceState({ battery: 250, fw: 'x'.repeat(50) })
  const saved = JSON.parse(readFileSync(join(d, 'badge.json'), 'utf8'))
  assert.equal(saved.device.battery, 100)
  assert.equal(saved.device.fw.length, 16)

  const v0 = s.version
  s.savePhoto({ png: Buffer.from([1, 2, 3]), rgb565a8: Buffer.alloc(62208, 0xaa) })
  assert.equal(s.hasPhoto(), true)
  assert.equal(s.profile.avatar_mode, 2)
  assert.equal(s.profile.photo_ver, 1)
  assert.equal(s.version, v0 + 1)
})

test('离线耗电黑匣子落盘、去重、排除充电段并按版本计算续航', () => {
  const d = dir()
  const s = new Store({ dir: d })
  s.deviceState({
    fw: '1.0.1', battery: 80, battery_mv: 3960,
    pwr: [
      { seq: 1, b: 1, u: 0,  s: 100, mv: 4180, br: 0,   dm: 0,    sl: 0,   wf: 0,    ht: 1,  f: 5 },
      { seq: 2, b: 1, u: 60, s: 90,  mv: 4060, br: 300, dm: 3000, sl: 300, wf: 1800, ht: 30, f: 1 },
      { seq: 3, b: 1, u: 120, s: 80, mv: 3960, br: 300, dm: 3000, sl: 300, wf: 1800, ht: 30, f: 1 },
      // 模拟插入充电（应被排除在放电统计之外）
      { seq: 4, b: 1, u: 150, s: 98, mv: 4190, br: 100, dm: 1700, sl: 0,   wf: 1800, ht: 20, f: 1 },
    ],
  })
  assert.equal(s.lastPowerAck, 4)
  // 重复上报同一批不重复计入
  s.deviceState({ fw: '1.0.1', battery: 80, pwr: [{ seq: 2, b: 1, u: 60, s: 90, mv: 4060, br: 300, dm: 3000, sl: 300, wf: 1800, ht: 30, f: 1 }] })

  const s2 = new Store({ dir: d })
  const r = s2.powerReport()
  assert.equal(r.total_samples, 4)
  assert.equal(r.versions.length, 1)
  assert.equal(r.versions[0].fw, '1.0.1')
  assert.equal(r.versions[0].hours, 2)
  assert.equal(r.versions[0].soc_drop, 20)
  assert.equal(r.versions[0].pct_per_hour, 10)
  assert.equal(r.versions[0].est_full_hours, 10)
  assert.equal(r.versions[0].http_per_hour, 30)
})
