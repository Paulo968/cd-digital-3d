# CD Digital 3D

Gêmeo digital 3D orientado por dados para representar endereços, ocupação, pallets, picking, estoque de reserva e movimentações internas de um centro de distribuição.

## Estado atual

O projeto está na fase inicial de construção. A primeira entrega usa **dados demonstrativos sintéticos**, claramente identificados como simulação, para validar a arquitetura, a navegação 3D e as regras de endereçamento antes de integrar dados reais de ERP/WMS.

## Escopo inicial

- 7 ruas: A até G;
- 8 posições de cada lado por rua;
- lado esquerdo com posições ímpares;
- lado direito com posições pares;
- 7 níveis por posição;
- nível 1 destinado ao picking;
- níveis 2 a 7 destinados ao estoque de reserva;
- 784 endereços logísticos gerados por configuração;
- pallets e ocupação derivados dos dados;
- busca, filtros e consulta de endereço no ambiente 3D.

## Princípios do produto

1. O 3D é a representação visual; a fonte da verdade é o domínio logístico.
2. O sistema não apresenta como certeza aquilo que os dados não comprovam.
3. Dados simulados, estimativas e resultados medidos devem ser identificados separadamente.
4. Regras operacionais não ficam acopladas ao renderizador 3D.
5. Cada funcionalidade deve ter uso plausível em uma operação real.

## Arquitetura prevista

- React + TypeScript + Vite;
- Three.js com React Three Fiber;
- estado compartilhado fora do renderizador;
- importação futura de CSV/Excel;
- auditoria física e rastreabilidade em etapas posteriores;
- motor de rotas e simulação separado da cena 3D.

## Roadmap resumido

### Marco 1 — Visualizador 3D

Mini CD gerado por configuração, pallets orientados por dados, navegação, busca, filtros e consulta de posições.

### Marco 2 — Importação e auditoria

Importação de planilha, validação de dados, confirmação física, divergências e histórico.

### Marco 3 — Movimentação interna

Tarefas de armazenagem, transferência e reabastecimento, com animação de empilhadeira.

### Marco 4 — Otimização

Comparação entre rota de referência e rota otimizada, métricas e cenários operacionais.

---

Desenvolvido por Paulo Zaqueu com foco em logística, estoque, automação e sistemas operacionais.