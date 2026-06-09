import * as THREE from 'three'
import * as CANNON from 'cannon-es'

export class Projectile {
  public mesh: THREE.Mesh
  public body: CANNON.Body
  private lifeTime: number = 0
  private maxLifeTime: number = 3
  private trail: THREE.Line | null = null
  private trailPoints: THREE.Vector3[] = []
  private projectileColor: number

  constructor(
    scene: THREE.Scene,
    world: CANNON.World,
    position: THREE.Vector3,
    direction: THREE.Vector3,
    color: number = 0xffb82e
  ) {
    this.projectileColor = color

    const geometry = new THREE.SphereGeometry(0.15, 6, 6)
    const emissiveColor = color === 0xff3333 ? 0xff0000 : 0xff8800
    const material = new THREE.MeshStandardMaterial({
      color: color,
      emissive: emissiveColor,
      emissiveIntensity: 0.8,
      metalness: 0.8,
      roughness: 0.2
    })
    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.position.copy(position)
    this.mesh.castShadow = false
    scene.add(this.mesh)

    const shape = new CANNON.Sphere(0.15)
    this.body = new CANNON.Body({
      mass: 5,
      shape: shape,
      linearDamping: 0.01
    })
    this.body.position.set(position.x, position.y, position.z)

    const speed = 80
    this.body.velocity.set(
      direction.x * speed,
      direction.y * speed,
      direction.z * speed
    )

    world.addBody(this.body)
  }

  public update(deltaTime: number): void {
    this.lifeTime += deltaTime

    this.mesh.position.copy(this.body.position as any)
    this.mesh.quaternion.copy(this.body.quaternion as any)

    if (this.trail) {
      this.trailPoints.push(this.mesh.position.clone())

      if (this.trailPoints.length > 10) {
        this.trailPoints.shift()
      }

      const positions = new Float32Array(this.trailPoints.length * 3)
      this.trailPoints.forEach((point, i) => {
        positions[i * 3] = point.x
        positions[i * 3 + 1] = point.y
        positions[i * 3 + 2] = point.z
      })

      this.trail.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      this.trail.geometry.attributes.position.needsUpdate = true
    }
  }

  public enableTrail(scene: THREE.Scene): void {
    if (this.trail) return
    const geometry = new THREE.BufferGeometry()
    const material = new THREE.LineBasicMaterial({
      color: this.projectileColor,
      transparent: true,
      opacity: 0.5
    })
    this.trail = new THREE.Line(geometry, material)
    scene.add(this.trail)
  }

  public shouldRemove(): boolean {
    return this.lifeTime > this.maxLifeTime || this.mesh.position.y < -10
  }

  public destroy(scene: THREE.Scene, world: CANNON.World): void {
    scene.remove(this.mesh)
    world.removeBody(this.body)

    if (this.trail) {
      scene.remove(this.trail)
      this.trail.geometry.dispose()
      if (!Array.isArray(this.trail.material)) {
        this.trail.material.dispose()
      }
    }

    this.mesh.geometry.dispose()
    if (!Array.isArray(this.mesh.material)) {
      this.mesh.material.dispose()
    }
  }
}
