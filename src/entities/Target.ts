import * as THREE from 'three'
import * as CANNON from 'cannon-es'

export enum TargetType {
  Static = 'static',
  Moving = 'moving',
  Bonus = 'bonus'
}

export class Target {
  public mesh: THREE.Mesh
  public body: CANNON.Body
  public targetType: TargetType
  public scoreValue: number
  private destroyed: boolean = false

  private moveSpeed: number = 0
  private moveRange: number = 0
  private moveAxis: 'x' | 'z' = 'x'
  private moveDirection: number = 1
  private startPosition: { x: number; z: number }
  private elapsedTime: number = 0
  private bobSpeed: number = 0
  private bobHeight: number = 0

  constructor(
    scene: THREE.Scene,
    world: CANNON.World,
    position: { x: number; y: number; z: number },
    type: TargetType = TargetType.Static
  ) {
    this.targetType = type
    this.startPosition = { x: position.x, z: position.z }

    let geometry: THREE.BufferGeometry
    let material: THREE.MeshStandardMaterial
    let hitRadius: number

    switch (type) {
      case TargetType.Bonus:
        geometry = new THREE.OctahedronGeometry(1.2, 0)
        material = new THREE.MeshStandardMaterial({
          color: 0xffd700,
          emissive: 0xffa500,
          emissiveIntensity: 0.4,
          roughness: 0.3,
          metalness: 0.8
        })
        this.scoreValue = 300
        hitRadius = 1.8
        this.bobSpeed = 2.0
        this.bobHeight = 0.5
        break

      case TargetType.Moving:
        geometry = new THREE.BoxGeometry(1.8, 1.8, 1.8)
        material = new THREE.MeshStandardMaterial({
          color: 0xcc4444,
          roughness: 0.6,
          metalness: 0.3
        })
        this.scoreValue = 150
        hitRadius = 1.5
        this.moveSpeed = 3 + Math.random() * 4
        this.moveRange = 8 + Math.random() * 8
        this.moveAxis = Math.random() > 0.5 ? 'x' : 'z'
        this.moveDirection = Math.random() > 0.5 ? 1 : -1
        break

      default:
        geometry = new THREE.BoxGeometry(2, 2, 2)
        material = new THREE.MeshStandardMaterial({
          color: 0x8b4513,
          roughness: 0.8,
          metalness: 0.1
        })
        this.scoreValue = 100
        hitRadius = 1.5
        break
    }

    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.position.set(position.x, position.y, position.z)
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    scene.add(this.mesh)

    if (type === TargetType.Bonus) {
      const ringGeo = new THREE.TorusGeometry(1.6, 0.08, 8, 32)
      const ringMat = new THREE.MeshStandardMaterial({
        color: 0xffd700,
        emissive: 0xffa500,
        emissiveIntensity: 0.6,
        metalness: 0.9,
        roughness: 0.1
      })
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.rotation.x = Math.PI / 2
      this.mesh.add(ring)

      const light = new THREE.PointLight(0xffd700, 1.5, 8)
      light.position.y = 0.5
      this.mesh.add(light)
    }

    const shape = new CANNON.Box(new CANNON.Vec3(hitRadius, hitRadius, hitRadius))
    this.body = new CANNON.Body({
      mass: type === TargetType.Moving ? 50 : 100,
      shape: shape
    })
    this.body.position.set(position.x, position.y, position.z)
    world.addBody(this.body)
  }

  public update(deltaTime: number = 0.016): void {
    if (this.destroyed) return

    this.elapsedTime += deltaTime

    if (this.targetType === TargetType.Moving) {
      const axis = this.moveAxis
      const currentPos = axis === 'x' ? this.mesh.position.x : this.mesh.position.z
      const startPos = axis === 'x' ? this.startPosition.x : this.startPosition.z

      if (Math.abs(currentPos - startPos) > this.moveRange) {
        this.moveDirection *= -1
      }

      const velocity = this.moveSpeed * this.moveDirection
      if (axis === 'x') {
        this.body.velocity.x = velocity
      } else {
        this.body.velocity.z = velocity
      }
    }

    if (this.targetType === TargetType.Bonus) {
      const bobY = 1 + Math.sin(this.elapsedTime * this.bobSpeed) * this.bobHeight
      this.body.position.y = bobY
      this.mesh.rotation.y += deltaTime * 1.5
    }

    this.mesh.position.copy(this.body.position as any)
    this.mesh.quaternion.copy(this.body.quaternion as any)
  }

  public checkHit(projectilePosition: THREE.Vector3): boolean {
    if (this.destroyed) return false
    const distance = this.mesh.position.distanceTo(projectilePosition)
    return distance < 2.0
  }

  public destroy(scene: THREE.Scene, world: CANNON.World): void {
    if (this.destroyed) return

    this.destroyed = true

    this.createDestroyEffect(scene)

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

  private createDestroyEffect(scene: THREE.Scene): void {
    const particleCount = this.targetType === TargetType.Bonus ? 30 : 15
    const color = this.targetType === TargetType.Bonus ? 0xffd700 : 0xff6633
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(particleCount * 3)

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = this.mesh.position.x + (Math.random() - 0.5) * 3
      positions[i * 3 + 1] = this.mesh.position.y + (Math.random() - 0.5) * 3
      positions[i * 3 + 2] = this.mesh.position.z + (Math.random() - 0.5) * 3
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const material = new THREE.PointsMaterial({
      color: color,
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
    }, 1500)
  }

  public isDestroyed(): boolean {
    return this.destroyed
  }
}
