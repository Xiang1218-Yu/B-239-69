import * as THREE from 'three'
import * as CANNON from 'cannon-es'

export class Enemy {
  public mesh: THREE.Group
  public body: CANNON.Body
  public scoreValue: number = 250

  private hull: THREE.Mesh
  private turret: THREE.Mesh
  private barrel: THREE.Mesh
  private healthBarBg: THREE.Mesh
  private healthBar: THREE.Mesh

  private maxHealth: number = 100
  private currentHealth: number = 100
  private destroyed: boolean = false
  private speed: number = 8
  private rotationSpeed: number = 1.5
  private turretRotation: number = 0
  private shootCooldown: number = 0
  private shootInterval: number = 2
  private targetPosition: THREE.Vector3
  private wanderTimer: number = 0
  private wanderInterval: number = 3

  private tempDirection: THREE.Vector3
  private tempForward: THREE.Vector3
  private tempTurretDirection: THREE.Vector3
  private tempTurretForward: THREE.Vector3

  constructor(
    scene: THREE.Scene,
    world: CANNON.World,
    position: { x: number; y: number; z: number }
  ) {
    this.mesh = new THREE.Group()
    this.targetPosition = new THREE.Vector3()
    this.tempDirection = new THREE.Vector3()
    this.tempForward = new THREE.Vector3()
    this.tempTurretDirection = new THREE.Vector3()
    this.tempTurretForward = new THREE.Vector3()

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
      color: 0x6b0000,
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
      color: 0x3d0000,
      roughness: 0.4,
      metalness: 0.8
    })
    this.barrel = new THREE.Mesh(barrelGeometry, barrelMaterial)
    this.barrel.rotation.z = Math.PI / 2
    this.barrel.position.set(1.5, 0, 0)
    this.barrel.castShadow = true
    this.turret.add(this.barrel)

    this.addTracks()
    this.createHealthBar()

    this.mesh.position.set(position.x, position.y, position.z)
    scene.add(this.mesh)

    const shape = new CANNON.Box(new CANNON.Vec3(1.5, 0.75, 2))
    this.body = new CANNON.Body({
      mass: 1000,
      shape: shape,
      linearDamping: 0.9,
      angularDamping: 0.8,
      fixedRotation: false,
      allowSleep: false
    })
    this.body.position.set(position.x, position.y, position.z)
    this.body.angularFactor.set(0, 1, 0)
    world.addBody(this.body)

    this.setNewWanderTarget()
  }

  private addTracks(): void {
    const trackGeometry = new THREE.BoxGeometry(2.5, 0.5, 5)
    const trackMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a0000,
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

  private createHealthBar(): void {
    const barBgGeometry = new THREE.PlaneGeometry(3, 0.4)
    const barBgMaterial = new THREE.MeshBasicMaterial({
      color: 0x333333,
      side: THREE.DoubleSide,
      depthTest: false
    })
    this.healthBarBg = new THREE.Mesh(barBgGeometry, barBgMaterial)
    this.healthBarBg.position.set(0, 4, 0)
    this.mesh.add(this.healthBarBg)

    const barGeometry = new THREE.PlaneGeometry(2.8, 0.3)
    const barMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      side: THREE.DoubleSide,
      depthTest: false
    })
    this.healthBar = new THREE.Mesh(barGeometry, barMaterial)
    this.healthBar.position.set(0, 4, 0.01)
    this.mesh.add(this.healthBar)
  }

  private setNewWanderTarget(): void {
    const angle = Math.random() * Math.PI * 2
    const distance = 15 + Math.random() * 20
    this.targetPosition.set(
      this.mesh.position.x + Math.cos(angle) * distance,
      1,
      this.mesh.position.z + Math.sin(angle) * distance
    )
  }

  public update(
    deltaTime: number,
    playerPosition: THREE.Vector3 | null,
    camera: THREE.Camera
  ): void {
    if (this.destroyed) return

    const distanceToPlayer = playerPosition
      ? this.mesh.position.distanceTo(playerPosition)
      : 100

    let moveTarget: THREE.Vector3
    let chasePlayer = false

    if (playerPosition && distanceToPlayer < 40) {
      moveTarget = playerPosition
      chasePlayer = true
    } else {
      this.wanderTimer += deltaTime
      if (this.wanderTimer > this.wanderInterval) {
        this.wanderTimer = 0
        this.setNewWanderTarget()
      }
      moveTarget = this.targetPosition
    }

    this.tempDirection.subVectors(moveTarget, this.mesh.position)
    this.tempDirection.y = 0
    this.tempDirection.normalize()

    this.tempForward.set(0, 0, -1)
    this.tempForward.applyQuaternion(this.mesh.quaternion)

    const angleToTarget = Math.atan2(this.tempDirection.x, this.tempDirection.z)
    const currentAngle = Math.atan2(this.tempForward.x, this.tempForward.z)
    let angleDiff = angleToTarget - currentAngle

    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2

    if (Math.abs(angleDiff) > 0.1) {
      this.body.angularVelocity.y = angleDiff > 0 ? -this.rotationSpeed : this.rotationSpeed
    } else {
      this.body.angularVelocity.y = 0
    }

    if (Math.abs(angleDiff) < 0.5) {
      const moveSpeed = chasePlayer ? this.speed : this.speed * 0.6
      this.body.velocity.x = this.tempForward.x * moveSpeed
      this.body.velocity.z = this.tempForward.z * moveSpeed
    } else {
      this.body.velocity.x = 0
      this.body.velocity.z = 0
    }

    if (playerPosition) {
      this.tempTurretDirection.subVectors(playerPosition, this.mesh.position)
      this.tempTurretDirection.y = 0
      this.tempTurretDirection.normalize()

      this.tempTurretForward.set(1, 0, 0)
      this.tempTurretForward.applyQuaternion(this.turret.quaternion)

      const turretAngleToTarget = Math.atan2(this.tempTurretDirection.z, this.tempTurretDirection.x)
      const turretCurrentAngle = Math.atan2(this.tempTurretForward.z, this.tempTurretForward.x)
      let turretAngleDiff = turretAngleToTarget - turretCurrentAngle

      while (turretAngleDiff > Math.PI) turretAngleDiff -= Math.PI * 2
      while (turretAngleDiff < -Math.PI) turretAngleDiff += Math.PI * 2

      this.turretRotation += turretAngleDiff * 0.05
      this.turret.rotation.y = this.turretRotation
    }

    this.shootCooldown -= deltaTime

    this.mesh.position.copy(this.body.position as any)
    this.mesh.quaternion.copy(this.body.quaternion as any)

    this.healthBarBg.lookAt(camera.position)
    this.healthBar.lookAt(camera.position)

    const healthPercent = this.currentHealth / this.maxHealth
    this.healthBar.scale.x = healthPercent
    const healthMat = this.healthBar.material as THREE.MeshBasicMaterial
    if (healthPercent > 0.5) {
      healthMat.color.setHex(0x00ff00)
    } else if (healthPercent > 0.25) {
      healthMat.color.setHex(0xffff00)
    } else {
      healthMat.color.setHex(0xff0000)
    }
  }

  public checkHit(projectilePosition: THREE.Vector3): boolean {
    if (this.destroyed) return false
    const dx = this.mesh.position.x - projectilePosition.x
    const dz = this.mesh.position.z - projectilePosition.z
    return dx * dx + dz * dz < 4
  }

  public takeDamage(damage: number): boolean {
    if (this.destroyed) return false
    this.currentHealth -= damage
    return this.currentHealth <= 0
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
  }

  public isDestroyed(): boolean {
    return this.destroyed
  }

  public canShoot(): boolean {
    return this.shootCooldown <= 0 && !this.destroyed
  }

  public getShootPosition(): THREE.Vector3 {
    const barrelEnd = new THREE.Vector3(3, 0, 0)
    barrelEnd.applyQuaternion(this.turret.quaternion)
    barrelEnd.applyQuaternion(this.mesh.quaternion)
    barrelEnd.add(this.mesh.position)
    barrelEnd.y += 1.25
    return barrelEnd
  }

  public getShootDirection(): THREE.Vector3 {
    const direction = new THREE.Vector3(1, 0, 0)
    direction.applyQuaternion(this.turret.quaternion)
    direction.applyQuaternion(this.mesh.quaternion)
    direction.normalize()
    return direction
  }
}
