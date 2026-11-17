// 侧边栏页面（client.js）：用假 React 把整页渲染一遍，确认注册了入口和页面、各种状态下渲染不抛错。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const SRC = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

function load(state) {
  let mod
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    // 第一个 useState 是 useInfo 的状态：直接塞进要测的状态
    useState: (init) => [init && typeof init === 'object' && init.status === 'checking' && state ? state : init, () => {}],
    useMemo: (fn) => fn(), useEffect: () => {}, useRef: () => ({ current: null }),
  }
  const window = { __ModuleLoader__: { load: (m) => { mod = m } }, localStorage: { getItem: () => null } }
  vm.runInNewContext(SRC, { window, fetch: () => Promise.reject(new Error('offline')), setInterval, clearInterval })
  const api = mod.factory((name) => { assert.equal(name, 'react'); return React })
  const registered = []
  api.apply({ slots: { inject: (_o, fn) => fn(), register: (opts, comp) => registered.push({ opts, comp }) } })
  return { mod, api, registered }
}

function textOf(node, out = []) {
  if (node === null || node === undefined || node === false) return out
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out }
  if (Array.isArray(node)) { node.forEach((n) => textOf(n, out)); return out }
  if (typeof node.type === 'function') return textOf(node.type({ ...node.props, children: node.children }), out)
  node.children.forEach((c) => textOf(c, out))
  return out
}
const pageText = (state) => { const { registered } = load(state); return textOf(registered.find((r) => r.opts.name === 'main').comp()).join(' ') }

const info = (over = {}) => ({ ok: true, port: 8797, pairing: [],
  device: { online: true, last_seen_s: 3, battery: 87, touches: 163, lucky: 4, today: 36, days: [] },
  profile: { name: '高鸣', handle: 'ALBIS', title: '产品经理', status: '开会中', theme: 'ACID', avatar: '1'.repeat(256), palette: Array(16).fill('#C8FF3D') },
  memos: { total: 4, left: 3 }, ...over })

test('id 与包名一致，注册侧边栏入口和主页面', () => {
  const { mod, api, registered } = load()
  assert.equal(mod.id, 'albis-aipassport-badge')
  assert.equal(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).name, mod.id)
  assert.deepEqual(Array.from(api.inject), ['slots'])
  const main = registered.find((r) => r.opts.name === 'main')
  const nav = registered.find((r) => r.opts.name === 'sidebar.panellist')
  assert.equal(main.opts.key, nav.opts.id)
  assert.equal(nav.opts.label, '赛博工牌')
  assert.ok(nav.comp({ size: 18 }))
})

test('服务在线：显示工牌资料、状态和战绩', () => {
  const t = pageText({ status: 'up', info: info() })
  for (const s of ['高鸣', 'ALBIS', '产品经理', '工牌在线 · 电量 87%', '大字：开会中', '皮肤：ACID', '便签还剩 3 条', '编辑我的工牌', '163', '36']) assert.ok(t.includes(s), s)
  assert.ok(!t.includes('请求连接'))
})

test('有工牌请求配对：页面最上面出现配对码和按钮', () => {
  const t = pageText({ status: 'up', info: info({ pairing: [{ code: '4821', ip: '192.168.1.9', age_s: 2 }] }) })
  assert.ok(t.indexOf('4821') < t.indexOf('编辑我的工牌'))
  assert.ok(t.includes('允许') && t.includes('拒绝'))
})

test('工牌从没连过：告诉主人怎么联网配对', () => {
  const t = pageText({ status: 'up', info: info({ device: { online: false, last_seen_s: null, battery: -1, touches: 0, lucky: 0, today: 0, days: [] } }) })
  assert.ok(t.includes('工牌还没连接过'))
  assert.ok(t.includes('联网配置'))
})

test('服务没起来：说明原因，不抛错', () => {
  assert.ok(pageText({ status: 'down' }).includes('工牌服务没在运行'))
  assert.ok(pageText({ status: 'checking' }).includes('正在检查服务'))
})

test('按键说明和固件一致：四张卡片和摸鱼池的按法都在', () => {
  const t = pageText({ status: 'up', info: info() })
  for (const s of ['切换状态', '划掉最上面一条', '翻出一个答案', '换皮肤', '自动回到工牌页', '撒鱼食', '对着麦克风吹气', '上岸']) assert.ok(t.includes(s), s)
  assert.ok(!t.includes('NFC') && !t.includes('二维码'))
})
