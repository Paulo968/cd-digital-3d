# Modo Realista Animado

## Objetivo

Transformar o modo `realistic` em uma apresentação viva do centro de distribuição sem misturar animação demonstrativa com dados operacionais ou confirmação física.

O modo operacional continua sendo a visão principal para consulta, rastreabilidade, movimentações e simulações dirigidas. O modo realista acrescenta ambientação, inventário visual vivo, geração automática de trabalho, controle de tráfego e reação a riscos virtuais.

## Regra de confiança

Toda a operação automática descrita neste documento é local ao cenário realista.

- não altera estoque oficial;
- não gera evento de rastreabilidade;
- não confirma movimentação física;
- não substitui a transferência manual de pallet;
- não envia comando para equipamento real;
- não afirma que o pallet físico está no endereço mostrado;
- desaparece quando existe rota manual ou transferência visual ativa, evitando veículos duplicados.

O cérebro automático é um motor determinístico de regras e pontuação. Ele não é um modelo generativo, não aprende sozinho e não possui autonomia industrial certificada.

## Ambiente

- paredes e estrutura do galpão;
- duas docas visuais;
- pátio externo;
- caminhões simplificados com carroceria aberta;
- seis posições de carga na expedição;
- plataformas de recebimento e áreas de espera;
- estruturas, endereços de reserva e picking;
- pessoa demonstrativa, obstáculo temporário e falha de equipamento;
- vigas, defensas, faixas de segurança e luminárias.

Os elementos usam geometrias primitivas e materiais compartilháveis. Não existem física rígida, texturas externas ou modelos GLB nesta etapa.

## Frota

### Desktop

- **EMP-01** — armazenagem, reabastecimento e expedição;
- **EMP-02** — armazenagem, reabastecimento e expedição em paralelo;
- **TP-01** — recebimento, transporte de piso e expedição;
- **TP-02** — expedição e apoio ao recebimento.

### Celular

- **EMP-01** — tarefas que exigem elevação;
- **TP-01** — transporte de piso e expedição.

EMP-02 e TP-02 não são montadas no perfil compacto para preservar memória, temperatura e bateria.

Cada máquina permanece no ponto onde terminou. Uma missão nova parte da pose atual registrada no runtime, sem recriação nem teletransporte.

## Cérebro do estoque

O componente `warehouseBrain` observa o inventário visual e produz no máximo uma decisão por pulso.

### Estado mantido

- próximo identificador de pallet;
- próximo identificador de missão;
- próximo identificador de pedido;
- cursor de seleção de pallets;
- pallets com pedido aberto;
- último recebimento gerado;
- último pedido gerado;
- momento em que o caminhão começou a receber carga;
- total visual expedido na sessão.

### Recebimento automático

Quando existe uma posição livre no recebimento e capacidade disponível na reserva, o cérebro cria um pallet `LIVE-IN-####`.

O pallet percorre etapas diferentes, cada uma como missão real da fila:

```text
recebimento → espera → reserva
```

A transpaleteira faz a transferência de piso e uma empilhadeira realiza a armazenagem.

### Reabastecimento

Quando o picking está abaixo do alvo visual, um pallet disponível da reserva pode gerar:

```text
reserva → picking
```

Somente empilhadeiras recebem essa tarefa porque a origem ou o destino pode exigir elevação.

### Pedidos automáticos

Em intervalos controlados, o cérebro escolhe um pallet que realmente está na reserva ou no picking e cria um pedido `AUTO-ORDER-####`.

A seleção usa um cursor rotativo para evitar que sempre o mesmo pallet seja escolhido. Um pallet com pedido aberto não recebe um segundo pedido.

### Expedição

- pallet no picking: transpaleteira ou empilhadeira compatível pode levar ao caminhão;
- pallet na reserva: empilhadeira pode executar expedição direta;
- a posição da carroceria precisa estar livre e não reservada;
- o pallet fica visualmente dentro do caminhão depois do depósito.

### Partida lógica do caminhão

O carregamento é encerrado quando:

- todas as posições estão ocupadas; ou
- a carga mínima foi atingida e o tempo visual de espera expirou.

Nesse momento, os pallets carregados são removidos do inventário visual e contam como expedidos. O modelo 3D do caminhão ainda não percorre o pátio; a partida nesta fase é lógica e representada pela liberação da carroceria.

### Continuidade

Não existe mais reinicialização de onda. O inventário continua evoluindo:

```text
entra pallet novo
→ armazena
→ reabastece
→ recebe pedido
→ carrega
→ sai do inventário
→ nova capacidade fica disponível
```

## Cérebro da frota

O componente `fleetDispatchBrain` decide qual máquina deve receber cada missão pronta.

### Pontuação

A pontuação considera:

- prioridade da missão;
- compatibilidade do tipo de veículo;
- papel operacional permitido;
- distância vazia da máquina até a origem;
- quantidade de células congestionadas;
- ordem de preferência dos papéis do veículo;
- sequência como critério de desempate.

Uma máquina livre próxima da origem tende a ser escolhida antes de outra distante.

### Pontos críticos

O despachante bloqueia as primeiras e últimas células da rota ativa. Isso protege entrada, cruzamento próximo à origem, aproximação do destino e recuo, sem reservar todo o trajeto durante toda a missão.

A consequência esperada é:

