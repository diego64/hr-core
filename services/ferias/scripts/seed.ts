/**
 * Seed idempotente do Ferias Service. Espelha o padrão do ms-avaliacao.
 *
 * O que faz:
 *   1. Lê os 3 funcionários do ms-funcionario (Ana/Bruno/Carla)
 *   2. Cria PeriodoAquisitivo para cada um — dataInicio = 13 meses atrás
 *      garante que o status inicial é DISPONIVEL (período já maduro)
 *      com saldo cheio de 30 dias.
 *   3. Cria uma solicitação de férias PENDENTE de exemplo para Ana
 *      (Tecnologia), com dataInicio 45 dias no futuro.
 *
 * Idempotente: skip-on-exists baseado em (funcionarioId).
 *
 * Variáveis:
 *   FUNC_MONGO_URL          mongodb://localhost:27018
 *   FUNC_MONGO_DB_NAME      hr-funcionarios
 *   MONGO_URL               mongodb://localhost:27019
 *   MONGO_DB_NAME           hr-ferias
 */
import { MongoClient, type ObjectId } from 'mongodb'

import { closeMongo, connectMongo } from '../src/database/mongo.js'
import { gerarCodigoFerias } from '../src/modules/domain/value-objects/codigo-ferias.js'
import { ContadorRepository } from '../src/modules/repositories/contador.repository.js'
import { PeriodoAquisitivoRepository } from '../src/modules/repositories/periodo-aquisitivo.repository.js'
import { SolicitacaoFeriasRepository } from '../src/modules/repositories/solicitacao-ferias.repository.js'

const FUNC_MONGO_URL = process.env.FUNC_MONGO_URL ?? 'mongodb://localhost:27018'
const FUNC_MONGO_DB_NAME = process.env.FUNC_MONGO_DB_NAME ?? 'hr-funcionarios'

const DIA_MS = 24 * 60 * 60 * 1000

interface FuncionarioDoc {
  _id: ObjectId
  nome: string
  cpf: string
  codigoFun: string
  departamento: string
  status: string
}

async function readFuncionarios(): Promise<FuncionarioDoc[]> {
  const client = new MongoClient(FUNC_MONGO_URL, { appName: 'hr-core-ferias-seed' })
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

/**
 * Próxima data útil (Seg-Qui) ≥ 45 dias à frente — atende a antecedência
 * mínima de 30 dias e evita início em véspera de domingo (regra CLT do
 * service). Usa UTC para previsibilidade.
 */
function proximaDataValida(): { dataInicio: Date; dataFim: Date } {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 45)
  d.setUTCHours(0, 0, 0, 0)
  const day = d.getUTCDay()
  if (day === 0) d.setUTCDate(d.getUTCDate() + 1)
  else if (day === 5) d.setUTCDate(d.getUTCDate() + 3)
  else if (day === 6) d.setUTCDate(d.getUTCDate() + 2)
  const fim = new Date(d)
  fim.setUTCDate(fim.getUTCDate() + 13)
  fim.setUTCHours(23, 59, 59, 0)
  return { dataInicio: d, dataFim: fim }
}

async function run(): Promise<void> {
  console.log('→ ms-ferias seed')
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

  console.log('2) Conectando no Mongo do ms-ferias')
  const db = await connectMongo()
  const aquisitivoRepo = new PeriodoAquisitivoRepository(db)
  const solicRepo = new SolicitacaoFeriasRepository(db)
  const contadorRepo = new ContadorRepository(db)

  console.log('3) Upsert de PeriodoAquisitivo (dataInicio = 13 meses atrás → DISPONIVEL)')
  const periodos = new Map<string, ObjectId>()
  for (const f of funcionarios) {
    const funcionarioId = f._id.toHexString()
    const existente = await aquisitivoRepo.findVigentePorFuncionario(funcionarioId)
    if (existente) {
      periodos.set(funcionarioId, existente._id)
      console.log(
        `  ✓ periodo ja existe: ${f.nome} → ${existente._id.toHexString()} (${existente.status})`,
      )
      continue
    }
    const dataInicio = new Date(Date.now() - 13 * 30 * DIA_MS)
    const created = await aquisitivoRepo.create({
      funcionarioId,
      codigoFun: f.codigoFun,
      dataInicio,
    })
    periodos.set(funcionarioId, created._id)
    console.log(`  ✓ periodo criado: ${f.nome} → ${created._id.toHexString()} (${created.status})`)
  }
  console.log('')

  console.log('4) Criando solicitacao PENDENTE de exemplo para Ana Lima')
  const ana = funcionarios.find((f) => f.codigoFun === 'FUN11144477735')
  if (!ana) {
    console.log('  ⚠ Ana Lima nao encontrada — pulando')
  } else {
    const anaId = ana._id.toHexString()
    const aquisitivoId = periodos.get(anaId)
    if (!aquisitivoId) {
      console.log('  ⚠ PeriodoAquisitivo da Ana nao foi criado — pulando')
    } else {
      const existente = await db.collection('solicitacoes_ferias').findOne({
        funcionarioId: anaId,
        codigo: 'FER000001',
      })
      if (existente) {
        console.log(`  ✓ solicitacao ja existia: FER000001`)
      } else {
        const seq = await contadorRepo.proximoValor('FER')
        const codigo = gerarCodigoFerias(seq)
        const { dataInicio, dataFim } = proximaDataValida()
        const sol = await solicRepo.create({
          codigo,
          codigoFun: ana.codigoFun,
          funcionarioId: anaId,
          periodoAquisitivoId: aquisitivoId,
          dataInicio,
          dataFim,
          diasSolicitados: 14,
          abonoPecuniario: false,
          diasAbono: 0,
          solicitadoPor: 'seed',
        })
        console.log(
          `  ✓ solicitacao criada: ${sol.codigo} (${dataInicio.toISOString().slice(0, 10)} → ${dataFim.toISOString().slice(0, 10)})`,
        )
      }
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
