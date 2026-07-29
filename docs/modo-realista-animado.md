# Modo Realista Animado

## Objetivo

Transformar o modo `realistic` em uma apresentação viva do centro de distribuição sem misturar animação demonstrativa com dados operacionais ou confirmação física.

O modo operacional continua sendo a visão principal para consulta, rastreabilidade, movimentações e simulações dirigidas. O modo realista acrescenta ambientação e uma operação visual contínua, mas continua sem confirmar operações reais.

## Elementos do ambiente

- paredes laterais e de fundo do galpão;
- estrutura frontal com docas abertas;
- pátio externo;
- duas docas visuais vinculadas às zonas de recebimento e expedição;
- caminhões simplificados com carroceria aberta;
- seis posições visuais de carga dentro do caminhão;
- plataformas baixas de recebimento e áreas de espera;
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

## Frota demonstrativa

### Desktop

- **EMP-01** — empilhadeira de armazenagem, reabastecimento e expedição;
- **EMP-02** — segunda empilhadeira para permitir trabalho simultâneo;
- **TP-01** — transpaleteira elétrica com foco em recebimento e transporte de piso;
- **TP-02** — transpaleteira elétrica com foco em expedição e apoio ao recebimento.

### Celular e dispositivos compactos

- **EMP-01** — concentra as tarefas que exigem elevação;
- **TP-01** — mantém o fluxo de transporte de piso e expedição;
- EMP-02 e TP-02 não são montadas para preservar memória, desenho, temperatura e bateria.

Cada veículo permanece montado durante a operação. Uma nova tarefa utiliza a coordenada em que a máquina terminou a missão anterior, sem recriar ou teleportar o equipamento.

## Posição persistente da EMP-01

A EMP-01 possui duas representações complementares de posição:

- **posição persistida** — salva o último ponto concluído e sobrevive à troca de abas, modos e recarregamento da página;
- **pose de execução** — guarda coordenada e orientação atuais durante o movimento, sem atualizar Zustand ou React por quadro.

Quando uma nova transferência manual é solicitada, a rota é recalculada no instante do comando usando a pose de execução mais recente. A EMP-01 não volta automaticamente à expedição e não reaparece no centro do galpão.

## Despachante de missões

A operação realista trabalha com uma fila compartilhada. Cada missão possui:

- pallet identificado;
- origem e destino;
- papel operacional;
- tipo de veículo permitido;
- prioridade;
- posição na sequência;
- células de circulação utilizadas pela rota.

O despachante só entrega uma missão quando:

1. o pallet está realmente no ponto de origem visual;
2. nenhuma missão anterior do mesmo pallet continua em execução;
3. existe um veículo ocioso compatível com o papel;
4. o destino não está reservado por outra missão simultânea;
5. os corredores e cruzamentos da rota não estão reservados por outra missão ativa.

Isso impede que uma empilhadeira tente retirar um pallet enquanto a transpaleteira anterior ainda está recuando ou baixando os garfos e reduz encontros entre veículos no mesmo corredor.

## Controle preventivo de tráfego

Cada rota é convertida em uma sequência de células de circulação. Antes do despacho, o sistema compara essas células com as missões que já estão em andamento.

- rotas que compartilham corredor ou cruzamento não são iniciadas ao mesmo tempo;
- a missão bloqueada continua pendente e recebe um veículo quando o trajeto é liberado;
- rotas afastadas continuam trabalhando em paralelo;
- a reserva é liberada quando a missão termina por completo;
- o cálculo acontece no despacho e não gera atualizações de React por quadro.

Esse modelo é propositalmente preventivo. Ele evita uma colisão provável antes da saída, em vez de depender de uma física pesada para reagir depois. O controle ainda não representa sensores físicos, pessoas entrando no corredor ou obstáculos que surgem durante uma missão já iniciada.

## Fluxo operacional demonstrativo

A fila alterna pallets e veículos em uma cadeia semelhante a uma operação de CD:

