# Fluxo industrial do modo Realista

## Objetivo

O modo Realista demonstra um fluxo logístico determinístico e contínuo. Ele não distribui tarefas aleatoriamente: cada equipamento possui função, território e passagem física obrigatória.

## Separação das interfaces

O modo Operacional mantém os módulos de visão geral, layout, rastreabilidade, movimentações, simulação e importação.

O modo Realista possui menu próprio:

- **Fluxo ao vivo:** missões em execução e aguardando, doca e eventos recentes;
- **Frota e ruas:** equipamento, função, território e justificativa da designação;
- **Estoque e pedidos:** pallets monitorados, unidades, pedidos e indicadores;
- **Segurança:** cenários e comandos controlados de travessia, obstáculo e avaria.

## Recebimento

1. Um pallet nasce em uma posição válida dentro do caminhão de recebimento.
2. A `RX-REC` retira o pallet da carroceria e deposita na área de descarga.
3. A `TP-IN` coleta o pallet da descarga e leva até o buffer da rua escolhida.
4. A empilhadeira responsável pela rua coleta no buffer e armazena em uma posição vazia da mesma rua.

A primeira descarga é distribuída entre ruas diferentes para evitar concentração artificial em um único corredor.

## Responsabilidade das ruas

As ruas ativas são agrupadas de duas em duas:

- `EMP-AB`: ruas A e B;
- `EMP-CD`: ruas C e D;
- `EMP-EF`: ruas E e F;
- `EMP-G`: rua G.

O agrupamento é gerado a partir do layout ativo. Uma empilhadeira territorial não recebe missão de outra rua.

## Expedição

1. Um pedido automático seleciona um pallet real da reserva ou do picking.
2. A empilhadeira territorial retira o pallet da estrutura.
3. O pallet é depositado numa posição livre de pré-embarque.
4. A `RX-LOAD` coleta o pallet no pré-embarque.
5. A `RX-LOAD` deposita na posição reservada da carroceria.
6. O caminhão só é liberado quando não existe carregamento aberto.

## Ocupação e segurança

- veículos ativos são obstáculos dinâmicos uns para os outros;
- pallets apoiados na descarga, buffers e pré-embarque são registrados como obstáculos;
- o pallet expedido deixa de ocupar espaço depois da saída;
- destinos e pontos críticos são reservados antes da missão;
- o sensor calcula distância segura durante o movimento;
- pessoa cruza apenas pela faixa e mediante comando;
- conferente e auxiliar permanecem em postos funcionais;
- obstáculo e avaria são cenários controlados.

A aproximação final para coleta e depósito continua sendo uma animação cinemática orientada por pontos de acesso. Não existe motor de corpo rígido, malha de colisão industrial ou certificação funcional.

## Perfil compacto

No celular são mantidos os papéis essenciais:

- `RX-REC`;
- `TP-IN`;
- primeira empilhadeira territorial;
- `RX-LOAD`.

Geometria, sombras e frequência de decisão continuam reduzidas para preservar desempenho.

## Limites

A operação é demonstrativa e isolada do estoque oficial. Ela não representa WMS, WCS, TMS, PLC, controlador de segurança ou comando enviado a equipamento físico. Pallets são movimentados como unidades completas; não há separação física de caixas ou unidades.
