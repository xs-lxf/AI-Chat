/**
 * 发起流式对话请求。
 * @param {Array}    messages  对话历史（符合 OpenAI 格式）
 * @param {Function} onChunk   每收到一段内容时回调 (chunk: string) => void
 * @param {Function} onDone    流结束时回调 () => void
 * @param {Function} onError   出错时回调 (message: string) => void
 * @param {AbortSignal} [signal]  可选，用于外部取消请求
 * @param {string}   [model]   指定模型：'auto' | 'qwen' | 'deepseek'
 */
export async function streamChat(messages, onChunk, onDone, onError, signal, model) {
  let response
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, stream: true, model }),
      signal,
    })
  } catch (err) {
    // 被主动取消时不触发 onError
    if (err.name === 'AbortError') return
    onError(err.message || '网络请求失败')
    return
  }

  if (!response.ok) {
    let message = '请求失败'
    try {
      const data = await response.json()
      message = data.error || message
    } catch {
      message = (await response.text()) || message
    }
    onError(message)
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue

        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') {
          onDone()
          return
        }

        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content
          if (content) onChunk(content)
        } catch {
          // 忽略格式异常的 SSE 块
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') return
    onError(err.message || '读取响应失败')
    return
  }

  onDone()
}
