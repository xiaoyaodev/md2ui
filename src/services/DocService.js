/**
 * 文档服务层（单例）
 * 统一使用 /@user-docs-* 路由，dev 和 CLI 模式共用同一套 API
 * 上层（useFileWatcher / useDocManager）只管调方法，不关心底层差异
 */

// ===== ETag 缓存 =====
let _listEtag = null
let _contentEtag = null
let _contentDocPath = null

// 过滤掉没有任何文档（递归）的空目录
function pruneEmpty(children) {
  return children.filter(item => {
    if (item.type === 'file') return true
    if (item.type === 'folder') {
      item.children = pruneEmpty(item.children || [])
      return item.children.length > 0
    }
    return false
  })
}

// ===== 公开 API =====

/**
 * 获取文档列表（首次加载用，不带 ETag）
 * 返回构建好的树
 */
export async function fetchDocsList() {
  try {
    const res = await fetch('/@user-docs-list')
    if (res.ok) {
      _listEtag = res.headers.get('etag')
      return pruneEmpty(await res.json())
    }
  } catch { /* ignore */ }
  return []
}

/**
 * 轮询文档列表（带 ETag，无变化返回 null）
 * 返回构建好的树 或 null
 */
export async function pollDocsList() {
  try {
    const res = await fetch('/@user-docs-list', {
      headers: _listEtag ? { 'If-None-Match': _listEtag } : {}
    })
    if (res.status === 304) return null
    if (res.status === 200) {
      _listEtag = res.headers.get('etag')
      return pruneEmpty(await res.json())
    }
  } catch { /* 静默忽略 */ }
  return null
}

/**
 * 轮询文档内容（带 ETag，无变化返回 null）
 * @param {string} docPath - 文档相对路径
 * @returns {string|null} 内容文本或 null
 */
export async function pollDocContent(docPath) {
  if (!docPath) return null
  // 文档切换时重置 ETag
  if (docPath !== _contentDocPath) {
    _contentEtag = null
    _contentDocPath = docPath
  }
  const url = `/@user-docs/${docPath.split('/').map(encodeURIComponent).join('/')}`
  try {
    const res = await fetch(url, {
      headers: _contentEtag ? { 'If-None-Match': _contentEtag } : {}
    })
    if (res.status === 304) return null
    if (res.status === 200) {
      _contentEtag = res.headers.get('etag')
      // 捕获最后修改时间
      const lm = res.headers.get('x-last-modified')
      if (lm) _lastModified = lm
      return await res.text()
    }
  } catch { /* 静默忽略 */ }
  return null
}

/** 重置内容 ETag（保存/切换文档后调用） */
export function resetContentEtag() {
  _contentEtag = null
  _contentDocPath = null
}

/** 重置列表 ETag（强制下次拉取最新） */
export function resetListEtag() {
  _listEtag = null
}

// ===== 文档最后修改时间 =====
let _lastModified = null

/** 获取当前文档的最后修改时间 */
export function getLastModified() {
  return _lastModified
}

/** 重置最后修改时间 */
export function resetLastModified() {
  _lastModified = null
}

// ===== 写操作 API =====

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return res
}

export async function saveDoc(filePath, content) {
  const res = await postJson('/api/save', { path: filePath, content })
  return res.ok
}

export async function createDoc(apiPath, type) {
  const res = await postJson('/api/create', { path: apiPath, type })
  if (!res.ok) {
    const msg = await res.text()
    throw new Error(msg)
  }
}

export async function deleteDoc(apiPath) {
  const res = await postJson('/api/delete', { path: apiPath })
  if (!res.ok) {
    const msg = await res.text()
    throw new Error(msg)
  }
}

export async function renameDoc(oldPath, newPath) {
  const res = await postJson('/api/rename', { oldPath, newPath })
  if (!res.ok) {
    const msg = await res.text()
    throw new Error(msg)
  }
}

export async function reorderDocs(items) {
  const res = await postJson('/api/reorder', { items })
  if (!res.ok) {
    const msg = await res.text()
    throw new Error(msg)
  }
}

/**
 * 上传图片（粘贴/拖拽）
 * @param {File|Blob} file - 图片文件
 * @param {string} docPath - 当前文档路径（如 "03-Markdown渲染/01-代码块.md"）
 * @returns {Promise<string>} 图片 URL
 */
export async function uploadImage(file, docPath) {
  const res = await fetch('/@upload-image', {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'image/png',
      'X-Doc-Path': encodeURIComponent(docPath),
      'X-File-Name': encodeURIComponent(file.name || `img-${Date.now()}.png`),
    },
    body: file,
  })

  if (!res.ok) {
    const msg = await res.text()
    throw new Error(msg || '图片上传失败')
  }

  const data = await res.json()
  return data.url
}
