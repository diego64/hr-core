# manifests/

Manifestos Kubernetes do HR Core, organizados por serviço, em **Kustomize**.

## Estrutura

```
manifests/
├── api-gateway/
│   ├── base/                       # manifestos canônicos, sem env-specifics
│   │   ├── kustomization.yaml
│   │   ├── serviceaccount.yaml
│   │   ├── configmap.yaml          # envs não-sensíveis
│   │   ├── secret.example.yaml     # template — NÃO referenciado pelo kustomize
│   │   ├── deployment.yaml         # pods, probes, recursos, security context
│   │   ├── service.yaml            # ClusterIP :80 → pod :3000
│   │   ├── ingress.yaml            # ingress-nginx, host placeholder
│   │   ├── networkpolicy.yaml      # ingress só do ingress-nginx, egress controlado
│   │   └── poddisruptionbudget.yaml
│   └── overlays/
│       └── dev/
│           ├── kustomization.yaml
│           ├── namespace.yaml      # hr-core-dev
│           └── patches/
│               ├── deployment-patch.yaml   # 1 réplica, recursos baixos
│               ├── ingress-patch.yaml      # api-gateway.dev.hr-core.local
│               └── configmap-patch.yaml    # LOG_LEVEL=debug, CORS aberto, etc.
└── auth/
    ├── base/
    │   ├── kustomization.yaml
    │   ├── serviceaccount.yaml
    │   ├── configmap.yaml          # MongoDB URL, JWT issuer/audience, scrypt params
    │   ├── secret.example.yaml     # template — chave RSA fica em Secret externo
    │   ├── deployment.yaml         # 2 réplicas, monta /keys via Secret
    │   ├── service.yaml            # ClusterIP :80 → pod :4000
    │   ├── networkpolicy.yaml      # ingress de ingress-nginx + pods hr-core + prometheus
    │   └── poddisruptionbudget.yaml
    └── overlays/
        └── dev/
            ├── kustomization.yaml
            └── patches/
                ├── deployment-patch.yaml   # 1 réplica, recursos baixos
                └── configmap-patch.yaml    # LOG_LEVEL=debug, CORS aberto, scrypt log_n=12
```

> **Nota**: o auth NÃO declara `Ingress` no base — em dev acessa-se via port-forward; em prod, configurar um Ingress separado se quiser expor `/auth/login` direto, ou rotear via api-gateway.

## Comandos

```bash
# Renderizar (preview do que será aplicado)
kubectl kustomize manifests/api-gateway/overlays/dev

# Aplicar em um cluster (sem Argo CD, dev local com kind/minikube/k3d)
kubectl apply -k manifests/api-gateway/overlays/dev

# Diff contra o cluster
kubectl diff -k manifests/api-gateway/overlays/dev

# Remover (cuidado — `--prune` é necessário para limpar tudo)
kubectl delete -k manifests/api-gateway/overlays/dev
```

> **Em produção, NÃO use `kubectl apply` direto** — deixe o Argo CD sincronizar. Ver [`argocd/README.md`](../argocd/README.md).

## Convenções

### Labels padrão (Kubernetes recommended labels)

Aplicadas pelo `base/kustomization.yaml` em todos os recursos:

- `app.kubernetes.io/name: api-gateway`
- `app.kubernetes.io/component: gateway`
- `app.kubernetes.io/part-of: hr-core`
- `app.kubernetes.io/managed-by: kustomize`

Overlays adicionam:

- `app.kubernetes.io/environment: dev|staging|prod`

### Imagem

`image:` no `deployment.yaml` aponta para `ghcr.io/diego64/hr-core/api-gateway:latest`
(placeholder). Em cada overlay, o tag é fixado via `images:` no `kustomization.yaml`:

```yaml
images:
  - name: ghcr.io/diego64/hr-core/api-gateway
    newTag: dev-latest # ou um SHA específico para imutabilidade
```

Em produção, o tag deve ser **sempre um SHA de commit** (imutável), substituído pelo
pipeline de CI (push de tag) ou pelo Argo CD Image Updater.

### Segredos

`base/secret.example.yaml` é **apenas template**, não está em `resources:`. O Secret real
é criado fora do Git, via uma das opções:

1. **Sealed Secrets** (Bitnami) — encriptado e commitado, decrypted pelo controller
2. **External Secrets Operator** — busca de Vault / AWS Secrets Manager / GCP Secret Manager
3. **SOPS** com `kustomize.config.k8s.io/v1beta1` + secretGenerator + plugin
4. **Dev local manual**:
   ```bash
   kubectl -n hr-core-dev create secret generic api-gateway \
     --from-literal=AUTH_JWKS_URL='http://auth.hr-core-dev.svc.cluster.local:4000/.well-known/jwks.json' \
     --dry-run=client -o yaml | kubectl apply -f -
   ```

O `Application` Argo CD (`argocd/applications/api-gateway-dev.yaml`) tem
`ignoreDifferences` no Secret `api-gateway` para que mudanças no Secret externo não
marquem o App como `OutOfSync`.

### Pod Security

Namespaces usam labels `pod-security.kubernetes.io/{enforce,audit,warn}: restricted`
— o Pod Security Standard "restricted" rejeita pods que rodam como root, com
capabilities, sem readOnlyRootFilesystem, etc. O deployment já cumpre o standard.

### NetworkPolicy

Default-deny implícito (presença de uma policy com `policyTypes` que liste a direção).
Permite explicitamente:

- **Ingress**: tráfego do `ingress-nginx` (porta 3000) e do `prometheus` (porta 3000)
- **Egress**: DNS interno (kube-dns), microsserviços no mesmo namespace, OTel Collector
  na `observability`, HTTPS externo (porta 443) para JWKS do Auth Service

Se o cluster não tiver um CNI que implementa NetworkPolicy (Calico, Cilium, etc.),
a policy é silenciosamente ignorada — **verifique** antes de assumir isolamento.

### Probes

- `livenessProbe` em `/health` — kubelet mata o container se falhar
- `readinessProbe` em `/ready` — service não roteia se falhar
- `startupProbe` em `/health` — janela inicial maior para boot (até 60s)

> Atenção: `/ready` hoje é estático (no Roadmap do gateway: validar JWKS + downstreams).
> Quando isso for implementado, `readinessProbe` passa a ser sensível a dependências.

## Adicionando um novo serviço

```
manifests/
└── <novo-servico>/
    ├── base/
    │   ├── kustomization.yaml
    │   └── ...
    └── overlays/
        └── dev/
            ├── kustomization.yaml
            └── patches/
```

Depois:

1. Criar `argocd/applications/<novo-servico>-dev.yaml`
2. O App-of-Apps (`argocd/applications/root.yaml`) detecta e sincroniza
   automaticamente — sem ação manual extra
3. Atualizar o `AppProject` em `argocd/projects/hr-core.yaml` se o serviço
   precisar de um recurso/namespace fora da allowlist atual
