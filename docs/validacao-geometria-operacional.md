# Validação da geometria operacional

## Critérios de apoio

- o pallet deve repousar imediatamente sobre a superfície de apoio da longarina, plataforma ou carroceria;
- a pequena folga visual deve evitar sobreposição de faces sem produzir efeito de flutuação;
- os garfos devem alcançar a face inferior do pallet sem atravessar a carga;
- a altura de coleta e a altura de deposição devem usar a mesma referência geométrica;
- o recebimento demonstrativo usa uma plataforma baixa compatível com a altura mínima dos garfos;
- a posição de carga no caminhão usa a superfície superior real do assoalho da carroceria.

## Regressão automática

Os testes unitários protegem a relação entre longarina, pallet e garfos nos níveis das estruturas. Lint, testes e build são executados antes do merge.

A inspeção visual em navegador continua necessária para validar câmera, percepção de profundidade e aparência final em diferentes telas.