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
- posições visuais de carga dentro do caminhão;
- plataformas baixas de recebimento compatíveis com a altura dos garfos;
- defensas, faixas de segurança e luminárias;
- vigas superiores sem cobertura opaca, preservando a leitura do CD pela câmera.

Todos os elementos usam geometrias primitivas e materiais compartilháveis. Não existem texturas externas, modelos GLB ou física rígida nesta etapa.

## Geometria operacional compartilhada

Longarinas, pallet, carga e garfos usam uma referência vertical comum:

1. a superfície superior da longarina, plataforma ou carroceria define o apoio;
2. o pallet recebe apenas uma pequena folga técnica sobre esse apoio;
3. a carga começa sobre a face superior do pallet;
4. a altura dos garfos é calculada para entrar abaixo do pallet;
5. coleta e deposição reutilizam a mesma referência.

Essa regra elimina o efeito de pallet flutuando sem comprometer a elevação dos garfos.

## Posição persistente da empilhadeira

A EMP-01 possui duas representações complementares de posição:

- **posição persistida** — salva o último ponto concluído e sobrevive à troca de abas, modos e recarregamento da página;
- **pose de execução** — guarda coordenada e orientação atuais durante o movimento, sem atualizar Zustand ou React por quadro.

Quando uma nova transferência é solicitada, a rota é recalculada no instante do comando usando a pose de execução mais recente. A empilhadeira não volta automaticamente à expedição e não reaparece no centro do galpão.

Ao terminar uma entrega, a posição após o recuo vira a origem da missão seguinte.

## Fila operacional demonstrativa

O modo realista não usa mais um único pallet atravessando todas as etapas. A fila alterna unidades diferentes e executa missões independentes:

1. **Armazenagem** — um pallet do recebimento é levado para uma posição de reserva.
2. **Reabastecimento** — outro pallet é retirado de uma posição de reserva e levado ao picking.
3. **Expedição** — outro pallet sai do picking e é colocado dentro do caminhão.
4. **Nova armazenagem** — a empilhadeira sai da última entrega e busca outro pallet no recebimento.
5. **Continuidade** — pallets deixados em reserva ou picking podem ser recolhidos em uma missão posterior.

Depois de cada depósito, a EMP-01:

1. desacopla o pallet;
2. recua;
3. baixa os garfos para a altura de transporte;
4. permanece no ponto onde terminou;
5. calcula a rota vazia até a próxima origem;
6. segue o trajeto completo antes de iniciar a coleta.

Ao final de uma onda demonstrativa, novos pallets são preparados nas posições iniciais, mas a empilhadeira continua onde parou e percorre fisicamente o caminho até a primeira origem da onda seguinte.

O ciclo é exclusivamente visual:

- não altera estoque oficial;
- não gera evento de rastreabilidade;
- não confirma movimentação física;
- não substitui a simulação manual de pallet;
- desaparece quando existe uma rota manual ou transferência visual ativa, evitando empilhadeiras duplicadas;
- respeita `prefers-reduced-motion`.

## Movimento dos veículos

As rotas continuam derivadas da geometria simplificada do layout, porém a reprodução visual aplica:

- cantos arredondados;
- orientação progressiva;
- aceleração;
- frenagem antes do destino;
- velocidade menor com carga;
- aproximação e recuo controlados;
- altura de transporte separada da altura de coleta;
- continuidade entre a posição final e a próxima rota vazia.

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
- a pose por quadro fica em uma variável de runtime, fora do Zustand e do React;
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
