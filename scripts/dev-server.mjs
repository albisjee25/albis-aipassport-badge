// 不开 Harness 也能把服务跑起来（开发和截图用）：node scripts/dev-server.mjs [端口] [数据目录]
// 数据目录默认是临时目录，不会动 ~/.dsh/cyber-badge 里的真实资料。
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Pairing } from '../lib/pairing.js'
import { startServer } from '../lib/server.js'
import { Store } from '../lib/store.js'

const port = Number(process.argv[2]) || 8797
const dir = process.argv[3] || mkdtempSync(join(tmpdir(), 'cyber-badge-'))
const store = new Store({ dir })
const pairing = new Pairing({ file: join(dir, 'devices.json') }).startDiscovery(port, port === 8797 ? undefined : port + 1)   // 开发端口不抢正式的发现端口
await startServer({ store, pairing, port, host: '0.0.0.0' })
console.log(`赛博工牌服务：http://127.0.0.1:${port}  数据目录：${dir}`)
