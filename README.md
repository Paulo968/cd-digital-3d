# CD Digital 3D

Protótipo funcional de laboratório logístico orientado por dados para criar layouts, visualizar ocupação, rastrear produtos e testar cenários de rotas dentro de um centro de distribuição.

> Maturidade atual: demonstração técnica e piloto controlado. Não é um WMS de produção, sistema oficial de estoque, gêmeo digital sincronizado em tempo real ou controlador de robôs.

## Entrega atual

- motor 3D otimizado com `InstancedMesh` para estruturas, posições, pallets e cargas;
- modo operacional focado em leitura, consulta, movimentação e análise;
- menu exclusivo do modo realista, separado dos módulos operacionais, com fluxo ao vivo, frota e ruas, estoque e pedidos e segurança;
- modo realista com galpão, docas, pátio, caminhões e operação contínua de recebimento, armazenagem, reabastecimento e expedição;
- fluxo industrial determinístico: `RX-REC` descarrega o caminhão, `TP-IN` distribui para os buffers das ruas, empilhadeiras territoriais armazenam e retiram, e `RX-LOAD` carrega a expedição;
- empilhadeiras geradas por grupos de uma ou duas ruas, sem receber tarefas fora do território atribuído;
- pré-embarque obrigatório entre a retirada do estoque e o carregamento da carroceria;
- primeira onda de recebimento balanceada entre ruas diferentes;
- visão ao vivo mostrando doca, missões em execução, tarefas aguardando, equipamentos e eventos recentes;
- central operacional responsiva mostrando pedidos, missões, estoque monitorado por zona, frota, eventos de segurança e ciclo do caminhão;
- justificativa legível para a escolha do veículo, considerando função, território, distância vazia, cabeceira e congestionamento;
- oito cenários controláveis: normal, alta demanda, recebimento intenso, expedição intensa, corredor bloqueado, falha de equipamento, ruptura no picking e equipe reduzida;
- comandos manuais para provocar travessia na faixa, obstáculo e avaria durante a operação;
- conferente de recebimento e auxiliar de expedição posicionados em postos funcionais, sem circulação aleatória;
- cérebro operacional determinístico que observa o inventário visual e cria a próxima ação válida;
- recebimentos automáticos com novos pallets dentro do caminhão quando existem posições livres;
- pedidos automáticos selecionando pallets diferentes que realmente estão na reserva ou no picking;
- camada quantitativa para pallets acompanhados pela operação automática, com SKU, descrição, unidades, capacidade e ponto de reposição;
- quantidades dos pedidos e das expedições registradas na telemetria demonstrativa;
- caminhão fecha a carroceria, sai da doca, permanece fora da operação interna e dá lugar ao próximo ciclo;
- missões de carregamento aguardam enquanto não existe caminhão estacionado na doca;
- fila visual de caminhões no cenário de expedição intensa no desktop;
- pallets expedidos desaparecem do inventário visual somente depois do carregamento e da liberação do caminhão;
- pallets apoiados na descarga, buffers das ruas e pré-embarque ocupam espaço nos sensores e não podem ser atravessados pelos demais veículos;
- não existe mais reinicialização de onda: inventário, pedidos e missões continuam evoluindo durante a sessão;
- frota industrial demonstrativa no desktop com RX de descarga, transpaleteira, empilhadeiras territoriais e RX de carregamento;
- perfil compacto com os quatro papéis essenciais, preservando o fluxo em celulares;
- despacho por prioridade, compatibilidade, território, distância vazia e congestionamento;
- veículos preferem cabeceiras diferentes e o roteador compara alternativas antes de iniciar a missão;
- apenas pontos críticos da rota são bloqueados no despacho, permitindo paralelismo com segurança;
- sensores virtuais medem a distância mínima durante o movimento sem atualizar React por quadro;
- telemetria da frota é publicada em intervalos limitados, com prioridade para transições importantes;
- velocidade segura calculada conforme distância disponível, velocidade atual e desaceleração de emergência;
- reação visual a pessoa na faixa, obstáculo controlado e equipamento avariado no meio da rota;
- luz de freio e giroflex indicam frenagem emergencial ou falha temporária;
- posições físicas de descarga, buffers de rua, pré-embarque e carga dentro do caminhão;
- posição e orientação persistentes da EMP-01 entre missões, modos e recarregamentos na operação legada;
- cada veículo parte da posição onde terminou a missão anterior, sem teletransporte;
- aceleração, frenagem, orientação progressiva e curvas arredondadas;
- geometria compartilhada entre longarinas, pallets, cargas e garfos, evitando cargas visualmente flutuantes;
- qualidade adaptativa para reduzir sombras, resolução, veículos, frequência de eventos e detalhes em celulares;
- construtor guiado de layouts regulares;
- proteção de estoque em alterações compatíveis de layout;
- importação CSV validada contra o layout ativo;
- consulta por endereço, SKU, produto, lote, validade e unidade logística;
- QR Code por endereço ou pallet, com leitura por câmera quando o navegador oferece `BarcodeDetector`;
- histórico local de eventos de rastreabilidade;
- movimentação interna com origem, destino, operador, documento e confirmação física;
- contagem física separada do saldo meramente sistêmico;
- simulação visual dirigida de coleta, transporte e deposição de um pallet entre endereços;
- persistência local no navegador para continuar testes.

