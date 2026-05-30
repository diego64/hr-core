/**
 * Seed idempotente para popular o Avaliacao Service com:
 *
 *   1. Um usuário AVALIADOR no Auth Service (Diana Reis — vinculada ao setor
 *      "Tecnologia"). Insere direto na collection `users` do hr-auth via
 *      mongo nativo + scrypt do auth-service (não passa pelo HTTP porque
 *      `POST /auth/register` só cria role USUARIO).
 *
 *   2. Cache local `funcionarios_cache` espelhando os 3 funcionários do
 *      seed do ms-funcionario (Ana=Tecnologia, Bruno=RH, Carla=Financeiro).
 *      Em produção isso virá via Kafka (FuncionarioCriado); aqui é manual.
 *
 *   3. Um `Avaliador` ativo (Diana → Tecnologia).
 *
 *   4. Duas avaliações de exemplo para Ana Lima (Tecnologia), criadas pela
 *      avaliadora Diana. Saída deterministicamente sequencial: AVAL000001 +
 *      AVAL000002 quando rodado em base vazia.
 *
 * Idempotente: tudo é upsert ou skip-on-exists.
 *
 * Variáveis necessárias (3 conexões mongo + scrypt):
 *   AUTH_MONGO_URL          mongodb://localhost:27017
 *   AUTH_MONGO_DB_NAME      hr-auth
 *   FUNC_MONGO_URL          mongodb://localhost:27018
 *   FUNC_MONGO_DB_NAME      hr-funcionarios
 *   MONGO_URL               mongodb://localhost:27020
 *   MONGO_DB_NAME           hr-avaliacao
 *   AUTH_SCRYPT_*           ver services/auth/.env.example (defaults aceitos)
 */
import { scryptSync, randomBytes } from 'node:crypto'

import { MongoClient, ObjectId } from 'mongodb'

import { connectMongo, closeMongo } from '../src/database/mongo.js'
import { gerarCodigoAvaliacao } from '../src/modules/domain/value-objects/codigo-avaliacao.js'
import { AvaliacaoRepository } from '../src/modules/repositories/avaliacao.repository.js'
import { AvaliadorRepository } from '../src/modules/repositories/avaliador.repository.js'
import { ContadorRepository } from '../src/modules/repositories/contador.repository.js'
import { FuncionarioCacheRepository } from '../src/modules/repositories/funcionario-cache.repository.js'

const AUTH_MONGO_URL = process.env.AUTH_MONGO_URL ?? 'mongodb://localhost:27017'
const AUTH_MONGO_DB_NAME = process.env.AUTH_MONGO_DB_NAME ?? 'hr-auth'
const FUNC_MONGO_URL = process.env.FUNC_MONGO_URL ?? 'mongodb://localhost:27018'
const FUNC_MONGO_DB_NAME = process.env.FUNC_MONGO_DB_NAME ?? 'hr-funcionarios'

// Parâmetros scrypt — devem casar com o que o auth-service espera. Defaults
// do auth-service: logN=15, r=8, p=1. Encoding em base64 (não hex).
const KEY_LENGTH = 64
const SALT_LENGTH = 16
const LOG_N = Number(process.env.AUTH_SCRYPT_LOG_N ?? '15')
const R = Number(process.env.AUTH_SCRYPT_R ?? '8')
const P = Number(process.env.AUTH_SCRYPT_P ?? '1')

/**
 * Mesmo formato do auth-service:
 *   scrypt$<logN>$<r>$<p>$<saltBase64>$<hashBase64>
 */
function hashPassword(plain: string): string {
  const params = { N: 2 ** LOG_N, r: R, p: P }
  const maxmem = 256 * params.N * params.r
  const salt = randomBytes(SALT_LENGTH)
  const derived = scryptSync(plain, salt, KEY_LENGTH, { ...params, maxmem })
  return `scrypt$${LOG_N}$${R}$${P}$${salt.toString('base64')}$${derived.toString('base64')}`
}

interface AuthUserDoc {
  _id: ObjectId
  email: string
  passwordHash: string
  roles: string[]
  active: boolean
  createdAt: Date
  updatedAt: Date
}

interface FuncionarioDoc {
  _id: ObjectId
  nome: string
  cpf: string
  codigoFun: string
  departamento: string
  status: string
}

const AVALIADOR_SEED = {
  email: 'diana.reis@hr-core.local',
  password: 'diana12345',
  nome: 'Diana Reis',
  setor: 'Tecnologia',
}

async function upsertAvaliadorUser(): Promise<string> {
  const client = new MongoClient(AUTH_MONGO_URL, { appName: 'hr-core-avaliacao-seed' })
  await client.connect()
  try {
    const collection = client.db(AUTH_MONGO_DB_NAME).collection<AuthUserDoc>('users')
    const existing = await collection.findOne({ email: AVALIADOR_SEED.email })
    if (existing) {
      console.log(
        `  ✓ usuario auth ja existe: ${AVALIADOR_SEED.email} (${existing._id.toHexString()})`,
      )
      return existing._id.toHexString()
    }
    const now = new Date()
    const doc: AuthUserDoc = {
      _id: new ObjectId(),
      email: AVALIADOR_SEED.email,
      passwordHash: hashPassword(AVALIADOR_SEED.password),
      roles: ['AVALIADOR'],
      active: true,
      createdAt: now,
      updatedAt: now,
    }
    await collection.insertOne(doc)
    console.log(`  ✓ usuario auth criado: ${AVALIADOR_SEED.email} (${doc._id.toHexString()})`)
    return doc._id.toHexString()
  } finally {
    await client.close()
  }
}

