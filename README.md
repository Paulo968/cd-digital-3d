# CD Digital 3D

Gêmeo digital 3D orientado por dados para representar endereços, ocupação, pallets, picking, estoque de reserva e movimentações internas de um centro de distribuição.

## Estado atual

A primeira entrega funcional já contém o mini CD 3D, navegação, consulta de endereços, filtros, busca e importação validada de CSV. O projeto inicia com **dados demonstrativos sintéticos**, claramente identificados como simulação, e permite substituí-los por um arquivo CSV.

A importação representa o conteúdo sistêmico do arquivo. Uma posição só é apresentada como fisicamente confirmada quando o dado de conferência também estiver informado.

## Escopo implementado

- 7 ruas: A até G;
- 8 posições de cada lado por rua;
- lado esquerdo com posições ímpares;
- lado direito com posições pares;
- 7 níveis por posição;
- nível 1 destinado ao picking;
- níveis 2 a 7 destinados ao estoque de reserva;
- 784 endereços logísticos gerados por configuração;
- pallets e ocupação derivados dos dados;
- busca por endereço, SKU ou descrição;
- filtros por posição ocupada, vazia, bloqueada ou divergente;
- consulta detalhada ao clicar em uma posição;
- importação de CSV com validação de endereço e duplicidade;
- arquivo CSV demonstrativo para teste;
- publicação automatizada preparada para GitHub Pages.

## Princípios do produto

1. O 3D é a representação visual; a fonte da verdade é o domínio logístico.
2. O sistema não apresenta como certeza aquilo que os dados não comprovam.
3. Dados simulados, estimativas e resultados medidos devem ser identificados separadamente.
4. Regras operacionais não ficam acopladas ao renderizador 3D.
5. Cada funcionalidade deve ter uso plausível em uma operação real.

## Stack

- React + TypeScript + Vite;
- Three.js com React Three Fiber e Drei;
- Zustand para o estado da aplicação;
- importador CSV próprio com validações;
- GitHub Actions para build e publicação.

## Executar localmente

```bash
npm install
npm run dev
```

Para validar a versão de produção:

```bash
npm run build
npm run preview
```

## Formato inicial do CSV

Colunas aceitas:

```text
endereco;sku;descricao;quantidade;capacidade;lote;status;confirmacao;ultima_conferencia
```

Exemplo de endereço:

```text
A-01-01
```

Onde:

- `A` é a rua;
- `01` é a posição horizontal;
- posição ímpar representa o lado esquerdo;
- posição par representa o lado direito;
- o último `01` é o nível;
- nível 1 é picking;
- níveis 2 a 7 são reserva.

O arquivo `public/sample-inventory.csv` pode ser usado para testar a importação.

## Publicação

O projeto usa GitHub Actions para gerar a versão de produção e publicar no GitHub Pages a cada novo envio para a branch `main`.

## Roadmap resumido

### Marco 1 — Visualizador 3D

Mini CD gerado por configuração, pallets orientados por dados, navegação, busca, filtros e consulta de posições. **Em construção avançada.**

### Marco 2 — Importação e auditoria

Importação de CSV implementada. Próximas etapas: Excel, confirmação física por usuário, QR Code, foto, divergências e histórico.

### Marco 3 — Movimentação interna

Tarefas de armazenagem, transferência e reabastecimento, com animação de empilhadeira.

### Marco 4 — Otimização

Comparação entre rota de referência e rota otimizada, métricas e cenários operacionais.

---

Desenvolvido por Paulo Zaqueu com foco em logística, estoque, automação e sistemas operacionais.