1. **Transferência de entrada** — uma transpaleteira retira um pallet do recebimento e leva para a área de espera.
2. **Armazenagem** — uma empilhadeira busca esse pallet na espera e o coloca na reserva.
3. **Reabastecimento** — uma empilhadeira leva outro pallet da reserva ao picking.
4. **Expedição** — uma transpaleteira ou empilhadeira leva um pallet do picking para o caminhão.
5. **Carregamento progressivo** — seis posições diferentes da carroceria recebem pallets durante a onda.
6. **Continuidade** — pallets armazenados podem entrar em tarefas posteriores, usando o local onde foram realmente deixados.

No desktop existem três posições de recebimento e cadeias completas para três pallets de entrada, além de pallets que já começam em reserva e picking. No perfil compacto a frota é menor, mas a fila continua longa para manter a operação ativa.

Depois de cada depósito, o veículo:

1. desacopla o pallet;
2. recua;
3. baixa os garfos para a altura de transporte;
4. conclui a missão;
5. permanece no ponto onde terminou;
6. libera a reserva da rota;
7. calcula a rota vazia até a próxima origem quando recebe outra ordem.

Ao final de uma onda demonstrativa, os pallets são preparados novamente nas posições iniciais, mas a frota permanece onde parou. Cada veículo percorre fisicamente o caminho até sua próxima origem.

A operação é exclusivamente visual:

- não altera estoque oficial;
- não gera evento de rastreabilidade;
- não confirma movimentação física;
- não substitui a simulação manual de pallet;
- desaparece quando existe uma rota manual ou transferência visual ativa, evitando veículos duplicados;
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
- continuidade entre a posição final e a próxima rota vazia;
- velocidades ligeiramente diferentes por tipo de veículo.

Não foi adicionada física pesada. O modelo cinemático é determinístico, mais leve e mais adequado a uma demonstração logística em navegador.

## Estratégia responsiva e de desempenho

### Desktop

- ambientação completa;
- sombras ativadas no modo realista;
- dois caminhões;
- duas empilhadeiras e duas transpaleteiras;
- três posições de recebimento;
- seis posições de carregamento;
- luminárias e vigas em quantidade moderada;
- operação visual automática, respeitando `prefers-reduced-motion`.

### Celular e dispositivos com ponteiro grosseiro

- sombras desativadas;
- `devicePixelRatio` reduzido;
- quantidade de luminárias e detalhes reduzida;
- apenas um caminhão detalhado;
- uma empilhadeira e uma transpaleteira;
- duas posições de recebimento;
- rodas com menos segmentos;
- mesma lógica de tráfego e fila, com menos objetos 3D simultâneos.

### Regras gerais

- `frameloop="demand"` permanece ativo;
- componentes animados chamam `invalidate()` apenas enquanto estão em movimento;
- a pose por quadro fica em uma variável de runtime, fora do Zustand e do React;
- a reserva de tráfego é calculada somente em eventos de despacho;
- mudanças de missão atualizam estado apenas nos eventos de coleta, depósito e conclusão;
- o modo operacional não monta os elementos realistas;
- o marcador de seleção deixa de animar quando há preferência por movimento reduzido;
- objetos auxiliares de `InstancedMesh` são reutilizados para reduzir alocações;
- o ambiente realista não cria um segundo piso sobre o piso principal.

## Limites declarados

A frota automática representa uma sequência operacional visual. Ela ainda não reproduz:

- tempos calibrados em uma operação real;
- capacidade real por modelo de equipamento;
- mapa físico completo de colisão;
- frenagem dinâmica diante de obstáculo que surge depois do despacho;
- pessoas circulando no galpão;
- prioridade dinâmica por urgência ou tempo de espera;
- bateria e recarga;
- fila e troca de caminhões na doca;
- regras reais de unitização e carregamento;
- comandos para equipamentos físicos.

A reserva atual atua por missão e por rota prevista. Sensores virtuais contínuos, distância mínima em tempo real e reação a obstáculos inesperados pertencem à próxima evolução do motor de tráfego.

A simulação manual de pallet continua sendo o recurso que representa origem, destino, unidade logística e eventual aplicação ao cenário sistêmico.
