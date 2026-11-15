# Guia de validação — API Test Studio

## Estado e abrangência

CLI Node.js 22 de verificação de status HTTP sem dependências externas, com timeout.

## Fontes para revisão

`src/cli.js`, `src/test-api.js`, `tests/options.test.js`, `tests/test-api.test.js`.

## Comandos de verificação

`npm test`; executar a CLI apenas contra serviço local próprio, como `node src/cli.js http://127.0.0.1:3000/health 200`.

Os testes automatizados devem ser revisados junto do código. Caso não tenham sido executados, registrar essa limitação no PR.

## Matriz de regressão

Validar timeout, HTTP HEAD, URL inválida, redirecionamentos, conexão recusada e código de saída; não chamar servidores de terceiros sem permissão.

## Próximo incremento fundamentado

Evoluir para relatórios estruturados, sem implementar redirecionamentos inseguros ou SSRF em eventual execução hospedada.

## Critérios de contribuição

- [ ] Alteração atende comportamento verificável.
- [ ] Foi criada evidência de teste ou procedimento reproduzível.
- [ ] Nenhuma credencial ou dado pessoal foi versionado.
- [ ] O PR identifica claramente o que mudou e o que ainda falta.
