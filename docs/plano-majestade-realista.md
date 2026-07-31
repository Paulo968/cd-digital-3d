# Plano Majestade — evolução do modo Realista

## Decisão arquitetural

O modo Realista evolui como um sistema de simulação logística, não como uma sequência crescente de cenas versionadas.

A regra central passa a ser:

> domínio e simulação decidem; Three.js representa.

A primeira entrega substituiu alterações globais de constantes e `prototype` por configurações explícitas de cenário. Os recebimentos padrão, compacto e crescente coexistem sem depender da ordem de imports.

A segunda entrega introduziu o kernel vivo e conectou o recebimento crescente a ele.

## Fundação entregue

- `ReceivingScenarioConfig` concentra dimensões, velocidades, capacidades e estratégias de trajetória;
- `ReceivingSimulation` recebe o cenário no construtor;
- pallets são acoplados e desacoplados por identificador, não pela posição circunstancial no array;
- capacidade e persistência do staging são regras do cenário;
- curvas de aproximação e retorno são resolvidas no início real da ação;
- layouts compacto e crescente deixaram de modificar `RECEIVING_V2` e `ReceivingSimulation.prototype`;
- a cena ativa usa uma fábrica explícita do cenário crescente;
- testes validam a coexistência dos cenários e a preservação de pallets entre caminhões.

## Kernel vivo entregue

- relógio determinístico com passo fixo de 30 Hz;
- pausa, retomada, escala de tempo e avanço de um tick;
- fila de comandos imediatos ou agendados;
- execução de comandos no início do tick;
- registro limitado de eventos serializáveis;
- snapshots do relógio, comandos, eventos e sistemas;
- restauração com reprodução determinística do mesmo futuro;
- contrato comum para novos sistemas;
- sistema `receiving` conectado ao kernel;
- eventos de transição, caminhão, pallet, lote, reset e falha;
- cena existente avançando pelo runtime do kernel sem depender do React para decidir o tempo.

A especificação está em [`docs/kernel-vivo.md`](kernel-vivo.md).

## Próximas fases

### Fase 2 — Tarefas em vez de coreografia

Representar descarga, transferência e armazenagem como tarefas com estados:

```text
created → waiting-resources → assigned → executing → completed
```

Critérios:

- veículo recebe tarefa, não uma lista global pré-montada;
- origem e destino são reservados;
- tarefa aguarda quando staging ou buffer está ocupado;
- falha não apaga pallet nem missão.

### Fase 3 — Primeira cadeia viva

Implementar:

```text
caminhão → RX20 → staging → TP-IN → buffer da rua A → retrátil → reserva
```

Critérios:

- TP-IN só recebe tarefa depois do depósito no staging;
- retrátil só recebe tarefa depois da chegada ao buffer;
- caminhão só sai depois da descarga concluída;
- nenhuma etapa depende de temporizador usado como confirmação logística;
- segundo caminhão não exige editar a coreografia da RX20.

### Fase 4 — Grafo operacional e tráfego

Gerar nós e conexões para docas, cruzamentos, ruas, buffers e posições. Separar planejamento lógico de rota da suavização visual da trajetória.

Critérios:

- sentidos e tipos de veículo permitidos;
- velocidade por zona;
- reserva curta de segmentos e cruzamentos;
- espera segura;
- detecção e recuperação de deadlock.

### Fase 5 — Reintegração do cérebro industrial

Adaptar `industrialWarehouseBrain` e `fleetDispatchBrain` ao novo kernel.

Preservar:

- papéis e territórios;
- buffers físicos;
- prioridade, distância e congestionamento;
- justificativa das decisões;
- cenários operacionais;
- Monte Carlo como estratégia opcional.

Remover:

- estado global fora do mundo;
- escrita direta e acoplada em múltiplos stores;
- decisões dependentes de tempo do navegador;
- telemetria usada como fonte de verdade da operação.

### Fase 6 — Fluxo ponta a ponta

Expandir progressivamente para recebimento, putaway, reposição, picking, consolidação, pré-embarque, carregamento e expedição.

Cada etapa deve entrar como workflow e publicar eventos rastreáveis.

## Regras de engenharia

- não criar `RealisticWorldV5`, `V6` ou novas versões como arquitetura permanente;
- não alterar protótipos durante imports;
- não usar objetos Three.js como fonte da verdade;
- não misturar estoque oficial com inventário demonstrativo;
- não adicionar física rígida pesada antes de existir grafo, tarefas e reservas;
- não colocar Monte Carlo como decisor principal antes de rollouts sobre cópias reais do estado;
- manter renderização por refs e snapshots limitados para proteger desempenho.

## Métricas da majestade

- throughput por hora simulada;
- tempo de ciclo por processo;
- distância vazia e carregada;
- utilização por equipamento;
- tempo em fila;
- ocupação de staging e buffers;
- bloqueios, paradas e deadlocks;
- tarefas concluídas, atrasadas e replanejadas;
- explicação de cada designação.

## Definição de pronto

O modo será considerado uma operação viva quando:

- o caminhão sair porque o processo terminou, não porque a animação acabou;
- o veículo se mover porque recebeu uma tarefa válida;
- cada pallet possuir uma cadeia de eventos reproduzível;
- gargalos alterarem o comportamento do restante da operação;
- novos veículos e caminhões entrarem sem reescrever roteiros existentes.