## Como funciona o cérebro operacional

O motor automático não usa um modelo generativo nem toma decisões imprevisíveis. Ele aplica regras e pontua alternativas:

1. observa em qual ponto visual cada pallet está;
2. confirma se o pallet não possui outra missão pendente ou em execução;
3. procura uma origem ocupada e um destino livre;
4. exige as passagens físicas do fluxo: caminhão, descarga, buffer da rua, endereço, pré-embarque e caminhão de expedição;
5. seleciona somente equipamentos compatíveis com a etapa e o território;
6. escolhe o veículo compatível mais próximo;
7. acrescenta penalidade para rotas congestionadas;
8. compara cabeceira esquerda, direita e caminho automático;
9. mantém sensores e frenagem dinâmica durante o deslocamento;
10. atualiza a posição visual do pallet somente nos eventos de coleta e depósito;
11. impede carregamento enquanto o caminhão está fora da doca;
12. remove a carga e sua ocupação do cenário quando o ciclo de saída é liberado.

## Regra de confiança

O 3D representa os dados carregados. Importação de ERP/WMS é tratada como informação sistêmica. Uma posição somente recebe confirmação física após uma ação explícita de conferência ou movimentação confirmada pelo operador.

O inventário automático, os indicadores e os cenários do modo realista são isolados e exclusivamente demonstrativos. Entradas, pedidos, missões e expedições automáticas não alteram o estoque oficial, não criam eventos oficiais de rastreabilidade, não confirmam movimentação física e não representam comando enviado a equipamento real.

A camada quantitativa descreve o conteúdo e a demanda dos pallets acompanhados pela operação automática. Ela não representa o saldo total de todos os endereços estáticos. A animação ainda movimenta pallets inteiros e não representa separação física de caixas ou unidades.

A pontuação do cérebro procura uma solução operacional coerente, mas não garante o ótimo global. Distâncias calculadas não representam tempo, produtividade ou economia financeira comprovados.

Os sensores atuais usam posições e volumes simplificados dentro da simulação. Eles demonstram ocupação, parada e retomada, mas não substituem scanner a laser, câmera, controlador de segurança, malha de colisão industrial, certificação ou redundância exigidos por equipamentos autônomos reais.

## Auditoria e arquitetura

O parecer técnico e comercial, os limites conhecidos, as correções de confiança e os bloqueios antes de uso produtivo estão documentados em [`docs/auditoria-tecnica-negocio-v0.4.md`](docs/auditoria-tecnica-negocio-v0.4.md).

A arquitetura, os elementos, os limites e a estratégia responsiva do ambiente vivo estão registrados em [`docs/modo-realista-animado.md`](docs/modo-realista-animado.md).

A central, os cenários, a telemetria quantitativa e o ciclo de caminhões estão documentados em [`docs/central-operacional-viva.md`](docs/central-operacional-viva.md).

O fluxo por docas, buffers, ruas, pré-embarque, papéis dos equipamentos e ocupação dos pallets está documentado em [`docs/fluxo-industrial-realista.md`](docs/fluxo-industrial-realista.md).

## Executar

```bash
npm ci
npm run dev
```

O `package-lock.json` é versionado para manter as mesmas versões de dependências no desenvolvimento, no CI e na publicação.

## Validar

```bash
npm run lint
npm run test
npm run build
```

Pull requests e branches `feat/**` ou `fix/**` executam automaticamente instalação, lint, testes e build. A branch `main` continua responsável pela publicação no GitHub Pages.

## Licenciamento

O repositório ainda não possui uma licença de código aberto. A publicação do código não concede automaticamente permissão para copiar, redistribuir ou criar derivados. A licença será definida conforme a estratégia futura do projeto.