- tarefas realmente incompatíveis aguardam;
- missões independentes trabalham ao mesmo tempo;
- a frota não fica paralisada apenas porque duas rotas compartilham uma parte distante do percurso.

## Rotas adaptativas

Cada veículo possui uma preferência inicial:

- identificador ímpar: cabeceira esquerda;
- identificador par: cabeceira direita.

O roteador calcula até três alternativas:

1. cabeceira preferida;
2. cabeceira oposta;
3. caminho automático sem bloqueio lateral.

Cada alternativa recebe custo por distância e por sobreposição com células já ocupadas. O menor custo é escolhido no instante em que a missão começa.

Isso não cria uma via física perfeitamente separada dentro de cada corredor, mas distribui os veículos pelas cabeceiras e reduz o comportamento de todos repetirem exatamente o mesmo caminho.

## Despacho e dependências

Uma missão só pode ficar pronta quando:

1. o pallet está visualmente na origem informada;
2. não existe outra missão pendente ou em execução para o mesmo pallet;
3. o destino está livre;
4. o destino não está reservado;
5. existe veículo compatível;
6. os pontos críticos não entram em conflito com uma missão ativa.

O próximo equipamento não recebe o pallet enquanto o anterior ainda coleta, deposita, recua ou baixa os garfos.

## Sensores virtuais contínuos

Durante os trechos de circulação, cada veículo publica em mapas leves:

- posição;
- direção da rota;
- velocidade;
- raio simplificado;
- estado ativo;
- estado de falha.

A cada quadro, o equipamento consulta outros veículos ativos, pessoa, obstáculo temporário e falha própria.

Um risco interfere quando está à frente, dentro da faixa lateral e próximo o suficiente para exigir redução.

A distância simplificada de parada é:

```text
velocidade² / (2 × desaceleração) + margem de reação
```

Com carga, a margem frontal é maior.

## Cenários de segurança

### Pessoa

Uma pessoa cruza uma rua operacional. A posição é atualizada durante a travessia e os veículos reduzem ou param na mesma faixa.

### Obstáculo temporário

Uma barreira aparece depois da saída dos veículos. O sensor reage a uma condição que não existia no despacho.

### Avaria

Uma máquina realmente em movimento pode entrar em falha temporária. Ela freia, acende giroflex, permanece como obstáculo e retoma a mesma missão depois da recuperação.

### Sinalização

- luz vermelha: redução ou frenagem emergencial;
- giroflex âmbar: falha temporária;
- carga continua acoplada durante a espera;
- a missão não reinicia depois da liberação.

## Geometria operacional

Longarina, pallet, carga e garfos usam referências compartilhadas:

1. apoio da estrutura, plataforma ou carroceria;
2. folga técnica do pallet;
3. altura real do pallet;
4. folga da carga;
5. altura da carga;
6. garfos abaixo da base do pallet.

Isso evita pallet flutuando e mantém coleta e deposição coerentes.

## Desempenho

### Regras gerais

- `frameloop="demand"` permanece ativo;
- componentes chamam `invalidate()` apenas enquanto precisam avançar ou reagir;
- pose, velocidade, riscos e falhas ficam fora do Zustand e do React;
- o cérebro do estoque decide por pulsos, não por quadro;
- o celular usa pulsos e eventos mais espaçados;
- mudanças React acontecem em criação de pallet, missão, coleta, depósito, conclusão ou saída;
- missões concluídas antigas são removidas da memória quando o histórico visual cresce;
- não existe física rígida pesada.

### Desktop

- quatro veículos;
- dois caminhões visuais;
- três posições de recebimento;
- seis posições de carregamento;
- eventos de segurança mais frequentes.

### Celular

- dois veículos;
- um caminhão detalhado;
- duas posições de recebimento;
- geometrias e rodas simplificadas;
- sombras desativadas;
- mesma lógica de inventário, despacho e segurança.

## Cobertura de testes

Os testes automatizados verificam:

- criação de pallet quando há capacidade;
- criação de pedido para pallet armazenado;
- transformação de pedido em expedição;
- expedição direta da reserva somente por empilhadeira;
- partida lógica do caminhão e contagem de pallets;
- ausência de missão duplicada para pallet ativo;
- preferência de cabeceiras opostas;
- escolha da missão mais próxima;
- bloqueio de pontos críticos;
- rotas diferentes para veículos de preferências opostas;
- distância de parada, faixa lateral e risco mais próximo;
- falha, recuperação e limpeza do runtime;
- regras anteriores de coleta, depósito e dependência.

## Limites declarados

O modo realista ainda não reproduz:

- WMS oficial ou saldo contábil de estoque;
- sincronização com ERP;
- confirmação física real;
- carregamento segundo peso, cubagem, eixo ou sequência de entrega;
- animação do caminhão percorrendo o pátio;
- prioridade baseada em SLA real, bateria ou turno;
- mapa físico completo de colisão;
- via dupla calibrada dentro de cada corredor;
- scanner a laser, câmera de profundidade, radar ou fusão de sensores;
- SLAM e incerteza de localização;
- previsão da trajetória de pessoas;
- desvio local contínuo ao redor de risco inesperado;
- controlador de segurança certificado;
- comunicação com equipamento físico.

A arquitetura separa inventário, geração de trabalho, despacho, rota, movimento e segurança para permitir que esses recursos sejam adicionados sem reescrever toda a demonstração.
