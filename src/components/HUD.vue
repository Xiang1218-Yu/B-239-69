<template>
  <div class="absolute inset-0 pointer-events-none">
    <div class="absolute top-4 left-4 right-4 flex justify-between">
      <div class="hud-panel p-4 pointer-events-auto">
        <div class="flex items-center space-x-6">
          <div class="flex items-center space-x-2">
            <div class="text-sm text-military-light">HP</div>
            <div class="w-40 h-6 bg-military-dark border-2 border-military-green rounded overflow-hidden">
              <div 
                class="h-full transition-all duration-300"
                :class="healthColor"
                :style="{ width: health + '%' }"
              ></div>
            </div>
            <div class="text-lg hud-text font-bold">{{ health }}</div>
          </div>
          
          <div class="flex items-center space-x-2">
            <div class="text-sm text-military-light">AMMO</div>
            <div class="text-2xl hud-text font-bold">{{ ammo }}</div>
          </div>

          <div class="flex items-center space-x-2">
            <div class="text-sm text-military-light">KILLS</div>
            <div class="text-2xl hud-text font-bold text-red-400">{{ killCount }}</div>
          </div>
        </div>
      </div>
      
      <div class="flex space-x-4">
        <div class="hud-panel p-4 pointer-events-auto">
          <div class="text-sm text-military-light mb-1">ENEMIES</div>
          <div class="text-2xl hud-text font-bold text-red-400">{{ enemyCount }}</div>
        </div>
        <div class="hud-panel p-4 pointer-events-auto">
          <div class="text-sm text-military-light mb-1">SCORE</div>
          <div class="text-3xl hud-text font-bold">{{ score }}</div>
        </div>
      </div>
    </div>

    <div
      v-for="(popup, index) in scorePopups"
      :key="index"
      class="score-popup"
      :style="getPopupStyle(popup)"
    >
      +{{ popup.value }}
    </div>
    
    <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
      <svg width="60" height="60" class="crosshair">
        <circle cx="30" cy="30" r="25" fill="none" stroke="#ffb82e" stroke-width="2" opacity="0.6"/>
        <line x1="30" y1="10" x2="30" y2="20" stroke="#ffb82e" stroke-width="2"/>
        <line x1="30" y1="40" x2="30" y2="50" stroke="#ffb82e" stroke-width="2"/>
        <line x1="10" y1="30" x2="20" y2="30" stroke="#ffb82e" stroke-width="2"/>
        <line x1="40" y1="30" x2="50" y2="30" stroke="#ffb82e" stroke-width="2"/>
        <circle cx="30" cy="30" r="2" fill="#ffb82e"/>
      </svg>
    </div>
    
    <div class="absolute bottom-4 right-4 hud-panel p-2 pointer-events-auto">
      <div class="w-40 h-40 bg-military-dark border border-military-green flex items-center justify-center">
        <div class="text-military-light text-sm">RADAR</div>
      </div>
    </div>
    
    <div class="absolute bottom-4 left-4 text-military-light text-sm space-y-1">
      <div><span class="hud-text">W/S</span> 前后移动 | <span class="hud-text">A/D</span> 车体旋转</div>
      <div>按住 <span class="hud-text">右键</span> 拖动控制炮塔 | <span class="hud-text">左键</span> 射击</div>
      <div><span class="hud-text text-red-400">红色坦克</span> 为AI敌人 | <span class="hud-text text-yellow-400">金色菱形</span> 为高分目标</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import type { Game, ScorePopup } from '../core/Game'

const props = defineProps<{
  game: Game | null
}>()

const health = ref(100)
const ammo = ref(50)
const score = ref(0)
const killCount = ref(0)
const enemyCount = ref(0)
const scorePopups = ref<ScorePopup[]>([])

const healthColor = computed(() => {
  if (health.value > 60) return 'bg-green-500'
  if (health.value > 30) return 'bg-yellow-500'
  return 'bg-hud-red'
})

let updateInterval: number | null = null

onMounted(() => {
  updateInterval = window.setInterval(() => {
    if (props.game) {
      health.value = props.game.health
      ammo.value = props.game.ammo
      score.value = props.game.score
      killCount.value = props.game.killCount
      enemyCount.value = props.game.enemies.filter(e => e.isAlive).length
      scorePopups.value = [...props.game.scorePopups]
    }
  }, 100)
})

onUnmounted(() => {
  if (updateInterval !== null) {
    clearInterval(updateInterval)
  }
})

const getPopupStyle = (popup: ScorePopup) => {
  const camera = props.game?.camera
  if (!camera) return { display: 'none' }

  const projected = popup.position.clone().project(camera)
  const x = (projected.x * 0.5 + 0.5) * window.innerWidth
  const y = (-projected.y * 0.5 + 0.5) * window.innerHeight

  const opacity = Math.min(popup.time, 1.0)
  const scale = 0.8 + (1 - popup.time / 2.0) * 0.5

  return {
    left: `${x}px`,
    top: `${y}px`,
    opacity: opacity,
    transform: `translate(-50%, -50%) scale(${scale})`,
    color: popup.value >= 200 ? '#ff4444' : popup.value >= 150 ? '#ffaa00' : '#ffd700',
    fontSize: popup.value >= 200 ? '2rem' : popup.value >= 150 ? '1.5rem' : '1.2rem'
  }
}
</script>

<style scoped>
.crosshair {
  filter: drop-shadow(0 0 5px rgba(255, 184, 46, 0.8));
  animation: crosshair-pulse 2s ease-in-out infinite;
}

@keyframes crosshair-pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

.score-popup {
  position: absolute;
  font-weight: 900;
  text-shadow: 0 0 10px currentColor, 0 0 20px currentColor;
  pointer-events: none;
  transition: opacity 0.1s ease-out;
  z-index: 100;
}
</style>
