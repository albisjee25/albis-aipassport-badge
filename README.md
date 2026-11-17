# 赛博工牌（DeepSeek Harness 插件）

把 FoloToy AI Passport 变成一块工牌。这个插件负责在电脑上维护工牌内容，并同步到设备。

## 能做什么

工牌有四页，▲▼ 翻页：

- **工牌（给别人看）**：像素头像、英文名、MBTI、大号姓名、职位和部门、一句签名，底部一行远处也看得清的大字（状态、想聊的话题或态度，最多 4 个字）。按 OK 换下一条大字。
- **便签（给自己看）**：最多 4 条备忘，按 OK 划掉最上面一条没完成的。一分钟不按键自动回到工牌页。
- **答案之书**：心里想一个问题，按 OK 翻一个答案。内置 72 个答案按 MBTI 调口吻，也可以加自己的答案。
- **摸鱼池**：不联网也能玩的解压小游戏，次数按天记到电脑上。

这个插件负责在电脑上维护这些内容：

- **编辑页**（`http://127.0.0.1:8797`）：带设备预览，含 16 × 16 像素头像编辑器（17 个预设头像）和六套皮肤。
- **对话里维护**：在 Harness 对话里说“把大字换成开会中”“帮我记一下周五交周报”“帮我画个像素头像”，助手用 `badge_get`、`badge_update`、`badge_set_status`、`badge_memo` 完成。

工牌上换的大字、皮肤和划掉的便签也会同步回电脑。

NFC 暂时没做：AI Passport 背面是一张不通电的 NTAG213 标签，设备和电脑都写不了它，是否用于门禁要先确认门禁读卡器。

## 文件

| 文件 | 作用 |
|---|---|
| `index.js` | 入口：读设置、启动服务、注册对话工具 |
| `client.js` | Harness 侧边栏里的插件页 |
| `admin.html` | 工牌编辑页，地址 `http://127.0.0.1:8797` |
| `lib/profile.js` | 资料规则、发给设备的数据 |
| `lib/store.js` | 资料和设备数据的保存（`~/.dsh/cyber-badge/badge.json`） |
| `lib/server.js` | 给编辑页和设备用的接口；`/api/device/*` 要带设备令牌 |
| `lib/pairing.js` | 设备发现（UDP 8798）和配对 |
| `lib/tools.js` | 对话工具 |
| `lib/themes.js`、`lib/avatars.js` | 皮肤表（和固件一致）、预设头像 |
| `scripts/dev-server.mjs` | 不开 Harness 单独跑服务，开发用 |

## 设备怎么连电脑

设备和电脑在同一个 2.4G Wi-Fi 下。设备开机后广播找电脑，屏幕显示 4 位配对码；Harness 的插件页顶部出现同样的码和“允许”按钮，核对后点“允许”，设备拿到专属令牌。设备没联网时照常显示上次同步的内容，摸鱼池也能玩。

## 开发

```
npm test                              # 全部测试
node scripts/dev-server.mjs 8897      # 用临时数据跑服务
```

设备固件在 FoloToy 官方 ai-passport 仓库的 `feature/cyber-badge` 分支（`main/cb_*.c`）。

字体：编辑页用得意黑 Smiley Sans（OFL-1.1，许可见 `assets/SmileySans-OFL.txt`）。
