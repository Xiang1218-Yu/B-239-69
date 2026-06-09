import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { Projectile } from './Projectile'

type EnemyState = 'patrol' | 'chase' | 'attack'

export class Enemy {
  public mesh: THREE.Group
  public body: CANNON.Body

  private bodyMesh: THREE.Mesh
  private headMesh: THREE.Mesh
  private leftArm: THREE.Mesh
  private rightArm: THREE.Mesh
  private leftLeg: THREE.Mesh
  private rightLeg: THREE.Mesh
  private healthBarBg: THREE.Sprite
  private healthBarFg: THREE.Sprite

  private maxHp: number = 100
  private currentHp: number = 100
  private destroyed: boolean = false

  // AI 参数
  private aiState: EnemyState = 'patrol'
  private moveSpeed: number = 4
  private detectRange: number = 35
  private attackRange: number = 18
  private patrolCenter: THREE.Vector3
  private patrolRadius: number = 12
  private patrolAngle: number = 0
  private animTime: number = 0

  // 攻击参数
  private attackCooldown: number = 0
  private attackInterval: number = 2.0
  private attackDamage: number = 10
  private projectileSpeed: number = 35

  constructor(
    scene: THREE.Scene,
    world: CANNON.World,
    position: { x: number, y: number, z: number }
  ) {
    this.mesh = new THREE.Group()
    this.patrolCenter = new THREE.Vector3(position.x, position.y, position.z)

    // 身体（机甲风格的立方躯干）
    const bodyGeo = new THREE.BoxGeometry(1.4, 1.8, 0.9)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x8a2a2a,
      roughness: 0.6,
      metalness: 0.7,
      emissive: 0x220000,
      emissiveIntensity: 0.4
    })
    this.bodyMesh = new THREE.Mesh(bodyGeo, bodyMat)
    this.bodyMesh.position.y = 1.6
    this.bodyMesh.castShadow = true
    this.mesh.add(this.bodyMesh)

    // 头部（带发光眼睛）
    const headGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8)
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x3a1a1a,
      roughness: 0.5,
      metalness: 0.8
    })
    this.headMesh = new THREE.Mesh(headGeo, headMat)
    this.headMesh.position.y = 2.9
    this.headMesh.castShadow = true
    this.mesh.add(this.headMesh)

    const eyeGeo = new THREE.SphereGeometry(0.1, 8, 8)
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2222 })
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat)
    leftEye.position.set(-0.2, 0.05, 0.4)
    this.headMesh.add(leftEye)
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat)
    rightEye.position.set(0.2, 0.05, 0.4)
    this.headMesh.add(rightEye)

    // 双臂
    const armGeo = new THREE.BoxGeometry(0.4, 1.5, 0.4)
    const armMat = new THREE.MeshStandardMaterial({
      color: 0x6a1a1a,
      roughness: 0.6,
      metalness: 0.6
    })
    this.leftArm = new THREE.Mesh(armGeo, armMat)
    this.leftArm.position.set(-0.95, 1.7, 0)
    this.leftArm.castShadow = true
    this.mesh.add(this.leftArm)

    this.rightArm = new THREE.Mesh(armGeo, armMat)
    this.rightArm.position.set(0.95, 1.7, 0)
    this.rightArm.castShadow = true
    this.mesh.add(this.rightArm)

    // 双腿
    const legGeo = new THREE.BoxGeometry(0.5, 1.4, 0.5)
    const legMat = new THREE.MeshStandardMaterial({
      color: 0x4a1010,
      roughness: 0.7,
      metalness: 0.5
    })
    this.leftLeg = new THREE.Mesh(legGeo, legMat)
    this.leftLeg.position.set(-0.4, 0.4, 0)
    this.leftLeg.castShadow = true
    this.mesh.add(this.leftLeg)

    this.rightLeg = new THREE.Mesh(legGeo, legMat)
    this.rightLeg.position.set(0.4, 0.4, 0)
    this.rightLeg.castShadow = true
    this.mesh.add(this.rightLeg)

    // 头顶血条
    this.healthBarBg = this.createHealthBarSprite('#222222', 1)
    this.healthBarBg.position.set(0, 4.0, 0)
    this.healthBarBg.scale.set(2.0, 0.25, 1)
    this.mesh.add(this.healthBarBg)

    this.healthBarFg = this.createHealthBarSprite('#ff3333', 1)
    this.healthBarFg.position.set(0, 4.0, 0.01)
    this.healthBarFg.scale.set(1.95, 0.2, 1)
    this.mesh.add(this.healthBarFg)

    this.mesh.position.set(position.x, position.y, position.z)
    scene.add(this.mesh)

    // 物理体（胶囊状近似为盒子）
    const shape = new CANNON.Box(new CANNON.Vec3(0.7, 1.6, 0.5))
    this.body = new CANNON.Body({
      mass: 60,
      shape: shape,
      linearDamping: 0.6,
      angularDamping: 0.9,
      allowSleep: false
    })
    this.body.position.set(position.x, position.y + 1.6, position.z)
    this.body.angularFactor.set(0, 1, 0)
    world.addBody(this.body)
  }

  private createHealthBarSprite(color: string, value: number): THREE.Sprite {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 16
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = color
    ctx.fillRect(0, 0, canvas.width * value, canvas.height)
    const texture = new THREE.CanvasTexture(canvas)
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false })
    const sprite = new THREE.Sprite(material)
    return sprite
  }

  private updateHealthBar(): void {
    const ratio = Math.max(0, this.currentHp / this.maxHp)
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 16
    const ctx = canvas.getContext('2d')!
    const color = ratio > 0.5 ? '#33ff33' : ratio > 0.25 ? '#ffcc33' : '#ff3333'
    ctx.fillStyle = color
    ctx.fillRect(0, 0, canvas.width * ratio, canvas.height)
    const newTexture = new THREE.CanvasTexture(canvas)
    const oldMaterial = this.healthBarFg.material as THREE.SpriteMaterial
    if (oldMaterial.map) oldMaterial.map.dispose()
    oldMaterial.map = newTexture
    oldMaterial.needsUpdate = true
  }

  public update(
    deltaTime: number,
    playerPosition: THREE.Vector3,
    camera: THREE.Camera,
    scene: THREE.Scene,
    world: CANNON.World
  ): Projectile | null {
    if (this.destroyed) return null

    this.animTime += deltaTime
    if (this.attackCooldown > 0) {
      this.attackCooldown -= deltaTime
    }

    // 同步网格与物理体
    this.mesh.position.set(
      this.body.position.x,
      this.body.position.y - 1.6,
      this.body.position.z
    )

    const distanceToPlayer = this.mesh.position.distanceTo(playerPosition)

    // AI 状态切换
    if (distanceToPlayer < this.attackRange) {
      this.aiState = 'attack'
    } else if (distanceToPlayer < this.detectRange) {
      this.aiState = 'chase'
    } else {
      this.aiState = 'patrol'
    }

    // 行为执行
    let targetDir = new THREE.Vector3()
    if (this.aiState === 'chase' || this.aiState === 'attack') {
      // 朝玩家移动
      targetDir.subVectors(playerPosition, this.mesh.position)
      targetDir.y = 0
      targetDir.normalize()
      if (this.aiState === 'attack') {
        // 攻击范围内停止前进，但仍朝向玩家
        this.body.velocity.x *= 0.5
        this.body.velocity.z *= 0.5
      } else {
        this.body.velocity.x = targetDir.x * this.moveSpeed
        this.body.velocity.z = targetDir.z * this.moveSpeed
      }
    } else {
      // 巡逻：绕巡逻中心做圆形移动
      this.patrolAngle += deltaTime * 0.5
      const targetX = this.patrolCenter.x + Math.cos(this.patrolAngle) * this.patrolRadius
      const targetZ = this.patrolCenter.z + Math.sin(this.patrolAngle) * this.patrolRadius
      targetDir.set(targetX - this.mesh.position.x, 0, targetZ - this.mesh.position.z).normalize()
      this.body.velocity.x = targetDir.x * (this.moveSpeed * 0.5)
      this.body.velocity.z = targetDir.z * (this.moveSpeed * 0.5)
    }

    // 朝向运动方向
    if (targetDir.lengthSq() > 0.001) {
      const angle = Math.atan2(targetDir.x, targetDir.z)
      this.mesh.rotation.y = angle
    }

    // 行走动画
    const walkSpeed = (this.aiState === 'patrol') ? 4 : 8
    const swing = Math.sin(this.animTime * walkSpeed) * 0.5
    this.leftLeg.rotation.x = swing
    this.rightLeg.rotation.x = -swing
    this.leftArm.rotation.x = -swing
    this.rightArm.rotation.x = swing

    // 血条始终面向相机
    this.healthBarBg.lookAt(camera.position)
    this.healthBarFg.lookAt(camera.position)

    // 主动攻击：当处于攻击状态且冷却结束时发射炮弹
    if (this.aiState === 'attack' && this.attackCooldown <= 0) {
      this.attackCooldown = this.attackInterval
      return this.fireProjectile(scene, world, playerPosition)
    }

    return null
  }

  /**
   * 朝玩家方向发射炮弹
   */
  private fireProjectile(
    scene: THREE.Scene,
    world: CANNON.World,
    playerPosition: THREE.Vector3
  ): Projectile {
    // 从胸口位置发射
    const firePosition = this.mesh.position.clone()
    firePosition.y += 2.0
    // 朝玩家中心稍上方瞄准
    const targetPos = playerPosition.clone()
    targetPos.y += 1.0
    const direction = new THREE.Vector3()
      .subVectors(targetPos, firePosition)
      .normalize()
    // 略微前移以避免与自身物理体碰撞
    firePosition.add(direction.clone().multiplyScalar(1.2))

    const projectile = new Projectile(scene, world, firePosition, direction)
    // 调整为敌方炮弹速度与外观
    projectile.body.velocity.set(
      direction.x * this.projectileSpeed,
      direction.y * this.projectileSpeed,
      direction.z * this.projectileSpeed
    )
    const mat = projectile.mesh.material as THREE.MeshStandardMaterial
    mat.color.setHex(0xff3333)
    mat.emissive.setHex(0xaa0000)
    return projectile
  }

  /**
   * 获取敌人攻击的伤害
   */
  public getAttackDamage(): number {
    return this.attackDamage
  }

  public checkHit(projectilePosition: THREE.Vector3): boolean {
    if (this.destroyed) return false
    const enemyCenter = this.mesh.position.clone()
    enemyCenter.y += 1.5
    const distance = enemyCenter.distanceTo(projectilePosition)
    return distance < 1.6
  }

  /**
   * 受到伤害，返回是否被消灭
   */
  public takeDamage(damage: number): boolean {
    if (this.destroyed) return false
    this.currentHp -= damage
    this.updateHealthBar()

    // 受击闪烁
    const originalColor = (this.bodyMesh.material as THREE.MeshStandardMaterial).color.clone()
    ;(this.bodyMesh.material as THREE.MeshStandardMaterial).color.setHex(0xffffff)
    setTimeout(() => {
      if (!this.destroyed) {
        ;(this.bodyMesh.material as THREE.MeshStandardMaterial).color.copy(originalColor)
      }
    }, 80)

    if (this.currentHp <= 0) {
      this.destroyed = true
      return true
    }
    return false
  }

  public destroy(scene: THREE.Scene, world: CANNON.World): void {
    this.destroyed = true
    scene.remove(this.mesh)
    world.removeBody(this.body)

    this.mesh.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose()
        if (Array.isArray(object.material)) {
          object.material.forEach(m => m.dispose())
        } else {
          object.material.dispose()
        }
      }
      if (object instanceof THREE.Sprite) {
        const mat = object.material as THREE.SpriteMaterial
        if (mat.map) mat.map.dispose()
        mat.dispose()
      }
    })
  }

  public isDestroyed(): boolean {
    return this.destroyed
  }
}
