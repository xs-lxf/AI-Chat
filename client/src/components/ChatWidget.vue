<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { streamChat } from '../api/chat.js'

let msgIdCounter = 0
let sessionIdCounter = 0
const newMsg = (role, content = '') => ({ id: ++msgIdCounter, role, content })

const sessions = ref([])
const activeSessionId = ref(null)
const showSidebar = ref(false)

function createSession(isDefault = false) {
  const session = reactive({
    id: ++sessionIdCounter,
    name: isDefault ? '默认对话' : '新对话 ' + sessionIdCounter,
    messages: [newMsg('assistant', '你好！我是 AI 助手，有什么可以帮你的吗？')],
    input: '',
    loading: false,
    abortController: null,
  })
  sessions.value.push(session)
  activeSessionId.value = session.id
  return session
}

const currentSession = computed(() => sessions.value.find((s) => s.id === activeSessionId.value))

const messages = computed({
  get: () => currentSession.value?.messages ?? [],
  set: (val) => {
    if (currentSession.value) currentSession.value.messages = val
  },
})

const input = computed({
  get: () => currentSession.value?.input ?? '',
  set: (val) => {
    if (currentSession.value) currentSession.value.input = val
  },
})

const loading = computed(() => currentSession.value?.loading ?? false)
const sessionCount = computed(() => sessions.value.length)

const isOpen = ref(false)
const messagesRef = ref(null)

const lastContent = computed(() => messages.value[messages.value.length - 1]?.content ?? '')

createSession(true)

function switchSession(id) {
  if (loading.value) return
  activeSessionId.value = id
  showSidebar.value = false
}

function deleteSession(id) {
  const idx = sessions.value.findIndex((s) => s.id === id)
  if (idx === -1) return
  const session = sessions.value[idx]
  if (session.abortController) session.abortController.abort()
  sessions.value.splice(idx, 1)
  if (sessions.value.length === 0) {
  createSession()
  } else if (activeSessionId.value === id) {
    activeSessionId.value = sessions.value[Math.min(idx, sessions.value.length - 1)].id
  }
}

function newSession() {
  if (loading.value) return
  showSidebar.value = false
  createSession()
}

async function scrollToBottom() {
  await nextTick()
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
}

watch(() => messages.value.length, scrollToBottom)
watch(lastContent, scrollToBottom)

function togglePanel() {
  isOpen.value = !isOpen.value
}

function buildApiMessages() {
  return messages.value
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map(({ role, content }) => ({ role, content }))
    .slice(0, -1)
}

function autoNameSession() {
  const session = currentSession.value
  if (!session || session.name !== '新对话') return
  const firstUser = session.messages.find((m) => m.role === 'user')
  if (firstUser) {
    session.name = firstUser.content.length > 20
      ? firstUser.content.slice(0, 20) + '…'
      : firstUser.content
  }
}

async function sendMessage() {
  const text = input.value.trim()
  if (!text || loading.value) return

  messages.value.push(newMsg('user', text))
  input.value = ''
  autoNameSession()

  const assistantMsg = newMsg('assistant', '')
  messages.value.push(assistantMsg)
  const session = currentSession.value
  if (session) session.loading = true

  const ac = new AbortController()
  if (session) session.abortController = ac
  const apiMessages = buildApiMessages()

  await streamChat(
    apiMessages,
    (chunk) => {
      assistantMsg.content += chunk
    },
    () => {
      if (session) {
        session.loading = false
        session.abortController = null
      }
      if (!assistantMsg.content) {
        assistantMsg.content = '（无回复内容）'
      }
    },
    (err) => {
      if (session) {
        session.loading = false
        session.abortController = null
      }
      assistantMsg.content = `错误：${err}`
    },
    ac.signal,
  )
}

