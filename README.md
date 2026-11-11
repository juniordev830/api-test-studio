# API Test Studio

Ferramenta CLI Node.js 22 para verificar status de endpoints REST, sem dependências externas. Timeout de 5 segundos e redirecionamentos desativados.

## Estado

**MVP funcional / projeto inicial de portfólio.** Implementa o núcleo descrito abaixo, mas não é produto pronto para produção.

## Como executar

```bash
node src/cli.js http://127.0.0.1:3000/health 200
node src/cli.js http://127.0.0.1:3000/health 200 --method HEAD --timeout 2000
node src/cli.js http://127.0.0.1:3000/health 200 --max-duration 500
node src/cli.js http://127.0.0.1:3000/health 200 --content-type application/json
```

O método padrão é `GET`. Use `--method HEAD` para conferir o status sem pedir o corpo da resposta. O parâmetro `--timeout` define o tempo máximo em milissegundos, de 1 a 120000. Use `--max-duration` para exigir que o endpoint responda dentro de um limite (em milissegundos, de 1 a 120000). Quando a resposta ultrapassa esse valor, o resultado inclui `durationPassed: false`, `passed: false` e o CLI termina com código 1. Sem a opção, o comportamento anterior é preservado.

`--timeout` limita quanto tempo a requisição pode levar antes de ser cancelada; `--max-duration` verifica a duração da resposta concluída. É possível usar ambos.

`--content-type MIME` exige o tipo de mídia HTTP informado, por exemplo `application/json`. A comparação ignora letras maiúsculas/minúsculas e parâmetros como `charset=utf-8`; não lê o corpo da resposta. Quando o cabeçalho está ausente ou não corresponde, a saída inclui `contentTypePassed: false` e o CLI termina com código 1. Sem a opção, a saída permanece compatível com a versão anterior.

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
