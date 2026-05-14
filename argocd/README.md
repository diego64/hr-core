# argocd/

Configuração GitOps do HR Core via **Argo CD**. Toda alteração em `main` que afete
`manifests/**` é sincronizada automaticamente para o cluster pelo Argo CD — sem
`kubectl apply` manual em produção.

## Estrutura

```
argocd/
├── README.md
├── projects/
│   └── hr-core.yaml              # AppProject — restringe sources/destinations/recursos
└── applications/
    ├── root.yaml                 # App-of-Apps — sincroniza tudo em applications/
    └── api-gateway-dev.yaml      # Application do api-gateway no overlay dev
```

## Padrão App-of-Apps

Um único `Application` chamado **`root`** observa o diretório `argocd/applications/`
e cria automaticamente um `Application` para cada arquivo YAML lá dentro. Novo
serviço/ambiente = novo arquivo em `argocd/applications/` + merge em `main`. O root
sincroniza sozinho, sem `kubectl apply` extra.

```
                          ┌──────────────────────────┐
                          │  Application: root       │
                          │  source: argocd/         │
                          │          applications/   │
                          └──────────┬───────────────┘
                                     │ sincroniza recursivamente
            ┌────────────────────────┼────────────────────────┐
            ▼                        ▼                        ▼
   Application:                Application:            Application:
   api-gateway-dev             auth-dev                ferias-dev
   (manifests/api-             (manifests/auth/        ...
    gateway/overlays/dev)       overlays/dev)
```

## Bootstrap inicial (passos manuais — uma vez por cluster)

```bash
# 1. Instalar o Argo CD (se ainda não estiver instalado).
kubectl create namespace argocd
kubectl apply -n argocd -f \
  https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# 2. Aguardar componentes ficarem prontos
kubectl -n argocd wait --for=condition=available --timeout=300s deployment --all

# 3. Acessar a UI (port-forward em dev)
kubectl -n argocd port-forward svc/argocd-server 8080:443
# UI: https://localhost:8080
# Usuário inicial: admin
# Senha inicial:
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d ; echo

# 4. Aplicar AppProject e o App-of-Apps
kubectl apply -f argocd/projects/hr-core.yaml
kubectl apply -f argocd/applications/root.yaml

# A partir daqui, o root sincroniza tudo automaticamente.
# Verificar status:
kubectl -n argocd get applications
```

## Política de sync

Todos os `Application` deste projeto usam **sync automatizado** com:

| Opção             | Valor | Por quê                                          |
| ----------------- | ----- | ------------------------------------------------ |
| `automated`       | true  | Deploy contínuo — Git é fonte da verdade         |
| `prune`           | true  | Remove recursos que saem do Git                  |
| `selfHeal`        | true  | Reverte alterações manuais no cluster            |
| `allowEmpty`      | false | Evita prune acidental se o diretório ficar vazio |
| `CreateNamespace` | true  | Cria namespace se não existir (idempotente)      |
| `ServerSideApply` | true  | Field ownership coerente com kubectl moderno     |
| `retry`           | 5×    | Backoff exponencial até 3min                     |

### Por que `selfHeal=true`

Em GitOps puro, **Git é fonte da verdade**. Se alguém aplica `kubectl edit` direto no
cluster, o Argo CD desfaz em segundos. Pra fazer mudança "permanente", commitar no Git.

### Por que `revisionHistoryLimit=5`

Argo CD mantém histórico para permitir rollback rápido pela UI. Cinco revisões é
suficiente — mais infla o etcd sem ganho prático.

## AppProject `hr-core`

Restringe o que cada `Application` pode fazer:

- **`sourceRepos`**: apenas `github.com/diego64/hr-core.git` — impede que alguém crie
  um App apontando para um fork malicioso
- **`destinations`**: apenas namespaces `hr-core`, `hr-core-dev` e `argocd` no cluster
  in-cluster — impede deploy em namespaces críticos (`kube-system`, `default`)
- **`clusterResourceWhitelist`**: só `Namespace` — impede que um App crie
  `ClusterRoleBinding` ou outros recursos cluster-scoped sensíveis
- **`namespaceResourceWhitelist`**: lista explícita de tipos permitidos (Deployment,
  Service, Ingress, ConfigMap, Secret, NetworkPolicy, etc.). Bloqueia coisas tipo
  `Role`/`RoleBinding` por padrão — adicionar se necessário

## Atualizando um serviço

### Mudança de manifest

```bash
git switch -c feature/gateway/ajustar-recursos
$EDITOR manifests/api-gateway/overlays/dev/patches/deployment-patch.yaml
git commit -am "refactor(gateway): ajustar limits de memória em dev"
git push -u origin HEAD
gh pr create   # template padrão de PR é injetado
# Após merge em main → Argo CD detecta em ~3min → sync automático
```

### Mudança de imagem (tag)

Hoje a tag em `dev` é `dev-latest` (configurável). Recomendado em prod:

1. **CI commita o tag** após push da imagem:

   ```bash
   # GitHub Action atualiza o kustomization.yaml com o SHA
   yq -i '.images[0].newTag = "${{ github.sha }}"' \
     manifests/api-gateway/overlays/prod/kustomization.yaml
   git commit -am "build(gateway): bump image to ${{ github.sha }}"
   git push
   ```

2. **Argo CD Image Updater** observa o registry e cria PR automaticamente. Instalação:
   ```bash
   kubectl apply -n argocd -f \
     https://raw.githubusercontent.com/argoproj-labs/argocd-image-updater/stable/manifests/install.yaml
   ```
   Depois anotar o `Application` com `argocd-image-updater.argoproj.io/image-list:`.

## Rollback

```bash
# Via CLI
argocd app history api-gateway-dev
argocd app rollback api-gateway-dev <revision-id>

# Via Git (preferido — mantém history alinhado)
git revert <bad-commit>
git push
# Argo CD sincroniza o revert em segundos
```

## Troubleshooting

| Sintoma                                     | Verificação                                                                 |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| App fica `OutOfSync` permanente             | `argocd app diff api-gateway-dev` — algo mutou no cluster fora do Git       |
| `Sync failed: rpc error`                    | `argocd app get api-gateway-dev` — ver `conditions`                         |
| Pod não sobe                                | `kubectl -n hr-core-dev describe pod -l app.kubernetes.io/name=api-gateway` |
| Imagem não pulla                            | Confirmar tag em `kustomization.yaml` e que existe no registry              |
| Secret missing                              | Criar Secret real (ver `manifests/README.md`)                               |
| Namespace label `pod-security` bloqueia pod | Pod tem que rodar como non-root (já configurado no deployment)              |

## Próximos passos (roadmap)

- [ ] Overlay de `production` (`overlays/prod/`) + `argocd/applications/api-gateway-prod.yaml`
- [ ] Aplicações para os outros microsserviços (`auth`, `funcionario`, `ferias`, ...)
- [ ] Argo CD Image Updater para tag automático em dev/prod
- [ ] Sync windows na AppProject (bloquear deploy em prod fora do horário comercial)
- [ ] SealedSecrets controller no cluster + secrets sealed commitados em `manifests/<servico>/overlays/*/secrets/`
- [ ] HorizontalPodAutoscaler no overlay de prod
- [ ] ServiceMonitor (prometheus-operator) em vez de annotations de scrape
