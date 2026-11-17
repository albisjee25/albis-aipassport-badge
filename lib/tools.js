// 给 Harness 助手用的对话工具：在对话里说“把状态改成开会中”“帮我记一条便签”“给我画个像素头像”，
// 助手调用这些工具，改动几秒内同步到工牌。走的是和编辑页同一套规则（lib/profile.js）。
import { LIMITS, cutBytes, keepDone, parseAvatar } from './profile.js'
import { THEMES } from './themes.js'

let defineTool = (def) => def
try { ({ defineTool } = await import('@deepseek-ai/dsh-tools')) } catch { /* 不在 Harness 里（测试）时用原样返回 */ }

const text = (_args, value) => [{ type: 'text', text: value }]
const out = { schema: { type: 'string' }, render: text }
const zh = (n) => Math.floor(n / 3)          // 一个汉字 3 个字节

export function describe(store) {
  const p = store.profile
  const d = store.deviceInfo()
  return [
    '【第一页：给别人看】',
    `姓名：${p.name}${p.handle ? `（${p.handle}）` : ''}，工号 ${p.emp_id || '—'}`,
    `部门 / 职位：${p.dept || '—'} / ${p.title || '—'}`,
    `MBTI：${p.mbti || '—'}`,
    `签名：${p.tagline || '—'}`,
    `大字：${p.statuses.map((s, i) => (i === p.status ? `【${s}】` : s)).join(' / ')}`,
    `皮肤：${THEMES[p.theme].name}（可选 ${THEMES.map((t) => t.name).join('、')}）`,
    '【第二页：便签，给自己看】',
    p.memos.length ? p.memos.map((m, i) => `${i + 1}. ${m.done ? '[已完成] ' : ''}${m.text}`).join('\n') : '（没有便签）',
    '【第三页：答案之书】',
    `自己加的答案：${p.answers.join('、') || '—'}（内置答案会按 MBTI 调口吻）`,
    `【工牌】${d.online ? '在线' : d.last_seen_s === null ? '还没连接过' : '离线'}${d.battery >= 0 ? `，电量 ${d.battery}%` : ''}；摸鱼 ${d.touches} 次（今天 ${d.today} 次），锦鲤 ${d.lucky} 次`,
  ].join('\n')
}

