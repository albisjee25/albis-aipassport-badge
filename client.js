// 赛博工牌的 Harness 界面：侧边栏入口 + 页面（工牌现在的样子、打开编辑页、配对、让 AI 帮你改、摸鱼战绩、按键说明）。
// 约定（来自 Harness 侧边栏文档）：sidebar.panellist 注册图标，main 注册页面，两者用同一个 id 对应。
// 样式只用 Harness 的主题变量（--dsw-alias-*），不引入任何 Harness 内部包。
window.__ModuleLoader__.load({
  id: 'albis-aipassport-badge',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const ID = 'albis-aipassport-badge'
    const DEFAULT_PORT = 8797
    const portOf = () => Number(window.localStorage?.getItem('cyber-badge.port')) || DEFAULT_PORT

    let CTX = null
    const nav = () => { try { return CTX?.get?.('uiWorkspace') } catch { return undefined } }
    const canChat = () => typeof nav()?.startSession === 'function'
    function startChat(prompt) {
      const n = nav()
      if (typeof n?.startSession !== 'function') return
      n.startSession(undefined, { prompt, whenDraftExists: 'append' })
    }
    // 对话入口：改工牌内容是这个插件的日常用法，助手用 badge_get / badge_update / badge_set_status 完成
    const ideas = [
      { title: '记一条便签', sub: '“周五前交周报”，说一句就记到工牌第二页', prompt: '用 badge_memo 帮我在工牌上记一条便签：' },
      { title: '写我自己的答案', sub: '给答案之书加几条你的口头禅', prompt: '先用 badge_get 看看我的赛博工牌。我想给答案之书加几条我自己口吻的答案，你先按我下面说的风格写 8 条给我挑，我定了再用 badge_update 写进去。我的风格：' },
      { title: '画一个像素头像', sub: '描述你想要的样子，AI 画成 16×16 像素', prompt: '帮我给赛博工牌画一个 16×16 的像素头像，画好直接用 badge_update 换上，我看了工牌再告诉你怎么改。我想要的样子：' },
      { title: '换一条大字', sub: '“开会中”“来聊露营”，一句话换掉第一页的大字', prompt: '用 badge_set_status 把我工牌第一页的大字换成：' },
    ]
    const K = (t) => h('span', { className: 'cbg-key' }, t)
    const manual = [
      { title: '四张卡片', rows: [
        [[K('▲'), ' ', K('▼')], '上一张 / 下一张：工牌、便签、答案之书、摸鱼池'],
        [['工牌页按 ', K('OK')], '切换状态（在线、开会中……）'],
        [['便签页按 ', K('OK')], '划掉最上面一条没完成的便签'],
        [['答案之书按 ', K('OK')], '心里想一个问题再按，翻出一个答案；再按一次重新问'],
        [['长按 ', K('OK')], '设置：声音开关、换皮肤、联网配置'],
        ['一分钟不按键', '自动回到工牌页，便签不会一直亮给别人看'],
      ] },
      { title: '摸鱼池（不联网也能玩）', rows: [
        [['摸鱼池页按 ', K('OK')], '下水'],
        [[K('▲'), ' ', K('▼')], '摸上半池 / 下半池的鱼。摸到会“+1”，连着摸有连击'],
        [['按 ', K('OK')], '撒鱼食，鱼会游过来吃'],
        ['对着麦克风吹气', '水面起风'],
        ['金色锦鲤', '摸几十下会游出来一条，摸到它抽一句今日好运'],
        [['长按 ', K('OK')], '上岸。开会时先到设置里把声音关掉'],
      ] },
    ]

    const css = `
.cbg-page{height:100%;overflow:auto;box-sizing:border-box;padding:36px 40px 72px;color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased;--cbg-acid:#C8FF3D;--cbg-ink:#0B0C10;--cbg-violet:#8B6CFF}
.cbg-wrap{max-width:760px;margin:0 auto}
.cbg-pair{margin-bottom:24px;padding:16px 20px;border-radius:20px;background:color-mix(in srgb,#F5A524 16%,var(--dsw-alias-bg-layer-1));border:1px solid color-mix(in srgb,#F5A524 45%,transparent)}
.cbg-pair-row{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:4px 0}
.cbg-pair-code{font:700 30px/1 ui-monospace,Menlo,monospace;letter-spacing:6px;padding:10px 16px;border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.cbg-pair-msg{flex:1;min-width:200px;display:flex;flex-direction:column;gap:2px}
.cbg-pair-msg small{opacity:.7}
.cbg-pair button{border:0;border-radius:12px;padding:10px 20px;font-size:15px;cursor:pointer;font-family:inherit}
.cbg-pair-ok{background:#2F9E6B;color:#fff}
.cbg-pair-no{background:transparent;color:inherit;opacity:.65}
.cbg-stage{display:flex;align-items:center;gap:28px;padding:28px 32px;border-radius:24px;margin-bottom:36px;background:var(--cbg-ink);color:#F2F4EE}
.cbg-card{flex:none;position:relative;width:132px;height:132px}
.cbg-card::before{content:"";position:absolute;inset:8px -8px -8px 8px;border-radius:6px;background:var(--cbg-acid)}
.cbg-card canvas{position:relative;display:block;width:132px;height:132px;box-sizing:border-box;padding:8px;border-radius:6px;background:#17191F;border:2px solid #F2F4EE;image-rendering:pixelated}
.cbg-say{flex:1;min-width:0}
.cbg-name{margin:0;font-size:30px;line-height:1.15;font-weight:700;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cbg-name span{margin-left:10px;font-size:16px;font-weight:600;color:var(--cbg-acid)}
.cbg-sub{margin:4px 0 0;color:#9096A3}
.cbg-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.cbg-chip{display:inline-flex;align-items:center;gap:6px;padding:3px 11px;border-radius:99px;background:#1C1F27;font-size:12.5px;color:#C9CED8}
.cbg-dot{width:7px;height:7px;border-radius:50%;background:#9096A3}
.cbg-dot.cbg-ok{background:#35D07F}.cbg-dot.cbg-warn{background:#FFB02E}.cbg-dot.cbg-bad{background:#FF5A5A}
.cbg-main{display:inline-flex;align-items:center;gap:8px;margin-top:18px;padding:11px 22px;border-radius:14px;text-decoration:none;background:var(--cbg-acid);color:var(--cbg-ink);font-size:15px;font-weight:700}
.cbg-main.cbg-off{opacity:.45;pointer-events:none}
.cbg-hint{margin:10px 0 0;font-size:12.5px;color:var(--dsw-alias-label-secondary)}
.cbg-stage .cbg-hint{color:#9096A3}
.cbg-sec{margin-bottom:36px}
.cbg-h2{display:flex;align-items:baseline;gap:10px;margin-bottom:12px}
.cbg-h2 b{font-size:16px}
.cbg-h2 span{color:var(--dsw-alias-label-secondary);font-size:13px}
.cbg-ideas{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.cbg-idea{display:flex;flex-direction:column;gap:2px;text-align:left;padding:14px 16px;border:0;border-radius:16px;background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;cursor:pointer}
.cbg-idea:disabled{opacity:.5;cursor:default}
.cbg-idea small{color:var(--dsw-alias-label-secondary)}
.cbg-alert{margin-top:10px;padding:11px 14px;border-radius:12px;background:color-mix(in srgb,#F5A524 14%,transparent)}
.cbg-nums{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.cbg-num{padding:14px 16px;border-radius:16px;background:var(--dsw-alias-bg-layer-1)}
.cbg-num b{display:block;font-size:28px;line-height:1.1}
.cbg-num small{color:var(--dsw-alias-label-secondary)}
.cbg-manual h3{margin:18px 0 6px;font-size:14px}
.cbg-table{width:100%;border-collapse:collapse}
.cbg-table td{padding:7px 0;border-top:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.25));vertical-align:top}
.cbg-table td:first-child{width:170px;padding-right:12px;white-space:nowrap}
.cbg-key{display:inline-block;min-width:22px;padding:0 6px;border-radius:6px;text-align:center;font-size:12px;line-height:20px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 9%,transparent)}
@media (max-width:640px){.cbg-page{padding:24px 18px 56px}.cbg-stage{flex-direction:column;align-items:flex-start}.cbg-ideas,.cbg-nums{grid-template-columns:minmax(0,1fr)}}
`

    function useInfo() {
      const [state, setState] = React.useState({ status: 'checking' })
      const port = React.useMemo(portOf, [])
      const [tick, setTick] = React.useState(0)
      React.useEffect(() => {
        let stop = false
        const run = async () => {
          try {
            const r = await fetch(`http://127.0.0.1:${port}/api/info`)
            if (!r.ok) throw new Error(String(r.status))
            const info = await r.json()
            if (!stop) setState({ status: 'up', info })
          } catch { if (!stop) setState({ status: 'down' }) }
        }
        run()
        const t = setInterval(run, 2000)
        return () => { stop = true; clearInterval(t) }
      }, [port, tick])
      return { ...state, port, refresh: () => setTick((n) => n + 1) }
    }

    // 像素头像：16×16，每格一个调色板编号
    function Avatar({ avatar, palette }) {
      const ref = React.useRef ? React.useRef(null) : { current: null }
      React.useEffect(() => {
        const g = ref.current?.getContext?.('2d')
        if (!g || !avatar) return
        g.clearRect(0, 0, 16, 16)
        for (let i = 0; i < 256; i++) {
          const v = parseInt(avatar[i], 16)
          if (v) { g.fillStyle = palette[v]; g.fillRect(i % 16, i >> 4, 1, 1) }
        }
      }, [avatar, (palette || []).join()])
      return h('div', { className: 'cbg-card' }, h('canvas', { ref, width: 16, height: 16, role: 'img', 'aria-label': '工牌上的像素头像' }))
    }

    function BadgeIcon({ size = 20 }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('rect', { x: 5, y: 5, width: 14, height: 16, rx: 3 }), h('path', { d: 'M10 3h4v3h-4z' }),
        h('rect', { x: 8.5, y: 9, width: 4, height: 4, rx: 0.8 }), h('path', { d: 'M8.5 16.5h7M15 10h1M15 12.5h1' }))
    }

    // ---- 新工牌请求连接：屏幕上的 4 位码和这里一致才点“允许” ----
    function PairCard({ info, port, refresh }) {
      const list = info?.pairing || []
      const [err, setErr] = React.useState('')
      if (!list.length) return null
      const act = async (kind, code) => {
        setErr('')
        try {
          const r = await fetch(`http://127.0.0.1:${port}/api/pair/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CB-Local': '1' }, body: JSON.stringify({ code }) })
          if (!r.ok) throw new Error(String(r.status))
          refresh?.()
        } catch { setErr('没能完成操作。重启一次 Harness 后再试。') }
      }
      return h('section', { className: 'cbg-pair', role: 'alert' }, list.map((p) =>
        h('div', { key: p.code, className: 'cbg-pair-row' },
          h('span', { className: 'cbg-pair-code' }, p.code),
          h('div', { className: 'cbg-pair-msg' }, h('b', null, '有一块工牌请求连接'),
            h('small', null, '看看工牌屏幕上的 4 位数字，和这里一样才点“允许”；不是你的工牌点“拒绝”。')),
          h('button', { type: 'button', className: 'cbg-pair-ok', onClick: () => act('approve', p.code) }, '允许'),
          h('button', { type: 'button', className: 'cbg-pair-no', onClick: () => act('deny', p.code) }, '拒绝'))),
        err ? h('p', { className: 'cbg-hint' }, err) : null)
    }

    // ---- 工牌现在的样子 + 打开编辑页 ----
    function Stage({ status, info, port }) {
      const up = status === 'up'
      const p = up ? info.profile : null
      const d = up ? info.device : null
      const dev = !up ? ['', status === 'checking' ? '检查中' : '服务没在运行']
        : d.online ? ['ok', `工牌在线${d.battery >= 0 ? ` · 电量 ${d.battery}%` : ''}`]
        : d.last_seen_s === null ? ['warn', '工牌还没连接过'] : ['bad', '工牌离线']
      return h('div', { className: 'cbg-stage' },
        h(Avatar, { avatar: p?.avatar, palette: p?.palette }),
        h('div', { className: 'cbg-say' },
          h('p', { className: 'cbg-name' }, p ? p.name : '赛博工牌', p?.handle ? h('span', null, p.handle) : null),
          h('p', { className: 'cbg-sub' }, p ? (p.title || '还没填职位') : '在电脑上改，工牌几秒后跟着变'),
          h('div', { className: 'cbg-chips' },
            h('span', { className: 'cbg-chip' }, h('i', { className: `cbg-dot${dev[0] ? ` cbg-${dev[0]}` : ''}` }), dev[1]),
            p ? h('span', { className: 'cbg-chip' }, `大字：${p.status}`) : null,
            p ? h('span', { className: 'cbg-chip' }, `皮肤：${p.theme}`) : null,
            up && info.memos?.total ? h('span', { className: 'cbg-chip' }, info.memos.left ? `便签还剩 ${info.memos.left} 条` : '便签都搞定了') : null),
          h('a', { className: `cbg-main${up ? '' : ' cbg-off'}`, href: `http://127.0.0.1:${port}`, target: '_blank', rel: 'noreferrer' }, '编辑我的工牌', h('span', { 'aria-hidden': true }, '↗')),
          up ? null : h('p', { className: 'cbg-hint' }, status === 'checking' ? '正在检查服务…' : '工牌服务没在运行，编辑页暂时打不开。到“插件”里确认赛博工牌已启用，再重启一次 Harness。')))
    }

    function Chat() {
      const ok = canChat()
      return h('section', { className: 'cbg-sec' },
        h('div', { className: 'cbg-h2' }, h('b', null, '让 AI 帮你折腾'), h('span', null, '在对话里说，改好自动同步到工牌')),
        h('div', { className: 'cbg-ideas' }, ideas.map((c) =>
          h('button', { key: c.title, type: 'button', className: 'cbg-idea', disabled: !ok, onClick: () => startChat(c.prompt) }, h('b', null, c.title), h('small', null, c.sub)))),
        ok ? null : h('p', { className: 'cbg-hint' }, '这个版本的 Harness 不支持从这里开对话。点左上角“新会话”，直接说“帮我改一下赛博工牌”。'))
    }

    function Pond({ status, info }) {
      const d = status === 'up' ? info.device : null
      const first = status === 'up' && d.last_seen_s === null
      return h('section', { className: 'cbg-sec' },
        h('div', { className: 'cbg-h2' }, h('b', null, '摸鱼战绩'), h('span', null, '工牌联网时自动记到这里')),
        h('div', { className: 'cbg-nums' },
          h('div', { className: 'cbg-num' }, h('b', null, d ? d.today : '—'), h('small', null, '今天摸鱼')),
          h('div', { className: 'cbg-num' }, h('b', null, d ? d.touches : '—'), h('small', null, '累计摸鱼')),
          h('div', { className: 'cbg-num' }, h('b', null, d ? d.lucky : '—'), h('small', null, '摸到锦鲤'))),
        first ? h('div', { className: 'cbg-alert' }, '工牌还没连过这台电脑。在工牌上长按 OK → 联网配置，用微信小程序“蓝牙配网-FoloToy AI PASSPORT”连上和电脑相同的 2.4G Wi-Fi；连上后工牌屏幕会出现 4 位配对码，本页最上方会出现“允许”按钮。') : null)
    }

    function Manual() {
      return h('section', { className: 'cbg-sec cbg-manual' },
        h('div', { className: 'cbg-h2' }, h('b', null, '工牌怎么按'), h('span', null, '▲ ▼ 是上下键，OK 是中间的键')),
        manual.map((g) => h('div', { key: g.title }, h('h3', null, g.title),
          h('table', { className: 'cbg-table' }, h('tbody', null, g.rows.map(([a, b], i) => h('tr', { key: i }, h('td', null, a), h('td', null, b)))))))
      )
    }

    function Page() {
      const s = useInfo()
      return h('div', { className: 'cbg-page' }, h('style', null, css),
        h('div', { className: 'cbg-wrap' },
          h(PairCard, { info: s.info, port: s.port, refresh: s.refresh }),
          h(Stage, s), h(Chat), h(Pond, s), h(Manual)))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        CTX = ctx
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: ID }, Page))
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
          { name: 'sidebar.panellist', id: ID, order: 31, label: '赛博工牌' },
          (props) => h(BadgeIcon, { size: typeof props?.size === 'number' ? props.size : 20 })))
      },
    }
  },
})
