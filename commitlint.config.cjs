/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'subject-case': [2, 'never', ['upper-case', 'pascal-case', 'start-case']],
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [2, 'always', 120],
    'scope-case': [2, 'always', 'kebab-case'],
    'scope-enum': [
      2,
      'always',
      [
        // Microserviços
        'gateway',
        'auth',
        'funcionario',
        'ferias',
        'avaliacao',
        'folha-pagamento',
        'notification',
        'reports',
        'dashboard',

        // Pacotes compartilhados (packages/*)
        'kafka',
        'mongo',
        'logger',
        'jwt',
        'domain',
        'config',

        // Escopos meta (raiz do monorepo)
        'deps',
        'ci',
        'docs',
        'release',
        'workspace',
        'tooling',
      ],
    ],
  },
}
