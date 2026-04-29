# URL 路由方案

## 概述

项目没有使用 vue-router，完全基于 `history.pushState / replaceState` + `popstate` 事件自行管理 URL 路由。URL 采用短 hash 格式，兼顾可读性和稳定性。

## URL 格式

```
/{8位base62短hash}#{锚点id}
```

- 路径部分：`/aBcDeFgH` — 文档 key 经 FNV-1a 哈希 + base62 编码生成的 8 位短码
- 锚点部分：`#heading-slug` — 由 `github-slugger` 生成的标题 slug
- 首页：`/`

示例：`/x3KmNp2Q#快速开始`

## 涉及文件

| 文件 | 职责 |
|---|---|
| `src/composables/useDocHash.js` | hash 生成、相对路径解析、文档树查找 |
| `src/composables/useDocManager.js` | URL 路由核心：读取/写入 URL、导航、popstate |
| `src/composables/useScroll.js` | 滚动检测、activeHeading 管理（驱动锚点同步） |
| `src/composables/useMarkdown.js` | 站内链接渲染（marked 自定义 renderer） |
| `src/composables/useDocTree.js` | `findDocByHash` 等文档树查找函数 |
| `src/App.vue` | popstate 事件注册、生命周期管理 |
| `src/services/DocService.js` | 文档 API 调用层 |
| `vite-plugin-doc-api.js` | 服务端路由（`/@user-docs-*`、`/api/*`） |

## Hash 生成算法

文件：`src/composables/useDocHash.js`

### 流程

1. `stripOrderPrefix` — 去掉路径每段的序号前缀（`01-快速开始` → `快速开始`），保证重编号不影响外链
2. `fnv1a64` — FNV-1a 双轮哈希（两个不同 seed），得到两个 32 位整数
3. `toBase62` — 拼成 64 bit BigInt，转 base62 字符集，取前 8 位

### 设计要点

- 碰撞空间：62^8 ≈ 218 万亿，对文档站绰绰有余
- 同步、确定性、零依赖
- 序号无关：重编号（拖拽排序）不会改变已有外链

### 导出函数

```js
export function stripOrderPrefix(key)   // 去序号前缀
export function docHash(key)            // 生成 8 位短 hash
export function resolveDocKey(href, currentDocKey)  // 解析相对路径
export function findDocInTree(items, key)           // 在文档树中查找
```

## URL 路由核心

文件：`src/composables/useDocManager.js`

### 初始加载（`loadFromUrl`）

```
读取 window.location.pathname + hash
  ├─ 路径为空
  │   ├─ 已有当前文档 → goHome（popstate 回退）
  │   ├─ 文档列表为空 → 显示"无文档"提示
  │   └─ 有文档 → 查找 README 或第一篇，replaceState 加载
  └─ 路径非空
      └─ findDocByHash 遍历文档树匹配
          ├─ 同文档 → 恢复滚动位置或锚点跳转
          └─ 不同文档 → expandParents + loadDoc(replace)
```

### popstate 监听

`App.vue` 的 `onMounted` 中注册：

```js
window.addEventListener('popstate', () => loadFromUrl())
```

浏览器前进/后退时触发 `loadFromUrl`，根据 URL 重新加载文档。

### URL 写入时机

| 场景 | 触发函数 | URL 操作 |
|---|---|---|
| 点击侧边栏文档 | `loadDoc(key)` | `pushState` |
| 点击站内链接 | `handleContentClick` → `loadDoc(key)` | `pushState` |
| 回到首页 | `goHome()` | `pushState('/')` |
| 刷新/首次加载 | `loadFromUrl()` | `replaceState` |
| 重命名后重定向 | `loadDoc(key, {replace:true})` | `replaceState` |
| 滚动触发标题变化 | `watch(activeHeading)` | `replaceState` 更新锚点 |
| 点击 TOC 目录项 | `scrollToHeading(id, {push:true})` | `pushState` 更新锚点 |

### `loadDoc` 函数签名

```js
async function loadDoc(key, { replace = false, anchor = '', keepState = false } = {})
```

- `replace`：true 时用 `replaceState`，false 时用 `pushState`
- `anchor`：加载后定位到指定锚点
- `keepState`：true 时保留 `history.state`（用于 popstate 恢复滚动位置）

### `goHome` 函数

```js
function goHome({ isPopstate = false } = {})
```

- 清空当前文档状态，显示欢迎页
- 非 popstate 场景下 `pushState('/')`
- popstate 场景下不操作 URL（浏览器已更新）

## 锚点同步机制

### 架构

```
用户操作（滚动/点击TOC）
    ↓
useScroll 更新 activeHeading
    ↓
useDocManager 的 watch(activeHeading) 
    ↓
history.pushState / replaceState 更新 URL 锚点
```

`scrollToHeading` 和滚动检测都不直接操作 URL，统一由 `watch(activeHeading)` 驱动。

