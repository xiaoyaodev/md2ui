# 发布到 npm 仓库

## 前置准备

1. 注册 npm 账号：https://www.npmjs.com/signup
2. 确认邮箱已验证

## 发布步骤

### 1. 切换到官方 registry

淘宝镜像不支持发布，需要切换到官方源：

```bash
npm config set registry https://registry.npmjs.org/
```

### 2. 登录 npm

```bash
npm login
```

按提示输入用户名、密码和邮箱。

### 3. 创建 Access Token（如果开启了 2FA）

如果账号开启了双因素认证，需要创建 token：

1. 登录 https://www.npmjs.com
2. 点击头像 -> Access Tokens
3. 点击 "Generate New Token" -> 选择 "Granular Access Token"
4. 设置：
   - Token name: 随便起个名字
   - Expiration: 选择有效期
   - Packages and scopes: 选择 "All packages"
   - Permissions: 选择 "Read and write"
   - 勾选 "Allow this token to bypass 2FA"
5. 复制生成的 token

配置 token：

```bash
npm config set //registry.npmjs.org/:_authToken=你的token
```

### 4. 发布

```bash
npm publish
```

### 5. 清理 token 并切回淘宝镜像

```bash
# 删除 token（保护账号安全）
npm config delete //registry.npmjs.org/:_authToken

# 切回淘宝镜像加速下载
npm config set registry https://registry.npmmirror.com
```

## 更新版本

修改 package.json 中的 version 字段，或使用命令：

```bash
# 补丁版本 1.0.0 -> 1.0.1
npm version patch

# 次版本 1.0.0 -> 1.1.0
npm version minor

# 主版本 1.0.0 -> 2.0.0
npm version major
```

然后重复上述发布步骤。

## 用户安装使用

```bash
# 全局安装
npm install -g md2ui

# 在包含 .md 文件的目录下运行
cd /path/to/your/docs
md2ui

# 指定端口
md2ui -p 3000
```

## 常见问题

### 403 Forbidden - Two-factor authentication required

账号开启了 2FA，需要创建带有 "bypass 2FA" 权限的 Granular Access Token。

### 包名被占用

修改 package.json 中的 name 字段，使用 scope 方式：

```json
{
  "name": "@your-username/md2ui"
}
```

发布时使用：

```bash
npm publish --access public
```

用户安装：

```bash
npm install -g @your-username/md2ui
```
