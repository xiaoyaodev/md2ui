# SSG 静态构建

验证 `md2ui build` 静态站点生成功能。

## 使用方式

```bash
md2ui build
```

## 构建产物

构建完成后在 `dist/` 目录下生成纯静态文件：

```
dist/
├── index.html          # 入口页面
├── assets/             # JS/CSS 资源
└── docs/               # 文档文件
```

## 部署方式

生成的静态文件可部署到任意静态服务器：

| 平台 | 说明 |
|------|------|
| GitHub Pages | 推送 dist 目录到 gh-pages 分支 |
| Vercel | 配置输出目录为 dist |
| Nginx | 将 dist 目录配置为网站根目录 |
| CDN | 上传 dist 目录到 CDN 存储 |

## SPA 路由

- 基于 hash 的文档路由
- 支持浏览器前进/后退
- 支持直接通过 URL 访问特定文档

## 验证要点

1. 运行 `md2ui build` 应在 dist 目录生成静态文件
2. 用静态服务器打开 dist/index.html 应正常显示
3. 文档导航和内容加载应正常工作
4. URL 路由应正确解析
