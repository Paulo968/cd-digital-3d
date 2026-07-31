# Plano Majestade — evolução do modo Realista

## Regra central

> domínio e simulação decidem; Three.js representa.

## Entregue

### Fundação configurável

- cenários padrão, compacto e crescente independentes;
- `ReceivingScenarioConfig` explícito;
- pallets identificados por ID estável;
- capacidade e persistência do staging como regras;
- remoção de mutações globais e alterações de `prototype`.

### Kernel vivo

- passo fixo determinístico em 30 Hz;
- pausa, retomada, passo manual e escala de tempo;
- comandos imediatos ou agendados;
- eventos serializáveis com tempo e tick;
- snapshots e restauração;
- contrato para novos sistemas;
- recebimento conectado ao kernel.

### Experiência visual

- ritmo padrão 2× e controles 1×, 2×, 4× e 8×;
- câmeras cinema, geral, acompanhamento da RX20 e doca;
- HUD com progresso, telemetria e eventos ao vivo;
- trilha luminosa, beacon e sinais pulsantes;
- iluminação industrial, staging e corredor TP-IN destacados;
- caminhão visualmente enriquecido.

## Próximas fases

### Tarefas e recursos

```text
created → waiting-resources → assigned → executing → completed
```

O veículo recebe tarefa, origem e destino são reservados e bloqueios mantêm a missão aguardando sem perder o pallet.

### Primeira cadeia viva

```text
caminhão → RX20 → staging → TP-IN → buffer da rua A → retrátil → reserva
```

### Grafo e tráfego

Nós, sentidos, velocidade por zona, reservas curtas, espera segura e recuperação de deadlock.

### Cérebro industrial

Adaptar `industrialWarehouseBrain` e `fleetDispatchBrain`, preservando papéis, territórios, buffers, prioridade, distância, congestionamento e Monte Carlo opcional.

### Fluxo ponta a ponta

Recebimento, putaway, reposição, picking, consolidação, pré-embarque, carregamento e expedição.

## Regras

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
