<template>
  <div 
    v-if="show" 
    class="fixed inset-0 flex items-center justify-center bg-black bg-opacity-80 z-50"
    style="pointer-events: auto;"
  >
    <div class="text-center">
      <div class="text-6xl hud-text font-black mb-8 loading-text">
        {{ title }}
      </div>
      
      <div class="text-2xl text-military-light mb-4">
        {{ message }}
      </div>

      <div class="hud-panel p-6 inline-block mb-8">
        <div class="grid grid-cols-2 gap-6">
          <div>
            <div class="text-sm text-military-light mb-1">最终得分</div>
            <div class="text-4xl hud-text font-bold">{{ score }}</div>
          </div>
          <div>
            <div class="text-sm text-military-light mb-1">击杀数</div>
            <div class="text-4xl hud-text font-bold text-red-400">{{ killCount }}</div>
          </div>
        </div>
      </div>
      
      <div>
        <button 
          @click="handleRestart"
          class="restart-button px-16 py-5 text-3xl font-bold tracking-wider"
        >
          重新开始
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  show: boolean
  reason: 'ammo' | 'health' | null
  score: number
  killCount: number
}>()

const emit = defineEmits<{
  (e: 'restart'): void
}>()

const title = computed(() => {
  if (props.reason === 'ammo') return '弹药耗尽'
  if (props.reason === 'health') return '战斗失败'
  return '游戏结束'
})

const message = computed(() => {
  if (props.reason === 'ammo') return '你的弹药已经用完了！'
  if (props.reason === 'health') return '你的坦克被敌人摧毁了！'
  return ''
})

const handleRestart = () => {
  emit('restart')
}
</script>

<style scoped>
.restart-button {
  background: rgba(26, 31, 30, 0.85);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(74, 95, 77, 0.5);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  color: #ffb82e;
  text-shadow: 0 0 10px rgba(255, 184, 46, 0.5);
  font-weight: 700;
  transition: all 0.3s;
}

.restart-button:hover {
  transform: scale(1.1);
  box-shadow: 0 0 30px rgba(255, 184, 46, 0.6);
  background: rgba(74, 95, 77, 0.9);
}

.restart-button:active {
  transform: scale(1.05);
}
</style>
