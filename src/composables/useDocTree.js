// 文档树操作：查找、展开、扁平化等纯逻辑

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

// 根据 hash 查找文档
export function findDocByHash(items, hash, docHash) {
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

// 查找节点的父级列表（用于插入/删除操作）
// 返回 { parent: 父节点children数组, index: 节点在数组中的索引 }
export function findParent(items, targetKey) {
  for (let i = 0; i < items.length; i++) {
    if (items[i].key === targetKey) {
      return { parent: items, index: i }
    }
    if (items[i].type === 'folder' && items[i].children) {
      const found = findParent(items[i].children, targetKey)
      if (found) return found
    }
  }
  return null
}

// 查找文件夹节点
export function findFolder(items, key) {
  for (const item of items) {
    if (item.type === 'folder' && item.key === key) return item
    if (item.type === 'folder' && item.children) {
      const found = findFolder(item.children, key)
      if (found) return found
    }
  }
  return null
}

// 收集所有已展开文件夹的 key
export function collectExpandedKeys(items) {
  const keys = new Set()
  for (const item of items) {
    if (item.type === 'folder') {
      if (item.expanded) keys.add(item.key)
      if (item.children) {
        for (const k of collectExpandedKeys(item.children)) keys.add(k)
      }
    }
  }
  return keys
}

// 根据 key 集合恢复展开状态
export function restoreExpandedKeys(items, keys) {
  for (const item of items) {
    if (item.type === 'folder') {
      if (keys.has(item.key)) item.expanded = true
      if (item.children) restoreExpandedKeys(item.children, keys)
    }
  }
}
