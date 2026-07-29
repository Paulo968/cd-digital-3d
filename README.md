# CD Digital 3D

Protótipo funcional de laboratório logístico orientado por dados para criar layouts, visualizar ocupação, rastrear produtos e testar cenários de rotas dentro de um centro de distribuição.

> Maturidade atual: demonstração técnica e piloto controlado. Não é um WMS de produção, sistema oficial de estoque, gêmeo digital sincronizado em tempo real ou controlador de robôs.

## Entrega atual

- motor 3D otimizado com `InstancedMesh` para estruturas, posições, pallets e cargas;
- modo operacional focado em leitura, consulta e análise;
- modo realista com galpão, docas, pátio, caminhões e fila contínua de recebimento, armazenagem, reabastecimento e expedição;
- frota demonstrativa com duas empilhadeiras e duas transpaleteiras no desktop;
- perfil compacto com uma empilhadeira e uma transpaleteira, preservando o fluxo em celulares;
- papéis separados para transporte de piso, armazenagem, reabastecimento e expedição;
- controle preventivo de tráfego por reserva de corredores e cruzamentos antes do despacho;
- missões com trajetos conflitantes aguardam, enquanto rotas independentes continuam em paralelo;
- três posições de recebimento no desktop e seis posições visuais de carga dentro do caminhão;
- pallets demonstrativos diferentes, coletados e depositados individualmente em espera, reserva, picking e carroceria;
- tarefas dependentes: o próximo veículo só recebe o pallet depois da missão anterior terminar por completo;
- posição e orientação persistentes da EMP-01 entre missões, modos e recarregamentos;
- veículos mantêm o ponto final ao iniciar novas ondas de operação, sem retorno automático ao começo;
- pose de execução em memória para que novos comandos partam do ponto atual sem provocar re-renderização por quadro;
- aceleração, frenagem, orientação progressiva e curvas arredondadas na movimentação dos veículos;
- geometria compartilhada entre longarinas, pallets, cargas e garfos, evitando cargas visualmente flutuantes;
- qualidade adaptativa para reduzir sombras, resolução, veículos e detalhes em celulares e dispositivos com ponteiro grosseiro;
- construtor guiado de layouts regulares;
- proteção de estoque em alterações compatíveis de layout;
- importação CSV validada contra o layout ativo;
- consulta por endereço, SKU, produto, lote, validade e unidade logística;
- QR Code por endereço ou pallet, com leitura por câmera quando o navegador oferece `BarcodeDetector`;
- histórico local de eventos de rastreabilidade;
- movimentação interna com origem, destino, operador, documento e confirmação física;
- contagem física separada do saldo meramente sistêmico;
- lista de tarefas, bloqueio de cabeceiras, rota de referência, sequência heurística e animação da empilhadeira;
- simulação visual de coleta, transporte e deposição de um pallet entre endereços;
- persistência local no navegador para continuar testes.

## Regra de confiança

O 3D representa os dados carregados. Importação de ERP/WMS é tratada como informação sistêmica. Uma posição somente recebe confirmação física após uma ação explícita de conferência ou movimentação confirmada pelo operador.

A sequência heurística busca reduzir a distância em relação à ordem informada, mas não garante o ótimo global. Distâncias calculadas não representam tempo, produtividade ou economia financeira comprovados.

A operação automática do modo realista é exclusivamente demonstrativa: não altera estoque, não gera evento e não representa comando de equipamento físico. A fila visual distribui pallets entre veículos compatíveis, reserva previamente os trajetos e mantém cada máquina onde concluiu a entrega, sem fabricar confirmação física.

O controle de tráfego atual é preventivo no despacho. Ele evita iniciar simultaneamente missões que compartilham células de circulação, mas ainda não substitui sensores, detecção dinâmica de obstáculos ou segurança de equipamentos físicos.

## Auditoria

O parecer técnico e comercial, os limites conhecidos, as correções de confiança e os bloqueios antes de uso produtivo estão documentados em [`docs/auditoria-tecnica-negocio-v0.4.md`](docs/auditoria-tecnica-negocio-v0.4.md).

A arquitetura, os elementos, os limites e a estratégia responsiva do ambiente vivo estão registrados em [`docs/modo-realista-animado.md`](docs/modo-realista-animado.md).

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
