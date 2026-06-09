<template>
  <div class="w-full h-full relative">
    <GameCanvas v-if="gameStarted" @game-ready="onGameReady" />
    <MainMenu v-else @start-game="startGame" />
    <HUD v-if="gameStarted && gameReady" :game="game" />
    <GameOver 
      v-if="gameStarted && gameReady"
      :show="showGameOver" 
      :reason="gameOverReason" 
      :score="finalScore"
      :killCount="finalKillCount"
      @restart="restartGame" 
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import GameCanvas from './components/GameCanvas.vue'
import MainMenu from './components/MainMenu.vue'
import HUD from './components/HUD.vue'
import GameOver from './components/GameOver.vue'
import type { Game } from './core/Game'

const gameStarted = ref(false)
const gameReady = ref(false)
const game = ref<Game | null>(null)
const showGameOver = ref(false)
const gameOverReason = ref<'ammo' | 'health' | null>(null)
const finalScore = ref(0)
const finalKillCount = ref(0)

let monitoringInterval: number | null = null

const startGame = () => {
  gameStarted.value = true
}

const onGameReady = (gameInstance: Game) => {
  game.value = gameInstance
  gameReady.value = true
  
  startMonitoring()
}

const startMonitoring = () => {
  monitoringInterval = window.setInterval(() => {
    if (game.value && !showGameOver.value) {
      if (game.value.ammo <= 0 && game.value.projectiles.filter(p => !p.isEnemyProjectile).length === 0) {
        gameOverReason.value = 'ammo'
        finalScore.value = game.value.score
        finalKillCount.value = game.value.killCount
        showGameOver.value = true
      }
      if (game.value.health <= 0) {
        gameOverReason.value = 'health'
        finalScore.value = game.value.score
        finalKillCount.value = game.value.killCount
        showGameOver.value = true
      }
    }
  }, 100)
}

const restartGame = () => {
  if (game.value) {
    game.value.restart()
    showGameOver.value = false
    gameOverReason.value = null
    finalScore.value = 0
    finalKillCount.value = 0
  }
}
</script>
