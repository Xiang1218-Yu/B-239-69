import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { Tank } from '../entities/Tank'
import { Terrain } from '../entities/Terrain'
import { InputSystem } from '../systems/InputSystem'
import { CameraSystem } from '../systems/CameraSystem'
import { Projectile } from '../entities/Projectile'
import { Target } from '../entities/Target'
import { Enemy } from '../entities/Enemy'

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
  public enemyProjectiles: Projectile[] = []

  public inputSystem: InputSystem
  public cameraSystem: CameraSystem

  private clock: THREE.Clock
  private animationId: number | null = null
  private enemySpawnTimer: number = 0
  private enemySpawnInterval: number = 10
  private maxEnemies: number = 5

  // 游戏状态
  public health: number = 100
  public ammo: number = 30
  public score: number = 0
  public enemiesKilled: number = 0
  public targetsDestroyed: number = 0
  public isRunning: boolean = false

  constructor(canvas: HTMLCanvasElement) {
    // 初始化 Three.js 场景
    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(0x8b9d8a, 50, 500)
    
    // 相机
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    )
    this.camera.position.set(0, 15, 30)
    
    // 渲染器
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
    
    // 物理世界
    this.world = new CANNON.World()
    this.world.gravity.set(0, -9.82, 0)
    this.world.broadphase = new CANNON.SAPBroadphase(this.world)
    this.world.defaultContactMaterial.friction = 0.4
    
    // 时钟
    this.clock = new THREE.Clock()
    
    // 系统
    this.inputSystem = new InputSystem(canvas)
    this.cameraSystem = new CameraSystem(this.camera)
    
    // 初始化场景
    this.initLights()
    this.initSkybox()
    
    // 监听窗口大小变化
    window.addEventListener('resize', this.onWindowResize.bind(this))
  }
  
  private initLights(): void {
    // 环境光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4)
    this.scene.add(ambientLight)
    
    // 主光源（太阳）
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
    
    // 半球光（天空漫反射）
    const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x4a5f4d, 0.6)
    this.scene.add(hemisphereLight)
  }
  
  private initSkybox(): void {
    // 简单的渐变天空
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
    // 创建地形
    this.terrain = new Terrain(this.scene, this.world)

    // 创建玩家坦克（在地面上方稍微一点）
    this.playerTank = new Tank(this.scene, this.world, { x: 0, y: 1, z: 0 })

    // 创建目标木箱（在玩家前方分散放置），不同位置不同分数
    this.targets.push(new Target(this.scene, this.world, { x: 10, y: 1, z: -5 }, 100))
    this.targets.push(new Target(this.scene, this.world, { x: -8, y: 1, z: -10 }, 100))
    this.targets.push(new Target(this.scene, this.world, { x: 15, y: 1, z: 8 }, 150))
    this.targets.push(new Target(this.scene, this.world, { x: -12, y: 1, z: 5 }, 150))
    this.targets.push(new Target(this.scene, this.world, { x: 0, y: 1, z: -15 }, 200))

    // 创建初始AI敌人
    this.spawnEnemy(25, 25)
    this.spawnEnemy(-25, 25)
    this.spawnEnemy(25, -25)

    // 设置相机跟随
    this.cameraSystem.setTarget(this.playerTank.mesh)

    console.log('游戏初始化完成')
  }

  private spawnEnemy(minDistance: number = 20, maxDistance: number = 40): void {
    if (this.enemies.length >= this.maxEnemies) return

    const angle = Math.random() * Math.PI * 2
    const distance = minDistance + Math.random() * (maxDistance - minDistance)
    const x = Math.cos(angle) * distance
    const z = Math.sin(angle) * distance

    const enemy = new Enemy(this.scene, this.world, { x, y: 1, z })
    this.enemies.push(enemy)
  }
  
  public restart(): void {
    // 重置游戏状态
    this.health = 100
    this.ammo = 30
    this.score = 0
    this.enemiesKilled = 0
    this.targetsDestroyed = 0
    this.enemySpawnTimer = 0

    // 清除所有玩家炮弹
    this.projectiles.forEach(projectile => {
      projectile.destroy(this.scene, this.world)
    })
    this.projectiles = []

    // 清除所有敌人炮弹
    this.enemyProjectiles.forEach(projectile => {
      projectile.destroy(this.scene, this.world)
    })
    this.enemyProjectiles = []

    // 清除所有目标
    this.targets.forEach(target => {
      target.destroy(this.scene, this.world)
    })
    this.targets = []

    // 清除所有敌人
    this.enemies.forEach(enemy => {
      enemy.destroy(this.scene, this.world)
    })
    this.enemies = []

    // 重新创建目标
    this.targets.push(new Target(this.scene, this.world, { x: 10, y: 1, z: -5 }, 100))
    this.targets.push(new Target(this.scene, this.world, { x: -8, y: 1, z: -10 }, 100))
    this.targets.push(new Target(this.scene, this.world, { x: 15, y: 1, z: 8 }, 150))
    this.targets.push(new Target(this.scene, this.world, { x: -12, y: 1, z: 5 }, 150))
    this.targets.push(new Target(this.scene, this.world, { x: 0, y: 1, z: -15 }, 200))

    // 重新创建敌人
    this.spawnEnemy(25, 25)
    this.spawnEnemy(-25, 25)
    this.spawnEnemy(25, -25)

    // 重置坦克位置
    if (this.playerTank) {
      this.playerTank.body.position.set(0, 1, 0)
      this.playerTank.body.velocity.set(0, 0, 0)
      this.playerTank.body.angularVelocity.set(0, 0, 0)
      this.playerTank.body.quaternion.set(0, 0, 0, 1)
    }

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

    const deltaTime = Math.min(this.clock.getDelta(), 0.1)

    this.world.step(1 / 60, deltaTime, 3)

    const playerPosition = this.playerTank ? this.playerTank.mesh.position : null

    if (this.playerTank) {
      const input = this.inputSystem.getInput()
      this.playerTank.update(deltaTime, input)

      if (input.shoot && this.ammo > 0) {
        this.shoot()
      }
    }

    for (let ei = this.enemies.length - 1; ei >= 0; ei--) {
      const enemy = this.enemies[ei]
      enemy.update(deltaTime, playerPosition, this.camera)

      if (enemy.canShoot() && playerPosition) {
        const shootPos = enemy.getShootPosition()
        const shootDir = enemy.getShootDirection()
        const enemyProjectile = new Projectile(this.scene, this.world, shootPos, shootDir, 0xff3333)
        this.enemyProjectiles.push(enemyProjectile)
      }
    }

    const projPos = new THREE.Vector3()
    for (let pi = this.projectiles.length - 1; pi >= 0; pi--) {
      const projectile = this.projectiles[pi]
      projectile.update(deltaTime)
      projPos.copy(projectile.mesh.position)

      let hitSomething = false

      for (let ti = this.targets.length - 1; ti >= 0; ti--) {
        const target = this.targets[ti]
        if (target.checkHit(projPos)) {
          target.destroy(this.scene, this.world)
          this.targets.splice(ti, 1)
          projectile.destroy(this.scene, this.world)
          this.projectiles.splice(pi, 1)
          this.score += target.scoreValue
          this.targetsDestroyed++
          hitSomething = true
          break
        }
      }

      if (!hitSomething) {
        for (let ei = this.enemies.length - 1; ei >= 0; ei--) {
          const enemy = this.enemies[ei]
          if (enemy.checkHit(projPos)) {
            const isDead = enemy.takeDamage(50)
            projectile.destroy(this.scene, this.world)
            this.projectiles.splice(pi, 1)
            if (isDead) {
              enemy.destroy(this.scene, this.world)
              this.enemies.splice(ei, 1)
              this.score += enemy.scoreValue
              this.enemiesKilled++
            }
            hitSomething = true
            break
          }
        }
      }

      if (!hitSomething && projectile.shouldRemove()) {
        projectile.destroy(this.scene, this.world)
        this.projectiles.splice(pi, 1)
      }
    }

    if (this.playerTank) {
      const tankPos = this.playerTank.mesh.position
      for (let pi = this.enemyProjectiles.length - 1; pi >= 0; pi--) {
        const projectile = this.enemyProjectiles[pi]
        projectile.update(deltaTime)

        const dx = tankPos.x - projectile.mesh.position.x
        const dz = tankPos.z - projectile.mesh.position.z
        const distSq = dx * dx + dz * dz

        if (distSq < 4) {
          projectile.destroy(this.scene, this.world)
          this.enemyProjectiles.splice(pi, 1)
          this.health -= 10
          if (this.health < 0) this.health = 0
          continue
        }

        if (projectile.shouldRemove()) {
          projectile.destroy(this.scene, this.world)
          this.enemyProjectiles.splice(pi, 1)
        }
      }
    } else {
      for (let pi = this.enemyProjectiles.length - 1; pi >= 0; pi--) {
        const projectile = this.enemyProjectiles[pi]
        projectile.update(deltaTime)
        if (projectile.shouldRemove()) {
          projectile.destroy(this.scene, this.world)
          this.enemyProjectiles.splice(pi, 1)
        }
      }
    }

    for (let i = 0; i < this.targets.length; i++) {
      this.targets[i].update()
    }

    this.enemySpawnTimer += deltaTime
    if (this.enemySpawnTimer > this.enemySpawnInterval) {
      this.enemySpawnTimer = 0
      this.spawnEnemy(30, 50)
    }

    if (this.targets.length === 0) {
      this.targets.push(new Target(this.scene, this.world, { x: 10 + Math.random() * 10, y: 1, z: -5 - Math.random() * 10 }, 100))
      this.targets.push(new Target(this.scene, this.world, { x: -8 - Math.random() * 10, y: 1, z: -10 - Math.random() * 10 }, 150))
      this.targets.push(new Target(this.scene, this.world, { x: 15 + Math.random() * 10, y: 1, z: 8 + Math.random() * 10 }, 200))
    }

    this.cameraSystem.update(deltaTime)

    this.renderer.render(this.scene, this.camera)
  }
  
  public shoot(): void {
    if (!this.playerTank || this.ammo <= 0) return

    this.ammo--

    const projectile = this.playerTank.shoot(this.scene, this.world)
    if (projectile) {
      projectile.enableTrail(this.scene)
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
    
    // 清理资源
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
