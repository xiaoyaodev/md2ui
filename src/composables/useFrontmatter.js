// Frontmatter 解析 & 阅读时间计算

// 解析 YAML frontmatter（轻量实现，不依赖 Node.js）
// 支持 title / description / order / hidden 字段
export function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return { data: {}, content: markdown, rawYaml: '' }
  const yamlStr = match[1]
  const data = {}
  for (const line of yamlStr.split('\n')) {
    const m = line.match(/^(\w+)\s*:\s*(.+)$/)
    if (!m) continue
    let val = m[2].trim()
    // 布尔值
    if (val === 'true') val = true
    else if (val === 'false') val = false
    // 数字
    else if (/^\d+$/.test(val)) val = parseInt(val)
    // 去掉引号
    else val = val.replace(/^['"]|['"]$/g, '')
    data[m[1]] = val
  }
  return { data, content: markdown.slice(match[0].length), rawYaml: yamlStr }
}

// 计算阅读时间（中文 400 字/分钟，英文 200 词/分钟）
export function calcReadingTime(markdown) {
  // 去掉 frontmatter、代码块、HTML 标签
  const clean = markdown
    .replace(/^---[\s\S]*?---\n?/, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[#*_~`>\-|[\]()!]/g, '')
  // 中文字符数
  const cnChars = (clean.match(/[\u4e00-\u9fff]/g) || []).length
  // 英文单词数
  const enWords = clean.replace(/[\u4e00-\u9fff]/g, '').split(/\s+/).filter(w => w.length > 0).length
  const totalChars = cnChars + enWords
  const minutes = Math.ceil(cnChars / 400 + enWords / 200)
  return { totalChars, minutes: Math.max(1, minutes) }
}