export function registerTools(ctx, { store }) {
  const reg = (def) => ctx.tools.register(defineTool(def))

  reg({
    name: 'badge_get',
    description: '查看赛博工牌（AI Passport 工牌）现在的内容：给别人看的资料和状态、给自己看的便签、答案之书里自己加的答案、摸鱼战绩。修改前先看一眼。',
    parameters: {},
    output: out,
    async execute() { return describe(store) },
  })

  reg({
    name: 'badge_update',
    description: [
      '修改赛博工牌上的内容，几秒内同步到工牌。只传要改的字段，没传的保持不变；列表类字段（statuses、answers、memos）传的是完整的新列表。',
      `长度按设备屏幕限制（超出会被截断）：姓名约 ${zh(LIMITS.name)} 个汉字；签名一行，约 11 个汉字以内显示完整；第一页底部的大字最多 ${LIMITS.statuses} 条，每条不超过 ${zh(LIMITS.status)} 个汉字，可以是状态（开会中）、想聊的话题（来聊露营）或态度（别催）。`,
      `answers 是答案之书里主人自己加的答案：最多 ${LIMITS.answers} 条，每条不超过 ${zh(LIMITS.answer)} 个汉字，要短、像一句断言（如“先问问老板”“再等等”），用主人的口吻。内置答案已经按 MBTI 调口吻，不用重复。`,
      `memos 是第二页的便签，给主人自己看：最多 ${LIMITS.memos} 条，每条不超过 ${zh(LIMITS.memo)} 个汉字（如“工位 12F-A027”“周五 18 点前交周报”）。只加一条时用 badge_memo 更方便。`,
      '像素头像 avatar：16 行，每行 16 个字符，每个字符是调色板编号 0–f，“.”或 0 表示透明；palette 是 16 个 #RRGGBB 颜色（第 0 个不用）。画头像时用深色描边、少量颜色，轮廓占满画面。',
    ].join('\n'),
    parameters: {
      name: { type: 'string', description: '姓名' },
      handle: { type: 'string', description: '英文名或花名（只显示英文、数字）' },
      dept: { type: 'string', description: '部门' }, job_title: { type: 'string', description: '职位' },
      emp_id: { type: 'string', description: '工号' },
      tagline: { type: 'string', description: '签名' },
      mbti: { type: 'string' },
      statuses: { type: 'array', items: { type: 'string' }, description: '第一页底部可切换的大字列表（工牌上按 OK 轮换），每条不超过 4 个汉字' },
      skin: { type: 'string', enum: THEMES.map((t) => t.name), description: '皮肤' },
      answers: { type: 'array', items: { type: 'string' }, description: '答案之书里自己加的答案' },
      memos: { type: 'array', items: { type: 'string' }, description: '便签的完整新列表' },
      avatar: { type: 'array', items: { type: 'string' }, description: '像素头像，16 行 × 16 字符' },
      palette: { type: 'array', items: { type: 'string' }, description: '头像调色板，16 个 #RRGGBB' },
    },
    output: out,
    async execute(args = {}) {
      // 参数名不用 title：它是 JSON Schema 的保留关键字，会被模型接口的校验误判
      const { job_title, skin, avatar, memos, ...rest } = args
      const patch = { ...rest }
      if (job_title !== undefined) patch.title = job_title
      if (skin !== undefined) {
        const i = THEMES.findIndex((t) => t.name === String(skin).toUpperCase())
        if (i < 0) return `没有叫 ${skin} 的皮肤，可选：${THEMES.map((t) => t.name).join('、')}`
        patch.theme = i
      }
      if (avatar !== undefined) {
        const a = parseAvatar(avatar)
        if (!a) return '头像格式不对：要 16 行，每行 16 个字符（0–f 或 .）。没有修改任何内容。'
        patch.avatar = a
      }
      if (memos !== undefined) patch.memos = keepDone(memos, store.profile.memos)
      const before = store.version
      store.update(patch)
      return `${store.version === before ? '内容没有变化。' : '已更新，工牌几秒内同步。'}\n${describe(store)}`
    },
  })

  reg({
    name: 'badge_set_status',
    description: `切换工牌第一页底部显示的大字：状态（“开会中”）、想聊的话题（“来聊露营”）或态度（“别催”）都可以。传文字，不超过 ${zh(LIMITS.status)} 个汉字；列表里没有的会新增（列表满了就替换最后一个）。`,
    parameters: { status: { type: 'string', required: true, description: '要显示的大字' } },
    output: out,
    async execute({ status }) {
      const want = cutBytes(String(status ?? '').replace(/\s/g, ''), LIMITS.status)
      if (!want) return '没有收到状态文字。'
      const list = [...store.profile.statuses]
      let i = list.indexOf(want)
      if (i < 0) i = list.findIndex((s) => s.includes(want) || want.includes(s))
      if (i < 0) {
        if (list.length >= LIMITS.statuses) list[list.length - 1] = want
        else list.push(want)
        i = list.length - 1
      }
      const p = store.update({ statuses: list, status: i })
      return `工牌大字已换成「${p.statuses[p.status]}」。`
    },
  })

  reg({
    name: 'badge_memo',
    description: [
      `管理工牌第二页的便签（给主人自己看的备忘，最多 ${LIMITS.memos} 条，每条不超过 ${zh(LIMITS.memo)} 个汉字）。`,
      'action：add 加一条（满了会先去掉已完成的，再去掉最旧的）；done 把一条标成已完成；remove 删一条；clear_done 清掉所有已完成的。',
      'done 和 remove 用 index 指定第几条（从 1 开始，见 badge_get）。主人说“记一下……”“提醒我……”时用 add，文字写短、写成主人一眼能看懂的样子。',
    ].join('\n'),
    parameters: {
      action: { type: 'string', required: true, enum: ['add', 'done', 'remove', 'clear_done'] },
      text: { type: 'string', description: 'add 时的便签内容' },
      index: { type: 'integer', description: 'done / remove 时的序号，从 1 开始' },
    },
    output: out,
    async execute({ action, text: memoText, index }) {
      let memos = store.profile.memos.map((m) => ({ ...m }))
      const at = Number(index) - 1
      if (action === 'add') {
        const t = cutBytes(memoText, LIMITS.memo)
        if (!t) return '没有收到便签内容。'
        while (memos.length >= LIMITS.memos) {
          const done = memos.findIndex((m) => m.done)
          memos.splice(done >= 0 ? done : 0, 1)
        }
        memos.push({ text: t, done: false })
      } else if (action === 'done' || action === 'remove') {
        if (!Number.isInteger(at) || at < 0 || at >= memos.length) return `没有第 ${index} 条便签。现在有 ${memos.length} 条。`
        if (action === 'done') memos[at].done = true
        else memos.splice(at, 1)
      } else if (action === 'clear_done') {
        memos = memos.filter((m) => !m.done)
      } else {
        return 'action 只能是 add、done、remove、clear_done。'
      }
      const p = store.update({ memos })
      return p.memos.length ? `便签已更新：\n${p.memos.map((m, i) => `${i + 1}. ${m.done ? '[已完成] ' : ''}${m.text}`).join('\n')}` : '便签已清空。'
    },
  })
}
