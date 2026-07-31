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

O relógio oferece pausa, retomada, avanço de um único tick, escala de tempo e limites de segurança contra espiral de atraso.

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

O primeiro sistema registrado é `receiving`. Os próximos serão tarefas, recursos, reservas, navegação, tráfego, frota, segurança e métricas.

## Comandos e eventos

Comandos podem ser imediatos ou agendados pelo tempo da simulação. O reset do recebimento utiliza `receiving.reset`.

O kernel mantém eventos serializáveis com identificador, tipo, sistema de origem, tempo, tick e payload. O recebimento já publica transições, lotes, fases do caminhão, pallets registrados, coletados e depositados, conclusão de caminhões e falhas de segurança.

## Experiência visual conectada

A telemetria do kernel aparece no modo Realista:

- velocidade de experiência em 1×, 2×, 4× e 8×;
- pausa e avanço manual de um tick;
- tick e tempo simulados;
- feed dos eventos logísticos recentes;
- progresso do caminhão atual;
- câmera cinematográfica, visão geral, acompanhamento da RX20 e câmera da doca.

A cena também possui trilha luminosa da RX20, beacon operacional, sinais pulsantes de doca, iluminação industrial e staging visível. Esses recursos apenas representam dados do kernel e do sistema de recebimento.

## Snapshot e restauração

O checkpoint preserva relógio, tick, acumulador, pausa, escala de tempo, comandos pendentes, eventos e snapshot de cada sistema.

O recebimento é reconstruído deterministicamente pela quantidade de passos fixos desde o último reset. Divergência provoca erro em vez de aceitar replay incorreto silenciosamente.

## Garantias cobertas por testes

- frames divididos de formas diferentes geram o mesmo estado;
- comando agendado executa no tick correto;
- pausa impede avanço por frame;
- passo manual avança exatamente um tick;
- checkpoint restaurado reproduz o mesmo futuro;
- recebimento publica eventos de coleta, staging e conclusão de caminhão;
- cenário crescente continua concluindo ciclos sem falha;
- lint, testes e build são validados pelo GitHub Actions.

## Limite atual

O interior de `ReceivingSimulation` ainda monta uma sequência cinemática para cada lote. A próxima etapa substitui essa coreografia por tarefas e recursos explícitos:

```text
caminhão → tarefa de descarga → RX20 → staging reservado
staging → TP-IN → buffer da rua A → retrátil → reserva
```

O caminhão deverá aguardar o encerramento das tarefas, e não o fim de uma lista previamente programada de movimentos.
