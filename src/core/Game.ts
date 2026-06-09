import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { Tank } from '../entities/Tank'
import { Terrain } from '../entities/Terrain'
import { InputSystem } from '../systems/InputSystem'
import { CameraSystem } from '../systems/CameraSystem'
import { Projectile } from '../entities/Projectile'
import { Target, TargetType } from '../entities/Target'
import { Enemy } from '../entities/Enemy'

export interface ScorePopup {
  value: number
  position: THREE.Vector3
  time: number
}

export class Game {
  public scene: THREE.Scene
  public camera: THREE.PerspectiveCamera
  public renderer: THREE.WebGLRenderer
  public world: CANNON.World

  public playerTank: Tank | null = null
  public terrain: Terrain | null = null
  public projectiles: Projectile[] = []
  public targets: Target[] = []
  public enemies: Enemy[] = []

  public inputSystem: InputSystem
  public cameraSystem: CameraSystem

  private clock: THREE.Clock
  private animationId: number | null = null

  public health: number = 100
  public ammo: number = 50
  public score: number = 0
  public killCount: number = 0
  public isRunning: boolean = false

  public scorePopups: ScorePopup[] = []

  private enemyShootTimers: Map<Enemy, number> = new Map()
  private enemyRespawnTimer: number = 0
  private enemyRespawnInterval: number = 15
  private maxEnemies: number = 4
  private targetRespawnTimer: number = 0
  private targetRespawnInterval: number = 10

