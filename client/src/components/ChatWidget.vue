<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { streamChat } from '../api/chat.js'

let msgIdCounter = 0
const newMsg = (role, content = '') => ({ id: ++msgIdCounter, role, content })

const isOpen = ref(false)
const input = ref('')
const loading = ref(false)
const messages = ref([newMsg('assistant', '你好！我是 AI 助手，有什么可以帮你的吗？')])

const messagesRef = ref(null)

// 当前正在进行的请求控制器，用于"停止生成"
let abortController = null

// 最后一条消息的内容——流式输出时此值不断变化，触发滚动
const lastContent = computed(() => messages.value[messages.value.length - 1]?.content ?? '')

async function scrollToBottom() {
  await nextTick()
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
}

// 同时监听消息数量和最后一条内容变化，保证流式输出时也能自动滚动
watch(() => messages.value.length, scrollToBottom)
watch(lastContent, scrollToBottom)

function togglePanel() {
  isOpen.value = !isOpen.value
}

function buildApiMessages() {
  // 取出 user/assistant 消息，去掉最后一条空白占位（assistant 正在回复中）
  return messages.value
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map(({ role, content }) => ({ role, content }))
    .slice(0, -1)
}

async function sendMessage() {
  const text = input.value.trim()
  if (!text || loading.value) return

  messages.value.push(newMsg('user', text))
  input.value = ''

  const assistantMsg = newMsg('assistant', '')
  messages.value.push(assistantMsg)
  loading.value = true

  abortController = new AbortController()
  const apiMessages = buildApiMessages()

  await streamChat(
    apiMessages,
    (chunk) => {
      assistantMsg.content += chunk
    },
    () => {
      loading.value = false
      abortController = null
      if (!assistantMsg.content) {
        assistantMsg.content = '（无回复内容）'
      }
    },
    (err) => {
      loading.value = false
      abortController = null
      assistantMsg.content = `错误：${err}`
    },
    abortController.signal,
  )
}

function stopGenerating() {
  if (abortController) {
    abortController.abort()
    abortController = null
  }
  loading.value = false
  // 如果当前回复为空，给一个提示
  const last = messages.value[messages.value.length - 1]
  if (last?.role === 'assistant' && !last.content) {
    last.content = '（已停止生成）'
  }
}

function onKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

function clearChat() {
  stopGenerating()
  messages.value = [newMsg('assistant', '对话已清空，继续聊吧！')]
}
</script>

<template>
  <div class="chat-widget">
    <Transition name="panel">
      <div v-if="isOpen" class="chat-panel">
        <header class="panel-header">
          <div class="panel-title">
            <span class="avatar">AI</span>
            <div>
              <strong>AI 助手</strong>
              <span class="status">{{ loading ? '正在输入…' : '在线' }}</span>
            </div>
          </div>
          <div class="panel-actions">
            <button type="button" class="icon-btn" title="清空对话" @click="clearChat">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
              </svg>
            </button>
            <button type="button" class="icon-btn" title="关闭" @click="togglePanel">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        <div ref="messagesRef" class="messages">
          <div
            v-for="(msg, i) in messages"
            :key="msg.id"
            class="message"
            :class="msg.role"
          >
            <div class="bubble">
              {{ msg.content }}
              <!-- 在流式输出时，光标始终显示在回复末尾 -->
              <span
                v-if="loading && i === messages.length - 1 && msg.role === 'assistant'"
                class="cursor"
              >▋</span>
            </div>
          </div>
        </div>

        <footer class="panel-footer">
          <textarea
            v-model="input"
            class="input"
            placeholder="输入消息，Enter 发送…"
            rows="2"
            :disabled="loading"
            @keydown="onKeydown"
          />
          <!-- 生成中：显示"停止"按钮；否则显示发送按钮 -->
          <button
            v-if="loading"
            type="button"
            class="send-btn stop-btn"
            title="停止生成"
            @click="stopGenerating"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
          </button>
          <button
            v-else
            type="button"
            class="send-btn"
            :disabled="!input.trim()"
            @click="sendMessage"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </footer>
      </div>
    </Transition>

    <button
      type="button"
      class="fab"
      :class="{ active: isOpen }"
      :aria-label="isOpen ? '关闭聊天' : '打开聊天'"
      @click="togglePanel"
    >
      <Transition name="icon" mode="out-in">
        <svg v-if="!isOpen" key="chat" width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
        </svg>
        <svg v-else key="close" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </Transition>
    </button>
  </div>
</template>

<style scoped>
.chat-widget {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 9999;
  font-family: var(--font);
}

.fab {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow);
  transition: transform 0.2s, background 0.2s, box-shadow 0.2s;
}

.fab:hover {
  background: var(--accent-hover);
  transform: scale(1.05);
}

.fab.active {
  background: var(--surface-hover);
  color: var(--text);
}

.chat-panel {
  position: absolute;
  right: 0;
  bottom: 72px;
  width: 380px;
  max-width: calc(100vw - 48px);
  height: 520px;
  max-height: calc(100vh - 120px);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--accent), #7c5cff);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 600;
  color: #fff;
}

.panel-title strong {
  display: block;
  font-size: 0.95rem;
}

.status {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.panel-actions {
  display: flex;
  gap: 4px;
}

.icon-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}

.icon-btn:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message {
  display: flex;
}

.message.user {
  justify-content: flex-end;
}

.message.assistant {
  justify-content: flex-start;
}

.bubble {
  max-width: 85%;
  padding: 10px 14px;
  border-radius: 14px;
  font-size: 0.9rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.message.user .bubble {
  background: var(--user-bubble);
  border-bottom-right-radius: 4px;
}

.message.assistant .bubble {
  background: var(--assistant-bubble);
  border-bottom-left-radius: 4px;
}

.cursor {
  animation: blink 1s step-end infinite;
  color: var(--accent);
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

.panel-footer {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.input {
  flex: 1;
  resize: none;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg);
  color: var(--text);
  font-family: inherit;
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.15s;
}

.input:focus {
  border-color: var(--accent);
}

.input:disabled {
  opacity: 0.6;
}

.send-btn {
  width: 42px;
  height: 42px;
  align-self: flex-end;
  border: none;
  border-radius: 10px;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, opacity 0.15s;
}

.send-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.stop-btn {
  background: var(--surface-hover);
  color: var(--text);
}

.stop-btn:hover {
  background: #ff4d4f22;
  color: #ff4d4f;
}

.panel-enter-active,
.panel-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.96);
}

.icon-enter-active,
.icon-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}

.icon-enter-from,
.icon-leave-to {
  opacity: 0;
  transform: scale(0.8);
}

@media (max-width: 480px) {
  .chat-widget {
    right: 16px;
    bottom: 16px;
  }

  .chat-panel {
    width: calc(100vw - 32px);
    height: calc(100vh - 100px);
  }
}
</style>
