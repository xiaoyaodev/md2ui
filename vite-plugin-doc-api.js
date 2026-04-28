import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

/**
 * Vite 插件：文档 API（统一使用 /@user-docs-* 路由前缀）
 *
 * 路由：
 * - GET  /@user-docs-list     返回文档树 + ETag
 * - GET  /@user-docs/xxx      返回文件内容（md / 图片等）
 * - POST /@upload-image       上传图片
 * - POST /api/save            保存文件内容
 * - POST /api/create          创建文件或文件夹
 * - POST /api/delete          删除文件或文件夹
 * - POST /api/rename          重命名
 * - POST /api/reorder         批量重编号
 * - POST /api/move            移动文件/文件夹
 */
export default function docApiPlugin(docsDir = '.') {
  const resolvedDocsDir = path.resolve(docsDir)

  // 计算内容的 ETag
  function etag(content) {
    return '"' + crypto.createHash('md5').update(content).digest('hex') + '"'
  }

  // 安全路径验证：使用 path.relative 防止路径遍历
  function safePath(filePath) {
    const fullPath = path.resolve(resolvedDocsDir, filePath)
    const relative = path.relative(resolvedDocsDir, fullPath)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return null // 路径越界
    }
    return fullPath
  }

  // 解析 POST 请求的 JSON body
  function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
      let body = ''
      req.on('data', chunk => { body += chunk })
      req.on('end', () => {
        try { resolve(JSON.parse(body)) }
        catch (e) { reject(e) }
      })
      req.on('error', reject)
    })
  }

  // 递归扫描 .md 文件，返回树结构（与 CLI 模式 scanDocs 一致）
  function scanDocs(dir, basePath = '', level = 0) {
    const items = []
    if (!fs.existsSync(dir)) return items
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        const children = scanDocs(fullPath, relativePath, level + 1)
        if (children.length > 0) {
          const match = entry.name.match(/^(\d+)-(.+)$/)
          items.push({
            key: relativePath,
            label: match ? match[2] : entry.name,
            order: match ? parseInt(match[1]) : 999,
            type: 'folder',
            level,
            expanded: false,
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

  // MIME 类型映射
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

  return {
    name: 'vite-plugin-doc-api',
    configureServer(server) {
      // 统一中间件
      server.middlewares.use((req, res, next) => {
        // GET /@user-docs-list — 返回文档树 + ETag
        if (req.url === '/@user-docs-list' && req.method === 'GET') {
          const docs = scanDocs(resolvedDocsDir)
          const body = JSON.stringify(docs)
          const tag = etag(body)
          if (req.headers['if-none-match'] === tag) {
            res.statusCode = 304; res.end(); return
          }
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('ETag', tag)
          res.end(body)
          return
        }

        // GET /@user-docs/xxx — 返回文件内容（md / 图片等）
        if (req.url?.startsWith('/@user-docs/') && req.method === 'GET') {
          const filePath = safePath(decodeURIComponent(req.url.replace('/@user-docs/', '')))
          if (!filePath) {
            res.statusCode = 403; res.end('禁止访问'); return
          }
          if (!fs.existsSync(filePath)) {
            res.statusCode = 404; res.end('文件不存在'); return
          }
          const extName = filePath.split('.').pop().toLowerCase()
          const contentType = mimeMap[extName] || 'application/octet-stream'
          res.setHeader('Content-Type', contentType)
          // 附带最后修改时间
          const stat = fs.statSync(filePath)
          res.setHeader('X-Last-Modified', stat.mtime.toISOString())
          // 文本文件支持 ETag
          if (contentType.startsWith('text/')) {
            const content = fs.readFileSync(filePath, 'utf-8')
            const tag = etag(content)
            if (req.headers['if-none-match'] === tag) {
              res.statusCode = 304; res.end(); return
            }
            res.setHeader('ETag', tag)
            res.end(content)
          } else {
            res.end(fs.readFileSync(filePath))
          }
          return
        }

        // POST /@upload-image — 上传图片
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

              const docDir = path.dirname(path.resolve(resolvedDocsDir, docPath))
              const relative = path.relative(resolvedDocsDir, docDir)
              if (relative.startsWith('..') || path.isAbsolute(relative)) {
                res.statusCode = 403; res.end('禁止访问'); return
              }

              const assetsDir = path.join(docDir, 'assets')
              fs.mkdirSync(assetsDir, { recursive: true })

              const ext = path.extname(fileName) || '.png'
              const baseName = `img-${Date.now()}`
              const targetName = `${baseName}${ext}`
              const targetPath = path.join(assetsDir, targetName)

              fs.writeFileSync(targetPath, body)

              // 返回 /@user-docs/ 前缀的路径
              const docDirRel = path.dirname(docPath)
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

        next()
      })

      // POST /api/create — 创建文件或文件夹
      server.middlewares.use('/api/create', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        try {
          const { path: filePath, type } = await parseJsonBody(req)
          if (!filePath) {
            res.statusCode = 400; res.end('缺少 path'); return
          }
          const fullPath = safePath(filePath)
          if (!fullPath) {
            res.statusCode = 403; res.end('禁止访问'); return
          }
          if (fs.existsSync(fullPath)) {
            res.statusCode = 409; res.end('已存在同名文件或文件夹'); return
          }
          if (type === 'folder') {
            fs.mkdirSync(fullPath, { recursive: true })
          } else {
            fs.mkdirSync(path.dirname(fullPath), { recursive: true })
            fs.writeFileSync(fullPath, '', 'utf-8')
          }
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
        } catch (e) {
          res.statusCode = 500; res.end(e.message)
        }
      })

      // POST /api/delete — 删除文件或文件夹
      server.middlewares.use('/api/delete', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        try {
          const { path: filePath } = await parseJsonBody(req)
          if (!filePath) {
            res.statusCode = 400; res.end('缺少 path'); return
          }
          const fullPath = safePath(filePath)
          if (!fullPath) {
            res.statusCode = 403; res.end('禁止访问'); return
          }
          if (!fs.existsSync(fullPath)) {
            res.statusCode = 404; res.end('文件不存在'); return
          }
          fs.rmSync(fullPath, { recursive: true, force: true })
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
        } catch (e) {
          res.statusCode = 500; res.end(e.message)
        }
      })

      // POST /api/rename — 重命名文件或文件夹
      server.middlewares.use('/api/rename', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        try {
          const { oldPath, newPath } = await parseJsonBody(req)
          if (!oldPath || !newPath) {
            res.statusCode = 400; res.end('缺少 oldPath 或 newPath'); return
          }
          const fullOld = safePath(oldPath)
          const fullNew = safePath(newPath)
          if (!fullOld || !fullNew) {
            res.statusCode = 403; res.end('禁止访问'); return
          }
          if (!fs.existsSync(fullOld)) {
            res.statusCode = 404; res.end('源文件不存在'); return
          }
          if (fs.existsSync(fullNew)) {
            res.statusCode = 409; res.end('目标名称已存在'); return
          }
          fs.mkdirSync(path.dirname(fullNew), { recursive: true })
          fs.renameSync(fullOld, fullNew)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
        } catch (e) {
          res.statusCode = 500; res.end(e.message)
        }
      })

      // POST /api/reorder — 批量重编号
      server.middlewares.use('/api/reorder', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        try {
          const { items } = await parseJsonBody(req)
          if (!Array.isArray(items) || items.length === 0) {
            res.statusCode = 400; res.end('缺少 items'); return
          }
          // 验证所有路径
          for (const { oldPath, newPath } of items) {
            if (!safePath(oldPath) || !safePath(newPath)) {
              res.statusCode = 403; res.end('禁止访问'); return
            }
          }
          // 先全部重命名为临时文件，再重命名为目标文件（避免冲突）
          const tempMap = []
          for (let i = 0; i < items.length; i++) {
            const { oldPath } = items[i]
            const fullOld = safePath(oldPath)
            if (!fullOld || !fs.existsSync(fullOld)) continue
            const tempName = fullOld + `.__reorder_tmp_${i}__`
            fs.renameSync(fullOld, tempName)
            tempMap.push({ temp: tempName, newPath: items[i].newPath })
          }
          for (const { temp, newPath: np } of tempMap) {
            const fullNew = safePath(np)
            if (!fullNew) continue
            fs.mkdirSync(path.dirname(fullNew), { recursive: true })
            fs.renameSync(temp, fullNew)
          }
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
        } catch (e) {
          res.statusCode = 500; res.end(e.message)
        }
      })

      // POST /api/move — 移动文件/文件夹
      server.middlewares.use('/api/move', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        try {
          const { oldPath, newPath } = await parseJsonBody(req)
          if (!oldPath || !newPath) {
            res.statusCode = 400; res.end('缺少 oldPath 或 newPath'); return
          }
          const fullOld = safePath(oldPath)
          const fullNew = safePath(newPath)
          if (!fullOld || !fullNew) {
            res.statusCode = 403; res.end('禁止访问'); return
          }
          if (!fs.existsSync(fullOld)) {
            res.statusCode = 404; res.end('源文件不存在'); return
          }
          fs.mkdirSync(path.dirname(fullNew), { recursive: true })
          fs.renameSync(fullOld, fullNew)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
        } catch (e) {
          res.statusCode = 500; res.end(e.message)
        }
      })

      // POST /api/save — 保存文件内容
      server.middlewares.use('/api/save', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        try {
          const { path: filePath, content } = await parseJsonBody(req)
          if (!filePath || content == null) {
            res.statusCode = 400; res.end('缺少 path 或 content'); return
          }
          const fullPath = safePath(filePath)
          if (!fullPath) {
            res.statusCode = 403; res.end('禁止访问'); return
          }
          fs.mkdirSync(path.dirname(fullPath), { recursive: true })
          fs.writeFileSync(fullPath, content, 'utf-8')
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
        } catch (e) {
          res.statusCode = 500; res.end(e.message)
        }
      })
    }
  }
}
