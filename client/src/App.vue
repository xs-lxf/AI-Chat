<script setup>
import ChatWidget from './components/ChatWidget.vue'
</script>

<template>
  <div class="page">
    <header class="hero">
      <h1>AI Chat</h1>
      <p>基于 Vue 3 + DeepSeek API 的智能对话助手</p>
      <p class="hint">点击右下角悬浮按钮开始聊天</p>
    </header>
    <ChatWidget />
  </div>
</template>

<style scoped>
.page {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse 80% 60% at 50% 0%, #1a2540 0%, var(--bg) 70%);
}

.hero {
  text-align: center;
  padding: 2rem;
}

.hero h1 {
  font-size: 2.5rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin-bottom: 0.75rem;
  background: linear-gradient(135deg, #fff 30%, #8bb4ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero p {
  color: var(--text-muted);
  font-size: 1.05rem;
}

.hint {
  margin-top: 1.5rem;
  font-size: 0.9rem;
  opacity: 0.7;
}
</style>
