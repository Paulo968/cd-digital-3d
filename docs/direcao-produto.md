# Direção do produto — CD Digital 3D

## Posicionamento

O CD Digital 3D não será apenas um visualizador de estoque. O 3D será a interface para compreender o armazém, enquanto o valor central será a rastreabilidade dos produtos, unidades logísticas e movimentações.

## Dois modos do sistema

### Modo Projeto

Permite criar ou alterar um layout em versão de rascunho:

- dimensões do piso;
- ruas e identificação;
- quantidade de módulos por lado;
- níveis por estrutura;
- níveis destinados ao picking;
- largura dos corredores;
- docas e áreas de recebimento, expedição, staging, quarentena e bloqueio;
- visualização prévia em 2D e 3D;
- validação antes da ativação.

Uma alteração estrutural nunca deve modificar silenciosamente o layout ativo. O sistema cria uma nova versão, valida conflitos e somente depois permite ativá-la.

### Modo Operação

Usa uma versão ativa do layout para:

- localizar endereço, SKU, lote, série ou unidade logística;
- visualizar saldo sistêmico e confirmação física separadamente;
- consultar histórico completo de movimentações;
- registrar recebimento, armazenagem, transferência, reabastecimento, picking, expedição, inventário, ajuste e bloqueio;
- mostrar origem, destino, usuário, horário, documento e confirmação de cada evento;
- identificar divergências e endereços sem conferência recente.

## Entidades centrais

### Layout

Versão física e lógica do armazém. Contém piso, ruas, estruturas e zonas.

### Endereço logístico

Posição única dentro de uma versão de layout. O endereço deve continuar identificável mesmo quando estiver vazio.

### Unidade logística

Pallet, caixa, tote ou unidade solta identificada por um código próprio. Pode possuir relação pai/filho.

### Identidade do estoque

SKU, descrição, lote, número de série, validade e unidade de medida.

### Evento de rastreabilidade

Registro imutável de algo que aconteceu. O saldo e a posição atual são derivados da sequência de eventos, em vez de depender somente de um campo sobrescrito.

## Princípios

1. O 3D representa dados; não inventa certeza física.
2. Saldo sistêmico e confirmação física são informações diferentes.
3. Toda movimentação relevante gera evento com origem, destino, usuário e horário.
4. Layouts são versionados e auditáveis.
5. O sistema deve funcionar sem 3D; o 3D é uma camada de visualização e decisão.
6. Primeiro rastrear corretamente; depois otimizar rotas e simular cenários.

## Ordem de evolução

1. Separar layout fixo do motor de estoque.
2. Criar editor guiado de layout, sem tentar ser um AutoCAD.
3. Implementar unidade logística e histórico de eventos.
4. Criar consulta por produto, lote, validade e pallet.
5. Registrar movimentações e confirmações físicas.
6. Adicionar rotas, tarefas e simulação operacional.
7. Otimizar o motor visual com instancing para suportar milhares de posições.
