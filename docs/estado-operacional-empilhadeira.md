# Estado operacional da empilhadeira

## Regra principal

A empilhadeira operacional `EMP-01` possui uma posição persistente no cenário.

- na primeira utilização, fica estacionada na zona de expedição;
- uma transferência visual parte da posição atual da empilhadeira;
- a máquina coleta um pallet na origem e o deposita no destino;
- enquanto a movimentação é apenas visual, estoque e posição persistente permanecem inalterados;
- ao aplicar a movimentação ao cenário sistêmico, a origem fica vazia, o destino recebe o pallet e a empilhadeira passa a ficar estacionada ao lado do destino;
- a missão seguinte parte desse último ponto;
- ao descartar uma simulação, a empilhadeira retorna à posição operacional anterior e o estoque não é alterado.

## Modos de visualização

No modo operacional, quando não há rota ou transferência ativa, a empilhadeira permanece visível e parada em sua posição atual.

No modo realista, o ciclo ambiente continua sendo exclusivamente demonstrativo e independente da posição persistente da `EMP-01`.

## Persistência e limites

A posição operacional é salva no navegador. Se o endereço armazenado deixar de existir após uma mudança de layout, o sistema usa a expedição como ponto seguro de fallback.

Esse estado representa o cenário sistêmico local. Ele não confirma posição física de um equipamento real e não envia comandos para máquinas, motores ou sensores.
