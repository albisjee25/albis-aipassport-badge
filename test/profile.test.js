// V1.0 (v2.5) 资料边界规则、双端协议对齐、5 风格 × 14 色卡与固件源码 1:1 校验。
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import {
  DEFAULT_PROFILE, LIMITS, cutBytes, cutCols, displayCols,
  devicePayload, keepDone, memoMask, memoStarMask, normalize, parseAvatar,
} from '../lib/profile.js'
import { PRESETS, DEFAULT_PALETTE } from '../lib/avatars.js'
import { BUILTIN_AVATARS, PIXEL_SPRITES, STYLES, SUB_SCENES } from '../lib/themes.js'

const bytes = (s) => Buffer.byteLength(s, 'utf8')
const FW = new URL('../../ai-passport-badge/main/', import.meta.url)

test('cutBytes 按字节截断且不切坏汉字', () => {
  assert.equal(cutBytes('高鸣高鸣', 7), '高鸣')
  assert.equal(cutBytes('  a\nb  ', 10), 'a b')
  assert.equal(cutBytes(null, 5), '')
})

test('cutCols 按显示列宽严格截断（防 2 寸屏溢出）', () => {
  assert.equal(cutCols('欧阳娜娜超长名字', LIMITS.nameCols), '欧阳娜娜')
  assert.equal(cutCols('AlexanderGreat', LIMITS.nameCols), 'Alexande')
  assert.equal(cutCols('把一件事做到极致还要再多写很多很多字', LIMITS.taglineCols), '把一件事做到极致还')
  assert.ok(displayCols(cutCols('高级产品总监负责全球业务线', LIMITS.titleCols)) <= LIMITS.titleCols)
})

test('默认资料本身合法，normalize 两次结果不变', () => {
  const p = normalize(DEFAULT_PROFILE)
  assert.deepEqual(normalize(p), p)
  assert.equal(p.avatar.length, 256)
  assert.equal(p.palette.length, 16)
  assert.equal(p.style, 0)
  assert.equal(p.palette_idx, 0)
  assert.equal(p.sub_scene, 0)
  assert.equal(p.mbti, 'INTJ')
  assert.equal(p.pass_tag, 'CREATOR PASS')
  assert.deepEqual([p.memos, p.answers, p.qrs], [[], [], []])
})

test('每个字段都不超过 UI 显示列宽与固件存储双边界（含 10 条便签与 3 星上限）', () => {
  const long = '特别特别长的文字'.repeat(20)
  const p = normalize({
    name: long, handle: '@albis_super_long_handle_123', title: long,
    emp_id: 'X'.repeat(99), tagline: long, mbti: 'intj', pass_tag: 'creator pass extra',
    statuses: Array(9).fill(long), status: 99, mood_idx: 99, style: 99, palette_idx: 99, sub_scene: 99,
    avatar_mode: 9, avatar_preset: 99, pixel_preset: 99,
    qrs: Array(5).fill({ label: long, url: 'https://u.wechat.com/' + 'a'.repeat(150) }),
    answers: Array(20).fill(long),
    memos: Array.from({ length: 14 }, (_, i) => ({ text: `待办任务${i + 1}`, done: false, star: true })),
  })
  for (const k of ['name', 'handle', 'title', 'emp_id', 'tagline', 'mbti', 'pass_tag']) {
    assert.ok(bytes(p[k]) <= LIMITS[k], k)
  }
  assert.ok(displayCols(p.name) <= LIMITS.nameCols)
  assert.ok(displayCols(p.title) <= LIMITS.titleCols)
  assert.ok(displayCols(p.tagline) <= LIMITS.taglineCols)
  assert.equal(p.handle, 'albis_supe')
  assert.equal(p.emp_id.length, LIMITS.empIdCols)
  assert.equal(p.mbti, 'INTJ')
  assert.equal(p.pass_tag, 'CREATOR PASS')
  assert.equal(normalize({ mbti: 'ENTP-EXTRA' }).mbti, '')

  assert.equal(p.statuses.length, LIMITS.statuses)
  assert.ok(p.statuses.every((t) => displayCols(t) <= LIMITS.statusCols))
  assert.ok(p.style < STYLES.length)
  assert.ok(p.palette_idx < STYLES[p.style].palettes.length)
  assert.ok(p.sub_scene < SUB_SCENES.length)
  assert.ok(p.avatar_preset < BUILTIN_AVATARS.length)
  assert.ok(p.pixel_preset < PIXEL_SPRITES.length)

  assert.equal(p.qrs.length, LIMITS.qrs)
  assert.ok(p.qrs.every((q) => displayCols(q.label) <= LIMITS.qrLabelCols && q.url.length <= LIMITS.qrUrlMax))
  assert.equal(p.memos.length, LIMITS.memos)
  assert.equal(p.memos.filter((m) => m.star).length, LIMITS.memoStars)
})

test('便签保留已完成与星标，星标不超过 3 个', () => {
  const prev = [{ text: '工位 12F', done: true, star: true }, { text: '交周报', done: false, star: false }]
  assert.deepEqual(keepDone(['交周报', '工位 12F', '新的一条'], prev), [
    { text: '交周报', done: false, star: false },
    { text: '工位 12F', done: true, star: true },
    { text: '新的一条', done: false, star: false },
  ])
  const p = normalize({ memos: [{ text: 'a', done: true, star: true }, { text: 'b', done: false, star: true }] })
  assert.equal(memoMask(p.memos), 0b01)
  assert.equal(memoStarMask(p.memos), 0b11)
})

test('大众化命名、5 风格 × 14 色卡、7 内置插画与固件 cb_model.h 1:1 对齐', () => {
  assert.deepEqual(STYLES.map((s) => s.name), ['解压键帽', '心情贴纸', '潮流通行证', '像素冒险', '复古终端'])
  assert.equal(STYLES.reduce((n, s) => n + s.palettes.length, 0), 14)
  assert.equal(BUILTIN_AVATARS.length, 7)
  assert.equal(PIXEL_SPRITES.length, 6)

  const fwHeader = new URL('cb_model.h', FW)
  if (existsSync(fwHeader)) {
    const h = readFileSync(fwHeader, 'utf8')
    const num = (macro) => Number(h.match(new RegExp(`#define\\s+${macro}\\s+(\\d+)`))?.[1])
    assert.equal(num('CB_MEMOS'), LIMITS.memos)
    assert.equal(num('CB_MEMO_STAR_MAX'), LIMITS.memoStars)
    assert.equal(num('CB_QRS'), LIMITS.qrs)
    assert.equal(num('CB_QR_URL_MAX'), LIMITS.qrUrlMax)
    assert.equal(num('CB_BUILTIN_CNT'), BUILTIN_AVATARS.length)
    assert.equal(num('CB_PIXEL_PRESETS'), PIXEL_SPRITES.length)
  }

  const payload = devicePayload(normalize(DEFAULT_PROFILE))
  assert.equal('mute' in payload, false)
  assert.equal('sleep_seq' in payload, false)
  assert.equal('sub_scene' in payload, true)
  assert.equal('mood_idx' in payload, true)
  assert.equal('pixel_preset' in payload, true)
})

test('头像 16x16 校验正常', () => {
  for (const p of PRESETS) assert.match(p.avatar, /^[0-9a-f]{256}$/, p.id)
  assert.equal(DEFAULT_PALETTE.length, 16)
  assert.equal(parseAvatar('1'.repeat(255)), null)
})
