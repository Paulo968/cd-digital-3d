# QA funcional — entrega v0.3

Data: 28/07/2026  
Commit funcional validado: `2d732b0dd29e8f97e1ee9c6dde5755d523af19d1`

## Resultado

A aplicação foi compilada em modo de produção, o artefato do GitHub Pages foi inspecionado e os fluxos principais foram executados em navegador controlado.

Cenários validados:

1. montagem da aplicação e criação do canvas 3D;
2. geração inicial de 784 endereços;
3. alternância entre modo operacional e realista;
4. localização estruturada por rua, posição e nível;
5. consulta de SKU, lote, validade e unidade logística;
6. geração do QR Code em canvas;
7. apresentação da linha do tempo de rastreabilidade;
8. movimentação parcial entre endereços compatíveis;
9. registro de operador, origem, destino e confirmação física;
10. contagem física e atualização do histórico;
11. lista de tarefas de simulação;
12. rota de referência;
13. reordenação otimizada;
14. desenho da rota e disparo da animação da empilhadeira;
15. bloqueio das duas cabeceiras com rejeição explícita;
16. recálculo usando apenas uma cabeceira disponível;
17. inclusão de uma oitava rua no construtor;
18. crescimento de 784 para 896 endereços;
19. aplicação do novo layout preservando endereços compatíveis;
20. importação de CSV com 2 de 2 linhas válidas e zero inconsistências;
21. localização posterior do SKU e pallet importados;
22. layout móvel ativado em viewport de 390 × 844;
23. navegação inferior e painel móvel posicionados corretamente;
24. ausência de exceções de runtime atribuíveis à aplicação durante os fluxos testados.

## Pontos de confiança

- O sistema diferencia informação sistêmica de confirmação física.
- Alterações de layout que removeriam posições ocupadas são bloqueadas no modo de preservação.
- Movimentações para posições bloqueadas, endereços inexistentes ou SKUs incompatíveis são rejeitadas.
- O CSV só atualiza endereços existentes no layout ativo.
- O histórico recebe eventos em vez de apenas sobrescrever silenciosamente o estado atual.

## Limites declarados

- Distância e redução de rota são resultados calculados para o layout e tarefas informados; não representam tempo real medido.
- A leitura automática de QR por imagem depende de suporte do navegador a `BarcodeDetector`; a busca manual continua disponível.
- A persistência atual é local ao navegador e ainda não representa uma base multiusuário.
- O comportamento visual e a fluidez do WebGL devem ser conferidos também no celular e computador reais do usuário, pois o ambiente de CI não representa uma GPU de operação.