  private shootCooldown: number = 0.3
  private shootTimer: number = 0

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(0x8b9d8a, 50, 500)

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    )
    this.camera.position.set(0, 15, 30)

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false
    })
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.2

    this.world = new CANNON.World()
    this.world.gravity.set(0, -9.82, 0)
    this.world.broadphase = new CANNON.SAPBroadphase(this.world)
    this.world.defaultContactMaterial.friction = 0.4

    this.clock = new THREE.Clock()

    this.inputSystem = new InputSystem(canvas)
    this.cameraSystem = new CameraSystem(this.camera)

    this.initLights()
    this.initSkybox()

    window.addEventListener('resize', this.onWindowResize.bind(this))
  }

  private initLights(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4)
    this.scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xfff4e6, 1.0)
    directionalLight.position.set(100, 100, 50)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.width = 2048
    directionalLight.shadow.mapSize.height = 2048
    directionalLight.shadow.camera.near = 0.5
    directionalLight.shadow.camera.far = 500
    directionalLight.shadow.camera.left = -100
    directionalLight.shadow.camera.right = 100
    directionalLight.shadow.camera.top = 100
    directionalLight.shadow.camera.bottom = -100
    this.scene.add(directionalLight)

    const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x4a5f4d, 0.6)
    this.scene.add(hemisphereLight)
  }

  private initSkybox(): void {
    const vertexShader = `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `

    const fragmentShader = `
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y;
        vec3 skyColor = mix(vec3(0.6, 0.7, 0.8), vec3(0.2, 0.5, 0.8), max(h, 0.0));
        gl_FragColor = vec4(skyColor, 1.0);
      }
    `

    const skyGeo = new THREE.SphereGeometry(500, 32, 15)
    const skyMat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: THREE.BackSide
    })
    const sky = new THREE.Mesh(skyGeo, skyMat)
    this.scene.add(sky)
  }

  public async init(): Promise<void> {
    this.terrain = new Terrain(this.scene, this.world)

    this.playerTank = new Tank(this.scene, this.world, { x: 0, y: 1, z: 0 })

    this.spawnInitialTargets()
    this.spawnInitialEnemies()

    this.cameraSystem.setTarget(this.playerTank.mesh)

    console.log('游戏初始化完成')
  }

  private spawnInitialTargets(): void {
    this.targets.push(new Target(this.scene, this.world, { x: 10, y: 1, z: -5 }, TargetType.Static))
    this.targets.push(new Target(this.scene, this.world, { x: -8, y: 1, z: -10 }, TargetType.Static))
    this.targets.push(new Target(this.scene, this.world, { x: 15, y: 1, z: 8 }, TargetType.Moving))
    this.targets.push(new Target(this.scene, this.world, { x: -12, y: 1, z: 5 }, TargetType.Moving))
    this.targets.push(new Target(this.scene, this.world, { x: 0, y: 1, z: -15 }, TargetType.Bonus))
    this.targets.push(new Target(this.scene, this.world, { x: 20, y: 1, z: -20 }, TargetType.Bonus))
    this.targets.push(new Target(this.scene, this.world, { x: -20, y: 1, z: 15 }, TargetType.Static))
    this.targets.push(new Target(this.scene, this.world, { x: 25, y: 1, z: 5 }, TargetType.Moving))
  }

  private spawnInitialEnemies(): void {
    const enemyPositions = [
      { x: 30, y: 1, z: -30 },
      { x: -30, y: 1, z: -25 },
      { x: 25, y: 1, z: 25 },
      { x: -25, y: 1, z: 30 }
    ]

    enemyPositions.forEach(pos => {
      const enemy = new Enemy(this.scene, this.world, pos)
      this.enemies.push(enemy)
      this.enemyShootTimers.set(enemy, 2 + Math.random() * 3)
    })
  }

  private spawnEnemyAtRandom(): void {
    const angle = Math.random() * Math.PI * 2
    const distance = 40 + Math.random() * 30
    const x = Math.cos(angle) * distance
    const z = Math.sin(angle) * distance

    const enemy = new Enemy(this.scene, this.world, { x, y: 1, z })
    this.enemies.push(enemy)
    this.enemyShootTimers.set(enemy, 2 + Math.random() * 3)
  }

  private spawnTargetAtRandom(): void {
    const types = [TargetType.Static, TargetType.Moving, TargetType.Bonus]
    const weights = [0.4, 0.4, 0.2]

    let random = Math.random()
    let type = TargetType.Static
    for (let i = 0; i < types.length; i++) {
      random -= weights[i]
      if (random <= 0) {
        type = types[i]
        break
      }
    }

    const x = (Math.random() - 0.5) * 60
    const z = (Math.random() - 0.5) * 60

    if (this.playerTank) {
      const dx = x - this.playerTank.mesh.position.x
      const dz = z - this.playerTank.mesh.position.z
      if (Math.sqrt(dx * dx + dz * dz) < 10) return
    }

    this.targets.push(new Target(this.scene, this.world, { x, y: 1, z }, type))
  }

  public restart(): void {
    this.health = 100
    this.ammo = 50
    this.score = 0
    this.killCount = 0
    this.scorePopups = []

    this.projectiles.forEach(projectile => {
      projectile.destroy(this.scene, this.world)
    })
    this.projectiles = []

    this.targets.forEach(target => {
      target.destroy(this.scene, this.world)
    })
    this.targets = []

    this.enemies.forEach(enemy => {
      enemy.destroy(this.scene, this.world)
    })
    this.enemies = []
    this.enemyShootTimers.clear()

    this.spawnInitialTargets()
    this.spawnInitialEnemies()

    if (this.playerTank) {
      this.playerTank.body.position.set(0, 1, 0)
      this.playerTank.body.velocity.set(0, 0, 0)
      this.playerTank.body.angularVelocity.set(0, 0, 0)
      this.playerTank.body.quaternion.set(0, 0, 0, 1)
    }

    this.enemyRespawnTimer = 0
    this.targetRespawnTimer = 0

    console.log('游戏重新开始')
  }

  public start(): void {
    this.isRunning = true
    this.animate()
  }

  public stop(): void {
    this.isRunning = false
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }

  private animate(): void {
    if (!this.isRunning) return

    this.animationId = requestAnimationFrame(this.animate.bind(this))

    const deltaTime = this.clock.getDelta()
    const elapsedTime = this.clock.getElapsedTime()

    this.world.step(1 / 60, deltaTime, 3)

    if (this.playerTank) {
      const input = this.inputSystem.getInput()
      this.playerTank.update(deltaTime, input)

      this.shootTimer -= deltaTime
      if (input.shoot && this.ammo > 0 && this.shootTimer <= 0) {
        this.shoot()
        this.shootTimer = this.shootCooldown
      }
    }

    this.updateProjectiles(deltaTime)

    this.targets.forEach(target => {
      target.update(deltaTime)
    })

    this.updateEnemies(deltaTime)

    this.updateRespawns(deltaTime)

    this.updateScorePopups(deltaTime)

    this.cameraSystem.update(deltaTime)

    this.renderer.render(this.scene, this.camera)
  }

  private updateProjectiles(deltaTime: number): void {
    this.projectiles = this.projectiles.filter(projectile => {
      projectile.update(deltaTime)

      if (projectile.isEnemyProjectile) {
        if (this.playerTank && this.playerTank.mesh) {
          const dist = this.playerTank.mesh.position.distanceTo(projectile.mesh.position)
          if (dist < 2.5) {
            this.health -= 15
            if (this.health < 0) this.health = 0
            projectile.destroy(this.scene, this.world)
            return false
          }
        }
      } else {
        for (let i = 0; i < this.targets.length; i++) {
          const target = this.targets[i]
          if (target.checkHit(projectile.mesh.position)) {
            const scoreValue = target.scoreValue
            target.destroy(this.scene, this.world)
            this.targets.splice(i, 1)
            projectile.destroy(this.scene, this.world)
            this.score += scoreValue
            this.scorePopups.push({
              value: scoreValue,
              position: projectile.mesh.position.clone(),
              time: 1.5
            })
            return false
          }
        }

        for (let i = 0; i < this.enemies.length; i++) {
          const enemy = this.enemies[i]
          if (enemy.checkHit(projectile.mesh.position)) {
            const killed = enemy.takeDamage(35)
            projectile.destroy(this.scene, this.world)

            if (killed) {
              const scoreValue = enemy.scoreValue
              enemy.destroy(this.scene, this.world)
              this.enemies.splice(i, 1)
              this.enemyShootTimers.delete(enemy)
              this.score += scoreValue
              this.killCount++
              this.scorePopups.push({
                value: scoreValue,
                position: enemy.mesh.position.clone(),
                time: 2.0
              })
            } else {
              this.scorePopups.push({
                value: 10,
                position: projectile.mesh.position.clone(),
                time: 1.0
              })
            }
            return false
          }
        }
      }

      if (projectile.shouldRemove()) {
        projectile.destroy(this.scene, this.world)
        return false
      }
      return true
    })
  }

  private updateEnemies(deltaTime: number): void {
    const playerPos = this.playerTank ? this.playerTank.mesh.position : new THREE.Vector3()

    this.enemies.forEach(enemy => {
      enemy.update(deltaTime, playerPos)

      const timer = this.enemyShootTimers.get(enemy) ?? 0
      const newTimer = timer - deltaTime
      this.enemyShootTimers.set(enemy, newTimer)

      if (newTimer <= 0 && enemy.isAlive) {
        const dist = enemy.mesh.position.distanceTo(playerPos)
        if (dist <= enemy.attackRange) {
          const projectile = enemy.tryShoot(this.scene, this.world, playerPos)
          if (projectile) {
            this.projectiles.push(projectile)
          }
        }
        this.enemyShootTimers.set(enemy, 2 + Math.random() * 2)
      }
    })
  }

  private updateRespawns(deltaTime: number): void {
    this.enemyRespawnTimer += deltaTime
    if (this.enemyRespawnTimer >= this.enemyRespawnInterval && this.enemies.length < this.maxEnemies) {
      this.spawnEnemyAtRandom()
      this.enemyRespawnTimer = 0
    }

    this.targetRespawnTimer += deltaTime
    if (this.targetRespawnTimer >= this.targetRespawnInterval && this.targets.length < 8) {
      this.spawnTargetAtRandom()
      this.targetRespawnTimer = 0
    }
  }

  private updateScorePopups(deltaTime: number): void {
    this.scorePopups = this.scorePopups.filter(popup => {
      popup.time -= deltaTime
      return popup.time > 0
    })
  }

  public shoot(): void {
    if (!this.playerTank || this.ammo <= 0) return

    this.ammo--

    const projectile = this.playerTank.shoot(this.scene, this.world)
    if (projectile) {
      this.projectiles.push(projectile)
    }
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  public dispose(): void {
    this.stop()

    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose()
        if (Array.isArray(object.material)) {
          object.material.forEach(material => material.dispose())
        } else {
          object.material.dispose()
        }
      }
    })

    this.renderer.dispose()
    window.removeEventListener('resize', this.onWindowResize.bind(this))
  }
}
