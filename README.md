# CD Digital 3D

Protótipo funcional de laboratório logístico orientado por dados para criar layouts, visualizar ocupação, rastrear produtos e testar cenários de rotas dentro de um centro de distribuição.

> Maturidade atual: demonstração técnica e piloto controlado. Não é um WMS de produção, sistema oficial de estoque, gêmeo digital sincronizado em tempo real ou controlador de robôs.

## Entrega atual

- motor 3D otimizado com `InstancedMesh` para estruturas, posições, pallets e cargas;
- modo operacional focado em leitura, consulta e análise;
- modo realista com galpão, docas, pátio, caminhões e ciclo visual de recebimento, reabastecimento e expedição;
- qualidade adaptativa para reduzir sombras, resolução e detalhes em celulares e dispositivos com ponteiro grosseiro;
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

O ciclo automático do modo realista é exclusivamente demonstrativo: não altera estoque, não gera evento e não representa comando de equipamento físico.

## Auditoria

O parecer técnico e comercial, os limites conhecidos, as correções de confiança e os bloqueios antes de uso produtivo estão documentados em [`docs/auditoria-tecnica-negocio-v0.4.md`](docs/auditoria-tecnica-negocio-v0.4.md).

A arquitetura, os elementos, os limites e a estratégia responsiva do ambiente vivo estão registrados em [`docs/modo-realista-animado.md`](docs/modo-realista-animado.md).

## Executar

```bash
npm install
npm run dev
```

## Validar

```bash
npm run lint
npm run build
```

O projeto é publicado automaticamente no GitHub Pages após lint e build bem-sucedidos na branch `main`.

## Licenciamento

O repositório ainda não possui uma licença de código aberto. A publicação do código não concede automaticamente permissão para copiar, redistribuir ou criar derivados. A licença será definida conforme a estratégia futura do projeto.
