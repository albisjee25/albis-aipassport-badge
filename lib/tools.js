// 给 Harness 助手用的对话工具（V1.0 v2.5：5 大众化风格 × 14 色卡、7 内置插画 + 6 像素精灵、
// 双场景名片与便签、10 条队列 × 3 星标上限）。
import { LIMITS, cutCols, keepDone, parseAvatar } from './profile.js'
import { BUILTIN_AVATARS, MBTI_OPTIONS, MOODS, PIXEL_SPRITES, STYLES, SUB_SCENES } from './themes.js'

let defineTool = (def) => def
try { ({ defineTool } = await import('@deepseek-ai/dsh-tools')) } catch { /* 单测环境 */ }

const text = (_args, value) => [{ type: 'text', text: value }]
const out = { schema: { type: 'string' }, render: text }

export function describe(store) {
  const p = store.profile
  const st = STYLES[p.style] ?? STYLES[0]
  const pal = st.palettes[p.palette_idx] ?? st.palettes[0]
  const sub = SUB_SCENES[p.sub_scene] ?? SUB_SCENES[0]
  const avName = p.style === 3
    ? (p.avatar_mode === 1 ? '自定义像素画' : (PIXEL_SPRITES[p.pixel_preset]?.name ?? '潮帽少年'))
    : (p.avatar_mode === 2 ? '自定义图片' : (BUILTIN_AVATARS[p.avatar_preset]?.name ?? '打工柴'))
  return [
    '【工牌】',
    `姓名：${p.name}（@${p.handle}）${p.emp_id ? `，工号 ${p.emp_id}` : ''}`,
    `身份：${p.title || '—'} ｜ MBTI：${p.mbti || '—'}`,
    `签名：${p.tagline || '—'}`,
    `风格：${st.name} · ${pal.name}（形象：${avName}）`,
    st.hasMood
      ? `心情：${MOODS[p.mood_idx]?.text ?? '好心情'}`
      : (st.hasStatus ? `状态：${p.statuses.map((s, i) => (i === p.status ? `【${s}】` : s)).join(' / ')}` : `顶标：${p.pass_tag}`),
    `【名片码 · ${sub.name}】`,
    p.qrs.length ? p.qrs.map((q, i) => `${i + 1}. ${q.label}：${q.url}`).join('\n') : '（未添加名片码）',
    `【待办便签 · ${sub.name}（${p.memos.length}/10 · ★ ${p.memos.filter((m) => m.star).length}/3）】`,
    p.memos.length ? p.memos.map((m, i) => `${i + 1}. ${m.star ? '★ ' : ''}${m.done ? '[已完成] ' : ''}${m.text}`).join('\n') : '（没有待办）',
  ].join('\n')
}

