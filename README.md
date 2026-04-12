<div align="center">

# SkillBar

> *叮~ XXX.md 已加入群聊，和大家来聊天吧~*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Skill-blueviolet)](https://claude.ai/code)
[![Nuwa](https://img.shields.io/badge/Inspired%20By-女娲.skill-orange)](https://github.com/alchaincyf/nuwa-skill)
[![LinuxDO](https://linux.do)]

[简介](##简介) · [本地安装](##本地安装) · [Docker 部署](#docker-部署) · [更多skill](#更多skill)

</div>

---
## 😊 简介
看到网上各种各样的人物 Skill，突然很想集众家之长，来把所有人都放进一个群聊中，看看他们会聊出怎样的火花🔥，也能从已故或健在之人，同事或朋友之间，汲取知识或领悟道理~

## 本地安装

### 通过 Agent 安装 (Recommend)
```text
请帮我克隆 git@github.com:Ch1ldKing/SkillBar.git，先查看仓库里的 AGENTS.md，并按照其中的安装与启动说明把项目跑起来。
```
### 环境要求

- Node.js `>= 20.9.0`
- 一个可用的 Anthropic API Key（第三方也可以）

### 启动步骤

```bash
git clone 
cd SkillBar
npm run dev
```

### 首次使用

1. 点击页面里的 `配置 Claude Token`，填入 `Anthropic API Key`(或者通过 base_url 和 Auth Token 配置第三方 Key，暂时仅支持 anthropic 协议)
2. 拖动一个 `SKILL.md` 文件到聊天界面
3. 看看大家聊什么吧，你也可以参与其中

### 生产模式运行

```bash
npm run build
npm run start
```

应用数据默认保存在项目根目录下的 `data/skillbar.sqlite`，包括聊天记录和本地保存的 Anthropic 配置。

### Docker 部署

项目根目录已提供 `Dockerfile`，可直接构建并运行。

#### 构建镜像

```bash
docker build -t skillbar .
```

#### 启动容器

推荐挂载 `/app/data` 来持久化 SQLite 数据：

```bash
docker run -d \
  --name skillbar \
  -p 3000:3000 \
  -e ANTHROPIC_API_KEY=sk-ant-xxxx \
  -v skillbar-data:/app/data \
  skillbar
```

启动后访问 [http://localhost:3000](http://localhost:3000)。

### 可选环境变量

- `ANTHROPIC_API_KEY`：Anthropic API Key
- `ANTHROPIC_AUTH_TOKEN`：如果你使用的是 Auth Token，可改传这个
- `ANTHROPIC_BASE_URL`：自定义 Anthropic 网关地址
- `PORT`：容器监听端口，默认 `3000`

如果没有在启动容器时传入 Anthropic 凭据，也可以在应用启动后通过页面里的 `配置 Claude Token` 手动保存。

## 🌟 效果示例
### 加群后自动讨论
![alt text](<imgs/CleanShot 2026-04-13 at 03.11.15@2x.png>)

说实话，张雪峰老师真的在这里发了一句话的时候，我是有被惊艳到的

### 自由讨论
![alt text](<imgs/CleanShot 2026-04-13 at 03.00.16@2x.png>)

### 情景收集
有朋友帮忙验证了 n 个前任放在里面 😂，大家可以自行尝试哈

### 动图展示

一键拖入 Skill 并加群，自动捕捉与交互

![alt text](<imgs/CleanShot 2026-04-13 at 04.09.03.gif>)
---

## 更多.skill
感谢 [alchaincyf](https://github.com/alchaincyf) 蒸馏了许多有意义的 Skill
| 人物 | 领域 |
|------|------|
| [乔布斯.skill](https://github.com/alchaincyf/steve-jobs-skill) | 产品/设计/战略 |
| [马斯克.skill](https://github.com/alchaincyf/elon-musk-skill) | 工程/成本/第一性原理 |
| [纳瓦尔.skill](https://github.com/alchaincyf/naval-skill) | 财富/杠杆/人生哲学 |
| [芒格.skill](https://github.com/alchaincyf/munger-skill) | 投资/多元思维/逆向思考 |
| [费曼.skill](https://github.com/alchaincyf/feynman-skill) | 学习/教学/科学思维 |
| [塔勒布.skill](https://github.com/alchaincyf/taleb-skill) | 风险/反脆弱/不确定性 |

## 许可证

MIT License © [Ch1ldKing](https://github.com/Ch1ldKing)

Inspired by [女娲.skill](https://github.com/alchaincyf/nuwa-skill)

Thanks to [Linux DO](https://linux.do/latest)
</div>