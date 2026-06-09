import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { Projectile } from './Projectile'

export enum EnemyState {
  Patrol = 'patrol',
  Chase = 'chase',
  Attack = 'attack'
}

export class Enemy {
  public mesh: THREE.Group
  public body: CANNON.Body
  public health: number = 100
  public maxHealth: number = 100
  public scoreValue: number = 200
  public isAlive: boolean = true

  private hull: THREE.Mesh
  private turret: THREE.Mesh
  private barrel: THREE.Mesh
  private healthBar: THREE.Mesh
  private healthBarBg: THREE.Mesh

  private state: EnemyState = EnemyState.Patrol
  private speed: number = 8
  private rotationSpeed: number = 1.5
  private detectionRange: number = 60
  public attackRange: number = 40
  private shootCooldown: number = 2.0
  private shootTimer: number = 0
  private patrolTarget: THREE.Vector3 = new THREE.Vector3()
  private patrolWaitTimer: number = 0
  private destroyed: boolean = false

  constructor(
    scene: THREE.Scene,
    world: CANNON.World,
    position: { x: number; y: number; z: number }
  ) {
    this.mesh = new THREE.Group()

    const hullGeometry = new THREE.BoxGeometry(2.8, 1.4, 3.8)
    const hullMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b1a1a,
      roughness: 0.7,
      metalness: 0.5
    })
    this.hull = new THREE.Mesh(hullGeometry, hullMaterial)
    this.hull.castShadow = true
    this.hull.receiveShadow = true
    this.mesh.add(this.hull)

    const turretGeometry = new THREE.CylinderGeometry(1.0, 1.1, 0.9, 8)
    const turretMaterial = new THREE.MeshStandardMaterial({
      color: 0x6b1010,
      roughness: 0.6,
      metalness: 0.6
    })
    this.turret = new THREE.Mesh(turretGeometry, turretMaterial)
    this.turret.position.y = 1.15
    this.turret.castShadow = true
    this.turret.receiveShadow = true
    this.mesh.add(this.turret)

    const barrelGeometry = new THREE.CylinderGeometry(0.18, 0.18, 2.8, 8)
    const barrelMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1f1e,
      roughness: 0.4,
      metalness: 0.8
    })
    this.barrel = new THREE.Mesh(barrelGeometry, barrelMaterial)
    this.barrel.rotation.z = Math.PI / 2
    this.barrel.position.set(1.4, 0, 0)
    this.barrel.castShadow = true
    this.turret.add(this.barrel)

    this.addTracks()

    const healthBarBgGeo = new THREE.PlaneGeometry(3, 0.3)
    const healthBarBgMat = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide })
    this.healthBarBg = new THREE.Mesh(healthBarBgGeo, healthBarBgMat)
    this.healthBarBg.position.y = 2.5
    this.mesh.add(this.healthBarBg)

    const healthBarGeo = new THREE.PlaneGeometry(3, 0.3)
    const healthBarMat = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide })
    this.healthBar = new THREE.Mesh(healthBarGeo, healthBarMat)
    this.healthBar.position.y = 2.5
    this.healthBar.position.z = 0.01
    this.mesh.add(this.healthBar)

    this.mesh.position.set(position.x, position.y, position.z)
    scene.add(this.mesh)

    const shape = new CANNON.Box(new CANNON.Vec3(1.4, 0.7, 1.9))
    this.body = new CANNON.Body({
      mass: 800,
      shape: shape,
      linearDamping: 0.9,
      angularDamping: 0.8,
      fixedRotation: false,
      allowSleep: false
    })
    this.body.position.set(position.x, position.y, position.z)
    this.body.angularFactor.set(0, 1, 0)
    world.addBody(this.body)

    this.pickPatrolTarget()
  }

  private addTracks(): void {
    const trackGeometry = new THREE.BoxGeometry(2.2, 0.5, 4.5)
    const trackMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1f1e,
      roughness: 0.9,
      metalness: 0.3
    })

    const leftTrack = new THREE.Mesh(trackGeometry, trackMaterial)
    leftTrack.position.set(-1.3, -0.5, 0)
    leftTrack.castShadow = true
    this.mesh.add(leftTrack)

    const rightTrack = new THREE.Mesh(trackGeometry, trackMaterial)
    rightTrack.position.set(1.3, -0.5, 0)
    rightTrack.castShadow = true
    this.mesh.add(rightTrack)
  }

  private pickPatrolTarget(): void {
    const range = 40
    this.patrolTarget.set(
      (Math.random() - 0.5) * range * 2,
      0,
      (Math.random() - 0.5) * range * 2
    )
    this.patrolWaitTimer = Math.random() * 3 + 1
  }

  public update(deltaTime: number, playerPosition: THREE.Vector3): Projectile | null {
    if (!this.isAlive) return null

    this.mesh.position.copy(this.body.position as any)
    this.mesh.quaternion.copy(this.body.quaternion as any)

    this.updateHealthBar()

    const distanceToPlayer = new THREE.Vector2(
      this.mesh.position.x - playerPosition.x,
      this.mesh.position.z - playerPosition.z
    ).length()

    if (distanceToPlayer <= this.attackRange) {
      this.state = EnemyState.Attack
    } else if (distanceToPlayer <= this.detectionRange) {
      this.state = EnemyState.Chase
    } else {
      this.state = EnemyState.Patrol
    }

    let firedProjectile: Projectile | null = null

    switch (this.state) {
      case EnemyState.Patrol:
        firedProjectile = this.updatePatrol(deltaTime)
        break
      case EnemyState.Chase:
        this.updateChase(deltaTime, playerPosition)
        break
      case EnemyState.Attack:
        firedProjectile = this.updateAttack(deltaTime, playerPosition)
        break
    }

    this.turret.lookAt(playerPosition.x, this.turret.getWorldPosition(new THREE.Vector3()).y, playerPosition.z)

    return firedProjectile
  }

  private updatePatrol(deltaTime: number): Projectile | null {
    const toTarget = new THREE.Vector3()
      .subVectors(this.patrolTarget, this.mesh.position)
    toTarget.y = 0
    const dist = toTarget.length()

    if (dist < 3) {
      this.patrolWaitTimer -= deltaTime
      this.body.velocity.x *= 0.9
      this.body.velocity.z *= 0.9
      this.body.angularVelocity.y = 0
      if (this.patrolWaitTimer <= 0) {
        this.pickPatrolTarget()
      }
      return null
    }

    this.rotateTowards(this.patrolTarget, deltaTime)

    const forward = new THREE.Vector3(0, 0, -1)
    forward.applyQuaternion(this.mesh.quaternion)
    this.body.velocity.x = forward.x * this.speed * 0.5
    this.body.velocity.z = forward.z * this.speed * 0.5

    return null
  }

  private updateChase(deltaTime: number, playerPosition: THREE.Vector3): void {
    this.rotateTowards(playerPosition, deltaTime)

    const forward = new THREE.Vector3(0, 0, -1)
    forward.applyQuaternion(this.mesh.quaternion)
    this.body.velocity.x = forward.x * this.speed
    this.body.velocity.z = forward.z * this.speed
  }

  private updateAttack(deltaTime: number, playerPosition: THREE.Vector3): Projectile | null {
    this.rotateTowards(playerPosition, deltaTime)

    const forward = new THREE.Vector3(0, 0, -1)
    forward.applyQuaternion(this.mesh.quaternion)
    this.body.velocity.x = forward.x * this.speed * 0.3
    this.body.velocity.z = forward.z * this.speed * 0.3

    this.shootTimer -= deltaTime
    if (this.shootTimer <= 0) {
      this.shootTimer = this.shootCooldown + Math.random() * 1.0
      return null
    }
    return null
  }

  public tryShoot(scene: THREE.Scene, world: CANNON.World, playerPosition: THREE.Vector3): Projectile | null {
    if (!this.isAlive) return null

    const barrelEnd = new THREE.Vector3(2.5, 0, 0)
    barrelEnd.applyQuaternion(this.turret.quaternion)
    barrelEnd.applyQuaternion(this.mesh.quaternion)
    barrelEnd.add(this.mesh.position)
    barrelEnd.y += 1.15

    const direction = new THREE.Vector3()
      .subVectors(playerPosition, barrelEnd)
      .normalize()

    direction.x += (Math.random() - 0.5) * 0.15
    direction.y += (Math.random() - 0.5) * 0.08
    direction.z += (Math.random() - 0.5) * 0.15
    direction.normalize()

    return new Projectile(scene, world, barrelEnd, direction, 0xff4444)
  }

  private rotateTowards(target: THREE.Vector3, deltaTime: number): void {
    const direction = new THREE.Vector3()
      .subVectors(target, this.mesh.position)
    direction.y = 0

    if (direction.length() < 0.1) return

    const targetAngle = Math.atan2(direction.x, direction.z)
    const currentAngle = this.mesh.rotation.y

    let angleDiff = targetAngle - currentAngle
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2

    const rotationAmount = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), this.rotationSpeed * deltaTime)
    this.body.angularVelocity.y = rotationAmount * 2
  }

  private updateHealthBar(): void {
    const ratio = this.health / this.maxHealth
    this.healthBar.scale.x = Math.max(ratio, 0)
    this.healthBar.position.x = -(1 - ratio) * 1.5

    if (ratio > 0.6) {
      (this.healthBar.material as THREE.MeshBasicMaterial).color.setHex(0x00ff00)
    } else if (ratio > 0.3) {
      (this.healthBar.material as THREE.MeshBasicMaterial).color.setHex(0xffff00)
    } else {
      (this.healthBar.material as THREE.MeshBasicMaterial).color.setHex(0xff0000)
    }

    this.healthBar.lookAt(this.healthBar.getWorldPosition(new THREE.Vector3()).add(
      new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion).negate()
    ))
    this.healthBarBg.lookAt(this.healthBarBg.getWorldPosition(new THREE.Vector3()).add(
      new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion).negate()
    ))
  }

  public takeDamage(amount: number): boolean {
    if (!this.isAlive) return false

    this.health -= amount
    if (this.health <= 0) {
      this.health = 0
      this.isAlive = false
      return true
    }
    return false
  }

  public checkHit(projectilePosition: THREE.Vector3): boolean {
    if (!this.isAlive || this.destroyed) return false
    const distance = this.mesh.position.distanceTo(projectilePosition)
    return distance < 2.5
  }

  public destroy(scene: THREE.Scene, world: CANNON.World): void {
    if (this.destroyed) return
    this.destroyed = true
    this.isAlive = false

    scene.remove(this.mesh)
    world.removeBody(this.body)

    this.mesh.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose()
        if (Array.isArray(object.material)) {
          object.material.forEach(mat => mat.dispose())
        } else {
          object.material.dispose()
        }
      }
    })
  }
}
