# Plano Majestade — evolução do modo Realista

## Decisão arquitetural

O modo Realista evolui como um sistema de simulação logística, não como uma sequência crescente de cenas versionadas.

> domínio e simulação decidem; Three.js representa.

## Entregue

### Fundação configurável

- cenários padrão, compacto e crescente independentes;
- `ReceivingScenarioConfig` explícito;
- pallets identificados por ID estável;
- capacidade e persistência do staging como regras do cenário;
- remoção de mutações globais e alterações de `prototype`.

### Kernel vivo

- passo fixo determinístico em 30 Hz;
- pausa, retomada, passo manual e escala de tempo;
- comandos imediatos ou agendados;
- eventos serializáveis com tempo e tick;
- snapshots e restauração;
- contrato comum para novos sistemas;
- recebimento crescente conectado ao kernel.

### Experiência visual perceptível

- ritmo padrão 2× e controles 1×, 2×, 4× e 8×;
- câmera cinema, visão geral, acompanhamento da RX20 e câmera da doca;
- HUD com progresso, telemetria, velocidade e eventos ao vivo;
- trilha luminosa, beacon operacional e sinais pulsantes de doca;
- iluminação industrial, slots de staging e corredor da TP-IN destacados;
- caminhão visualmente enriquecido.

## Próximas fases

### Fase 2 — Tarefas em vez de coreografia

```text
created → waiting-resources → assigned → executing → completed
```

- veículo recebe tarefa, não lista global de movimentos;
- origem e destino são reservados;
- tarefa aguarda quando staging ou buffer está ocupado;
- falha não apaga pallet nem missão.

### Fase 3 — Primeira cadeia viva

```text
caminhão → RX20 → staging → TP-IN → buffer da rua A → retrátil → reserva
```

- TP-IN só recebe tarefa após depósito no staging;
- retrátil só recebe tarefa após chegada ao buffer;
- caminhão só sai após descarga concluída;
- segundo caminhão não exige reescrever coreografia.

### Fase 4 — Grafo operacional e tráfego

- nós para docas, cruzamentos, ruas, buffers e posições;
- sentidos e veículos permitidos;
- velocidade por zona;
- reservas curtas de segmentos;
- espera segura e recuperação de deadlock.

### Fase 5 — Reintegração do cérebro industrial

Adaptar `industrialWarehouseBrain` e `fleetDispatchBrain`, preservando papéis, territórios, buffers, prioridade, distância, congestionamento, justificativas e Monte Carlo opcional.

### Fase 6 — Fluxo ponta a ponta

Expandir para recebimento, putaway, reposição, picking, consolidação, pré-embarque, carregamento e expedição.

## Regras de engenharia

- não criar versões permanentes `RealisticWorldV5`, `V6`;
- não alterar protótipos durante imports;
- não usar Three.js como fonte da verdade;
- não misturar estoque oficial com inventário demonstrativo;
- não adicionar física pesada antes de grafo, tarefas e reservas;
- manter renderização por refs e snapshots limitados.

## Definição de pronto

- caminhão sai porque o processo terminou;
- veículo se move porque recebeu tarefa válida;
- pallet possui cadeia de eventos reproduzível;
- gargalos alteram o restante da operação;
- novos veículos entram sem reescrever roteiros.
