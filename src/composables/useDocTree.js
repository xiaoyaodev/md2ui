// 文档树操作：查找、展开、扁平化等纯逻辑

// ===== Hash 索引（O(1) 查找 + 碰撞检测） =====
// 文档列表变更时由 buildHashIndex 重建
let _hashIndex = new Map() // hash → doc

// 构建 hash → doc 索引，同时检测碰撞
export function buildHashIndex(items, docHashFn) {
  _hashIndex = new Map()
  const allDocs = flattenDocsList(items)
  for (const doc of allDocs) {
    const hash = docHashFn(doc.key)
    if (_hashIndex.has(hash)) {
      const existing = _hashIndex.get(hash)
      console.warn(
        `[md2ui] hash 碰撞检测：「${doc.key}」与「${existing.key}」生成了相同的 hash「${hash}」，` +
        '后者将被覆盖。请考虑重命名其中一个文档。'
      )
    }
    _hashIndex.set(hash, doc)
  }
}

// 在文档树中查找文档
export function findDoc(items, key) {
  for (const item of items) {
    if (item.type === 'file' && item.key === key) return item
    if (item.type === 'folder' && item.children) {
      const found = findDoc(item.children, key)
      if (found) return found
    }
  }
  return null
}

// 查找第一个文档
export function findFirstDoc(items) {
  for (const item of items) {
    if (item.type === 'file') return item
    if (item.type === 'folder' && item.children) {
      const found = findFirstDoc(item.children)
      if (found) return found
    }
  }
  return null
}

// 查找 README 文档（不区分大小写，优先根目录）
export function findReadmeDoc(items) {
  // 先在当前层级找
  for (const item of items) {
    if (item.type === 'file' && /^readme$/i.test(item.key?.split('/').pop() || '')) return item
  }
  // 再递归子目录找
  for (const item of items) {
    if (item.type === 'folder' && item.children) {
      const found = findReadmeDoc(item.children)
      if (found) return found
    }
  }
  return null
}

// 根据 hash 查找文档（优先走索引，O(1)；索引未建时回退全树遍历）
export function findDocByHash(items, hash, docHash) {
  if (_hashIndex.size > 0) {
    return _hashIndex.get(hash) || null
  }
  // 回退：索引未建时全树遍历
  for (const item of items) {
    if (item.type === 'file' && docHash(item.key) === hash) return item
    if (item.type === 'folder' && item.children) {
      const found = findDocByHash(item.children, hash, docHash)
      if (found) return found
    }
  }
  return null
}

// 展开文档所在的所有父级文件夹
export function expandParents(items, targetKey) {
  for (const item of items) {
    if (item.key === targetKey) {
      // 如果目标本身是文件夹，也展开它
      if (item.type === 'folder') item.expanded = true
      return true
    }
    if (item.type === 'folder' && item.children) {
      if (expandParents(item.children, targetKey)) {
        item.expanded = true
        return true
      }
    }
  }
  return false
}

// 扁平化文档树，按顺序提取所有文件节点
export function flattenDocsList(items, result = []) {
  for (const item of items) {
    if (item.type === 'file') result.push(item)
    if (item.type === 'folder' && item.children) flattenDocsList(item.children, result)
  }
  return result
}

// 全部展开
export function expandAll(items) {
  items.forEach(item => {
    if (item.type === 'folder') {
      item.expanded = true
      if (item.children) expandAll(item.children)
    }
  })
}

// 全部收起
export function collapseAll(items) {
  items.forEach(item => {
    if (item.type === 'folder') {
      item.expanded = false
      if (item.children) collapseAll(item.children)
    }
  })
}


