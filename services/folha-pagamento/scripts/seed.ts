/**
 * Seed idempotente do Folha de Pagamento Service.
 *
 * O que faz:
 *   1. Lê os 3 funcionários do ms-funcionario (Ana/Bruno/Carla)
 *   2. Popula `funcionarios_cache` espelhando os 3 com salários fictícios
 *      (em produção viria via Kafka FuncionarioCriado + SalarioAlterado).
 *   3. Cria uma folha mensal ABERTA de exemplo para Ana Lima na
 *      competência atual (mês corrente).
 *
 * Idempotente: skip-on-exists.
 *
 * Variáveis:
 *   FUNC_MONGO_URL          mongodb://localhost:27018
 *   FUNC_MONGO_DB_NAME      hr-funcionarios
 *   MONGO_URL               mongodb://localhost:27021
 *   MONGO_DB_NAME           hr-folha-pagamento
 */
import { MongoClient, type ObjectId } from 'mongodb'

import { closeMongo, connectMongo } from '../src/database/mongo.js'
import { gerarCodigoFolha } from '../src/modules/domain/value-objects/codigo-folha.js'
import { ContadorRepository } from '../src/modules/repositories/contador.repository.js'
import { FolhaRepository } from '../src/modules/repositories/folha.repository.js'
import { FuncionarioCacheRepository } from '../src/modules/repositories/funcionario-cache.repository.js'

const FUNC_MONGO_URL = process.env.FUNC_MONGO_URL ?? 'mongodb://localhost:27018'
const FUNC_MONGO_DB_NAME = process.env.FUNC_MONGO_DB_NAME ?? 'hr-funcionarios'

interface FuncionarioDoc {
  _id: ObjectId
  nome: string
  cpf: string
  codigoFun: string
  departamento: string
  status: string
}

/**
 * Salários fictícios por funcionário. Em produção viria do
 * SalarioAlterado event do ms-funcionario.
 *
 * DEVE bater com o fixture do seed de funcionario
 * (services/funcionario/scripts/seed.ts → SEED_FUNCIONARIOS), que publica
 * esses mesmos valores no evento FuncionarioCriado. Manter os dois idênticos.
 */
const SALARIOS_BASE: Readonly<Record<string, { salarioBase: number; numeroDependentes: number }>> =
  {
    FUN11144477735: { salarioBase: 8_500, numeroDependentes: 1 }, // Ana — Tecnologia
    FUN52998224725: { salarioBase: 7_200, numeroDependentes: 2 }, // Bruno — RH
    FUN12345678909: { salarioBase: 5_500, numeroDependentes: 0 }, // Carla — Financeiro
  }

async function readFuncionarios(): Promise<FuncionarioDoc[]> {
  const client = new MongoClient(FUNC_MONGO_URL, { appName: 'hr-core-folha-seed' })
  await client.connect()
  try {
    return await client
      .db(FUNC_MONGO_DB_NAME)
      .collection<FuncionarioDoc>('funcionarios')
      .find({})
      .sort({ createdAt: 1 })
      .toArray()
  } finally {
    await client.close()
  }
}

function competenciaAtual(): string {
  const d = new Date()
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${yyyy}-${mm}`
}

async function run(): Promise<void> {
  console.log('→ ms-folha-pagamento seed')
  console.log('')

  console.log('1) Lendo funcionarios do ms-funcionario')
  const funcionarios = await readFuncionarios()
  if (funcionarios.length === 0) {
    console.log(`  ⚠ Nenhum funcionario em ${FUNC_MONGO_URL}/${FUNC_MONGO_DB_NAME}`)
    console.log('    Rode antes: pnpm --filter @hr-core/funcionario seed')
    process.exit(0)
  }
  for (const f of funcionarios) {
    console.log(`  ✓ ${f.codigoFun} — ${f.nome} (${f.departamento})`)
  }
  console.log('')

  console.log('2) Conectando no Mongo do ms-folha-pagamento')
  const db = await connectMongo()
  const cacheRepo = new FuncionarioCacheRepository(db)
  const folhaRepo = new FolhaRepository(db)
  const contadorRepo = new ContadorRepository(db)

  console.log('3) Espelhando funcionarios em funcionarios_cache (com salários ficticios)')
  for (const f of funcionarios) {
    const salario = SALARIOS_BASE[f.codigoFun]
    if (!salario) {
      console.log(`  ⚠ ${f.codigoFun} sem salário definido no seed — pulando`)
      continue
    }
    await cacheRepo.upsert({
      funcionarioId: f._id.toHexString(),
      codigoFun: f.codigoFun,
      nome: f.nome,
      setor: f.departamento,
      salarioBase: salario.salarioBase,
      numeroDependentes: salario.numeroDependentes,
      ativo: f.status !== 'DESLIGADO',
    })
    console.log(
      `  ✓ cache: ${f.codigoFun} (${f.nome} / ${f.departamento}) — sal R$ ${salario.salarioBase.toFixed(2)}, ${salario.numeroDependentes} dep`,
    )
  }
  console.log('')

  console.log('4) Criando folha mensal ABERTA de exemplo para Ana Lima')
  const ana = funcionarios.find((f) => f.codigoFun === 'FUN11144477735')
  if (!ana) {
    console.log('  ⚠ Ana Lima nao encontrada — pulando')
  } else {
    const salarioAna = SALARIOS_BASE.FUN11144477735!
    const competencia = competenciaAtual()
    const existente = await folhaRepo.findByFuncionarioCompetencia(
      ana.codigoFun,
      'MENSAL',
      competencia,
    )
    if (existente) {
      console.log(`  ✓ folha ja existia: ${existente.codigo} (${competencia})`)
    } else {
      const seq = await contadorRepo.proximoValor('FOLHA')
      const codigo = gerarCodigoFolha(seq)
      const folha = await folhaRepo.create({
        codigo,
        codigoFun: ana.codigoFun,
        funcionarioId: ana._id.toHexString(),
        tipo: 'MENSAL',
        competencia,
        salarioBase: salarioAna.salarioBase,
        numeroDependentes: salarioAna.numeroDependentes,
        abertaPor: 'seed',
      })
      console.log(`  ✓ folha criada: ${folha.codigo} (${competencia}, status ${folha.status})`)
    }
  }
  console.log('')

  console.log('✓ seed concluido.')
  await closeMongo()
}

run().catch((err: unknown) => {
  console.error('✗ seed falhou:', err instanceof Error ? err.stack : err)
  process.exit(1)
})
