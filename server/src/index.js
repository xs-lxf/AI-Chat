import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY?.trim().replace(/^['"]|['"]$/g, '')
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'

const QWEN_API_KEY = process.env.QWEN_API_KEY?.trim().replace(/^['"]|['"]$/g, '')
const QWEN_BASE_URL = process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1'
const QWEN_MODEL = process.env.QWEN_MODEL || 'qwen-max'

const PRIMARY_MODEL = process.env.PRIMARY_MODEL || 'qwen'
let currentModel = PRIMARY_MODEL
let lastSwitchTime = 0
const FALLBACK_COOLDOWN_MS = 10 * 60 * 1000

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || ''
const UPSTREAM_TIMEOUT_MS = parseInt(process.env.UPSTREAM_TIMEOUT_MS || '60000', 10)
const CORS_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim())
  : null

function getModelConfig() {
  if (currentModel === 'qwen') {
    return {
      apiKey: QWEN_API_KEY,
      baseUrl: QWEN_BASE_URL,
      model: QWEN_MODEL,
      name: 'Qwen（千问）',
    }
  }
  return {
    apiKey: DEEPSEEK_API_KEY,
    baseUrl: DEEPSEEK_BASE_URL,
    model: DEEPSEEK_MODEL,
    name: 'DeepSeek',
  }
}

function switchToBackup(now) {
  currentModel = currentModel === 'qwen' ? 'deepseek' : 'qwen'
  lastSwitchTime = now
  console.log(`[模型切换] 已切换到 ${currentModel === 'qwen' ? 'Qwen（千问）' : 'DeepSeek'}`)
}

function isOverloadError(response, errText) {
  if (response.status === 429 || response.status === 503) return true
  const lower = (errText || '').toLowerCase()
  return (
    lower.includes('overload') ||
    lower.includes('high demand') ||
    lower.includes('too many requests') ||
    lower.includes('rate limit') ||
    lower.includes('flow control') ||
    lower.includes('throttling') ||
    lower.includes('server busy') ||
    lower.includes('service unavailable') ||
    lower.includes('服务器繁忙') ||
    lower.includes('服务暂不可用') ||
    lower.includes('当前负载过高')
  )
}

app.use(
  cors({
    origin: CORS_ORIGINS
      ? (origin, cb) => {
          if (!origin || CORS_ORIGINS.includes(origin)) return cb(null, true)
          cb(new Error(`CORS: origin ${origin} not allowed`))
        }
      : true,
  }),
)
app.use(express.json({ limit: '4mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: currentModel === 'qwen' ? QWEN_MODEL : DEEPSEEK_MODEL, currentModel, qwenReady: !!QWEN_API_KEY, deepseekReady: !!DEEPSEEK_API_KEY })
})

function getFixedConfig(modelKey) {
  if (modelKey === 'qwen') {
    return { apiKey: QWEN_API_KEY, baseUrl: QWEN_BASE_URL, model: QWEN_MODEL, name: 'Qwen（千问）' }
  }
  return { apiKey: DEEPSEEK_API_KEY, baseUrl: DEEPSEEK_BASE_URL, model: DEEPSEEK_MODEL, name: 'DeepSeek' }
}

app.post('/api/chat', async (req, res) => {
  const { messages, stream = true, model: reqModel } = req.body
  const isAuto = !reqModel || reqModel === 'auto'

  const now = Date.now()
  if (isAuto && currentModel !== PRIMARY_MODEL && now - lastSwitchTime >= FALLBACK_COOLDOWN_MS) {
    currentModel = PRIMARY_MODEL
    lastSwitchTime = 0
    console.log(`[模型回切] 已回切到主模型 ${PRIMARY_MODEL === 'qwen' ? 'Qwen（千问）' : 'DeepSeek'}`)
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages 不能为空' })
    return
  }

  const fullMessages = SYSTEM_PROMPT
    ? [{ role: 'system', content: SYSTEM_PROMPT }, ...messages]
    : messages

  const ac = new AbortController()
  let completed = false
  let timeoutId = setTimeout(() => ac.abort(new Error('upstream timeout')), UPSTREAM_TIMEOUT_MS)

  const cleanup = () => {
    clearTimeout(timeoutId)
    res.off('close', onClientClose)
  }

  const onClientClose = () => {
    if (!completed && !res.writableEnded) {
      ac.abort(new Error('client disconnected'))
    }
  }
  res.on('close', onClientClose)

  let lastError = null
  const maxAttempts = isAuto ? 2 : 1

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const config = isAuto ? getModelConfig() : getFixedConfig(reqModel)

    if (!config.apiKey) {
      if (isAuto && attempt === 0) {
        console.warn(`[${config.name}] API 密钥未配置，尝试备用模型`)
        switchToBackup(now)
        continue
      }
      lastError = new Error(`${config.name} 未配置 API 密钥`)
      break
    }

    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: fullMessages,
          stream,
        }),
        signal: ac.signal,
      })

      if (!response.ok) {
        const errText = await response.text()
        if (isAuto && attempt === 0 && isOverloadError(response, errText)) {
          console.log(`[${config.name}] 负载过高，切换到备用模型重试`)
          switchToBackup(now)
          clearTimeout(timeoutId)
          timeoutId = setTimeout(() => ac.abort(new Error('upstream timeout')), UPSTREAM_TIMEOUT_MS)
          continue
        }
        completed = true
        cleanup()
        const msg = isOverloadError(response, errText)
          ? `${config.name} 当前负载过高，请切换其他模型或稍后重试`
          : (errText || `${config.name} API 请求失败`)
        res.status(response.status).json({ error: msg })
        return
      }

      clearTimeout(timeoutId)

      if (!stream) {
        const data = await response.json()
        completed = true
        cleanup()
        res.json(data)
        return
      }

      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no')
      res.flushHeaders()

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(decoder.decode(value, { stream: true }))
      }

      completed = true
      cleanup()
      res.end()
      return

    } catch (err) {
      if (err.name === 'AbortError') {
        cleanup()
        if (!res.headersSent) {
          const isTimeout = err.message === 'upstream timeout'
          res
            .status(isTimeout ? 504 : 500)
            .json({ error: isTimeout ? '上游请求超时，请稍后重试' : err.message || '服务器内部错误' })
        } else {
          res.end()
        }
        return
      }

      if (isAuto && attempt === 0) {
        console.log(`[${config.name}] 请求异常: ${err.message}，切换到备用模型重试`)
        switchToBackup(now)
        clearTimeout(timeoutId)
        timeoutId = setTimeout(() => ac.abort(new Error('upstream timeout')), UPSTREAM_TIMEOUT_MS)
        continue
      }
      lastError = err
    }
  }

  cleanup()
  if (!res.headersSent) {
    const isOverload = lastError && isOverloadError({ status: 503 }, lastError.message)
    res.status(503).json({ error: isOverload ? '当前模型负载过高，请切换其他模型' : (lastError?.message || '所有模型均不可用，请稍后重试') })
  }
})

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
  console.log(`主模型: ${PRIMARY_MODEL === 'qwen' ? 'Qwen（千问）' : 'DeepSeek'} | 当前: ${currentModel === 'qwen' ? 'Qwen（千问）' : 'DeepSeek'}`)
  if (!DEEPSEEK_API_KEY) console.warn('警告: 未设置 DEEPSEEK_API_KEY')
  if (!QWEN_API_KEY) console.warn('警告: 未设置 QWEN_API_KEY')
})
