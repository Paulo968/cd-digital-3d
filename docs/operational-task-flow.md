# Fluxo operacional determinístico

## Autoridade da operação

O modo Realista separa três responsabilidades:

1. o sistema de tarefas cria demanda e reserva recursos;
2. a autoridade operacional libera ou bloqueia a execução;
3. o motor de recebimento movimenta a RX20 somente quando autorizado.

Sem tarefa atribuída, recurso reservado ou destino válido, a RX20 permanece parada. A chegada e a saída do caminhão continuam independentes da autorização da empilhadeira.

## Descarga

```text
pallet no caminhão
  → tarefa criada
  → vaga de staging reservada
  → RX20 reservada
  → tarefa executando
  → pallet depositado
  → tarefa concluída
```

## Putaway da Rua A

Quando uma tarefa de descarga termina, nasce uma unidade de putaway:

```text
staging
  → TP-IN
  → buffer da Rua A
  → retrátil REACH-PUT
  → endereço A-XX-XX
```

O buffer possui capacidade finita. Quando está cheio, a TP-IN aguarda e publica um evento de bloqueio. A retrátil libera a posição somente depois de concluir o armazenamento.

## Estado atual

A descarga da RX20 possui movimento físico no mundo 3D. O putaway já possui tarefas, recursos, tempos, buffer, endereços, eventos, snapshots e telemetria determinísticos, mas TP-IN e retrátil ainda não possuem movimento visual conectado ao estado do domínio.

## Próximos passos

- representar TP-IN e REACH-PUT na cena usando o estado do kernel;
- remover visualmente o pallet do staging quando a TP-IN confirmar a coleta;
- materializar o pallet no buffer e depois no endereço reservado;
- liberar a ocupação real do staging para fluxo contínuo de longo prazo;
- adicionar métricas de tempo de ciclo, fila e utilização por recurso.
