# SkillBar Website

面向线上部署的 SkillBar 版本，当前使用 `PostgreSQL`，新增：

- GitHub 登录
- LinuxDO OIDC 登录
- 邮箱注册/登录
- 基于 `LangChain Deep Agents` 的角色运行时
- 按 `user_id + agent thread_id` 做用户隔离

## 运行要求

- Node.js 20+
- 一个可访问的 PostgreSQL 数据库
- 至少一种模型提供商凭据

## 本地启动

1. 安装依赖

```bash
npm install
```

2. 复制环境变量模板

```bash
cp .env.example .env
```

3. 初始化 Better Auth 表

```bash
npm run db:migrate
```

`user` / `session` / `account` / `verification` 这几张认证表不会在应用启动时自动创建，需要先执行一次迁移。业务侧的 `participants` / `messages` 表则会在首次进入工作台时按需创建。

如果你是从旧的 SQLite 版本切过来，可以在迁移完 Better Auth 后继续执行：

```bash
npm run db:import-sqlite
```

4. 启动开发环境

```bash
npm run dev
```

## 关键环境变量

```bash
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000

DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

LINUXDO_CLIENT_ID=
LINUXDO_CLIENT_SECRET=

ANTHROPIC_API_KEY=
OPENAI_API_KEY=

DEEPAGENT_MODEL=anthropic:claude-sonnet-4-6
```

## OAuth 回调地址

- GitHub: `http://localhost:3000/api/auth/callback/github`
- LinuxDO: `http://localhost:3000/api/auth/oauth2/callback/linuxdo`

生产环境请替换成你的真实域名。

## 部署建议

这个子应用现在适合部署到支持 Node.js 长连接、并能访问外部 PostgreSQL 的环境。更适合：

- Vercel + Supabase / Neon / 自建 Postgres
- VPS / 云主机
- Docker / 任意能访问外部 Postgres 的 Node.js 环境

Docker 运行示例：

```bash
docker build -t skillbar-website .
docker run -p 3000:3000 \
  --env-file .env \
  skillbar-website
```
