#!/usr/bin/env node

// 子命令路由：build 命令走独立的 SSG 构建流程
const subCommand = process.argv[2]
if (subCommand === 'build') {
  await import('./build.js')
  process.exit(0)
}

import { createServer } from 'vite'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { exec } from 'child_process'
import { pathToFileURL } from 'url'

// 获取 CLI 工具所在目录
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const pkgRoot = resolve(__dirname, '..')

// 用户执行命令的目录
const userDir = process.cwd()

// 默认配置
const defaultConfig = {
  title: 'md2ui',
  port: 3000,
  folderExpanded: false,
  github: '',
  footer: '',
  themeColor: '#3eaf7c'
}

// 加载用户配置文件（md2ui.config.js 或 .md2uirc.json）
async function loadUserConfig() {
  // 尝试 md2ui.config.js
  const jsPath = resolve(userDir, 'md2ui.config.js')
  if (fs.existsSync(jsPath)) {
    try {
      const mod = await import(pathToFileURL(jsPath).href)
      console.log('  配置文件: md2ui.config.js\n')
      return mod.default || mod
    } catch (e) {
      console.warn('  配置文件加载失败:', e.message, '\n')
    }
  }
  // 尝试 .md2uirc.json
  const jsonPath = resolve(userDir, '.md2uirc.json')
  if (fs.existsSync(jsonPath)) {
    try {
      const raw = fs.readFileSync(jsonPath, 'utf-8')
      console.log('  配置文件: .md2uirc.json\n')
      return JSON.parse(raw)
    } catch (e) {
      console.warn('  配置文件加载失败:', e.message, '\n')
    }
  }
  return {}
}

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2)
  const result = { dir: null }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-p' || args[i] === '--port') {
      result.port = parseInt(args[i + 1]) || undefined
      i++
    } else if (!args[i].startsWith('-')) {
      // 位置参数作为扫描目录
      result.dir = args[i]
    }
  }
  return result
}

// 扫描目录下的 md 文件
function scanDocs(dir, basePath = '', level = 0, folderExpanded = false) {
  const items = []
  if (!fs.existsSync(dir)) return items

  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.name !== 'node_modules')
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))

  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name)
    const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      const children = scanDocs(fullPath, relativePath, level + 1, folderExpanded)
      if (children.length > 0) {
        const match = entry.name.match(/^(\d+)-(.+)$/)
        items.push({
          key: relativePath,
          label: match ? match[2] : entry.name,
          order: match ? parseInt(match[1]) : 999,
          type: 'folder',
          level,
          expanded: folderExpanded,
          children
        })
      }
    } else if (entry.name.endsWith('.md')) {
      const match = entry.name.match(/^(\d+)-(.+)\.md$/)
      const label = match ? match[2] : entry.name.replace(/\.md$/, '')
      items.push({
        key: relativePath.replace(/\.md$/, ''),
        label,
        order: match ? parseInt(match[1]) : 999,
        type: 'file',
        level,
        path: `/@user-docs/${relativePath}`
      })
    }
  }

  items.sort((a, b) => a.order - b.order)
  return items
}

// 检查目录下是否有 md 文件
function hasMdFiles(dir) {
  if (!fs.existsSync(dir)) return false
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.name !== 'node_modules')
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md')) return true
    if (entry.isDirectory() && hasMdFiles(resolve(dir, entry.name))) return true
  }
  return false
}

