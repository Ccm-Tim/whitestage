import { openDB, type IDBPDatabase } from 'idb'
import type { Project } from '../core/types'

export interface ProjectRecord {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  json: Project
  thumb?: string
}

export interface AssetRecord {
  id: string
  projectId: string
  name: string
  type: string
  blob: Blob
}

const DB_NAME = 'whitestage'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase> | null = null

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('projects')) {
          database.createObjectStore('projects', { keyPath: 'id' })
        }
        if (!database.objectStoreNames.contains('settings')) {
          database.createObjectStore('settings', { keyPath: 'key' })
        }
        if (!database.objectStoreNames.contains('assets')) {
          const store = database.createObjectStore('assets', { keyPath: 'id' })
          store.createIndex('projectId', 'projectId')
        }
      },
    })
  }
  return dbPromise
}

export async function listProjects(): Promise<ProjectRecord[]> {
  const database = await db()
  const all = (await database.getAll('projects')) as ProjectRecord[]
  return all.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getProjectRecord(id: string): Promise<ProjectRecord | undefined> {
  const database = await db()
  return (await database.get('projects', id)) as ProjectRecord | undefined
}

export async function putProject(record: ProjectRecord): Promise<void> {
  const database = await db()
  await database.put('projects', record)
}

export async function deleteProjectRecord(id: string): Promise<void> {
  const database = await db()
  await database.delete('projects', id)
  // 一并清理该工程的资源
  try {
    const tx = database.transaction('assets', 'readwrite')
    const index = tx.store.index('projectId')
    let cursor = await index.openCursor(id)
    while (cursor) {
      await cursor.delete()
      cursor = await cursor.continue()
    }
    await tx.done
  } catch {
    /* 资源清理失败不阻塞主流程 */
  }
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const database = await db()
  const row = (await database.get('settings', key)) as { key: string; value: T } | undefined
  return row ? row.value : fallback
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const database = await db()
  await database.put('settings', { key, value })
}

export async function putAsset(asset: AssetRecord): Promise<void> {
  const database = await db()
  await database.put('assets', asset)
}

export async function getAsset(id: string): Promise<AssetRecord | undefined> {
  const database = await db()
  return (await database.get('assets', id)) as AssetRecord | undefined
}

export async function deleteAsset(id: string): Promise<void> {
  const database = await db()
  await database.delete('assets', id)
}

export async function listAssets(projectId: string): Promise<AssetRecord[]> {
  const database = await db()
  return (await database.getAllFromIndex('assets', 'projectId', projectId)) as AssetRecord[]
}
