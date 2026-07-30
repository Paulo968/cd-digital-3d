# Central Operacional Viva

## Objetivo

A central operacional torna visível a inteligência que já existia por baixo do modo realista. Em vez de mostrar somente veículos em movimento, a interface apresenta pedidos, missões, decisões da frota, quantidades, eventos de segurança e o ciclo da doca.

A camada continua sendo exclusivamente demonstrativa. Ela não altera o estoque oficial, não confirma movimentação física e não envia comando para equipamentos reais.

## Fonte única da telemetria

O painel não calcula números paralelos nem inventa indicadores a partir da animação. O store `operationsControlStore` recebe eventos produzidos pelo mesmo cérebro que cria pedidos e missões:

- pallet recebido;
- pedido criado;
- missão criada;
- veículo designado;
- missão iniciada e concluída;
- risco ou avaria ativados;
- pallet embarcado;
- caminhão liberado e novo ciclo iniciado.

As métricas são recalculadas a partir dos pallets acompanhados pela operação automática, dos pedidos, das missões e dos veículos registrados durante a sessão. Elas não representam o saldo total de todos os endereços estáticos do galpão.

## Indicadores apresentados

- pedidos abertos e criados;
- missões ativas e concluídas;
- unidades monitoradas em reserva;
- unidades monitoradas em picking;
- unidades no caminhão;
- pallets e unidades expedidos;
- veículos trabalhando e ociosos;
- eventos de segurança e avarias;
- fase e número do ciclo do caminhão.

O painel também mostra o inventário monitorado com SKU, saldo, capacidade e ponto de reposição, as filas recentes de pedidos e missões, além do histórico de eventos da sessão.

## Explicação das decisões

Ao selecionar um equipamento, o despachante registra uma justificativa legível. A explicação considera:

- compatibilidade do veículo com a função;
- distância vazia até a origem;
- preferência de cabeceira;
- congestionamento compartilhado fora dos pontos críticos;
- reserva de origem, destino e cruzamentos.

Exemplo conceitual:

```text
EMP-02 designada
Compatível com armazenagem
8,2 m até a origem
Preferência pela cabeceira direita
Rota sem conflito relevante
```

A justificativa é explicativa, não uma prova matemática de ótimo global.

## Cenários controláveis

### Operação normal

Equilibra entrada, armazenagem, reposição e pedidos.

### Alta demanda

Reduz o intervalo entre pedidos, permite mais ordens abertas e aumenta a pressão sobre picking e expedição.

### Recebimento intenso

Acelera a chegada de pallets e revela gargalos em recebimento, espera e reserva.

### Expedição intensa

Acelera pedidos e reduz o tempo mínimo de permanência da carga antes da saída. Também apresenta fila maior de caminhões no desktop.

### Corredor bloqueado

Mantém uma barreira virtual ativa até a troca do cenário. Os sensores provocam frenagem e espera; ainda não existe recálculo automático da rota ao redor de um obstáculo surgido depois da saída.

### Falha de equipamento

Reduz o intervalo entre avarias demonstrativas. A missão e a carga permanecem preservadas durante a parada.

### Ruptura no picking

Aumenta o alvo de abastecimento e a prioridade das missões de reposição.

### Equipe reduzida

EMP-02 e TP-02 deixam de receber novas tarefas. Uma missão que já estivesse em andamento pode terminar antes da indisponibilidade operacional completa, evitando teletransporte ou abandono de carga.

## Comandos manuais de segurança

O painel permite provocar:

- travessia de pedestre;
- surgimento de obstáculo;
- avaria de um equipamento em movimento.

Esses comandos alimentam os mesmos atores e registros usados pelos cenários automáticos.

## Estoque quantitativo demonstrativo

Cada unidade logística acompanhada pela operação automática recebe de forma determinística:

- pallet identificado;
- SKU;
- descrição;
- quantidade de unidades;
- capacidade;
- ponto de reposição;
- zona e posição atuais;
- pedido pendente, quando existir.

Pallets que já começam em reserva ou picking são registrados como estoque inicial observado, sem fabricar um evento de recebimento. Novos pallets `LIVE-IN-*` aumentam o contador de entrada somente quando realmente surgem no recebimento da simulação.

Os pedidos também recebem quantidade. A contabilização de unidades expedidas usa a demanda registrada no pedido; quando não existe pedido quantitativo, utiliza o conteúdo conhecido do pallet como referência.

### Limite da unidade logística

A animação continua movimentando o pallet inteiro. A camada quantitativa representa o conteúdo associado à unidade logística e a demanda do pedido, mas ainda não anima separação de caixas ou unidades dentro do pallet. Portanto, esta etapa não deve ser apresentada como um motor completo de case picking ou piece picking.

## Ciclo vivo dos caminhões

Quando a carga é liberada:

1. a carroceria fecha;
2. o caminhão sai da doca;
3. permanece um intervalo fora da operação interna;
4. o próximo caminhão se aproxima;
5. a carroceria abre somente depois de estacionar;
6. missões de expedição voltam a ser despachadas.

Enquanto a doca está sem caminhão, pedidos e missões podem permanecer na fila, mas nenhum veículo recebe ordem de carregamento para uma carroceria ausente.

No cenário de expedição intensa, caminhões adicionais aparecem visualmente em fila no desktop. Essa fila é demonstrativa e não representa agendamento real de transportadoras.

## Desempenho

- a decisão do cérebro acontece em pulsos, não a cada quadro;
- posição e sensores permanecem em mapas leves de runtime;
- telemetria de veículos ativos é publicada em intervalos limitados;
- veículos ociosos publicam com frequência ainda menor;
- transições importantes, como início e conclusão de missão, ignoram a limitação para não perder eventos;
- o perfil compacto mantém menos equipamentos, sombras reduzidas e fila externa simplificada.

## Confiança e limites

A central não transforma o protótipo em WMS, WCS, TMS ou controlador de robôs de produção. Ainda não existem:

- integração oficial com pedidos e saldo empresarial;
- confirmação física automática;
- separação real de caixas ou unidades;
- capacidade calibrada de equipamento e doca;
- horários reais de transportadora;
- custo operacional comprovado;
- aprendizado de máquina treinado com histórico real;
- redundância ou certificação de segurança industrial.

O valor atual está em demonstrar arquitetura, regras, continuidade operacional, explicabilidade, análise de cenários e integração entre o cérebro e a representação 3D.
