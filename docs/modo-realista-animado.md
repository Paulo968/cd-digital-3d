# Modo Realista Animado

## Objetivo

Transformar o modo `realistic` em uma apresentação viva do centro de distribuição sem misturar animação demonstrativa com dados operacionais ou confirmação física.

O modo operacional continua sendo a visão principal para consulta, rastreabilidade, movimentações e simulações dirigidas. O modo realista acrescenta ambientação, operação visual contínua, controle de tráfego e reação a riscos virtuais, mas continua sem confirmar operações reais.

## Elementos do ambiente

- paredes laterais e de fundo do galpão;
- estrutura frontal com docas abertas;
- pátio externo;
- duas docas visuais vinculadas às zonas de recebimento e expedição;
- caminhões simplificados com carroceria aberta;
- seis posições visuais de carga dentro do caminhão;
- plataformas baixas de recebimento e áreas de espera;
- defensas, faixas de segurança e luminárias;
- vigas superiores sem cobertura opaca, preservando a leitura do CD pela câmera;
- pessoa demonstrativa cruzando uma rua operacional;
- obstáculo temporário inserido depois do início das missões.

Todos os elementos usam geometrias primitivas e materiais compartilháveis. Não existem texturas externas, modelos GLB ou física rígida nesta etapa.

## Geometria operacional compartilhada

Longarinas, pallet, carga e garfos usam uma referência vertical comum:

1. a superfície superior da longarina, plataforma ou carroceria define o apoio;
2. o pallet recebe apenas uma pequena folga técnica sobre esse apoio;
3. a carga começa sobre a face superior do pallet;
4. a altura dos garfos é calculada para entrar abaixo do pallet;
5. coleta e deposição reutilizam a mesma referência.

Essa regra elimina o efeito de pallet flutuando sem comprometer a elevação dos garfos. O componente da frota reutiliza `PALLET_HEIGHT` e `LOAD_SUPPORT_CLEARANCE`, evitando medidas visuais independentes.

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

Esse controle reduz conflitos previsíveis antes da saída. Ele funciona em conjunto com a camada dinâmica descrita a seguir.

## Sensores virtuais contínuos

Enquanto um veículo percorre os trechos de circulação, sua pose, velocidade e volume simplificado são registrados em mapas leves de runtime.

A cada quadro, o equipamento consulta:

- outros veículos em missão;
- pessoa ativa no corredor;
- obstáculo temporário ativo;
- estado de falha do próprio equipamento.

O sensor projeta cada risco sobre a direção atual da rota. Um objeto só interfere quando:

1. está à frente do veículo;
2. está dentro da faixa lateral ocupada pela máquina e pela margem de segurança;
3. possui distância livre menor do que a necessária para manter a velocidade desejada.

A convenção de orientação é a mesma de `routePlanning`: `facing = 0` representa deslocamento para `+Z`. Isso impede a inversão entre risco à frente e risco atrás em ruas com sentidos diferentes.

## Distância de parada e velocidade segura

A distância necessária para parar considera:

- velocidade atual;
- desaceleração de emergência;
- margem de reação;
- raio do veículo;
- raio do risco detectado.

A forma simplificada usada é:

```text
velocidade² / (2 × desaceleração) + margem de reação
```

Quando existe espaço, o veículo mantém ou recupera a velocidade nominal. Quando a distância diminui, o sistema calcula uma velocidade segura menor e desacelera progressivamente. Quando a área livre entra na distância crítica, o estado visual muda para frenagem emergencial.

A carga aumenta a margem frontal, e a transpaleteira utiliza um volume menor do que a empilhadeira.

## Cenários de segurança demonstrativos

### Pessoa entrando no corredor

Uma pessoa cruza periodicamente a rua frontal do CD. Sua coordenada é atualizada durante o movimento e registrada como risco circular. Veículos que se aproximam pela mesma faixa reduzem a velocidade ou param até a travessia terminar.

### Obstáculo depois da saída

Uma barreira aparece temporariamente numa rua operacional após as missões já terem começado. Esse cenário demonstra a diferença entre reserva preventiva de rota e reação a algo que não existia no momento do despacho.

### Equipamento avariado

O sistema procura uma máquina que esteja realmente em movimento e ativa uma falha temporária. O veículo:

