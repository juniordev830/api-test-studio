# API Test Studio

Ferramenta CLI Node.js 22 para verificar status de endpoints REST, sem dependências externas. Timeout de 5 segundos e redirecionamentos desativados.

## Estado

**MVP funcional / projeto inicial de portfólio.** Implementa o núcleo descrito abaixo, mas não é produto pronto para produção.

## Como executar

```bash
node src/cli.js http://127.0.0.1:3000/health 200
```

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
