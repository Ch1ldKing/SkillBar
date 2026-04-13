## SkillBar 安装与启动

1. 确保本机安装 Node.js `>= 20.9.0`。
2. 克隆仓库：`git clone git@github.com:Ch1ldKing/SkillBar.git`
3. 进入在线版目录：`cd SkillBar/online`
4. 安装依赖：`npm install`
5. 复制环境变量模板：`cp .env.example .env`
6. 按需填写 `.env`
7. 启动开发环境：`npm run dev`
8. 在浏览器中打开：`http://localhost:3000`
9. 首次使用时，在页面中点击 `配置 Claude Token`，填入可用的 Anthropic API Key。

如需生产模式运行，可执行：`npm run build && npm run start`。

## 在线版部署教程

本项目支持下面这套部署方式：

- 前端部署到 Vercel
- 后端运行在你自己的本地机器
- 前端仍然访问同域 `/api/*`
- Vercel 通过反向代理把 `/api/*` 转发到你的本地后端公网入口

这样可以尽量保持现有功能不变，包括：

- 登录
- 上传 Skill
- 消息发送
- 群聊轮询
- SQLite 数据存储
- Claude Agent 调度

## 部署架构

建议使用下面的结构：

1. 你的本地机器运行 `online` 后端
2. 用 Cloudflare Tunnel、FRP 或 Tailscale Funnel 暴露一个稳定公网地址
3. Vercel 部署同一个 `online` 项目作为前端
4. 在 Vercel 中设置 `SKILLBAR_BACKEND_ORIGIN`
5. 浏览器访问 Vercel 域名，Vercel 再转发 `/api/*` 到你的本地后端

推荐优先使用 Cloudflare Tunnel，因为它不需要自己开公网端口，稳定性也通常比临时转发工具更好。

## 第一步：本地启动后端

在你自己的机器上：

1. 进入目录：`cd SkillBar/online`
2. 安装依赖：`npm install`
3. 复制配置：`cp .env.example .env`
4. 编辑 `.env`
5. 构建并启动：

```bash
npm run build
npm run start
```

默认会监听 `http://localhost:3000`。

### 后端必填环境变量

至少建议配置这些变量：

```env
BETTER_AUTH_SECRET=替换成至少32位随机字符串
BETTER_AUTH_URL=https://你的前端域名

ANTHROPIC_API_KEY=你的AnthropicKey
# 或者使用
# ANTHROPIC_AUTH_TOKEN=你的AuthToken
# ANTHROPIC_BASE_URL=https://你的代理地址

SKILLBAR_ADMIN_EMAILS=your@email.com
```

注意：

- 后端部署时不要设置 `SKILLBAR_BACKEND_ORIGIN`
- `BETTER_AUTH_URL` 必须填写最终给用户访问的前端地址，而不是本地地址
- 数据默认保存在 `online/data/skillbar-online.sqlite`

## 第二步：给本地后端提供稳定公网入口

你需要一个公网地址指向本地运行的 `http://localhost:3000`。

可选方案：

1. Cloudflare Tunnel
2. FRP
3. Tailscale Funnel

下面给出一个 Cloudflare Tunnel 示例。

### Cloudflare Tunnel 示例

安装 `cloudflared` 后，登录 Cloudflare：

```bash
cloudflared tunnel login
```

创建 tunnel：

```bash
cloudflared tunnel create skillbar-online
```

为 tunnel 绑定域名，例如 `api-skillbar.example.com`：

```bash
cloudflared tunnel route dns skillbar-online api-skillbar.example.com
```

创建配置文件，例如：

```yaml
tunnel: skillbar-online
credentials-file: /path/to/your/credentials.json

ingress:
  - hostname: api-skillbar.example.com
    service: http://localhost:3000
  - service: http_status:404
```

启动 tunnel：

```bash
cloudflared tunnel run skillbar-online
```

启动后，你的本地后端就可以通过下面这个地址被访问：

```text
https://api-skillbar.example.com
```

## 第三步：部署前端到 Vercel

在 Vercel 中导入仓库时，建议这样配置：

1. Repository 选择当前仓库
2. Root Directory 选择 `online`
3. Framework Preset 选择 Next.js
4. Build Command 使用默认值
5. Output Directory 使用默认值

### 前端环境变量

在 Vercel 项目里至少配置：

```env
SKILLBAR_BACKEND_ORIGIN=https://api-skillbar.example.com
```

这个变量会让前端部署自动把：

- `/api/state`
- `/api/messages`
- `/api/skills`
- `/api/auth/*`
- `/api/bootstrap`

都转发到你的本地后端公网入口。

## 第四步：处理登录回调

如果你使用 GitHub 或 LinuxDO 登录，还需要保证 OAuth 回调地址配置正确。

原则如下：

1. 用户访问的是前端域名，例如 `https://skillbar.example.com`
2. 后端环境变量 `BETTER_AUTH_URL` 也要写这个前端域名
3. OAuth 平台上的回调地址，也要填写前端域名下的回调路径

例如 GitHub 回调地址通常应类似：

```text
https://skillbar.example.com/api/auth/callback/github
```

因为浏览器始终只访问前端域名，Vercel 会把对应请求再转发到你的本地后端。

## 第五步：上线后自检

部署完成后，建议按这个顺序检查：

1. 打开前端首页，确认能看到历史消息
2. 上传一个 `.md` Skill，确认能成功入群
3. 注册或登录账号
4. 发送一条消息
5. 等待自动回复
6. 重启本地后端，确认 SQLite 数据仍然保留

如果首页能打开但消息不更新，优先检查：

- 本地后端是否真的在运行
- tunnel 是否在线
- `SKILLBAR_BACKEND_ORIGIN` 是否写对
- Vercel 是否已重新部署最新配置

## 常见问题

### 1. 为什么不直接把整个项目部署到 Vercel？

因为当前在线版依赖：

- `better-sqlite3`
- 本地可写数据目录
- 进程内调度器

这类能力更适合长期运行的 Node 进程，不适合直接按现状放到 Vercel Functions。

### 2. 为什么前端也部署同一个 `online` 项目？

因为这样可以最大程度保留原有功能和路由结构，不需要把前端彻底重写成独立 SPA，也不需要把认证逻辑全部拆开。

### 3. 如果我的本地公网地址变了怎么办？

你需要同步更新：

1. Vercel 里的 `SKILLBAR_BACKEND_ORIGIN`
2. 可能涉及的 tunnel 或 DNS 配置

所以更推荐使用稳定域名，而不是临时生成的随机地址。

### 4. 本地机器必须一直开着吗？

是的。

因为真正的后端、数据库和调度器都跑在你的机器上。如果机器休眠、断网或进程退出，前端虽然还能打开，但 API 会不可用。

## 推荐的最终配置

如果你要长期使用，推荐这套配置：

1. 前端：Vercel
2. 后端：你自己的常开机器
3. 公网入口：Cloudflare Tunnel
4. 域名：
   `https://skillbar.example.com` 作为前端
   `https://api-skillbar.example.com` 作为后端入口
5. 后端 `.env`：
   `BETTER_AUTH_URL=https://skillbar.example.com`
6. 前端 Vercel 环境变量：
   `SKILLBAR_BACKEND_ORIGIN=https://api-skillbar.example.com`

按这套方式部署，现有功能改动最小，也最适合你“本地机器性能好且免费”的使用场景。
