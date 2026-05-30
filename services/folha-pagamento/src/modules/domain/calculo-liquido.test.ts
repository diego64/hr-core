import { describe, expect, it } from 'vitest'

import { processarFolha } from './calculo-liquido.js'

describe('domain/processarFolha — orquestrador', () => {
  it('salário 5000 sem dependentes nem variáveis', () => {
    const r = processarFolha({
      salarioBase: 5_000,
      numeroDependentes: 0,
      proventos: [],
      descontos: [],
    })

    // INSS progressivo até 5.000:
    //   1.412 * 7,5%   = 105,90
    //   1.254,68 * 9%  = 112,9212
    //   1.333,35 * 12% = 160,002
    //   999,97 * 14%   = 139,9958
    //   Total ≈ 518,82
    expect(r.descontoINSS).toBeCloseTo(518.82, 2)
    // BaseIRRF = 5.000 - 518,82 = 4.481,18 → faixa 22,5%
    //   4.481,18 * 22,5% - 662,77 = 345,4955 → 345,50
    expect(r.descontoIRRF).toBeCloseTo(345.5, 2)
    expect(r.fgts).toBe(400) // 8% sobre 5.000
    expect(r.salarioBruto).toBe(5_000)
    expect(r.salarioLiquido).toBeCloseTo(5_000 - 518.82 - 345.5, 1)
  })

  it('injeta automaticamente Salário base (001), INSS (101) e IRRF (102)', () => {
    const r = processarFolha({
      salarioBase: 3_000,
      numeroDependentes: 0,
      proventos: [],
      descontos: [],
    })
    expect(r.proventos.some((p) => p.codigo === '001' && p.valor === 3_000)).toBe(true)
    expect(r.descontos.some((d) => d.codigo === '101')).toBe(true)
    expect(r.descontos.some((d) => d.codigo === '102')).toBe(true)
  })

  it('soma proventos variáveis no salário bruto antes do INSS', () => {
    // Salário 3.000 + Hora extra 500 = 3.500 bruto
    const r = processarFolha({
      salarioBase: 3_000,
      numeroDependentes: 0,
      proventos: [{ codigo: '002', descricao: 'Hora extra 50%', tipo: 'PROVENTO', valor: 500 }],
      descontos: [],
    })
    expect(r.salarioBruto).toBe(3_500)
    // INSS sobre 3.500
    //   1.412 * 7,5%   = 105,90
    //   1.254,68 * 9%  = 112,9212
    //   833,32 * 12%   = 99,9984
    //   Total ≈ 318,82
    expect(r.descontoINSS).toBeCloseTo(318.82, 2)
  })

  it('descontos variáveis somam ao total mas NÃO afetam base de INSS/IRRF', () => {
    const r = processarFolha({
      salarioBase: 5_000,
      numeroDependentes: 0,
      proventos: [],
      descontos: [{ codigo: '103', descricao: 'Vale transporte', tipo: 'DESCONTO', valor: 300 }],
    })
    expect(r.descontoINSS).toBeCloseTo(518.82, 2) // mesmo INSS de antes
    expect(r.totalDescontos).toBeCloseTo(518.82 + 345.5 + 300, 1)
  })

  it('ignora lançamento manual de verbas automáticas (001, 101, 102)', () => {
    const r = processarFolha({
      salarioBase: 3_000,
      numeroDependentes: 0,
      proventos: [
        { codigo: '001', descricao: 'Tentativa de inflar', tipo: 'PROVENTO', valor: 9_999 },
      ],
      descontos: [{ codigo: '101', descricao: 'INSS fake', tipo: 'DESCONTO', valor: 9_999 }],
    })
    // Salário base recalculado a partir do cache (3.000), não dos 9.999
    expect(r.proventos.filter((p) => p.codigo === '001')).toHaveLength(1)
    expect(r.proventos.find((p) => p.codigo === '001')?.valor).toBe(3_000)
    // INSS recalculado, ignora o 9.999 fake
    expect(r.descontos.filter((d) => d.codigo === '101')).toHaveLength(1)
    expect(r.descontoINSS).toBeLessThan(500)
  })

  it('dependentes reduzem o IRRF', () => {
    const semDep = processarFolha({
      salarioBase: 4_000,
      numeroDependentes: 0,
      proventos: [],
      descontos: [],
    })
    const com2 = processarFolha({
      salarioBase: 4_000,
      numeroDependentes: 2,
      proventos: [],
      descontos: [],
    })
    expect(com2.descontoIRRF).toBeLessThan(semDep.descontoIRRF)
    // INSS não muda com dependentes
    expect(com2.descontoINSS).toBe(semDep.descontoINSS)
  })

  it('rejeita salário base negativo', () => {
    expect(() =>
      processarFolha({
        salarioBase: -1,
        numeroDependentes: 0,
        proventos: [],
        descontos: [],
      }),
    ).toThrow(/salarioBase/)
  })
})
