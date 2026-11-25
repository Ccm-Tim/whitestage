import * as THREE from 'three'
import type { WeaponConfig } from '../core/types'

function mesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const item = new THREE.Mesh(geometry, material)
  item.position.set(...position)
  item.rotation.set(...rotation)
  item.castShadow = true
  item.receiveShadow = true
  item.userData.part = 'weapon'
  parent.add(item)
  return item
}

export function buildWeapon(weapon: WeaponConfig): THREE.Group {
  const group = new THREE.Group()
  const steel = new THREE.MeshStandardMaterial({
    color: 0xd4d9df,
    roughness: 0.35,
    metalness: 0.55,
  })
  const dark = new THREE.MeshStandardMaterial({
    color: 0x2c3239,
    roughness: 0.5,
    metalness: 0.35,
  })
  const grip = new THREE.MeshStandardMaterial({ color: 0x6b4b35, roughness: 0.88 })
  const accent = new THREE.MeshStandardMaterial({ color: 0x8d969f, roughness: 0.45 })

  if (weapon.type === 'sword') {
    mesh(
      group,
      new THREE.CylinderGeometry(0.024, 0.028, 0.18, 12),
      grip,
      [0, 0, -0.02],
      [Math.PI / 2, 0, 0],
    )
    mesh(group, new THREE.SphereGeometry(0.04, 12, 10), dark, [0, 0, -0.12])
    mesh(group, new THREE.BoxGeometry(0.24, 0.05, 0.035), accent, [0, 0, 0.08])
    mesh(group, new THREE.BoxGeometry(0.06, 0.014, 0.74), steel, [0, 0, 0.47])
    mesh(
      group,
      new THREE.ConeGeometry(0.034, 0.12, 4),
      steel,
      [0, 0, 0.9],
      [Math.PI / 2, 0, Math.PI / 4],
    )
  } else if (weapon.type === 'staff') {
    mesh(
      group,
      new THREE.CylinderGeometry(0.023, 0.023, 1.8, 14),
      grip,
      [0, 0, 0.38],
      [Math.PI / 2, 0, 0],
    )
    for (const z of [-0.32, 0.08, 0.48]) {
      mesh(
        group,
        new THREE.CylinderGeometry(0.03, 0.03, 0.045, 14),
        dark,
        [0, 0, z],
        [Math.PI / 2, 0, 0],
      )
    }
  } else if (weapon.type === 'knife') {
    mesh(
      group,
      new THREE.CylinderGeometry(0.022, 0.026, 0.14, 12),
      grip,
      [0, 0, -0.02],
      [Math.PI / 2, 0, 0],
    )
    mesh(group, new THREE.BoxGeometry(0.13, 0.035, 0.025), accent, [0, 0, 0.07])
    mesh(group, new THREE.BoxGeometry(0.045, 0.012, 0.28), steel, [0, 0, 0.22])
    mesh(
      group,
      new THREE.ConeGeometry(0.025, 0.07, 4),
      steel,
      [0, 0, 0.39],
      [Math.PI / 2, 0, Math.PI / 4],
    )
  } else if (weapon.type === 'handblade') {
    mesh(group, new THREE.BoxGeometry(0.07, 0.035, 0.05), dark, [0, 0, 0.02])
    mesh(group, new THREE.BoxGeometry(0.05, 0.012, 0.36), steel, [0, 0, 0.22])
    mesh(
      group,
      new THREE.ConeGeometry(0.026, 0.08, 4),
      steel,
      [0, 0, 0.43],
      [Math.PI / 2, 0, Math.PI / 4],
    )
  } else if (weapon.type === 'pistol') {
    mesh(group, new THREE.BoxGeometry(0.06, 0.2, 0.09), grip, [0, -0.08, -0.02], [0.35, 0, 0])
    mesh(group, new THREE.BoxGeometry(0.07, 0.07, 0.28), dark, [0, 0.03, 0.1])
    mesh(
      group,
      new THREE.CylinderGeometry(0.018, 0.018, 0.12, 12),
      steel,
      [0, 0.03, 0.28],
      [Math.PI / 2, 0, 0],
    )
    mesh(group, new THREE.BoxGeometry(0.045, 0.025, 0.04), accent, [0, 0.08, -0.02])
  } else {
    mesh(group, new THREE.BoxGeometry(0.07, 0.1, 0.46), dark, [0, 0, 0.16])
    mesh(group, new THREE.BoxGeometry(0.06, 0.13, 0.32), grip, [0, -0.02, -0.28], [0.1, 0, 0])
    mesh(
      group,
      new THREE.CylinderGeometry(0.017, 0.017, 0.52, 12),
      steel,
      [0, 0.025, 0.62],
      [Math.PI / 2, 0, 0],
    )
    mesh(
      group,
      new THREE.CylinderGeometry(0.035, 0.035, 0.2, 14),
      accent,
      [0, 0.09, 0.1],
      [Math.PI / 2, 0, 0],
    )
    mesh(group, new THREE.BoxGeometry(0.045, 0.07, 0.08), grip, [0, -0.08, -0.1], [0.3, 0, 0])
    mesh(group, new THREE.BoxGeometry(0.05, 0.03, 0.14), dark, [0, -0.02, 0.05])
  }

  return group
}
