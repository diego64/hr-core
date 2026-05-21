import { MongoClient, type Db } from 'mongodb'

let client: MongoClient | null = null
let db: Db | null = null

export async function getTestDb(): Promise<Db> {
  if (db) return db
  const url = process.env.MONGO_URL ?? 'mongodb://localhost:27018'
  const name = process.env.MONGO_DB_NAME ?? 'hr-funcionarios-test'
  client = new MongoClient(url, { appName: 'hr-funcionarios-test', retryWrites: true })
  await client.connect()
  db = client.db(name)
  return db
}

export async function closeTestDb(): Promise<void> {
  if (client) {
    await client.close()
    client = null
    db = null
  }
}

export async function cleanCollections(database: Db): Promise<void> {
  const collections = await database.collections()
  await Promise.all(collections.map((c) => c.deleteMany({})))
}
