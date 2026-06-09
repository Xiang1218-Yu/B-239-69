import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { Projectile } from './Projectile'

type AiState = 'patrol' | 'chase' | 'attack'

export class EnemyTank {
  public mesh: THREE.Group
  public body: CANNON.Body

  private hull: THREE.Mesh
  private turret: THREE.Mesh
  private barrel: THREE.Mesh

  private speed = 8
  private rotationSpeed = 1.5
  private turretRotationSpeed = 0.03

  private turretRotation = 0
  private barrelElevation = 0

  public health: number = 50
  private destroyed: boolean = false

  private aiState: AiState = 'patrol'
  private patrolTarget: THREE.Vector3 | null = null
  private patrolTimer: number = 0

  private shootCooldown: number = 0
  private shootInterval: number = 3.5

  private detectionRange: number = 35
  private attackRange: number = 25

  constructor(
    scene: THREE.Scene,
    world: CANNON.World,
    position: { x: number; y: number; z: number }
  ) {
    this.mesh = new THREE.Group()

    const hullGeometry = new THREE.BoxGeometry(3, 1.5, 4)
    const hullMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b0000,
      roughness: 0.7,
      metalness: 0.5
    })
    this.hull = new THREE.Mesh(hullGeometry, hullMaterial)
    this.hull.castShadow = true
    this.hull.receiveShadow = true
    this.mesh.add(this.hull)

    const turretGeometry = new THREE.CylinderGeometry(1.2, 1.2, 1, 8)
    const turretMaterial = new THREE.MeshStandardMaterial({
      color: 0x660000,
      roughness: 0.6,
      metalness: 0.6
    })
    this.turret = new THREE.Mesh(turretGeometry, turretMaterial)
    this.turret.position.y = 1.25
    this.turret.castShadow = true
    this.turret.receiveShadow = true
    this.mesh.add(this.turret)

    const barrelGeometry = new THREE.CylinderGeometry(0.2, 0.2, 3, 8)
    const barrelMaterial = new THREE.MeshStandardMaterial({
      color: 0x330000,
      roughness: 0.4,
      metalness: 0.8
    })
    this.barrel = new THREE.Mesh(barrelGeometry, barrelMaterial)
    this.barrel.rotation.z = Math.PI / 2
    this.barrel.position.set(1.5, 0, 0)
    this.barrel.castShadow = true
    this.turret.add(this.barrel)

    this.addTracks()

    this.mesh.position.set(position.x, position.y, position.z)
    scene.add(this.mesh)

    const shape = new CANNON.Box(new CANNON.Vec3(1.5, 0.75, 2))
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
    this.body.userData = { type: 'enemy' }

    world.addBody(this.body)

    this.setRandomPatrolTarget()
  }

  private addTracks(): void {
    const trackGeometry = new THREE.BoxGeometry(2.5, 0.5, 5)
    const trackMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1f1e,
      roughness: 0.9,
      metalness: 0.3
    })

    const leftTrack = new THREE.Mesh(trackGeometry, trackMaterial)
    leftTrack.position.set(-1.5, -0.5, 0)
    leftTrack.castShadow = true
    this.mesh.add(leftTrack)

    const rightTrack = new THREE.Mesh(trackGeometry, trackMaterial)
    rightTrack.position.set(1.5, -0.5, 0)
    rightTrack.castShadow = true
    this.mesh.add(rightTrack)
  }

  private setRandomPatrolTarget(): void {
    const angle = Math.random() * Math.PI * 2
    const distance = 10 + Math.random() * 15
    this.patrolTarget = new THREE.Vector3(
      this.body.position.x + Math.cos(angle) * distance,
      0,
      this.body.position.z + Math.sin(angle) * distance
    )
  }

  public update(
    deltaTime: number,
    playerPosition: THREE.Vector3,
    scene: THREE.Scene,
    world: CANNON.World,
    projectiles: Projectile[]
  ): void {
    if (this.destroyed) return

    const distanceToPlayer = this.mesh.position.distanceTo(playerPosition)

    if (distanceToPlayer < this.attackRange) {
      this.aiState = 'attack'
    } else if (distanceToPlayer < this.detectionRange) {
      this.aiState = 'chase'
    } else {
      this.aiState = 'patrol'
    }

    this.shootCooldown -= deltaTime

    switch (this.aiState) {
      case 'patrol':
        this.updatePatrol(deltaTime)
        break
      case 'chase':
        this.updateChase(deltaTime, playerPosition)
        break
      case 'attack':
        this.updateAttack(deltaTime, playerPosition, scene, world, projectiles)
        break
    }

    this.mesh.position.copy(this.body.position as any)
    this.mesh.quaternion.copy(this.body.quaternion as any)
  }

  private updatePatrol(deltaTime: number): void {
    if (!this.patrolTarget) {
      this.setRandomPatrolTarget()
      return
    }

    this.patrolTimer += deltaTime
    if (this.patrolTimer > 5) {
      this.patrolTimer = 0
      this.setRandomPatrolTarget()
    }

    const direction = new THREE.Vector3()
    direction.subVectors(this.patrolTarget, this.mesh.position)
    direction.y = 0
    const distance = direction.length()

    if (distance < 2) {
      this.setRandomPatrolTarget()
      return
    }

    direction.normalize()
    this.moveTowards(direction, deltaTime)

    this.turretRotation += this.turretRotationSpeed * 0.5
  }

  private updateChase(deltaTime: number, playerPosition: THREE.Vector3): void {
    const direction = new THREE.Vector3()
    direction.subVectors(playerPosition, this.mesh.position)
    direction.y = 0
    direction.normalize()

    this.moveTowards(direction, deltaTime)
    this.aimAtPlayer(playerPosition)
  }

  private updateAttack(
    deltaTime: number,
    playerPosition: THREE.Vector3,
    scene: THREE.Scene,
    world: CANNON.World,
    projectiles: Projectile[]
  ): void {
    const direction = new THREE.Vector3()
    direction.subVectors(playerPosition, this.mesh.position)
    direction.y = 0
    const distance = direction.length()

    if (distance > 20) {
      direction.normalize()
      this.moveTowards(direction, deltaTime * 0.5)
    }

    this.aimAtPlayer(playerPosition)

    if (this.shootCooldown <= 0) {
      this.shoot(scene, world, projectiles)
      this.shootCooldown = this.shootInterval
    }
  }

  private moveTowards(direction: THREE.Vector3, deltaTime: number): void {
    const forward = new THREE.Vector3(0, 0, -1)
    forward.applyQuaternion(this.mesh.quaternion)

    const targetAngle = Math.atan2(direction.x, direction.z)
    const currentAngle = Math.atan2(forward.x, forward.z)
    let angleDiff = targetAngle - currentAngle

    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2

    if (Math.abs(angleDiff) > 0.1) {
      this.body.angularVelocity.y = angleDiff > 0 ? this.rotationSpeed : -this.rotationSpeed
    } else {
      this.body.angularVelocity.y = 0
      const velocity = new CANNON.Vec3(
        direction.x * this.speed,
        this.body.velocity.y,
        direction.z * this.speed
      )
      this.body.velocity.x = velocity.x
      this.body.velocity.z = velocity.z
    }
  }

  private aimAtPlayer(playerPosition: THREE.Vector3): void {
    const direction = new THREE.Vector3()
    direction.subVectors(playerPosition, this.mesh.position)
    direction.y = 0
    direction.normalize()

    const forward = new THREE.Vector3(1, 0, 0)
    forward.applyQuaternion(this.turret.quaternion)
    forward.applyQuaternion(this.mesh.quaternion)
    forward.y = 0
    forward.normalize()

    const targetAngle = Math.atan2(direction.x, direction.z)
    const currentAngle = Math.atan2(forward.x, forward.z)
    let angleDiff = targetAngle - currentAngle

    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2

    this.turretRotation += angleDiff * 0.1
    this.turret.rotation.y = this.turretRotation
  }

  public shoot(
    scene: THREE.Scene,
    world: CANNON.World,
    projectiles: Projectile[]
  ): void {
    const barrelEnd = new THREE.Vector3(3, 0, 0)
    barrelEnd.applyQuaternion(this.turret.quaternion)
    barrelEnd.applyQuaternion(this.mesh.quaternion)
    barrelEnd.add(this.mesh.position)
    barrelEnd.y += 1.25

    const direction = new THREE.Vector3(1, 0, 0)
    direction.applyQuaternion(this.turret.quaternion)
    direction.applyQuaternion(this.mesh.quaternion)
    direction.normalize()

    const projectile = new Projectile(scene, world, barrelEnd, direction)
    projectile.body.userData = { type: 'enemyProjectile' }
    projectiles.push(projectile)
  }

  public checkHit(projectilePosition: THREE.Vector3): boolean {
    if (this.destroyed) return false

    const distance = this.mesh.position.distanceTo(projectilePosition)
    return distance < 2
  }

  public takeDamage(damage: number): boolean {
    this.health -= damage
    return this.health <= 0
  }

  public destroy(scene: THREE.Scene, world: CANNON.World): void {
    if (this.destroyed) return

    this.destroyed = true

    scene.remove(this.mesh)
    world.removeBody(this.body)

    this.mesh.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose()
        if (Array.isArray(object.material)) {
          object.material.forEach((mat) => mat.dispose())
        } else {
          object.material.dispose()
        }
      }
    })

    this.createExplosion(scene)
  }

  private createExplosion(scene: THREE.Scene): void {
    const particleCount = 40
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(particleCount * 3)

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = this.mesh.position.x + (Math.random() - 0.5) * 4
      positions[i * 3 + 1] = this.mesh.position.y + (Math.random() - 0.5) * 4
      positions[i * 3 + 2] = this.mesh.position.z + (Math.random() - 0.5) * 4
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const material = new THREE.PointsMaterial({
      color: 0xff4400,
      size: 0.6,
      transparent: true,
      opacity: 0.9
    })

    const particles = new THREE.Points(geometry, material)
    scene.add(particles)

    setTimeout(() => {
      scene.remove(particles)
      geometry.dispose()
      material.dispose()
    }, 2500)
  }

  public isDestroyed(): boolean {
    return this.destroyed
  }
}
