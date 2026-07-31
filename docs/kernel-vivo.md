# Kernel vivo do modo Realista

## Objetivo

O kernel vivo é a camada que controla o tempo e coordena os sistemas da simulação sem depender do React ou do Three.js.

A regra permanece:

> domínio e simulação decidem; Three.js representa.

A primeira integração real é o recebimento crescente. A cena continua consumindo `step`, `read` e `snapshot`, porém essas operações agora passam por `ReceivingKernelRuntime` e `LivingWorldKernel`.

## Relógio determinístico

O kernel trabalha com passo fixo, inicialmente em 30 Hz:

```text
1 tick = 1/30 segundo de simulação
```

O tempo recebido do navegador é acumulado e transformado em passos fixos. Portanto, divisões diferentes de frames produzem o mesmo número de ticks e o mesmo estado quando representam o mesmo tempo admitido.

O relógio oferece:

- pausa;
- retomada;
- avanço de um único tick;
- escala de tempo;
- limite de delta por frame;
- limite de subpassos para evitar espiral de atraso;
- registro de tempo descartado quando o limite de segurança é atingido.

## Sistemas

Cada domínio entra no kernel por um contrato comum:

```ts
interface KernelSystem {
  id: string
  step(context): void
  handleCommand?(command, context): void
  snapshot(): unknown
  restore(snapshot): void
}
```

O primeiro sistema registrado é `receiving`.

Sistemas futuros previstos:

- tarefas e workflows;
- recursos e reservas;
- navegação e tráfego;
- frota;
- docas e pátio;
- inventário visual;
- segurança;
- métricas.

## Comandos

Comandos podem ser imediatos ou agendados pelo tempo da simulação. Eles possuem:

- identificador sequencial;
- tipo;
- sistema de destino opcional;
- tempo de execução;
- payload serializável.

O reset do recebimento já utiliza o comando:

```text
receiving.reset
```

Comandos são executados no início do tick, antes do avanço dos sistemas. Isso impede alterações no meio de uma atualização.

## Eventos

O kernel mantém um log limitado e serializável. Cada evento contém:

- identificador;
- sequência;
- tipo;
- sistema de origem;
- tempo da simulação;
- tick;
- payload.

Eventos já publicados pelo recebimento:

- `receiving.transition`;
- `receiving.batch.started`;
- `receiving.reset`;
- `truck.phase.changed`;
- `truck.receiving.completed`;
- `pallet.registered`;
- `pallet.picked`;
- `pallet.staged`;
- `pallet.phase.changed`;
- `pallet.removed`;
- `safety.fault.activated`.

Eventos internos incluem registro de sistema, fila e execução de comandos, pausa, retomada, escala de tempo e descarte controlado de atraso.

## Experiência visual conectada

A telemetria do kernel aparece no modo Realista:

- velocidade de experiência em 1×, 2×, 4× e 8×;
- pausa e avanço manual de um tick;
- tick e tempo simulados;
- feed dos eventos logísticos recentes;
- progresso do caminhão atual;
- câmera cinematográfica, visão geral, acompanhamento da RX20 e câmera da doca.

A cena também possui trilha luminosa da RX20, beacon operacional, sinais pulsantes de doca, iluminação industrial e staging visível. Esses recursos não se tornam fonte da verdade; apenas representam dados do kernel e do sistema de recebimento.

## Snapshot e restauração

O checkpoint do kernel preserva:

- relógio;
- tick e acumulador;
- pausa e escala de tempo;
- sequências de comandos e eventos;
- comandos pendentes;
- log recente;
- snapshot de cada sistema registrado.

O sistema de recebimento é reconstruído deterministicamente pela quantidade de passos fixos desde o último reset. O estado reconstruído é comparado ao estado armazenado; divergência provoca erro em vez de aceitar um replay incorreto silenciosamente.

Essa estratégia é adequada para a primeira célula. Quando existirem tarefas externas, falhas injetadas e múltiplos sistemas, o motor de recebimento deverá ganhar checkpoint nativo de fila e ação em execução.

## Garantias cobertas por testes

- frames divididos de formas diferentes geram o mesmo estado;
- comando agendado executa no tick correto;
- pausa impede avanço por frame;
- passo manual avança exatamente um tick;
- checkpoint restaurado reproduz o mesmo futuro;
- recebimento publica eventos de coleta, staging e conclusão de caminhão;
- reset ocorre por comando do kernel;
- cenário crescente existente continua concluindo ciclos sem falha;
- lint, testes e build são validados pelo GitHub Actions.

## Limite atual

O kernel controla o tempo, comandos, eventos e snapshots, mas o interior de `ReceivingSimulation` ainda monta uma sequência cinemática de ações para cada lote.

Portanto, a etapa seguinte é substituir a coreografia antecipada por tarefas e recursos explícitos:

```text
caminhão → tarefa de descarga → RX20 → staging reservado
```

Depois:

```text
staging → TP-IN → buffer da rua A → retrátil → reserva
```

O caminhão deverá aguardar o encerramento das tarefas, e não o fim de uma lista previamente programada de movimentos.
