# CD Digital 3D

[![Abrir CD Digital 3D](https://img.shields.io/badge/ABRIR-CD%20DIGITAL%203D-0ea5e9?style=for-the-badge&logo=github)](https://paulo968.github.io/cd-digital-3d/)

**Acesso direto:** https://paulo968.github.io/cd-digital-3d/

Protótipo de centro de distribuição em 3D para visualização operacional, rastreabilidade, testes de layout e construção gradual de uma simulação logística realista.

> Projeto demonstrativo. Não é um WMS de produção nem um controlador certificado de equipamentos reais.

## Modos

### Operacional

Mantém as ferramentas de consulta, layout, estoque, movimentação, rastreabilidade e simulações dirigidas já existentes.

### Realista V2

É um ambiente independente do operacional. Nesta fase contém somente a primeira célula de recebimento:

- um caminhão com seis pallets;
- uma empilhadeira RX 20-20;
- entrada reta na carroceria;
- retirada de um pallet por vez;
- saída de ré antes de qualquer giro;
- depósito no staging;
- saída do caminhão vazio;
- intervalo de um segundo;
- chegada automática do próximo caminhão;
- ciclo contínuo.

## Staging preparado para a próxima fase

Os seis pallets são organizados em um bloco compacto de **duas colunas por três fileiras**, no canto direito da área de recebimento.

A ordem de depósito começa no fundo e termina na fileira mais próxima. Isso evita que a RX20 precise atravessar pallets já posicionados.

Ao lado do bloco existe uma faixa reservada para a futura transpaleteira, com:

- entrada independente;
- largura livre de circulação;
- área de alinhamento;
- espaço de manobra;
- acesso às três fileiras do staging.

## Validação local

```bash
npm ci
npm run lint
npm run test
npm run build
```

A `main` publica automaticamente a aplicação no GitHub Pages.

## Documentação técnica

- [`docs/auditoria-tecnica-negocio-v0.4.md`](docs/auditoria-tecnica-negocio-v0.4.md)
- [`docs/modo-realista-animado.md`](docs/modo-realista-animado.md)
- [`docs/central-operacional-viva.md`](docs/central-operacional-viva.md)
- [`docs/fluxo-industrial-realista.md`](docs/fluxo-industrial-realista.md)

## Licenciamento

O repositório ainda não possui licença de código aberto. A publicação do código não concede automaticamente permissão para copiar, redistribuir ou criar trabalhos derivados.
