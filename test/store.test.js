// 资料保存、版本号、设备上报。
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
  assert.deepEqual(s.profile.memos, [{ text: '工位 12F', done: false }])
})

test('坏掉的数据文件不会让插件起不来', () => {
  const d = dir()
  writeFileSync(join(d, 'badge.json'), '{ not json')
  const s = new Store({ dir: d })
  assert.equal(s.version, 1)
  assert.ok(s.profile.name)
})

test('设备上报：切状态和皮肤会改资料并加版本号', () => {
  const s = new Store({})
  const v = s.version
  s.deviceState({ status: 2, theme: 3, touches: 5, lucky: 1, battery: 77, fw: '0.1.0' })
  assert.equal(s.profile.status, 2)
  assert.equal(s.profile.theme, 3)
  assert.equal(s.version, v + 1)
  s.deviceState({ touches: 6, lucky: 1, battery: 76 })     // 只是心跳：不带状态，不改资料
  assert.equal(s.version, v + 1)
  assert.equal(s.profile.status, 2)
  s.deviceState({ status: 99, theme: 99 })                 // 越界的值被收回合法范围
  assert.ok(s.profile.status < s.profile.statuses.length)
  assert.ok(s.profile.theme <= 5)
})

test('在工牌上划掉便签：电脑上的便签跟着变；心跳不带便签时不动', () => {
  const s = new Store({})
  s.update({ memos: ['a', 'b', 'c'] })
  const v = s.version
  s.deviceState({ status: 0, theme: 0, memo_done: 0b101 })
  assert.deepEqual(s.profile.memos.map((m) => m.done), [true, false, true])
  assert.equal(s.version, v + 1)
  s.deviceState({ touches: 1 })
  assert.deepEqual(s.profile.memos.map((m) => m.done), [true, false, true])
  s.deviceState({ status: 0, theme: 0, memo_done: 0b101 })      // 和电脑上的一样：不加版本号
  assert.equal(s.version, v + 1)
})

test('摸鱼次数按天记差值；设备重刷后累计变小不倒扣', () => {
  let now = new Date(2026, 10, 16, 10, 0, 0)
  const s = new Store({ now: () => now })
  s.deviceState({ touches: 100 })                           // 第一次上报：之前的不算今天的
  assert.equal(s.deviceInfo().today, 0)
  s.deviceState({ touches: 130 })
  assert.equal(s.deviceInfo().today, 30)
  now = new Date(2026, 10, 17, 9, 0, 0)
  s.deviceState({ touches: 142 })
  assert.equal(s.deviceInfo().today, 12)
  assert.deepEqual(s.deviceInfo().days, [{ day: '2026-11-16', touches: 30 }, { day: '2026-11-17', touches: 12 }])
  s.deviceState({ touches: 3 })
  assert.equal(s.deviceInfo().today, 12)
  assert.equal(s.deviceInfo().touches, 3)
})

test('在线判断：45 秒内联系过算在线', () => {
  let now = new Date(2026, 10, 16, 10, 0, 0)
  const s = new Store({ now: () => now })
  assert.deepEqual([s.deviceInfo().online, s.deviceInfo().last_seen_s], [false, null])
  s.seen()
  assert.equal(s.deviceInfo().online, true)
  now = new Date(now.getTime() + 60 * 1000)
  assert.equal(s.deviceInfo().online, false)
  assert.equal(s.deviceInfo().last_seen_s, 60)
})

test('保存的文件是合法 JSON，电量和固件版本被整理', () => {
  const d = dir()
  const s = new Store({ dir: d })
  s.deviceState({ battery: 250, fw: 'x'.repeat(50) })
  const saved = JSON.parse(readFileSync(join(d, 'badge.json'), 'utf8'))
  assert.equal(saved.device.battery, 100)
  assert.equal(saved.device.fw.length, 16)
})
