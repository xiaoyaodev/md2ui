---
title: Frontmatter 功能测试
description: 验证 YAML frontmatter 解析和阅读时间计算

---

# Frontmatter 功能测试

本文档使用了 Frontmatter 元数据，页面标题应显示为 "Frontmatter 功能测试"。

## 支持的字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| title | string | 文档标题，覆盖第一个 h1 |
| description | string | 文档描述，显示在元信息区域 |
| order | number | 排序权重 |
| hidden | boolean | 是否在导航中隐藏 |

## 阅读时间

文档顶部应显示字数统计和预计阅读时间：

- 中文按 400 字/分钟计算
- 英文按 200 词/分钟计算
- 自动去除 frontmatter、代码块、HTML 标签后统计

## 验证要点

1. 页面标题应为 frontmatter 中的 `title` 值
2. 元信息区域应显示 `description` 内容
3. 应显示字数和预计阅读时间