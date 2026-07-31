# Kernel vivo do modo Realista

## Objetivo

O kernel controla tempo, comandos, eventos e sistemas da simulação sem depender do React ou do Three.js.

> domínio e simulação decidem; Three.js representa.

## Relógio

Passo fixo determinístico em 30 Hz, com pausa, retomada, passo manual, escala de tempo e proteção contra espiral de atraso.

## Sistemas

```ts
interface KernelSystem {
  id: string
  step(context): void
  handleCommand?(command, context): void
  snapshot(): unknown
  restore(snapshot): void
}
```

O primeiro sistema é `receiving`. Os próximos são tarefas, recursos, reservas, navegação, tráfego, frota, segurança e métricas.

## Comandos e eventos

Comandos são imediatos ou agendados. Eventos possuem ID, tipo, origem, tempo, tick e payload. O recebimento publica transições, lotes, fases do caminhão, pallets registrados, coletados e depositados, conclusão e falhas de segurança.

## Experiência visual

- velocidades 1×, 2×, 4× e 8×;
- pausa e passo manual;
- tick, tempo e eventos ao vivo;
- progresso do caminhão;
- câmeras cinema, geral, RX20 e doca;
- trilha, beacon, sinais de doca, iluminação e staging visível.

A cena representa dados do kernel; não é fonte da verdade.

## Snapshot

Preserva relógio, comandos, eventos e estado dos sistemas. A reconstrução do recebimento é verificada deterministicamente.

## Testes

Determinismo entre frames, comandos agendados, pausa, passo manual, restauração, eventos de recebimento e ciclos sem falha. Lint, testes e build validados no GitHub Actions.

## Próximo passo

Substituir a coreografia interna por tarefas e recursos explícitos:

```text
caminhão → tarefa de descarga → RX20 → staging reservado
staging → TP-IN → buffer da rua A → retrátil → reserva
```
