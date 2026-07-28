# Auditoria técnica e comercial — CD Digital 3D v0.4

Data: 28/07/2026

## Parecer executivo

O CD Digital 3D possui base técnica e operacional legítima. Ele não é apenas uma animação: o layout gera endereços, os dados importados alteram o estado visual, as movimentações atualizam saldos, os eventos formam uma linha do tempo e as rotas são calculadas a partir da geometria configurada.

A classificação correta da entrega atual é:

> Protótipo funcional e laboratório logístico orientado por dados, preparado para pilotos controlados.

A aplicação ainda não deve ser apresentada como WMS de produção, sistema oficial de estoque, gêmeo digital sincronizado em tempo real ou controlador de robôs.

## O que é utilizável hoje

1. Construção guiada de layouts com ruas, módulos, níveis e picking.
2. Geração automática de endereços logísticos.
3. Visualização 3D operacional e realista.
4. Importação de uma fotografia sistêmica do estoque por CSV.
5. Localização por endereço, SKU, produto, lote, validade e unidade logística.
6. Geração de QR Code para endereço ou unidade logística.
7. Registro local de movimentações internas e contagens físicas.
8. Linha do tempo com origem, destino, operador, documento, quantidade e confirmação.
9. Comparação entre uma ordem de referência e uma sequência heurística de menor deslocamento.
10. Simulação visual da rota e teste de bloqueio de cabeceiras.
11. Uso como demonstração, levantamento de requisitos, protótipo consultivo e piloto com dados anonimizados.

## O que continua sendo simulação ou protótipo

1. A empilhadeira 3D não controla um equipamento físico.
2. A distância calculada não equivale a tempo real de operação.
3. A sequência heurística não garante a menor rota matematicamente possível.
4. O mapa ainda assume principalmente ruas paralelas e acesso pelas cabeceiras.
5. Não há sincronização automática com ERP, WMS, sensores ou robôs.
6. A persistência é local ao navegador e pode ser apagada ou alterada pelo usuário.
7. Não existem usuários, permissões, banco multiempresa ou trilha de auditoria protegida.
8. Layouts recebem número de versão, mas as versões antigas ainda não são armazenadas em um repositório histórico.
9. Não existe garantia de disponibilidade, recuperação de desastre ou suporte operacional.

## Falhas de confiança corrigidas nesta auditoria

- O cenário demonstrativo deixou de fabricar confirmações físicas.
- Importações CSV passaram a ser tratadas somente como informação sistêmica.
- Quantidades acima da capacidade são rejeitadas.
- Status contraditórios com quantidade são rejeitados.
- Saldo sem SKU é rejeitado.
- Validades inválidas são rejeitadas.
- Unidades logísticas duplicadas no mesmo arquivo são rejeitadas.
- Mistura de SKU, lote ou validade no destino é bloqueada.
- Consolidação sobre posição ocupada ficou restrita ao reabastecimento compatível de picking.
- Contagens acima da capacidade são rejeitadas.
- Alterações de layout que reposicionariam fisicamente estoque existente são bloqueadas.
- Expedição externa foi desativada até existir um fluxo próprio e seguro.
- A interface deixou de chamar a heurística de rota de solução ótima.
- O pipeline passou a executar lint antes da compilação e a preservar diagnóstico quando o build falha.

## Limites do construtor de layout

O construtor atual resolve estruturas regulares. Ainda faltam validações e recursos para:

- colisão entre estruturas;
- estruturas fora dos limites do piso;
- sobreposição de zonas;
- pilares, paredes internas e obstáculos;
- mezaninos e múltiplos pavimentos;
- ruas curvas ou topologias irregulares;
- arrastar, girar e posicionar livremente cada estrutura;
- largura de circulação validada conforme equipamento real.

## Limites do planejador de rotas

O planejador atual usa uma geometria simplificada e uma heurística de vizinho mais próximo. Antes de apoiar decisões físicas, precisa evoluir para um grafo operacional que represente:

- sentidos permitidos;
- pontos de cruzamento;
- obstáculos permanentes e temporários;
- raio de giro;
- largura e comprimento do equipamento;
- velocidade por zona;
- tempo de coleta e entrega;
- filas e congestionamentos;
- múltiplos equipamentos;
- bateria, prioridade e capacidade de carga.

Qualquer percentual exibido hoje deve ser descrito como redução de distância no cenário calculado, nunca como economia financeira ou produtividade comprovada.

## Potencial comercial

Existe possibilidade real de monetização, porém a entrada recomendada não é vender imediatamente uma assinatura de WMS. O caminho de menor risco é vender projeto ou piloto assistido:

1. mapear uma operação real;
2. importar dados anonimizados;
3. configurar o layout;
4. demonstrar localização e rastreabilidade;
5. simular um problema delimitado;
6. comparar indicadores antes e depois;
7. documentar limitações e resultado.

A primeira proposta comercial deve vender diagnóstico, modelagem e validação — não prometer economia antes de medir.

## Métricas necessárias em um piloto

- distância percorrida por tarefa;
- quantidade de viagens;
- tempo de ciclo medido;
- tempo de espera;
- divergências de endereço;
- percentual de posições conferidas;
- rupturas de picking;
- reabastecimentos emergenciais;
- intervenções manuais;
- erros de identificação;
- esforço e deslocamento com carga;
- disponibilidade do sistema.

## Bloqueios antes de uso produtivo

### Críticos

- banco de dados transacional;
- autenticação, autorização e separação entre empresas;
- eventos de auditoria append-only com horário do servidor;
- backups e restauração;
- histórico real de versões de layout;
- modo explícito de importação completa versus atualização parcial;
- unidades de medida e conversões;
- modelagem de conteúdo de pallet/caixa e relações pai-filho;
- recebimento e expedição completos;
- testes automatizados das regras de estoque e rastreabilidade;
- instalação reproduzível com arquivo de lock de dependências;
- política de privacidade e análise de LGPD quando houver dados de operadores.

### Importantes

- grafo de rotas mais fiel;
- calibração com distâncias e tempos reais;
- integração por API;
- monitoramento e logs de produção;
- acessibilidade e testes em aparelhos variados;
- tratamento de falhas offline e conflitos de sincronização.

## Robótica

O projeto pode futuramente atuar como orquestrador de missões, traduzindo endereço logístico em ponto físico e acompanhando estados como criada, aceita, em execução, pausada, concluída ou falhou.

Ele não deve comandar motores nem ser a única camada de segurança. Uma integração real exigirá controlador de frota, navegação embarcada, sensores, parada segura, análise de risco, normas aplicáveis e validação em área controlada.

## Posicionamento recomendado no LinkedIn

Usar:

> Protótipo funcional de laboratório logístico 3D para criação de layouts, visualização de estoque, rastreabilidade por eventos e simulação de distância em rotas internas.

Declarar:

- dados atuais sintéticos;
- resultados de rota calculados, não medidos;
- ausência de validação em operação real;
- busca por profissionais ou empresas interessados em fornecer dados anonimizados e avaliar um piloto.

Evitar:

- “WMS pronto”;
- “gêmeo digital em tempo real”;
- “IA encontrou a melhor rota”;
- “reduz custos em X%”;
- “já controla robôs”;
- qualquer alegação de resultado sem piloto real.

## Decisão

Continuar o projeto faz sentido. A base existente é reaproveitável e demonstra competência real em domínio logístico, modelagem de dados, interface 3D e regras operacionais.

A próxima validação decisiva não é adicionar mais efeitos visuais. É conseguir um conjunto de dados anonimizados, modelar um processo específico e medir se o sistema ajuda alguém a enxergar, rastrear ou decidir melhor.
