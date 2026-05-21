# AI Chat

基于 **Vue 3 + Express + 多模型 AI API** 的智能对话应用。页面右下角有悬浮按钮，点击后弹出聊天面板，支持流式逐字输出、停止生成、清空对话，API Key 安全保存在服务端。

内置 **千问（Qwen）** 与 **DeepSeek** 双模型，当主模型负载过高时自动切换到备用模型并重试，10 分钟后自动回切。

---

## 目录

- [环境要求](#环境要求)
- [快速启动](#快速启动)
- [配置说明](#配置说明)
- [功能介绍](#功能介绍)
- [项目结构](#项目结构)
- [生产部署](#生产部署)
- [常见问题](#常见问题)
- [技术栈](#技术栈)

---

## 环境要求

| 工具 | 版本 |
|------|------|
| Node.js | ≥ 18（需内置 `fetch`） |
| npm | ≥ 9 |

> 推荐使用 [nvm](https://github.com/nvm-sh/nvm) 管理 Node 版本：`nvm use 20`

---

## 快速启动

### 第一步：安装依赖

```bash
npm run install:all
```

这条命令会同时安装根目录、`server/`、`client/` 三处的依赖。

---

### 第二步：配置 API Key

复制配置文件：

```bash
cp server/.env.example server/.env
```

打开 `server/.env`，填入你的密钥：

```env
# 主模型：千问（Qwen）
QWEN_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx

# 备用模型：DeepSeek
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
```

> ⚠️ `.env` 已在 `.gitignore` 中，不会被提交到代码仓库，请勿直接在代码里硬编码 Key。

---

### 第三步：启动开发服务

```bash
npm run dev
```

启动后会同时运行前端和后端：

| 服务 | 地址 |
|------|------|
| 前端（Vite） | http://localhost:5173 |
| 后端（Express） | http://localhost:3001 |

打开 http://localhost:5173，点击页面**右下角的气泡按钮**即可开始对话。

---

## 配置说明

所有配置均在 `server/.env` 中设置，以下是完整的配置项列表：

### 模型配置

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `QWEN_API_KEY` | 千问 API 密钥，格式 `sk-xxxxxxxx` | — |
| `QWEN_BASE_URL` | 千问 API 接入地址 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `QWEN_MODEL` | 千问使用的模型 | `qwen-max` |
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥，格式 `sk-xxxxxxxx` | — |
| `DEEPSEEK_BASE_URL` | DeepSeek API 接入地址 | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | DeepSeek 使用的模型 | `deepseek-chat` |
| `PRIMARY_MODEL` | 主模型，可选 `qwen` 或 `deepseek` | `qwen` |

> 至少需要配置一个模型的 API Key 才能使用。两个都配置时可获得自动容灾能力。

### 通用配置

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `PORT` | 后端监听端口 | `3001` |
| `SYSTEM_PROMPT` | 系统提示词，注入到每次对话的最前面 | 空（不注入） |
| `UPSTREAM_TIMEOUT_MS` | 上游 API 请求超时时间（毫秒） | `60000`（60 秒） |
| `CORS_ORIGINS` | 允许跨域的来源，多个用英文逗号分隔，留空不限制 | 空（允许所有来源） |

### 自动容灾

当主模型返回过载错误（HTTP 429/503 或包含 overload/服务器繁忙 等关键字）时，系统会自动：

1. **切换模型**：立即切换到备用模型
2. **自动重试**：用备用模型重新发送当前请求，用户无感知
3. **定时回切**：10 分钟后自动将主模型恢复为首选模型

---

## 功能介绍

### 对话交互

- **发送消息**：在输入框中输入内容，按 `Enter` 发送；按 `Shift + Enter` 换行
- **流式输出**：AI 回复逐字实时显示，附带打字光标动画
- **上下文记忆**：完整的对话历史会随每次请求一起发送，AI 能理解多轮对话语境

### 控制操作

- **停止生成**：AI 回复过程中，发送按钮变为"停止"按钮（■），点击后立即中断，保留已输出的内容
- **清空对话**：点击顶部垃圾桶图标，清空全部历史并重置为初始状态；若正在生成中，会自动停止

### 安全性

- API Key 仅存储在服务端 `.env` 文件中，**不会暴露给浏览器**
- 所有 AI 请求通过 Express 后端代理，前端无法直接获取 Key

### 响应式布局

- 桌面端：聊天面板固定宽度 380px，高度 520px
- 移动端（≤ 480px）：自动撑满屏幕宽度和可用高度

---

## 项目结构

```
AI-Chat/
├── client/                  # 前端（Vue 3 + Vite）
│   ├── src/
│   │   ├── api/
│   │   │   └── chat.js      # 封装 SSE 流式请求，支持 AbortController
│   │   ├── components/
│   │   │   └── ChatWidget.vue  # 聊天面板主组件
│   │   ├── App.vue
│   │   ├── main.js
│   │   └── style.css        # 全局 CSS 变量（主题色）
│   ├── index.html
│   ├── vite.config.js       # 开发代理：/api → localhost:3001
│   └── package.json
│
├── server/                  # 后端（Node.js + Express）
│   ├── src/
│   │   └── index.js         # 入口：代理多模型 API，处理 SSE 流，自动容灾
│   ├── .env                 # 本地配置（不提交）
│   ├── .env.example         # 配置模板
│   └── package.json
│
├── package.json             # 根目录脚本（concurrently 并发启动）
└── README.md
```

---

## 生产部署

### 第一步：构建前端

```bash
npm run build
```

产物输出到 `client/dist/`。

### 第二步：部署方案

#### 方案 A：Nginx 托管前端 + 反向代理后端（推荐）

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # 前端静态文件
    root /path/to/AI-Chat/client/dist;
    index index.html;

    # 所有非 /api 路径交给前端路由
    location / {
        try_files $uri $uri/ /index.html;
    }

    # /api 反向代理到 Node 后端
    location /api {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        # SSE 必须关闭缓冲，否则流式输出会卡顿
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 120s;
    }
}
```

启动后端：

```bash
cd server && node src/index.js
```

> 推荐配合 [PM2](https://pm2.keymetrics.io/) 守护进程：
> ```bash
> npm install -g pm2
> pm2 start server/src/index.js --name ai-chat-server
> pm2 save && pm2 startup
> ```

#### 方案 B：后端同时托管前端静态文件

在 `server/src/index.js` 末尾、`app.listen` 之前加入：

```js
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.resolve(__dirname, '../../client/dist')

app.use(express.static(distPath))
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})
```

之后只需启动一个 Node 进程，访问 `http://服务器IP:3001` 即可。

---

## 常见问题

**Q：启动后访问页面，发送消息提示未配置 API Key**

确认 `server/.env` 文件存在，且至少配置了 `QWEN_API_KEY` 或 `DEEPSEEK_API_KEY` 中的一个，格式正确（不带引号、不带多余空格）。

---

**Q：AI 回复时页面没有流式效果，等很久才一次性出现**

通常是 Nginx 开启了响应缓冲。确认 Nginx 配置中有 `proxy_buffering off;`，或检查服务器是否有其他反向代理。

---

**Q：想换用其他兼容 OpenAI 格式的模型（如本地 Ollama）**

修改 `server/.env`，例如使用本地 Ollama：

```env
DEEPSEEK_BASE_URL=http://localhost:11434/v1
DEEPSEEK_MODEL=qwen2.5:7b
DEEPSEEK_API_KEY=ollama
PRIMARY_MODEL=deepseek
```

---

**Q：对话轮数多了以后请求变慢**

每次请求都会把完整历史发给 API，token 消耗随轮数增加。目前没有自动截断，如需控制可以在 `ChatWidget.vue` 的 `buildApiMessages()` 里限制消息数量，例如只保留最近 10 条：

```js
function buildApiMessages() {
  return messages.value
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map(({ role, content }) => ({ role, content }))
    .slice(-10)
    .slice(0, -1)
}
```

---

**Q：如何让 AI 扮演特定角色或专注某个领域？**

在 `server/.env` 中配置 `SYSTEM_PROMPT`，无需修改代码：

```env
SYSTEM_PROMPT=你是一名专业的法律顾问，只回答与中国法律相关的问题，用简洁易懂的语言解释。
```

---

**Q：主模型过载了会怎样？**

系统会自动切换到备用模型并重试当前请求。切换后 10 分钟，会自动恢复首选模型。整个过程无需手动干预。

---

## 技术栈

| 层 | 技术 |
|----|------|
| 前端框架 | Vue 3（Composition API） |
| 前端构建 | Vite 6 |
| 后端框架 | Express 4 |
| 运行时 | Node.js 18+（原生 fetch） |
| AI 接口 | 千问 / DeepSeek Chat Completions API（OpenAI 兼容） |
| 流式传输 | Server-Sent Events（SSE） |
