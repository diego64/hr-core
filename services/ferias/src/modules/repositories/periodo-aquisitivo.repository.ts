import { ObjectId, type Collection, type Db } from 'mongodb'

import type {
  CreatePeriodoAquisitivoInput,
  PeriodoAquisitivo,
  PeriodoAquisitivoStatus,
} from '../domain/entities/periodo-aquisitivo.js'
import { addMeses } from '../domain/entities/periodo-aquisitivo.js'
import { CLT_CONSTANTES } from '../domain/clt-rules.js'

export class PeriodoAquisitivoRepository {
  private readonly collection: Collection<PeriodoAquisitivo>

  constructor(db: Db) {
    this.collection = db.collection<PeriodoAquisitivo>('periodos_aquisitivos')
  }

  /**
   * Cria o período aquisitivo. Calcula dataFim (dataInicio + 12 meses) e
   * dataLimiteGozo (dataFim + 12 meses) automaticamente. Status inicial é
   * EM_CURSO; quando atinge dataFim, jobs/services promovem para DISPONIVEL.
   */
  async create(input: CreatePeriodoAquisitivoInput): Promise<PeriodoAquisitivo> {
    const now = new Date()
    const diasDevidos = input.diasDevidos ?? CLT_CONSTANTES.DIAS_DIREITO
    const dataFim = addMeses(input.dataInicio, CLT_CONSTANTES.PERIODO_AQUISITIVO_MESES)
    const dataLimiteGozo = addMeses(dataFim, CLT_CONSTANTES.PERIODO_CONCESSIVO_MESES)
    const inicial: PeriodoAquisitivoStatus =
      dataFim.getTime() <= now.getTime() ? 'DISPONIVEL' : 'EM_CURSO'

    const document: PeriodoAquisitivo = {
      _id: new ObjectId(),
      funcionarioId: input.funcionarioId,
      codigoFun: input.codigoFun,
      dataInicio: input.dataInicio,
      dataFim,
      dataLimiteGozo,
      diasDevidos,
      diasGozados: 0,
      diasVendidos: 0,
      saldoDias: diasDevidos,
      status: inicial,
      createdAt: now,
      updatedAt: now,
    }
    await this.collection.insertOne(document)
    return document
  }

  async findById(id: string | ObjectId): Promise<PeriodoAquisitivo | null> {
    const oid = typeof id === 'string' ? new ObjectId(id) : id
    return this.collection.findOne({ _id: oid })
  }

  /**
   * Período vigente (DISPONIVEL ou EM_GOZO) — o que aceita solicitação.
   * Retorna o mais recente.
   */
  async findVigentePorFuncionario(funcionarioId: string): Promise<PeriodoAquisitivo | null> {
    return this.collection.findOne(
      { funcionarioId, status: { $in: ['DISPONIVEL', 'EM_GOZO'] } },
      { sort: { dataInicio: -1 } },
    )
  }

  async listPorFuncionario(funcionarioId: string): Promise<PeriodoAquisitivo[]> {
    return this.collection.find({ funcionarioId }).sort({ dataInicio: -1 }).toArray()
  }

  /**
   * Reduz saldo após aprovação (gozados += diasGozo, vendidos += diasAbono).
   * Filtro de status garante que não pisamos em período já encerrado.
   */
  async debitarSaldo(id: string | ObjectId, diasGozo: number, diasAbono: number): Promise<boolean> {
    const oid = typeof id === 'string' ? new ObjectId(id) : id
    const doc = await this.collection.findOne({ _id: oid })
    if (!doc) return false
    const novoGozados = doc.diasGozados + diasGozo
    const novoVendidos = doc.diasVendidos + diasAbono
    const novoSaldo = doc.diasDevidos - novoGozados - novoVendidos
    const result = await this.collection.updateOne(
      { _id: oid, status: { $in: ['DISPONIVEL', 'EM_GOZO'] } },
      {
        $set: {
          diasGozados: novoGozados,
          diasVendidos: novoVendidos,
          saldoDias: novoSaldo,
          status: novoSaldo > 0 ? 'EM_GOZO' : 'ENCERRADO',
          updatedAt: new Date(),
        },
      },
    )
    return result.modifiedCount === 1
  }

  /**
   * Reembolso ao cancelar uma solicitação aprovada (devolve dias ao saldo).
   */
  async creditarSaldo(
    id: string | ObjectId,
    diasGozo: number,
    diasAbono: number,
  ): Promise<boolean> {
    const oid = typeof id === 'string' ? new ObjectId(id) : id
    const doc = await this.collection.findOne({ _id: oid })
    if (!doc) return false
    const novoGozados = Math.max(0, doc.diasGozados - diasGozo)
    const novoVendidos = Math.max(0, doc.diasVendidos - diasAbono)
    const novoSaldo = doc.diasDevidos - novoGozados - novoVendidos
    // Reverter ENCERRADO → DISPONIVEL faz sentido só se ainda dentro do prazo.
    const podeVoltar = doc.dataLimiteGozo.getTime() > Date.now()
    const novoStatus = podeVoltar ? (novoSaldo > 0 ? 'DISPONIVEL' : doc.status) : doc.status
    const result = await this.collection.updateOne(
      { _id: oid },
      {
        $set: {
          diasGozados: novoGozados,
          diasVendidos: novoVendidos,
          saldoDias: novoSaldo,
          status: novoStatus,
          updatedAt: new Date(),
        },
      },
    )
    return result.modifiedCount === 1
  }

  async atualizarStatus(
    id: string | ObjectId,
    from: PeriodoAquisitivoStatus,
    to: PeriodoAquisitivoStatus,
  ): Promise<boolean> {
    const oid = typeof id === 'string' ? new ObjectId(id) : id
    const result = await this.collection.updateOne(
      { _id: oid, status: from },
      { $set: { status: to, updatedAt: new Date() } },
    )
    return result.modifiedCount === 1
  }

  /**
   * Para jobs: lista aquisitivos cuja dataFim já passou e ainda estão EM_CURSO
   * (para promover para DISPONIVEL).
   */
  async listarParaPromoverDisponivel(hoje: Date): Promise<PeriodoAquisitivo[]> {
    return this.collection.find({ status: 'EM_CURSO', dataFim: { $lte: hoje } }).toArray()
  }

  /**
   * Para jobs: aquisitivos vencidos (dataLimiteGozo < hoje, status não-VENCIDO/ENCERRADO).
   */
  async listarVencidos(hoje: Date): Promise<PeriodoAquisitivo[]> {
    return this.collection
      .find({
        status: { $in: ['EM_CURSO', 'DISPONIVEL', 'EM_GOZO'] },
        dataLimiteGozo: { $lt: hoje },
      })
      .toArray()
  }

  /**
   * Para jobs: aquisitivos com vencimento iminente (entre `diasAFrente` e
   * `diasAFrente + 1`), usado pra disparar PeriodoVencendo (30 dias antes).
   */
  async listarVencendoEm(hoje: Date, diasAFrente: number): Promise<PeriodoAquisitivo[]> {
    const ms = 24 * 60 * 60 * 1000
    const inicioJanela = new Date(hoje.getTime() + diasAFrente * ms)
    const fimJanela = new Date(inicioJanela.getTime() + ms)
    return this.collection
      .find({
        status: { $in: ['DISPONIVEL', 'EM_GOZO'] },
        dataLimiteGozo: { $gte: inicioJanela, $lt: fimJanela },
      })
      .toArray()
  }
}