// Vite 插件：提供用户文档 API + 配置 API + 热更新
function md2uiPlugin(siteConfig, docsRoot) {
  return {
    name: 'md2ui-server',
    configureServer(server) {
      // API 中间件
      server.middlewares.use((req, res, next) => {
        // 文档列表 API（带 ETag 支持，避免轮询时重复传输）
        if (req.url === '/@user-docs-list') {
          const docs = scanDocs(docsRoot, '', 0, siteConfig.folderExpanded)
          const body = JSON.stringify(docs)
          const etag = '"' + crypto.createHash('md5').update(body).digest('hex') + '"'
          if (req.headers['if-none-match'] === etag) {
            res.statusCode = 304
            res.end()
            return
          }
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('ETag', etag)
          res.end(body)
          return
        }
        // 站点配置 API
        if (req.url === '/@site-config') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(siteConfig))
          return
        }
        // 图片上传 API
        if (req.url === '/@upload-image' && req.method === 'POST') {
          const chunks = []
          req.on('data', chunk => chunks.push(chunk))
          req.on('end', () => {
            try {
              const body = Buffer.concat(chunks)
              const docPath = decodeURIComponent(req.headers['x-doc-path'] || '')
              const fileName = decodeURIComponent(req.headers['x-file-name'] || `img-${Date.now()}.png`)

              if (!docPath) {
                res.statusCode = 400; res.end('缺少文档路径'); return
              }

              const docDir = dirname(resolve(docsRoot, docPath))
              if (!docDir.startsWith(docsRoot)) {
                res.statusCode = 403; res.end('禁止访问'); return
              }

              const assetsDir = resolve(docDir, 'assets')
              fs.mkdirSync(assetsDir, { recursive: true })

              const ext = docPath.includes('.') ? `.${fileName.split('.').pop()}` : '.png'
              const baseName = `img-${Date.now()}`
              const targetName = `${baseName}${ext.startsWith('.') ? ext : '.' + ext}`
              const targetPath = resolve(assetsDir, targetName)

              fs.writeFileSync(targetPath, body)

              // 返回相对于文档根目录的路径（对路径各段做 URL 编码）
              const docDirRel = dirname(docPath)
              const encodedDir = docDirRel && docDirRel !== '.'
                ? docDirRel.split('/').map(encodeURIComponent).join('/')
                : ''
              const imageUrl = encodedDir
                ? `/@user-docs/${encodedDir}/assets/${targetName}`
                : `/@user-docs/assets/${targetName}`

              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(JSON.stringify({ url: imageUrl }))
            } catch (e) {
              res.statusCode = 500; res.end(e.message)
            }
          })
          return
        }
        // 文档内容
        if (req.url?.startsWith('/@user-docs/')) {
          const filePath = resolve(docsRoot, decodeURIComponent(req.url.replace('/@user-docs/', '')))
          if (fs.existsSync(filePath)) {
            // 根据扩展名设置 Content-Type
            const extName = filePath.split('.').pop().toLowerCase()
            const mimeMap = {
              md: 'text/plain; charset=utf-8',
              png: 'image/png',
              jpg: 'image/jpeg',
              jpeg: 'image/jpeg',
              gif: 'image/gif',
              webp: 'image/webp',
              svg: 'image/svg+xml',
              bmp: 'image/bmp',
            }
            const contentType = mimeMap[extName] || 'application/octet-stream'
            res.setHeader('Content-Type', contentType)
            // 附带最后修改时间
            const stat = fs.statSync(filePath)
            res.setHeader('X-Last-Modified', stat.mtime.toISOString())
            // 文本文件用 utf-8 读取，二进制文件直接读取
            if (contentType.startsWith('text/')) {
              res.end(fs.readFileSync(filePath, 'utf-8'))
            } else {
              res.end(fs.readFileSync(filePath))
            }
            return
          }
        }
        next()
      })

      // SPA fallback
      return () => {
        server.middlewares.use((req, res, next) => {
          const url = req.url?.split('?')[0] || ''
          if (url.startsWith('/@') || url.startsWith('/src/') || url.startsWith('/node_modules/') || url.match(/\.\w+$/)) {
            next()
            return
          }
          req.url = '/index.html'
          next()
        })
      }
    }
  }
}

async function start() {
  // 解析参数，支持位置参数指定扫描目录
  const cliArgs = parseArgs()
  const scanDir = cliArgs.dir ? resolve(userDir, cliArgs.dir) : userDir

  console.log(`\n  md2ui - Markdown 文档预览工具\n`)
  console.log(`  扫描目录: ${scanDir}\n`)

  if (!hasMdFiles(scanDir)) {
    console.log('  当前目录下没有找到 Markdown 文件 (.md)\n')
    console.log('  请在包含 .md 文件的目录中运行此命令\n')
    process.exit(1)
  }

  // 加载配置
  const userConfig = await loadUserConfig()
  const siteConfig = { ...defaultConfig, ...userConfig, ...cliArgs }
  delete siteConfig.dir

  const server = await createServer({
    root: pkgRoot,
    configFile: false,
    plugins: [
      (await import('@vitejs/plugin-vue')).default(),
      md2uiPlugin(siteConfig, scanDir)
    ],
    server: {
      port: siteConfig.port
    },
    optimizeDeps: {
      include: ['vue', 'marked', 'mermaid']
    }
  })

  await server.listen()
  server.printUrls()

  if (siteConfig.title !== defaultConfig.title) {
    console.log(`  站点标题: ${siteConfig.title}`)
  }
  console.log('')

  // 自动打开浏览器
  const address = server.httpServer.address()
  const url = `http://localhost:${address.port}`
  const platform = process.platform
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open'
  exec(`${cmd} ${url}`)
}

start().catch(console.error)
