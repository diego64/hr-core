import { MongoClient, type Db } from 'mongodb'

import { env } from '../config/env.js'

let client: MongoClient | null = null
let db: Db | null = null

export async function connectMongo(): Promise<Db> {
  if (db) return db
  client = new MongoClient(env.MONGO_URL, {
    appName: 'hr-core-auth',
    retryWrites: true,
  })
  await client.connect()
  db = client.db(env.MONGO_DB_NAME)
  await ensureIndexes(db)
  return db
}

export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close()
    client = null
    db = null
  }
}

export function getDb(): Db {
  if (!db) {
    throw new Error('MongoDB not connected — call connectMongo() before getDb()')
  }
  return db
}

async function ensureIndexes(database: Db): Promise<void> {
  // users — email único, busca por id
  await database.collection('users').createIndexes([
    { key: { email: 1 }, unique: true, name: 'users_email_unique' },
    { key: { createdAt: -1 }, name: 'users_created_at' },
  ])

  // refresh_tokens —
  //   jtiHash único para lookup constante em refresh
  //   userId para revogação em cascata
  //   expiresAt com TTL: o MongoDB remove docs automaticamente após expiração
  await database.collection('refresh_tokens').createIndexes([
    { key: { jtiHash: 1 }, unique: true, name: 'refresh_tokens_jti_hash_unique' },
    { key: { userId: 1 }, name: 'refresh_tokens_user_id' },
    {
      key: { expiresAt: 1 },
      name: 'refresh_tokens_ttl',
      expireAfterSeconds: 0,
    },
  ])
}