async function readFuncionarios(): Promise<FuncionarioDoc[]> {
  const client = new MongoClient(FUNC_MONGO_URL, { appName: 'hr-core-avaliacao-seed' })
  await client.connect()
  try {
    const col = client.db(FUNC_MONGO_DB_NAME).collection<FuncionarioDoc>('funcionarios')
    const docs = await col.find({}).sort({ createdAt: 1 }).toArray()
    return docs
  } finally {
    await client.close()
  }
}

async function run(): Promise<void> {
  console.log('→ ms-avaliacao seed')
  console.log('')

  console.log('1) Upsert do usuario AVALIADOR no auth-service')
  const usuarioId = await upsertAvaliadorUser()
  console.log('')

  console.log('2) Conectando no Mongo do ms-avaliacao')
  const db = await connectMongo()
  const cacheRepo = new FuncionarioCacheRepository(db)
  const avaliadorRepo = new AvaliadorRepository(db)
  const avaliacaoRepo = new AvaliacaoRepository(db)
  const contadorRepo = new ContadorRepository(db)

  console.log('3) Espelhando funcionarios do ms-funcionario em funcionarios_cache')
  const funcionarios = await readFuncionarios()
  if (funcionarios.length === 0) {
    console.log('  ⚠ Nenhum funcionario encontrado em ' + FUNC_MONGO_URL + '/' + FUNC_MONGO_DB_NAME)
    console.log('    Rode antes: pnpm --filter @hr-core/funcionario seed')
  }
  for (const f of funcionarios) {
    await cacheRepo.upsert({
      _id: f._id.toHexString(),
      codigoFun: f.codigoFun,
      nome: f.nome,
      setor: f.departamento,
      ativo: f.status !== 'DESLIGADO',
    })
    console.log(`  ✓ cache: ${f.codigoFun} (${f.nome} / ${f.departamento})`)
  }
  console.log('')

  console.log('4) Criando avaliador Diana Reis vinculado a Tecnologia')
  let avaliador = await avaliadorRepo.findByUsuarioId(usuarioId)
  if (!avaliador) {
    avaliador = await avaliadorRepo.create({
      usuarioId,
      nome: AVALIADOR_SEED.nome,
      email: AVALIADOR_SEED.email,
      setor: AVALIADOR_SEED.setor,
      criadoPor: 'seed',
    })
    console.log(`  ✓ avaliador criado: ${avaliador._id.toHexString()}`)
  } else {
    console.log(`  ✓ avaliador ja existia: ${avaliador._id.toHexString()}`)
  }
  console.log('')

  console.log('5) Criando 2 avaliacoes de exemplo para Ana Lima (Tecnologia)')
  const ana = funcionarios.find((f) => f.codigoFun === 'FUN11144477735')
  if (!ana) {
    console.log('  ⚠ Ana Lima nao encontrada — pulando avaliacoes de exemplo')
  } else if (avaliador) {
    const exemplosBase = [
      {
        titulo: 'Avaliação Semestral Q1 2026',
        comentario:
          'Demonstrou excelente capacidade técnica e colaboração com a equipe ao longo do período. ' +
          'Entregou os épicos do roadmap dentro do prazo e mentorou dois colegas júnior.',
        nota: 5 as const,
      },
      {
        titulo: 'Feedback Trimestral — Liderança Técnica',
        comentario:
          'Conduziu o desenho da arquitetura de microsserviços, alinhando squad e stakeholders. ' +
          'Pontos a evoluir: documentação dos ADRs e cadência de 1:1 com a squad.',
        nota: 4 as const,
      },
    ]

    // idempotente: identifica avaliações já criadas pelo seed via título exato.
    for (const exemplo of exemplosBase) {
      const existente = await db
        .collection('avaliacoes')
        .findOne({ avaliadorId: avaliador._id.toHexString(), titulo: exemplo.titulo })
      if (existente) {
        console.log(
          `  ✓ avaliacao ja existia: ${(existente as { codigo: string }).codigo} — ${exemplo.titulo}`,
        )
        continue
      }
      const sequencia = await contadorRepo.proximoValor('AVAL')
      const codigo = gerarCodigoAvaliacao(sequencia)
      const doc = await avaliacaoRepo.create({
        codigo,
        codigoFun: ana.codigoFun,
        funcionarioId: ana._id.toHexString(),
        avaliadorId: avaliador._id.toHexString(),
        setor: avaliador.setor,
        titulo: exemplo.titulo,
        comentario: exemplo.comentario,
        nota: exemplo.nota,
      })
      console.log(`  ✓ avaliacao criada: ${doc.codigo} — ${doc.titulo}`)
    }
  }
  console.log('')

  console.log('✓ seed concluido. Para autenticar como AVALIADOR:')
  console.log('')
  console.log('  curl -s -X POST http://localhost:4000/auth/login \\')
  console.log("    -H 'Content-Type: application/json' \\")
  console.log(
    `    -d '{"email":"${AVALIADOR_SEED.email}","password":"${AVALIADOR_SEED.password}"}'`,
  )
  console.log('')

  await closeMongo()
}

run().catch((err: unknown) => {
  console.error('✗ seed falhou:', err instanceof Error ? err.stack : err)
  process.exit(1)
})
