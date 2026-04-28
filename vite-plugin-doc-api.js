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
          const filePath = path.resolve(resolvedDocsDir, decodeURIComponent(req.url.replace('/@user-docs/', '')))
          if (!filePath.startsWith(resolvedDocsDir)) {
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
              if (!docDir.startsWith(resolvedDocsDir)) {
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
      server.middlewares.use('/api/create', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => {
          try {
            const { path: filePath, type } = JSON.parse(body)
            if (!filePath) {
              res.statusCode = 400; res.end('缺少 path'); return
            }
            const fullPath = path.resolve(resolvedDocsDir, filePath)
            if (!fullPath.startsWith(resolvedDocsDir)) {
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
      })

      // POST /api/delete — 删除文件或文件夹
      server.middlewares.use('/api/delete', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => {
          try {
            const { path: filePath } = JSON.parse(body)
            if (!filePath) {
              res.statusCode = 400; res.end('缺少 path'); return
            }
            const fullPath = path.resolve(resolvedDocsDir, filePath)
            if (!fullPath.startsWith(resolvedDocsDir)) {
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
      })

      // POST /api/rename — 重命名文件或文件夹
      server.middlewares.use('/api/rename', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => {
          try {
            const { oldPath, newPath } = JSON.parse(body)
            if (!oldPath || !newPath) {
              res.statusCode = 400; res.end('缺少 oldPath 或 newPath'); return
            }
            const fullOld = path.resolve(resolvedDocsDir, oldPath)
            const fullNew = path.resolve(resolvedDocsDir, newPath)
            if (!fullOld.startsWith(resolvedDocsDir) || !fullNew.startsWith(resolvedDocsDir)) {
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
      })

      // POST /api/reorder — 批量重编号
      server.middlewares.use('/api/reorder', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => {
          try {
            const { items } = JSON.parse(body)
            if (!Array.isArray(items) || items.length === 0) {
              res.statusCode = 400; res.end('缺少 items'); return
            }
            for (const { oldPath, newPath } of items) {
              const fullOld = path.resolve(resolvedDocsDir, oldPath)
              const fullNew = path.resolve(resolvedDocsDir, newPath)
              if (!fullOld.startsWith(resolvedDocsDir) || !fullNew.startsWith(resolvedDocsDir)) {
                res.statusCode = 403; res.end('禁止访问'); return
              }
            }
            const tempMap = []
            for (let i = 0; i < items.length; i++) {
              const { oldPath } = items[i]
              const fullOld = path.resolve(resolvedDocsDir, oldPath)
              if (!fs.existsSync(fullOld)) continue
              const tempName = fullOld + `.__reorder_tmp_${i}__`
              fs.renameSync(fullOld, tempName)
              tempMap.push({ temp: tempName, newPath: items[i].newPath })
            }
            for (const { temp, newPath: np } of tempMap) {
              const fullNew = path.resolve(resolvedDocsDir, np)
              fs.mkdirSync(path.dirname(fullNew), { recursive: true })
              fs.renameSync(temp, fullNew)
            }
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
          } catch (e) {
            res.statusCode = 500; res.end(e.message)
          }
        })
      })

      // POST /api/move — 移动文件/文件夹
      server.middlewares.use('/api/move', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => {
          try {
            const { oldPath, newPath } = JSON.parse(body)
            if (!oldPath || !newPath) {
              res.statusCode = 400; res.end('缺少 oldPath 或 newPath'); return
            }
            const fullOld = path.resolve(resolvedDocsDir, oldPath)
            const fullNew = path.resolve(resolvedDocsDir, newPath)
            if (!fullOld.startsWith(resolvedDocsDir) || !fullNew.startsWith(resolvedDocsDir)) {
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
      })

      // POST /api/save — 保存文件内容
      server.middlewares.use('/api/save', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => {
          try {
            const { path: filePath, content } = JSON.parse(body)
            if (!filePath || content == null) {
              res.statusCode = 400; res.end('缺少 path 或 content'); return
            }
            const fullPath = path.resolve(resolvedDocsDir, filePath)
            if (!fullPath.startsWith(resolvedDocsDir)) {
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
      })
    }
  }
}