1. deixa de avançar na missão;
2. acende luzes de freio e giroflex âmbar;
3. permanece registrado como obstáculo para os demais;
4. mantém a fase e a rota atuais;
5. retoma a missão depois da recuperação.

Máquinas ociosas ou fora de missão não são escolhidas para a avaria demonstrativa.

## Sinalização visual

- luzes traseiras vermelhas acendem durante redução por risco;
- giroflex âmbar aparece durante falha temporária;
- a carga permanece acoplada enquanto o veículo aguarda;
- a missão não reinicia nem teletransporta o equipamento depois da parada.

O estado visual somente atualiza React quando muda entre `normal`, `braking` e `fault`. Posição, velocidade e distância continuam fora do estado React.

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
- velocidades ligeiramente diferentes por tipo de veículo;
- limitação dinâmica de velocidade nos trechos de circulação.

Não foi adicionada física pesada. O modelo cinemático é determinístico, mais leve e mais adequado a uma demonstração logística em navegador.

## Estratégia responsiva e de desempenho

### Desktop

- ambientação completa;
- sombras ativadas no modo realista;
- dois caminhões;
- duas empilhadeiras e duas transpaleteiras;
- três posições de recebimento;
- seis posições de carregamento;
- pessoa, obstáculo e falha em intervalos mais curtos;
- luminárias e vigas em quantidade moderada.

### Celular e dispositivos com ponteiro grosseiro

- sombras desativadas;
- `devicePixelRatio` reduzido;
- quantidade de luminárias e detalhes reduzida;
- apenas um caminhão detalhado;
- uma empilhadeira e uma transpaleteira;
- duas posições de recebimento;
- rodas com menos segmentos;
- eventos de pessoa, obstáculo e falha mais espaçados;
- mesma lógica de distância e frenagem, com menos objetos 3D simultâneos.

### Regras gerais

- `frameloop="demand"` permanece ativo;
- componentes animados chamam `invalidate()` apenas enquanto precisam avançar ou reagir;
- pose, velocidade, riscos e falhas ficam fora do Zustand e do React;
- o registro de riscos é percorrido diretamente, sem criar uma nova lista por veículo em cada quadro;
- a reserva preventiva de tráfego é calculada somente em eventos de despacho;
- mudanças de missão atualizam estado apenas nos eventos de coleta, depósito e conclusão;
- o modo operacional não monta os elementos realistas;
- objetos auxiliares de `InstancedMesh` são reutilizados para reduzir alocações;
- o ambiente realista não cria um segundo piso sobre o piso principal.

## Cobertura de testes

Os testes automatizados verificam:

- crescimento da distância de parada com a velocidade;
- frenagem diante de pessoa na mesma faixa;
- descarte de risco lateral fora do corredor;
- descarte de objeto que já ficou para trás;
- seleção do risco mais próximo;
- escolha de uma máquina realmente em movimento para a falha;
- exclusão de equipamentos ociosos da falha;
- ativação, recuperação e limpeza do estado de avaria;
- regras anteriores de missão, pallet, destino e reserva de rota.

## Limites declarados

A frota automática representa uma sequência operacional visual. Ela ainda não reproduz:

- tempos calibrados em uma operação real;
- capacidade real por modelo de equipamento;
- malha física completa de colisão;
- scanner a laser, câmera de profundidade, radar ou fusão de sensores;
- localização SLAM e incerteza de posicionamento;
- trajetória preditiva de pessoas;
- desvio automático ao redor de um risco inesperado;
- prioridade dinâmica por urgência, tempo de espera ou bateria;
- estacionamento inteligente de veículos ociosos;
- bateria e recarga;
- fila e troca de caminhões na doca;
- regras reais de unitização e carregamento;
- redundância, controlador certificado ou parada física de segurança;
- comandos para equipamentos reais.

O sensor dinâmico atua nos trechos principais de viagem. Aproximação e recuo junto às estruturas continuam protegidos pelas reservas de origem, destino e missão, e não por um modelo físico completo.

Veículos ociosos não são tratados como bloqueio dinâmico nesta versão, porque ainda não existe um gerenciador de estacionamento capaz de removê-los de forma garantida das ruas. Essa escolha evita deadlocks demonstrativos e deve ser substituída antes de uma simulação industrial de tráfego.

A simulação manual de pallet continua sendo o recurso que representa origem, destino, unidade logística e eventual aplicação ao cenário sistêmico.
