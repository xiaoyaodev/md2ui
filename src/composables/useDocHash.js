// 文档 hash 生成 & 链接解析工具

// base62 字符集
const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

// 同步 hash：FNV-1a 变体，双轮 hash 拼接得到 64 bit，再转 base62 取 8 位
// 碰撞空间 62^8 ≈ 218 万亿，对文档站绰绰有余
function fnv1a64(str) {
  // 第一轮 FNV-1a（seed = 标准 FNV offset basis）
  let h1 = 0x811c9dc5 >>> 0
  for (let i = 0; i < str.length; i++) {
    h1 ^= str.charCodeAt(i)
    h1 = Math.imul(h1, 0x01000193) >>> 0
  }
  // 第二轮 FNV-1a（不同 seed，避免对称碰撞）
  let h2 = 0x050c5d1f >>> 0
  for (let i = 0; i < str.length; i++) {
    h2 ^= str.charCodeAt(i)
    h2 = Math.imul(h2, 0x01000193) >>> 0
  }
  return [h1, h2]
}

// 将两个 32 位整数转为 base62 字符串，取前 8 位
function toBase62(h1, h2) {
  const num = (BigInt(h1) << 32n) | BigInt(h2)
  let n = num
  let result = ''
  while (n > 0n && result.length < 12) {
    result = BASE62[Number(n % 62n)] + result
    n = n / 62n
  }
  return result.padStart(8, '0').slice(0, 8)
}

// 去掉路径中每一段的序号前缀（如 "01-快速开始" → "快速开始"）
// 保证重编号不影响外链地址
export function stripOrderPrefix(key) {
  return key.split('/').map(seg => seg.replace(/^\d+-/, '')).join('/')
}

// 根据文档 key 生成 8 位 base62 短 hash（同步、确定性、零依赖）
// 哈希计算前会去掉序号前缀，使得重编号不影响外链
export function docHash(key) {
  const stripped = stripOrderPrefix(key)
  const [h1, h2] = fnv1a64(stripped)
  return toBase62(h1, h2)
}

// 解析相对路径，基于当前文档 key 计算目标 key
export function resolveDocKey(href, currentDocKey) {
  const currentParts = currentDocKey.split('/')
  currentParts.pop() // 去掉当前文件名
  const linkParts = href.replace(/\.md$/, '').split('/')
  const resolved = [...currentParts]
  for (const part of linkParts) {
    if (part === '.' || part === '') continue
    if (part === '..') { resolved.pop(); continue }
    resolved.push(part)
  }
  return resolved.join('/')
}

// 在文档树中查找文档
export function findDocInTree(items, key) {
  for (const item of items) {
    if (item.type === 'file' && item.key === key) return item
    if (item.type === 'folder' && item.children) {
      const found = findDocInTree(item.children, key)
      if (found) return found
    }
  }
  return null
}
