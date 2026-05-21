import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001
const API_KEY = process.env.DEEPSEEK_API_KEY?.trim().replace(/^['"]|['"]$/g, '')
const BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || ''
// 上游请求超时（毫秒），默认 60 秒
const UPSTREAM_TIMEOUT_MS = parseInt(process.env.UPSTREAM_TIMEOUT_MS || '60000', 10)
// CORS 允许的来源，多个用逗号分隔，留空则允许全部
const CORS_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim())
  : null

app.use(
  cors({
    origin: CORS_ORIGINS
      ? (origin, cb) => {
          // 允许无 origin（如 curl/服务端请求）或在白名单内的来源
          if (!origin || CORS_ORIGINS.includes(origin)) return cb(null, true)
          cb(new Error(`CORS: origin ${origin} not allowed`))
        }
      : true,
  }),
)
app.use(express.json({ limit: '4mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: MODEL })
})

app.post('/api/chat', async (req, res) => {
  if (!API_KEY) {
    res.status(500).json({ error: '未配置 DEEPSEEK_API_KEY，请在 server/.env 中设置' })
    return
  }

  const { messages, stream = true } = req.body

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages 不能为空' })
    return
  }

  // 若配置了系统提示词，自动注入到消息列表最前面
  const fullMessages = SYSTEM_PROMPT
    ? [{ role: 'system', content: SYSTEM_PROMPT }, ...messages]
    : messages

  // 用 AbortController 同时处理：客户端断开 & 请求超时
  const ac = new AbortController()

  // 超时自动 abort
  const timeoutId = setTimeout(() => ac.abort(new Error('upstream timeout')), UPSTREAM_TIMEOUT_MS)

  // 客户端断开时也 abort，避免继续消耗上游资源
  req.on('close', () => {
    clearTimeout(timeoutId)
    ac.abort(new Error('client disconnected'))
  })

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: fullMessages,
        stream,
      }),
      signal: ac.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errText = await response.text()
      res.status(response.status).json({ error: errText || 'DeepSeek API 请求失败' })
      return
    }

    if (!stream) {
      const data = await response.json()
      res.json(data)
      return
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    // 禁用 Nginx 缓冲，确保 SSE 实时到达客户端
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(decoder.decode(value, { stream: true }))
    }

    res.end()
  } catch (err) {
    clearTimeout(timeoutId)
    // 客户端主动断开或超时属于正常流程，不需要打印错误
    if (err.name !== 'AbortError') {
      console.error('Chat API error:', err)
    }
    if (!res.headersSent) {
      const isTimeout = err.message === 'upstream timeout'
      res
        .status(isTimeout ? 504 : 500)
        .json({ error: isTimeout ? '上游请求超时，请稍后重试' : err.message || '服务器内部错误' })
    } else {
      res.end()
    }
  }
})

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
  if (!API_KEY) {
    console.warn('警告: 未设置 DEEPSEEK_API_KEY，请在 server/.env 中配置')
  }
})
