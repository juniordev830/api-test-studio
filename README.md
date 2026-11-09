# API Test Studio

Ferramenta CLI Node.js 22 para verificar status de endpoints REST, sem dependências externas. Timeout de 5 segundos e redirecionamentos desativados.

## Estado

**MVP funcional / projeto inicial de portfólio.** Implementa o núcleo descrito abaixo, mas não é produto pronto para produção.

## Como executar

```bash
node src/cli.js http://127.0.0.1:3000/health 200
node src/cli.js http://127.0.0.1:3000/health 200 --method HEAD --timeout 2000
```

O método padrão é `GET`. Use `--method HEAD` para conferir o status sem pedir o corpo da resposta. O parâmetro `--timeout` define o tempo máximo em milissegundos, de 1 a 120000.

## Testes

```bash
npm test
```

O GitHub Actions executa os testes automaticamente em pushes e pull requests.

## Segurança e limitações

O usuário escolhe a URL; não execute sobre sistemas sem autorização. MVP é CLI para um endpoint por chamada, não é um test runner completo nem interface web.

## Evolução planejada

Adicionar coleções JSON, assertions de esquema, execução concorrente com limites e frontend React + Playwright.

---
Projeto de Engenharia de Software mantido na conta [juniordev830](https://github.com/juniordev830).


## Coleções de testes HTTP (novo)

O verificador original de um endpoint continua disponível. O novo runner permite
executar **até 100 cenários** por coleção JSON, com **1 a 8 workers**, tentativas
limitadas (0–3 retries) e relatórios JSON, Markdown ou JUnit XML.

Execute sua API local e depois:

```bash
node src/collection-cli.js --file examples/collection.json
node src/collection-cli.js --file examples/collection.json --concurrency 4 --format markdown
node src/collection-cli.js --file examples/collection.json --format junit --output junit.xml
npm test
```

O exemplo assume endpoints locais em 127.0.0.1:3000; ajuste para sua aplicação.
O runner não inicia servidores nem faz chamadas remotas durante os testes automatizados.
Saída: código 0 para sucesso, 1 para falhas de assertions e 2 para entrada inválida.

### Estrutura da coleção

- `name`: nome da coleção.
- `defaults`: método GET/HEAD, timeoutMs (1–120000), expectedStatus (100–599),
  retries (0–3), retryDelayMs (0–5000) e headers opcionais.
- `cases`: lista de objetos com `id` único, `url` HTTP(S), overrides dos
  defaults e até 30 `assertions` por cenário.

Matchers suportados:

| kind | Campos | Exemplo |
| --- | --- | --- |
| status | equals | `{"kind":"status","equals":200}` |
| header | name, equals/contains/exists | `{"kind":"header","name":"content-type","contains":"json"}` |
| text | equals/contains | `{"kind":"text","contains":"ready"}` |
| json | path, equals/exists/type | `{"kind":"json","path":"/data/0/id","type":"number"}` |
| duration | maxMs | `{"kind":"duration","maxMs":500}` |
| size | minBytes/maxBytes | `{"kind":"size","maxBytes":4096}` |

JSON pointers seguem RFC 6901, incluindo escapes `~0` e `~1`.
Cada cenário compara também o status esperado, mesmo sem assertions explícitas.
Os relatórios contêm status, duração, tentativas e falhas, mas não armazenam o
corpo de resposta ou valores de cabeçalhos potencialmente sensíveis.

### Limites e segurança

- Somente GET/HEAD e HTTP(S), sem seguir redirecionamentos.
- URL sem credenciais embutidas ou fragmentos; cabeçalhos de transporte restritos.
- Nomes de cabeçalhos são normalizados para minúsculas: o valor do cenário
  substitui o padrão mesmo com capitalização diferente (`Accept`/`accept`).
  Duplicatas no mesmo objeto são rejeitadas; o limite de 20 cabeçalhos vale
  também após combinar os padrões e o cenário.
- Até 1 MiB de corpo por resposta, interrompendo leitura ao atingir o limite.
- Arquivo JSON de entrada até 128 KiB, com campos desconhecidos rejeitados.
- O runner **não isola destinos de rede**: não execute coleções não confiáveis,
  nem aponte para serviços sem autorização; URLs de rede interna são permitidas
  intencionalmente para testes locais.
- Repetições são limitadas, com execução apenas de métodos idempotentes.
- JUnit escapa XML e Markdown escapa caracteres de tabela.

### Organização

`src/test-api.js` e `src/cli.js` preservam o verificador legado.
`src/assertions.js` valida e avalia verificações de resposta.
`src/collection.js` valida coleções, limita recursos e agenda workers.
`src/report.js` gera formatos para pipelines.
`src/collection-cli.js` oferece execução e exportação por terminal.
`tests/` inclui testes de unidade e integração HTTP local.
