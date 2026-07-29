# Modo Realista Animado

## Objetivo

Transformar o modo `realistic` em uma apresentação viva do centro de distribuição sem misturar animação demonstrativa com dados operacionais ou confirmação física.

O modo operacional continua sendo a visão principal para consulta, rastreabilidade, movimentações e simulações dirigidas. O modo realista acrescenta ambientação e um ciclo visual físico, mas continua sem confirmar operações reais.

## Elementos do ambiente

- paredes laterais e de fundo do galpão;
- estrutura frontal com docas abertas;
- pátio externo;
- duas docas visuais vinculadas às zonas de recebimento e expedição;
- caminhões simplificados com carroceria aberta;
- posição visual de carga dentro do caminhão;
- defensas, faixas de segurança e luminárias;
- vigas superiores sem cobertura opaca, preservando a leitura do CD pela câmera.

Todos os elementos usam geometrias primitivas e materiais compartilháveis. Não existem texturas externas, modelos GLB ou física rígida nesta etapa.

## Geometria operacional compartilhada

Longarinas, pallet, carga e garfos usam uma referência vertical comum:

1. a superfície superior da longarina define o apoio;
2. o pallet recebe apenas uma pequena folga técnica sobre esse apoio;
3. a carga começa sobre a face superior do pallet;
4. a altura dos garfos é calculada para entrar abaixo do pallet;
5. coleta e deposição reutilizam a mesma referência.

Essa regra elimina o efeito de pallet flutuando sem comprometer a elevação dos garfos.

## Ciclo operacional demonstrativo

Uma empilhadeira visual e um único pallet persistente executam continuamente:

1. **Recebimento** — a empilhadeira alinha, eleva os garfos, coleta o pallet e recua.
2. **Armazenagem** — transporta o mesmo pallet e o deposita em uma posição de reserva.
3. **Reabastecimento** — recolhe o mesmo pallet da reserva e o leva ao picking.
4. **Expedição** — recolhe o pallet do picking, entra alinhada na doca e o deposita dentro da carroceria.
5. **Retorno** — volta vazia ao recebimento antes de iniciar um novo ciclo demonstrativo.

O pallet não é recriado em cada etapa. O mesmo objeto 3D alterna entre repouso na estrutura e acoplamento cinemático aos garfos.

O ciclo é exclusivamente visual:

- não altera estoque;
- não gera evento de rastreabilidade;
- não confirma movimentação física;
- não substitui a simulação manual de pallet;
- pausa quando existe uma rota manual ou transferência visual ativa;
- respeita `prefers-reduced-motion`.

## Movimento dos veículos

As rotas continuam derivadas da geometria simplificada do layout, porém a reprodução visual aplica:

- cantos arredondados;
- orientação progressiva;
- aceleração;
- frenagem antes do destino;
- velocidade menor com carga;
- aproximação e recuo controlados;
- altura de transporte separada da altura de coleta.

Não foi adicionada física pesada. O modelo cinemático é determinístico, mais leve e mais adequado a uma demonstração logística em navegador.

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
- rodas com menos segmentos;
- ciclo visual mantido em velocidade moderada quando o usuário não pediu redução de movimento.

### Regras gerais

- `frameloop="demand"` permanece ativo;
- componentes animados chamam `invalidate()` apenas enquanto estão em movimento;
- nenhum estado por frame passa pelo Zustand ou força re-renderização ampla do React;
- o modo operacional não monta os elementos realistas;
- o marcador de seleção deixa de animar quando há preferência por movimento reduzido;
- objetos auxiliares de `InstancedMesh` são reutilizados para reduzir alocações;
- o ambiente realista não cria um segundo piso sobre o piso principal.

## Limites declarados

O ciclo automático representa uma sequência operacional visual. Ele ainda não reproduz:

- tempos calibrados em uma operação real;
- capacidade real por modelo de empilhadeira;
- mapa de colisão completo;
- tráfego de pessoas e outros veículos;
- bateria e recarga;
- filas e congestionamentos;
- regras reais de unitização e carregamento;
- comandos para equipamentos físicos.

A simulação manual de pallet continua sendo o recurso que representa origem, destino, unidade logística e eventual aplicação ao cenário sistêmico.
