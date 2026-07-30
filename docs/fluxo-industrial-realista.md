# Fluxo industrial do modo Realista

## Objetivo

O modo Realista demonstra um fluxo logístico contínuo com papéis especializados, passagens físicas obrigatórias e seleção de missões apoiada por Monte Carlo. O planejador não libera movimentos aleatórios: regras de compatibilidade, território, ocupação e segurança continuam soberanas.

## Separação das interfaces

O modo Operacional mantém os módulos de visão geral, layout, rastreabilidade, movimentações, simulação e importação.

O modo Realista possui menu próprio:

- **Fluxo ao vivo:** missões em execução e aguardando, doca e eventos recentes;
- **Frota e ruas:** equipamento, função, território e justificativa da designação;
- **Estoque e pedidos:** pallets monitorados, unidades, pedidos e indicadores;
- **Segurança:** cenários e comandos controlados de travessia, obstáculo e avaria.

## Recebimento

1. Um pallet nasce em uma posição válida dentro do caminhão de recebimento.
2. A `RX-REC` entra na operação de doca, retira o pallet da carroceria e deposita na área de descarga.
3. A `TP-IN` coleta o pallet da descarga e leva até o buffer de entrada da rua escolhida.
4. A empilhadeira retrátil responsável pela rua coleta no buffer e armazena em uma posição vazia da mesma rua.

A primeira descarga é distribuída entre ruas diferentes para evitar concentração artificial em um único corredor.

## Responsabilidade das ruas

As ruas ativas são agrupadas de duas em duas:

- `EMP-AB`: ruas A e B;
- `EMP-CD`: ruas C e D;
- `EMP-EF`: ruas E e F;
- `EMP-G`: rua G.

O agrupamento é gerado a partir do layout ativo. Uma empilhadeira retrátil territorial não recebe missão de outra rua.

## Expedição

1. Um pedido automático seleciona um pallet real da reserva ou do picking.
2. A empilhadeira retrátil territorial retira o pallet da estrutura.
3. O pallet é depositado no buffer de retirada da própria rua.
4. A `TP-OUT` coleta o pallet e realiza o transporte horizontal até uma posição livre de pré-embarque.
5. A `RX-LOAD` coleta o pallet no pré-embarque.
6. A `RX-LOAD` deposita na posição reservada da carroceria.
7. O caminhão só é liberado quando não existe carregamento aberto.

Os buffers de recebimento, retirada e pré-embarque são independentes. Isso evita que a mesma posição tente atender fluxos opostos e permite que a retrátil volte a trabalhar na rua enquanto a transpaleteira conclui o transporte até a doca.

## Planejador Monte Carlo

Depois dos bloqueios obrigatórios, o despacho compara as alternativas disponíveis por meio de rollouts reproduzíveis. Cada alternativa recebe custo por:

- prioridade operacional;
- deslocamento vazio;
- células de rota compartilhadas;
- pressão prevista sobre filas e buffers;
- interferência futura e risco de parada;
- incompatibilidade funcional e território.

A mesma semente e o mesmo estado produzem a mesma decisão, o que permite repetir um cenário. O resultado melhora a comparação local entre missões, mas não garante o ótimo global da operação.

## Ocupação e segurança

- veículos em missão são obstáculos dinâmicos uns para os outros;
- equipamentos avariados permanecem bloqueando fisicamente a área ocupada;
- pallets apoiados na descarga, buffers de entrada, buffers de retirada e pré-embarque são registrados como obstáculos;
- o pallet expedido deixa de ocupar espaço depois da saída;
- destinos e pontos críticos são reservados antes da missão;
- o sensor calcula distância segura, velocidade relativa e tempo estimado para contato;
- pessoa cruza apenas pela faixa e mediante comando;
- conferente e auxiliar permanecem em postos funcionais;
- obstáculo e avaria são cenários controlados.

A aproximação final para coleta e depósito continua sendo uma animação cinemática orientada por pontos de acesso. A física preditiva trabalha com volumes circulares simplificados; não existe motor industrial de corpo rígido, estabilidade de carga, tombamento, malha certificada ou dinâmica hidráulica.

Equipamentos ociosos ficam fora da malha dinâmica até existir um gerenciador de estacionamento capaz de garantir que eles não permaneçam nos pontos de transferência. Essa decisão evita bloqueios permanentes artificiais entre as etapas do fluxo.

## Perfil compacto

No celular são mantidos os cinco papéis essenciais:

- `RX-REC`;
- `TP-IN`;
- primeira empilhadeira retrátil territorial;
- `TP-OUT`;
- `RX-LOAD`.

Geometria, sombras e frequência de decisão continuam reduzidas para preservar desempenho.

## Limites

A operação é demonstrativa e isolada do estoque oficial. Ela não representa WMS, WCS, TMS, PLC, controlador de segurança ou comando enviado a equipamento físico. Pallets são movimentados como unidades completas; não há separação física de caixas ou unidades.
