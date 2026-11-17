// 资料规则和发给设备的数据。
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { DEFAULT_PROFILE, LIMITS, cutBytes, devicePayload, keepDone, memoMask, normalize, parseAvatar } from '../lib/profile.js'
import { PRESETS, DEFAULT_PALETTE } from '../lib/avatars.js'
import { THEMES } from '../lib/themes.js'

const bytes = (s) => Buffer.byteLength(s, 'utf8')
const FW = new URL('../../ai-passport-badge/main/', import.meta.url)

test('cutBytes 按字节截断且不切坏汉字', () => {
  assert.equal(cutBytes('高鸣高鸣', 7), '高鸣')
  assert.equal(cutBytes('  a\nb  ', 10), 'a b')
  assert.equal(cutBytes(null, 5), '')
})

test('默认资料本身合法，normalize 两次结果不变', () => {
  const p = normalize(DEFAULT_PROFILE)
  assert.deepEqual(normalize(p), p)
  assert.equal(p.avatar.length, 256)
  assert.equal(p.palette.length, 16)
  assert.deepEqual([p.memos, p.answers], [[], []])
})

test('每个字段都不超过设备上的存储空间', () => {
  const long = '特别特别长的文字'.repeat(20)
  const p = normalize({ name: long, handle: long, title: long, dept: long, emp_id: 'X'.repeat(99), tagline: long, mbti: 'entp-extra-long', sign: long,
    statuses: Array(9).fill(long), status: 99, theme: 99, answers: Array(20).fill(long), memos: Array(9).fill(long) })
  for (const k of ['name', 'handle', 'title', 'dept', 'emp_id', 'tagline', 'mbti', 'sign']) assert.ok(bytes(p[k]) <= LIMITS[k], k)
  assert.equal(p.statuses.length, LIMITS.statuses)
  assert.ok(p.statuses.every((t) => [...t].length <= 4))            // 竖着写，最多 4 个字
  assert.ok(p.status < p.statuses.length)
  assert.ok(p.theme < THEMES.length)
  assert.equal(p.answers.length, LIMITS.answers)
  assert.ok(p.answers.every((t) => [...t].length <= 12))
  assert.equal(p.memos.length, LIMITS.memos)
  assert.ok(p.memos.every((m) => [...m.text].length <= 20 && m.done === false))
  assert.equal(p.mbti, 'ENTP-EX')
})

