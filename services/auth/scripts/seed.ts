/**
 * Seed idempotente para popular o Auth Service com 3 perfis de teste:
 *   - ana.lima@hr-core.local    / ana12345    → role ADMINISTRADOR
 *   - bruno.costa@hr-core.local / bruno12345  → role COORDENADOR
 *   - carla.dias@hr-core.local  / carla12345  → role USUARIO
 *
 * Os mesmos 3 emails aparecem no seed do Funcionario Service, ligando o JWT
 * de cada usuário a um registro real de funcionario (Ana=Tecnologia,
 * Bruno=RH, Carla=Financeiro). Útil para exercitar o RBAC end-to-end.
 *
 * Idempotente: roda quantas vezes quiser sem duplicar (usa email único como
 * chave). Se o usuário já existe, pula. Útil em ambientes de dev/CI onde
 * o banco pode ser recriado várias vezes.
 *
 * Como rodar:
 *   pnpm --filter @hr-core/auth seed
 *
 * Variáveis usadas: as mesmas do serviço (MONGO_URL, MONGO_DB_NAME, AUTH_SCRYPT_*).
 * Aceita override pontual via .env do diretório (services/auth/.env).
 */
import { closeMongo, connectMongo } from '../src/database/mongo.js'
import { UserRepository } from '../src/modules/repositories/user.repository.js'
import { hashPassword } from '../src/modules/services/password.service.js'

interface SeedUser {
  readonly email: string
  readonly password: string
  readonly roles: string[]
  readonly label: string
}

const SEED_USERS: readonly SeedUser[] = [
  {
    email: 'ana.lima@hr-core.local',
    password: 'ana12345',
    roles: ['ADMINISTRADOR'],
    label: 'Ana Lima — Administradora (CRUD de usuários, operações elevadas)',
  },
  {
    email: 'bruno.costa@hr-core.local',
    password: 'bruno12345',
    roles: ['COORDENADOR'],
    label: 'Bruno Costa — Coordenador (aprovações de fluxo, relatórios da equipe)',
  },
  {
    email: 'carla.dias@hr-core.local',
    password: 'carla12345',
    roles: ['USUARIO'],
    label: 'Carla Dias — Usuária comum (operações do dia-a-dia)',
  },
]

async function seed(): Promise<void> {
  console.log('→ conectando no MongoDB...')
  const db = await connectMongo()
  const userRepo = new UserRepository(db)

  console.log('')
  console.log('  Senhas omitidas da tabela abaixo (defesa contra logging de credenciais).')
  console.log('  Valores literais estão no array SEED_USERS no topo deste arquivo.')
  console.log('')
  console.log('  ┌──────────────────────────────────────────────────────────────────────────┐')
  console.log('  │ Email                          │ Senha       │ Role           │ Status   │')
  console.log('  ├──────────────────────────────────────────────────────────────────────────┤')

  const MASKED = '*'.repeat(11)
  for (const seedUser of SEED_USERS) {
    const existing = await userRepo.findByEmail(seedUser.email)
    if (existing) {
      console.log(
        `  │ ${seedUser.email.padEnd(30)} │ ${MASKED} │ ${seedUser.roles[0]!.padEnd(14)} │ skip     │`,
      )
      continue
    }

    const passwordHash = await hashPassword(seedUser.password)
    await userRepo.create({
      email: seedUser.email,
      passwordHash,
      roles: seedUser.roles,
    })
    console.log(
      `  │ ${seedUser.email.padEnd(30)} │ ${MASKED} │ ${seedUser.roles[0]!.padEnd(14)} │ created  │`,
    )
  }

  console.log('  └──────────────────────────────────────────────────────────────────────────┘')
  console.log('')
  console.log('✓ seed concluído. Para autenticar:')
  console.log('')
  console.log('  curl -s -X POST http://localhost:4000/auth/login \\')
  console.log("    -H 'Content-Type: application/json' \\")
  console.log('    -d \'{"email":"ana.lima@hr-core.local","password":"ana12345"}\'')
  console.log('')

  await closeMongo()
}

seed().catch((err: unknown) => {
  console.error('✗ seed falhou:', err instanceof Error ? err.stack : err)
  process.exit(1)
})