### push vs replace 区分

通过 `_pendingPush` 标记：

```js
// 点击 TOC 目录项时标记为 push
function scrollToHeading(id, { push = false } = {}) {
  if (push) _pendingPush = true
  _scrollToHeading(id)
}

// watch 中消费标记
watch(activeHeading, (id) => {
  const shouldPush = _pendingPush
  _pendingPush = false
  // shouldPush ? pushState : replaceState
})
```

### 防抖与防闪动

- **100ms 防抖**：`_hashUpdateTimer` 避免滚动时频繁更新 URL
- **锁定机制**：点击 TOC 后 `_locked = true`，800ms 内跳过滚动检测更新，防止 smooth 滚动期间 activeHeading 闪动
- **scrollend 解锁**：优先用 `scrollend` 事件解锁，800ms 超时兜底
- **文档切换标记**：`_suppressHashClear` 标记文档切换导致的 activeHeading 清空，不清除 URL hash

### 滚动位置恢复

`history.state` 中存储 `scrollTop`：

```js
function makeState(scrollTop) {
  return { scrollTop: scrollTop ?? getScrollTop() }
}
```

popstate 时优先恢复 `savedScroll`，其次恢复锚点，最后回到顶部。

## 站内链接渲染

文件：`src/composables/useMarkdown.js` 的 `createRenderer`

marked 自定义 renderer 处理四类链接：

### 站外链接

匹配 `http/https/mailto/tel` 协议，`target="_blank"` 新窗口打开。

### 纯锚点链接

`#xxx` 格式，渲染为 `<a href="javascript:void(0)" data-anchor="xxx">`，点击时由 `handleContentClick` 拦截调用 `scrollToHeading`。

### 站内 .md 文档链接

处理流程：

1. `resolveDocKey(mdPath, currentDocKey)` — 基于当前文档解析相对路径
2. `findDocInTree(docsList, targetKey)` — 在文档树中查找目标
3. 找到 → 生成 `/{hash}#anchor` 格式 URL，附带 `data-doc-key` 和 `data-anchor` 属性
4. 未找到 → 渲染为 `broken-link` 样式

### 其他相对链接

兜底处理，`target="_blank"` 新窗口打开。

## 内容区点击拦截

文件：`src/composables/useDocManager.js` 的 `handleContentClick`

```
点击事件
  ├─ 检测 <a> 标签
  │   ├─ 有 data-doc-key → 跨文档跳转
  │   │   expandParents → loadDoc → 锚点滚动
  │   ├─ 有 data-anchor（无 docKey）→ 同文档锚点跳转
  │   │   scrollToHeading(anchor, {push:true})
  │   └─ 其他链接 → 浏览器默认行为
  └─ 检测 <img> / .mermaid → 图片放大
```

## 标题锚点生成

文件：`src/composables/useMarkdown.js` 的 `renderer.heading`

使用 `github-slugger` 生成语义化锚点 ID，每个标题渲染为：

```html
<h2 id="slug-id">
  <a class="heading-anchor" href="#slug-id" data-anchor="slug-id" aria-hidden="true">#</a>
  标题文本
</h2>
```

## 图片 URL 处理

文件：`src/composables/useMarkdown.js` 的 `renderer.image`

相对路径图片基于当前文档目录解析，转换为 `/@user-docs/` 前缀的绝对路径：

```
./assets/img.png → /@user-docs/{docDir}/assets/img.png
```

绝对路径（`http/https/data/`）和 `/@` 前缀路径保持不变。

## 服务端路由

文件：`vite-plugin-doc-api.js`

| 路由 | 方法 | 用途 |
|---|---|---|
| `/@user-docs-list` | GET | 文档树 JSON + ETag |
| `/@user-docs/{path}` | GET | 文件内容（md/图片），支持 ETag |
| `/@upload-image` | POST | 图片上传 |
| `/api/save` | POST | 保存文件内容 |
| `/api/create` | POST | 创建文件或文件夹 |
| `/api/delete` | POST | 删除文件或文件夹 |
| `/api/rename` | POST | 重命名 |
| `/api/reorder` | POST | 批量重编号 |
| `/api/move` | POST | 移动文件/文件夹 |

所有路径操作都经过 `safePath` 验证，防止路径遍历攻击。

## 注意事项

1. **SPA Fallback**：当前 `vite.config.js` 没有显式配置 `historyApiFallback`，依赖 Vite 默认的 SPA fallback 行为。生产部署时需要在 Web 服务器（Nginx 等）配置所有路径回退到 `index.html`
2. **序号无关性**：hash 计算前去掉序号前缀，拖拽排序不会破坏已分享的链接
3. **编辑模式锚点**：编辑模式下标题无 id，通过 `tocItems` 文本匹配实现 TOC 高亮和锚点跳转
4. **ETag 缓存**：`DocService.js` 对文档列表和文档内容分别维护 ETag，轮询时无变化返回 304