test('乱七八糟的输入不会让资料坏掉', () => {
  for (const bad of [null, 'x', 42, [], { statuses: {}, palette: ['red'], avatar: 'zz', answers: 3, memos: 'no' }]) {
    const p = normalize(bad)
    assert.ok(p.name)
    assert.ok(p.statuses.length >= 1)
    assert.match(p.avatar, /^[0-9a-f]{256}$/)
    assert.ok(p.palette.every((c) => /^#[0-9A-Fa-f]{6}$/.test(c)))
    assert.ok(Array.isArray(p.memos) && Array.isArray(p.answers))
  }
  assert.deepEqual(normalize({ statuses: [] }).statuses, ['在线'])
  assert.equal('tags' in normalize({ tags: ['露营'] }), false)                       // 旧版的“找我聊”不再保留
  assert.deepEqual(normalize({ statuses: ['专注中 勿扰'] }).statuses, ['专注中勿'])   // 去空格，截到 4 个字
})

test('头像：接受 256 位字符串或 16 行，其他不接受', () => {
  const rows = Array.from({ length: 16 }, () => '..1234567890ab..')
  assert.equal(parseAvatar(rows).length, 256)
  assert.equal(parseAvatar(rows)[0], '0')
  assert.equal(parseAvatar('1'.repeat(255)), null)
  assert.equal(parseAvatar(['x'.repeat(16)]), null)
  for (const p of PRESETS) assert.match(p.avatar, /^[0-9a-f]{256}$/, p.id)
  assert.equal(DEFAULT_PALETTE.length, 16)
})

test('便签：接受文字或 { text, done }，空的去掉', () => {
  const p = normalize({ memos: ['工位 12F', { text: '交周报', done: true }, '', { text: '  ' }, { done: true }] })
  assert.deepEqual(p.memos, [{ text: '工位 12F', done: false }, { text: '交周报', done: true }])
  assert.equal(memoMask(p.memos), 0b10)
  assert.equal(memoMask([]), 0)
})

test('改便签列表时，没动的那几条保留“已完成”', () => {
  const prev = [{ text: '工位 12F', done: true }, { text: '交周报', done: false }]
  assert.deepEqual(keepDone(['交周报', '工位 12F', '新的一条'], prev),
    [{ text: '交周报', done: false }, { text: '工位 12F', done: true }, { text: '新的一条', done: false }])
  assert.deepEqual(keepDone([{ text: '交周报', done: true }], prev), [{ text: '交周报', done: true }])
})

test('发给设备的资料字段和固件解析的一致', (t) => {
  const d = devicePayload(normalize({ name: '高鸣', answers: ['先问问老板'], memos: ['a', { text: 'b', done: true }] }))
  assert.deepEqual(d.cards, ['先问问老板'])
  assert.deepEqual(d.memos, ['a', 'b'])
  assert.equal(d.memo_done, 2)
  for (const k of ['company', 'stats', 'link', 'link_kind', 'nfc_written', 'contact', 'nfc', 'answers']) assert.ok(!(k in d), k)
  if (!existsSync(new URL('cb_net.c', FW))) return t.skip('这台电脑上没有固件源码')
  const src = readFileSync(new URL('cb_net.c', FW), 'utf8')
  const parse = src.slice(src.indexOf('static bool parse_profile'), src.indexOf('// Sends the badge'))
  const read = new Set([...parse.matchAll(/pr, "([a-z_]+)"/g)].map((m) => m[1]))
  assert.deepEqual([...read].sort(), Object.keys(d).sort())        // 多发或少发一个字段都会在这里发现
})

test('最长的资料也装得进设备的接收缓冲区', () => {
  const long = '龘'.repeat(40)
  const p = normalize({ name: long, handle: 'W'.repeat(30), title: long, dept: long, emp_id: '9'.repeat(30), tagline: long, mbti: 'ENTP', sign: long,
    statuses: Array(6).fill(long), answers: Array(8).fill(long), memos: Array(4).fill({ text: long, done: true }) })
  assert.ok(Buffer.byteLength(JSON.stringify({ version: 4294967295, changed: true, profile: devicePayload(p) })) < 4095)
})

test('字段上限不超过固件里的存储空间', (t) => {
  if (!existsSync(new URL('cb_model.h', FW))) return t.skip('这台电脑上没有固件源码')
  const h = readFileSync(new URL('cb_model.h', FW), 'utf8')
  const size = (re) => Number(re.exec(h)[1])
  const cap = { name: size(/char name\[(\d+)\]/), handle: size(/char handle\[(\d+)\]/), title: size(/char title\[(\d+)\]/), dept: size(/char dept\[(\d+)\]/),
    emp_id: size(/char emp_id\[(\d+)\]/), tagline: size(/char tagline\[(\d+)\]/), mbti: size(/char mbti\[(\d+)\]/), sign: size(/char sign\[(\d+)\]/),
    status: size(/char statuses\[CB_STATUSES\]\[(\d+)\]/), answer: size(/char cards\[CB_CARDS\]\[(\d+)\]/), memo: size(/char memos\[CB_MEMOS\]\[(\d+)\]/) }
  for (const [k, n] of Object.entries(cap)) assert.ok(LIMITS[k] <= n - 1, `${k}: ${LIMITS[k]} > ${n - 1}`)
  const count = (name) => Number(new RegExp(`#define ${name}\\s+(\\d+)`).exec(h)[1])
  assert.deepEqual([LIMITS.statuses, LIMITS.answers, LIMITS.memos], [count('CB_STATUSES'), count('CB_CARDS'), count('CB_MEMOS')])
})

test('皮肤表和固件里的一致', (t) => {
  if (!existsSync(new URL('cb_model.c', FW))) return t.skip('这台电脑上没有固件源码')
  const src = readFileSync(new URL('cb_model.c', FW), 'utf8')
  const rows = [...src.matchAll(/\{ "([A-Z]+)",\s*((?:0x[0-9A-F]{6},?\s*){7})\}/g)]
  assert.equal(rows.length, THEMES.length)
  rows.forEach((m, i) => {
    const c = m[2].match(/0x[0-9A-F]{6}/g).map((x) => '#' + x.slice(2))
    const th = THEMES[i]
    assert.deepEqual([m[1], ...c], [th.name, th.bg, th.card, th.ink, th.soft, th.accent, th.accentInk, th.second])
  })
})
