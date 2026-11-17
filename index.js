// 赛博工牌 —— DeepSeek Harness 插件入口。
// 启动一个本机 HTTP 服务（工牌和编辑页用），并给 Harness 助手注册对话工具。
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Pairing } from './lib/pairing.js'
import { startServer } from './lib/server.js'
import { Store } from './lib/store.js'
import { registerTools } from './lib/tools.js'

export const name = 'cyber-badge'
export const inject = ['tools']

export const DEFAULTS = { port: 8797, host: '0.0.0.0', dataDir: '' }

// 设置页的字段说明。在 Harness 外（单元测试）取不到 schemastery 时没有 Config，不影响运行。
export let Config
try {
  const { default: z } = await import('@deepseek-ai/schemastery')
  Config = z.object({
    port: z.number().default(DEFAULTS.port).description('服务端口。工牌会自动找到电脑，一般不用改'),
    host: z.string().default(DEFAULTS.host).description('监听地址。0.0.0.0 让同一 Wi-Fi 下的工牌能连上'),
    dataDir: z.string().default('').description('数据目录，留空用 ~/.dsh/cyber-badge'),
  })
} catch { Config = undefined }

const logger = { info: (m) => console.log(m), warn: (m) => console.warn(m), error: (m) => console.error(m) }

export async function apply(ctx, config = {}) {
  const cfg = { ...DEFAULTS, ...config }
  const dataDir = cfg.dataDir || join(homedir(), '.dsh', 'cyber-badge')
  mkdirSync(dataDir, { recursive: true })

  const store = new Store({ dir: dataDir })
  const pairing = new Pairing({ file: join(dataDir, 'devices.json'), log: logger }).startDiscovery(cfg.port)
  const server = await startServer({ store, pairing, port: cfg.port, host: cfg.host, log: logger })
  logger.info(`[badge] 赛博工牌已启动：http://127.0.0.1:${cfg.port}`)

  registerTools(ctx, { store })

  // 插件被停用或重载时关掉服务
  ctx.effect(function* () {
    yield () => {
      server.closeAllConnections?.()
      server.close()
    }
  }, 'cyber-badge.server')
}