export function registerTools(ctx, { store }) {
  const reg = (def) => ctx.tools.register(defineTool(def))

  reg({
    name: 'badge_get',
    description: '查看赛博工牌当前已保存的配置：风格、形象、资料、名片码与待办便签。',
    parameters: {},
    output: out,
    async execute() { return describe(store) },
  })

  reg({
    name: 'badge_update',
    description: [
      '更新赛博工牌配置数据，待工牌同步时下发。只传要改的字段；列表类字段传完整新列表。',
      `边界：姓名 ≤4 汉字；花名 3–10 英文；工号 ≤6 字符；身份 ≤6 汉字；签名 ≤9 汉字；状态 ≤${LIMITS.statuses} 条每条 ≤4 汉字；名片码 ≤${LIMITS.qrs} 张短链 ≤${LIMITS.qrUrlMax} 字节；便签 ≤${LIMITS.memos} 条、星标上限 ${LIMITS.memoStars} 个。`,
      `style 可选：${STYLES.map((s) => s.name).join('、')}；sub_scene 可选：${SUB_SCENES.map((s) => s.name).join('、')}。`,
    ].join('\n'),
    parameters: {
      name: { type: 'string', description: '姓名（≤4汉字）' },
      handle: { type: 'string', description: '花名（3-10英文）' },
      job_title: { type: 'string', description: '身份/职务（≤6汉字）' },
      emp_id: { type: 'string', description: '工号（≤6字符，选填）' },
      tagline: { type: 'string', description: '签名（≤9汉字）' },
      mbti: { type: 'string', enum: [...MBTI_OPTIONS, ''], description: 'MBTI（可留空）' },
      pass_tag: { type: 'string', description: '潮流通行证顶标（≤12大写英文）' },
      style: { type: 'string', enum: STYLES.map((s) => s.name), description: '风格名称' },
      palette_idx: { type: 'integer', description: '配色编号' },
      sub_scene: { type: 'string', enum: SUB_SCENES.map((s) => s.name), description: '名片与便签样式' },
      mood_idx: { type: 'integer', description: '心情贴纸编号 0-5' },
      avatar_preset: { type: 'string', enum: BUILTIN_AVATARS.map((a) => a.name), description: '内置插画形象' },
      pixel_preset: { type: 'string', enum: PIXEL_SPRITES.map((a) => a.name), description: '像素冒险精灵' },
      statuses: { type: 'array', items: { type: 'string' }, description: '状态列表（最多6条，每条≤4汉字）' },
      qrs: { type: 'array', items: { type: 'object' }, description: '名片码列表 [{label, url, channel}]（最多3张）' },
      memos: { type: 'array', items: { type: 'string' }, description: '便签完整列表（最多10条）' },
      avatar: { type: 'array', items: { type: 'string' }, description: '16x16 自定义像素画' },
      palette: { type: 'array', items: { type: 'string' }, description: '像素画调色板（16个 #RRGGBB）' },
    },
    output: out,
    async execute(args = {}) {
      const { job_title, style, sub_scene, avatar_preset, pixel_preset, avatar, memos, ...rest } = args
      const patch = { ...rest }
      if (job_title !== undefined) patch.title = job_title
      if (style !== undefined) {
        const i = STYLES.findIndex((s) => s.name === style || s.key === String(style).toLowerCase())
        if (i < 0) return `没有叫 ${style} 的风格，可选：${STYLES.map((s) => s.name).join('、')}`
        patch.style = i
      }
      if (sub_scene !== undefined) {
        const i = typeof sub_scene === 'number' ? sub_scene : SUB_SCENES.findIndex((s) => s.name === sub_scene)
        if (i >= 0) patch.sub_scene = i
      }
      if (avatar_preset !== undefined) {
        const i = BUILTIN_AVATARS.findIndex((a) => a.name === avatar_preset || a.key === String(avatar_preset).toLowerCase())
        if (i < 0) return `没有叫 ${avatar_preset} 的形象`
        patch.avatar_mode = 0
        patch.avatar_preset = i
      }
      if (pixel_preset !== undefined) {
        const i = PIXEL_SPRITES.findIndex((a) => a.name === pixel_preset || a.key === String(pixel_preset).toLowerCase())
        if (i >= 0) {
          patch.avatar_mode = 0
          patch.pixel_preset = i
        }
      }
      if (avatar !== undefined) {
        const a = parseAvatar(avatar)
        if (!a) return '像素画格式不对：需要 16×16 十六进制字符。'
        patch.avatar = a
        patch.avatar_mode = 1
      }
      if (memos !== undefined) patch.memos = keepDone(memos, store.profile.memos)
      const before = store.version
      store.update(patch)
      return `${store.version === before ? '内容没有变化。' : '已保存，待工牌同步。'}\n${describe(store)}`
    },
  })

  reg({
    name: 'badge_set_status',
    description: '切换工牌状态字（最多 4 个汉字）。',
    parameters: { status: { type: 'string', required: true, description: '状态字' } },
    output: out,
    async execute({ status }) {
      const want = cutCols(String(status ?? '').replace(/\s/g, ''), LIMITS.statusCols, LIMITS.status)
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
      return `工牌状态已切换为「${p.statuses[p.status]}」。`
    },
  })

  reg({
    name: 'badge_memo',
    description: `管理工牌待办便签（最多 ${LIMITS.memos} 条，星标最多 ${LIMITS.memoStars} 个）。action：add / done / star / remove / clear_done。`,
    parameters: {
      action: { type: 'string', required: true, enum: ['add', 'done', 'star', 'remove', 'clear_done'] },
      text: { type: 'string', description: 'add 时的待办内容' },
      index: { type: 'integer', description: 'done / star / remove 时的序号（从 1 开始）' },
    },
    output: out,
    async execute({ action, text: memoText, index }) {
      let memos = store.profile.memos.map((m) => ({ ...m }))
      const at = Number(index) - 1
      if (action === 'add') {
        const t = cutCols(memoText, LIMITS.memoCols, LIMITS.memo)
        if (!t) return '没有收到待办内容。'
        while (memos.length >= LIMITS.memos) {
          const done = memos.findIndex((m) => m.done)
          memos.splice(done >= 0 ? done : 0, 1)
        }
        memos.push({ text: t, done: false, star: false })
      } else if (action === 'done' || action === 'star' || action === 'remove') {
        if (!Number.isInteger(at) || at < 0 || at >= memos.length) return `没有第 ${index} 条待办。`
        if (action === 'done') memos[at].done = true
        else if (action === 'star') {
          if (!memos[at].star && memos.filter((m) => m.star).length >= LIMITS.memoStars) {
            return `星标最多允许标记 ${LIMITS.memoStars} 条，请先取消一条星标。`
          }
          memos[at].star = !memos[at].star
          memos = [
            ...memos.filter((x) => !x.done && x.star),
            ...memos.filter((x) => !x.done && !x.star),
            ...memos.filter((x) => x.done),
          ]
        } else {
          memos.splice(at, 1)
        }
      } else if (action === 'clear_done') {
        memos = memos.filter((m) => !m.done)
      } else {
        return 'action 只能是 add、done、star、remove、clear_done。'
      }
      const p = store.update({ memos })
      return p.memos.length
        ? `待办已更新（${p.memos.length}/10 · ★ ${p.memos.filter((m) => m.star).length}/3）：\n${p.memos.map((m, i) => `${i + 1}. ${m.star ? '★ ' : ''}${m.done ? '[已完成] ' : ''}${m.text}`).join('\n')}`
        : '待办已清空。'
    },
  })

  reg({
    name: 'badge_power',
    description: '查看赛博工牌按固件版本分组的实测耗电速率（%/小时）、推算续航小时数与亮屏/暗屏/息屏/Wi-Fi 占比报告。',
    parameters: {},
    output: out,
    async execute() {
      const r = store.powerReport()
      const lines = [
        `【当前电量】${r.latest.battery >= 0 ? `${r.latest.battery}%` : '未知'}${r.latest.battery_mv > 0 ? ` (${r.latest.battery_mv} mV)` : ''} ｜ 固件：${r.latest.fw || '未知'} ｜ 累计采样：${r.total_samples} 条`,
      ]
      if (!r.versions.length) {
        lines.push('暂无耗电历史样本（设备离线或在线运行满 10 分钟或掉电 ≥2% 后会自动回传）。')
      } else {
        for (const v of r.versions) {
          lines.push(
            `• fw ${v.fw}：观测 ${v.hours}h 掉电 ${v.soc_drop}%` +
            (v.pct_per_hour !== null ? ` → ${v.pct_per_hour}%/h（推算满电约 ${v.est_full_hours ?? '—'}h）` : '（样本积累中）') +
            ` ｜ 高亮 ${v.bright_pct}% / 常亮 ${v.dim_pct}% / 息屏 ${v.sleep_pct}% / Wi-Fi ${v.wifi_pct}% / HTTP ${v.http_per_hour}次/h`,
          )
        }
      }
      return lines.join('\n')
    },
  })
}
