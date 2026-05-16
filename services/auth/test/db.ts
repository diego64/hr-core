/**
 * Helpers de teste para o MongoDB. Conecta no Mongo de teste (banco
 * `hr-auth-test`) reutilizando o mesmo container do compose, e oferece
 * `cleanCollections` pra zerar o estado entre testes.
 *
 * Os testes presumem que o Mongo está acessível em `MONGO_URL` (default:
 * `mongodb://localhost:27017`) e que o banco `hr-auth-test` é exclusivo
 * para essa suite — `cleanCollections` apaga *todas* as collections.
 */
import { MongoClient, type Db } from 'mongodb'

let client: MongoClient | null = null
let db: Db | null = null

export async function getTestDb(): Promise<Db> {
  if (db) return db
  const url = process.env.MONGO_URL ?? 'mongodb://localhost:27017'
  const name = process.env.MONGO_DB_NAME ?? 'hr-auth-test'
  client = new MongoClient(url, { appName: 'hr-auth-test', retryWrites: true })
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