function stopGenerating() {
  const session = currentSession.value
  if (!session || !session.abortController) return
  session.abortController.abort()
  session.abortController = null
  session.loading = false
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
            <button type="button" class="icon-btn menu-btn" title="对话列表" @click="showSidebar = !showSidebar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span class="avatar">AI</span>
            <div class="title-info">
              <strong>AI 助手</strong>
              <span class="status">
                <svg class="status-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
                {{ currentSession?.name ?? '新对话' }}
              </span>
            </div>
          </div>
          <div class="panel-actions">
            <button type="button" class="icon-btn" title="新对话" @click="newSession">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <button type="button" class="icon-btn" title="清空当前对话" @click="clearChat">
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

        <div class="panel-body">
          <Transition name="sidebar">
            <aside v-if="showSidebar" class="sidebar">
              <div class="sidebar-header">
                <span>对话列表</span>
                <button type="button" class="icon-btn" title="关闭列表" @click="showSidebar = false">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div class="sidebar-list">
                <div
                  v-for="s in sessions"
                  :key="s.id"
                  class="sidebar-item"
                  :class="{ active: s.id === activeSessionId }"
                  @click="switchSession(s.id)"
                >
                  <span class="sidebar-item-dot">
                    <svg v-if="s.id === activeSessionId" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                    <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                    </svg>
                  </span>
                  <span class="sidebar-item-name">{{ s.name }}</span>
                  <button
                    v-if="sessions.length > 1"
                    class="sidebar-item-del"
                    title="删除此对话"
                    @click.stop="deleteSession(s.id)"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
                    </svg>
                  </button>
                </div>
              </div>
              <button class="sidebar-new" @click="newSession">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                新建对话
              </button>
            </aside>
          </Transition>

          <div ref="messagesRef" class="messages">
            <div
              v-for="(msg, i) in messages"
              :key="msg.id"
              class="message"
              :class="msg.role"
            >
              <div class="bubble">
                {{ msg.content }}
                <span
                  v-if="loading && i === messages.length - 1 && msg.role === 'assistant'"
                  class="cursor"
                >▋</span>
              </div>
            </div>
          </div>
        </div>

        <footer class="panel-footer">
          <textarea
            :value="input"
            class="input"
            placeholder="输入消息，Enter 发送…"
            rows="2"
            :disabled="loading"
            @input="input = $event.target.value"
            @keydown="onKeydown"
          />
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
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  gap: 4px;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.menu-btn {
  flex-shrink: 0;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--accent), #7c5cff);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 600;
  color: #fff;
  flex-shrink: 0;
}

.title-info {
  min-width: 0;
}

.panel-title strong {
  display: block;
  font-size: 0.9rem;
  line-height: 1.3;
}

.status {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 0.7rem;
  color: var(--text-muted);
  line-height: 1.2;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.status-icon {
  flex-shrink: 0;
  opacity: 0.5;
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

.panel-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

.sidebar {
  position: absolute;
  inset: 0;
  z-index: 10;
  background: var(--surface);
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--border);
}

.sidebar-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  font-size: 0.85rem;
  margin-bottom: 2px;
}

.sidebar-item:hover {
  background: var(--surface-hover);
}

.sidebar-item.active {
  background: var(--accent);
  color: #fff;
}

.sidebar-item-dot {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.5;
}

.sidebar-item.active .sidebar-item-dot {
  opacity: 1;
}

.sidebar-item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-item-del {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.4;
  transition: opacity 0.15s, background 0.15s;
}

.sidebar-item:hover .sidebar-item-del {
  opacity: 0.7;
}

.sidebar-item.active .sidebar-item-del {
  opacity: 0.8;
}

.sidebar-item-del:hover {
  opacity: 1 !important;
  background: rgba(255, 77, 79, 0.25);
  color: #ff4d4f;
}

.sidebar-new {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 8px;
  padding: 8px;
  border: 1px dashed var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.85rem;
  transition: color 0.15s, border-color 0.15s;
}

.sidebar-new:hover {
  color: var(--accent);
  border-color: var(--accent);
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

/* Transitions */
.panel-enter-active,
.panel-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.96);
}

.sidebar-enter-active,
.sidebar-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}

.sidebar-enter-from,
.sidebar-leave-to {
  opacity: 0;
  transform: translateX(-12px);
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
