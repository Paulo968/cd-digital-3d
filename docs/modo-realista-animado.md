# Modo Realista Animado

## Objetivo

Transformar o modo `realistic` em uma apresentação viva do centro de distribuição sem misturar animação demonstrativa com dados operacionais ou confirmação física.

O modo operacional continua sendo a visão principal para consulta, rastreabilidade, movimentações e simulações dirigidas. O modo realista passa a acrescentar ambientação e um ciclo visual automático.

## Elementos do ambiente

- paredes laterais e de fundo do galpão;
- estrutura frontal com docas abertas;
- pátio externo;
- duas docas visuais vinculadas às zonas de recebimento e expedição;
- caminhões simplificados nas docas;
- defensas, faixas de segurança e luminárias;
- vigas superiores sem cobertura opaca, preservando a leitura do CD pela câmera.

Todos os elementos usam geometrias primitivas e materiais compartilháveis. Não existem texturas externas, modelos GLB ou física nesta etapa.

## Ciclo operacional demonstrativo

Uma empilhadeira visual executa continuamente três tipos de missão:

1. **Recebimento** — sai da área de recebimento e leva uma carga para uma posição de reserva.
2. **Reabastecimento** — desloca uma carga da reserva para uma posição de picking.
3. **Expedição** — leva uma carga de uma posição de picking para a área de expedição.

O ciclo é exclusivamente visual:

- não altera estoque;
- não gera evento de rastreabilidade;
- não confirma movimentação física;
- não substitui a simulação manual de pallet;
- pausa quando existe uma rota manual ou transferência visual ativa, evitando sobreposição de veículos e mensagens conflitantes.

## Estratégia responsiva e de desempenho

### Desktop

- ambientação completa;
- sombras ativadas no modo realista;
- dois caminhões;
- luminárias e vigas em quantidade moderada;
- ciclo visual automático, respeitando `prefers-reduced-motion`.

### Celular e dispositivos com ponteiro grosseiro

- sombras desativadas;
- `devicePixelRatio` reduzido;
- quantidade de luminárias e detalhes reduzida;
- apenas um caminhão detalhado;
- ciclo visual mantido em velocidade moderada quando o usuário não pediu redução de movimento.

### Regras gerais

- `frameloop="demand"` permanece ativo;
- componentes animados chamam `invalidate()` apenas enquanto estão em movimento;
- nenhum estado por frame passa pelo Zustand ou força re-renderização ampla do React;
- o modo operacional não monta os elementos realistas;
- a animação respeita `prefers-reduced-motion: reduce`.

## Limites declarados

O ciclo automático é uma representação ilustrativa de fluxo. Ele não reproduz tempos reais, capacidade de carga, raio de giro, tráfego, pessoas, bateria ou comandos de uma empilhadeira física.

A simulação manual de pallet continua sendo o recurso que representa origem, destino, elevação dos garfos, coleta e deposição de uma unidade logística específica.
