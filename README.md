# CD Digital 3D

Gêmeo digital logístico orientado por dados para criar layouts, visualizar ocupação, rastrear produtos e simular rotas dentro de um centro de distribuição.

## Entrega atual

- motor 3D otimizado com `InstancedMesh` para estruturas, posições, pallets e cargas;
- modos visual operacional e realista;
- construtor guiado e versionado de layout;
- preservação segura de estoque em alterações compatíveis;
- importação CSV validada contra o layout ativo;
- consulta por endereço, SKU, produto, lote, validade e unidade logística;
- QR Code por endereço ou pallet, com leitura por câmera quando o navegador oferece `BarcodeDetector`;
- linha do tempo imutável de eventos;
- movimentação origem → destino com operador, documento e confirmação física;
- contagem física separada do saldo meramente sistêmico;
- lista de tarefas, bloqueio de cabeceiras, rota de referência, otimização e animação da empilhadeira;
- persistência local no navegador para continuar os testes.

## Regra de confiança

O 3D representa os dados carregados. Uma posição vazia ou ocupada no sistema somente é tratada como confirmação física quando existe um evento explícito de conferência ou movimentação física.

## Executar

```bash
npm install
npm run dev
```

## Compilar

```bash
npm run build
```

O projeto é publicado automaticamente no GitHub Pages a cada atualização da branch `main`.
