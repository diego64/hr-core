/**
 * Seed idempotente para popular o Funcionario Service com 3 colaboradores
 * de teste. Usa exatamente os mesmos emails do seed do Auth — assim o JWT
 * de cada usuário corresponde a um registro real de funcionario:
 *
 *   Email (Auth + Funcionario)        | Role          | Cargo / Departamento
 *   ----------------------------------|---------------|---------------------------------
 *   ana.lima@hr-core.local            | ADMINISTRADOR | Desenvolvedora / Tecnologia
 *   bruno.costa@hr-core.local         | COORDENADOR   | Coordenador / Recursos Humanos
 *   carla.dias@hr-core.local          | USUARIO       | Analista / Financeiro
 *
 * Idempotente: usa o CPF (canônico, sem máscara) como chave de existência —
 * roda quantas vezes quiser sem duplicar. Os códigos FUN e HR são gerados
 * pelo service na primeira vez (FUN determinístico do CPF, HR sequencial
 * atômico via collection `contadores`).
 *
 * Como rodar:
 *   pnpm --filter @hr-core/funcionario seed
 *
 * O seed escreve direto no Mongo via repositórios — não passa pela API HTTP,
 * portanto não precisa de JWT. Os usuários do Auth Service (criados pelo
 * seed do auth) reutilizam essas credenciais para AUTENTICAR e fazer
 * o fluxo completo via HTTP. Veja a seção "Fluxo completo via HTTP" abaixo.
 *
 * Variáveis usadas: as mesmas do serviço (MONGO_URL, MONGO_DB_NAME, e as do
 * Zod schema de env). Aceita override pontual via services/funcionario/.env.
 */
import { closeMongo, connectMongo } from '../src/database/mongo.js'
import { LogEventPublisher } from '../src/infrastructure/messaging/event-publisher.js'
import { Cpf } from '../src/modules/domain/value-objects/cpf.js'
import { ContadorRepository } from '../src/modules/repositories/contador.repository.js'
import { FuncionarioRepository } from '../src/modules/repositories/funcionario.repository.js'
import { FuncionarioService } from '../src/modules/services/funcionario.service.js'

interface SeedFuncionario {
  readonly nome: string
  readonly cpf: string
  readonly email: string
  readonly telefone: string
  readonly cargo: string
  readonly departamento: string
  // Salário/dependentes viajam no evento FuncionarioCriado para o
  // ms-folha-pagamento. DEVEM bater com o SALARIOS_BASE do seed de
  // folha-pagamento (services/folha-pagamento/scripts/seed.ts) — ambos
  // são fonte dos mesmos 3 funcionários e precisam ficar idênticos.
  readonly salarioBase: number
  readonly numeroDependentes: number
}

const SEED_FUNCIONARIOS: readonly SeedFuncionario[] = [
  {
    nome: 'Ana Lima',
    cpf: '111.444.777-35',
    email: 'ana.lima@hr-core.local',
    telefone: '11999990001',
    cargo: 'Desenvolvedora',
    departamento: 'Tecnologia',
    salarioBase: 8_500,
    numeroDependentes: 1,
  },
  {
    nome: 'Bruno Costa',
    cpf: '529.982.247-25',
    email: 'bruno.costa@hr-core.local',
    telefone: '11999990002',
    cargo: 'Coordenador',
    departamento: 'Recursos Humanos',
    salarioBase: 7_200,
    numeroDependentes: 2,
  },
  {
    nome: 'Carla Dias',
    cpf: '123.456.789-09',
    email: 'carla.dias@hr-core.local',
    telefone: '11999990003',
    cargo: 'Analista',
    departamento: 'Financeiro',
    salarioBase: 5_500,
    numeroDependentes: 0,
  },
]

async function seed(): Promise<void> {
  console.log('→ conectando no MongoDB...')
  const db = await connectMongo()
  const repo = new FuncionarioRepository(db)
  const contadorRepo = new ContadorRepository(db)
  // Seed escreve direto no Mongo e não sobe Kafka — usa LogEventPublisher (só
  // loga o FuncionarioCriado em JSON). O publish é exigido pelo construtor do
  // service desde a implantação do event bus.
  const events = new LogEventPublisher(console as never)
  const service = new FuncionarioService(repo, contadorRepo, events)

  console.log('')
  console.log(
    '  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐',
  )
  console.log(
    '  │ Email                          │ CPF             │ Departamento       │ codigoFun        │ Status  │',
  )
  console.log(
    '  ├─────────────────────────────────────────────────────────────────────────────────────────────────────┤',
  )

  for (const f of SEED_FUNCIONARIOS) {
    const cpfCanonico = Cpf.sanitize(f.cpf)
    const existing = await repo.findByCpf(cpfCanonico)
    if (existing) {
      console.log(
        `  │ ${f.email.padEnd(30)} │ ${f.cpf.padEnd(15)} │ ${f.departamento.padEnd(18)} │ ${existing.codigoFun.padEnd(16)} │ skip    │`,
      )
      continue
    }

    // Service cria sempre PENDENTE. Como os 3 do seed são fixtures que devem
    // estar prontos para serem usados via API logo após o seed, promovemos
    // direto para ATIVO com snapshot eSocial completo, pulando o workflow
    // de upload + aprovação. Em produção esse atalho não existe.
    const created = await service.criar(f)
    await repo.atualizarValidacao(created.id, {
      score: 100,
      asoValido: true,
      ctpsDigital: true,
    })
    await repo.atualizarStatus(created.id, 'PENDENTE', 'EM_VALIDACAO')
    await repo.atualizarStatus(created.id, 'EM_VALIDACAO', 'APROVADO')
    await repo.atualizarStatus(created.id, 'APROVADO', 'ATIVO')
    console.log(
      `  │ ${created.email.padEnd(30)} │ ${f.cpf.padEnd(15)} │ ${created.departamento.padEnd(18)} │ ${created.codigoFun.padEnd(16)} │ created │`,
    )
  }

  console.log(
    '  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘',
  )
  console.log('')
  console.log('✓ seed concluído.')
  console.log('')
  console.log('  ╭─── Fluxo completo via HTTP ───────────────────────────────────────────────╮')
  console.log('  │ 1. Login no Auth Service (usa o seed do auth) — captura o accessToken:    │')
  console.log('  │    ACCESS_TOKEN=$(curl -s -X POST http://localhost:4000/auth/login \\      │')
  console.log("  │      -H 'Content-Type: application/json' \\                                │")
  console.log('  │      -d \'{"email":"ana.lima@hr-core.local","password":"ana12345"}\' \\   │')
  console.log('  │      | jq -r .accessToken)                                                │')
  console.log('  │                                                                           │')
  console.log('  │ 2. Listar funcionários (ADMINISTRADOR ou COORDENADOR):                    │')
  console.log('  │    curl -s http://localhost:3002/funcionarios \\                           │')
  console.log('  │      -H "Authorization: Bearer $ACCESS_TOKEN" | jq                        │')
  console.log('  │                                                                           │')
  console.log('  │ 3. Buscar por id (qualquer autenticado):                                  │')
  console.log('  │    curl -s http://localhost:3002/funcionarios/<id> \\                      │')
  console.log('  │      -H "Authorization: Bearer $ACCESS_TOKEN" | jq                        │')
  console.log('  ╰───────────────────────────────────────────────────────────────────────────╯')
  console.log('')

  await closeMongo()
}

seed().catch((err: unknown) => {
  console.error('✗ seed falhou:', err instanceof Error ? err.stack : err)
  process.exit(1)
})
