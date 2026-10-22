# Toptech — cobrancas na Hostinger

Aplicacao Next.js com login proprio, MySQL, importacao paginada do Asaas, monitor de sincronizacao, carteira de inadimplentes e historico de contatos. WhatsApp via Evolution e configuracao de SMS via Asaas. O envio de mensagens depende de acao do operador.

## Instalacao na Hostinger

1. Use hospedagem com suporte a aplicativos Node.js. Conecte o repositorio `rangelac/toptech`, branch `main`, pasta raiz.
2. No painel do site, em **Bancos de dados > Gerenciamento**, crie um banco MySQL e um usuario com acesso a esse banco. Copie os nomes completos, incluindo o prefixo fornecido pela Hostinger.
3. Nas variaveis de ambiente do aplicativo, importe o arquivo privado `toptech-hostinger.env` ou preencha `.env.example`. Complete `DB_NAME`, `DB_USER` e `DB_PASSWORD`. Na hospedagem gerenciada Hostinger, use `DB_HOST=127.0.0.1` e `DB_PORT=3306`.
4. Defina `APP_URL=https://toptech.cartao.in` e `HOSTNAME=0.0.0.0`. Use o dominio realmente conectado ao aplicativo e com SSL ativo. Se estiver testando em outro dominio, altere APP_URL para esse endereco.
5. Configuracao de compilacao: **Next.js**, **Node.js 22 (22.13 ou superior) ou 24**, instalacao `npm ci`, compilacao `npm run build`, diretorio de saida **.next**. O servidor gerado e `.next/standalone/server.js`; se houver campo de comando de inicializacao, use `npm start`. Nao use a configuracao antiga de Vinext ou a pasta dist.
6. Implante. O banco recebe as tabelas automaticamente no primeiro acesso que necessite de dados. Nenhuma tabela existente e apagada.
7. Entre com o usuario `toptech` e a senha correspondente a `TOPTECH_PASSWORD_HASH` do arquivo privado. Em **Integracoes**, conecte o Asaas e inicie a sincronizacao. A chave fica no servidor, criptografada no banco.
8. Para atualizacoes via webhook, configure no Asaas `https://toptech.cartao.in/api/webhooks/asaas`, com o token definido em `ASAAS_WEBHOOK_TOKEN` e eventos de cobranca relevantes. Realize a importacao inicial antes de habilitar os eventos.

O arquivo privado de entrega contem segredos: nao envie ao GitHub. `ENCRYPTION_KEY` e `TOPTECH_PASSWORD_HASH` sao obrigatorios. Nao troque ENCRYPTION_KEY depois de salvar credenciais de integracao sem reconfigurar essas integracoes. Campos Evolution podem ficar vazios ate contratar/configurar o provedor e conectar a instancia pelo painel. ASAAS_API_KEY tambem pode ficar vazio quando a chave sera cadastrada no painel.

A instalacao usa um banco novo. Clientes e cobrancas podem ser reimportados do Asaas; observacoes e historico de contatos da hospedagem anterior precisam de exportacao especifica, se houver dados a preservar. Mantenha a hospedagem anterior disponivel ate validar a nova.

## Diagnostico

- **Next.js build produced no standalone server**: confirme que o deploy usa o commit atualizado, `npm run build` e saida `.next`.
- **Configure o banco MySQL**: falta a variavel indicada. Confirme os valores em ambiente de execucao e reimplante.
- **Nao foi possivel acessar o banco MySQL**: confira banco, usuario, senha, permissoes e host 127.0.0.1. O log registra somente o codigo de erro, sem a senha.
- **Origem da solicitacao invalida**: APP_URL deve coincidir com o endereco aberto no navegador, incluindo https.
- **Acesso ainda nao configurado**: falta TOPTECH_PASSWORD_HASH. O formato e `pbkdf2:100000:salt:hash`.
- **Chave Asaas invalida**: configure uma chave de producao valida em Integracoes. Nao use chave sandbox com o endpoint de producao.

## Desenvolvimento e verificacao

Copie `.env.example` para `.env.local`, complete o banco e segredos, ajuste APP_URL para `http://localhost:3000` apenas no desenvolvimento e execute `npm ci` / `npm run dev`.

`npm run build` gera o servidor standalone e copia seus recursos estaticos. `npm start` executa o resultado. Para executar fora da Hostinger, exporte as variaveis de ambiente antes de iniciar.

`node tests/auth.test.mjs` e `node tests/sync.test.mjs` verificam autenticacao e retomada de importacao. Use Node 24 nesses testes por causa de `node:sqlite`. Testes MySQL devem apontar somente para um banco dedicado de teste, nunca para o banco de clientes.

Documentacao: https://www.hostinger.com/support/connecting-a-hostinger-mysql-database-to-a-node-js-application/ e https://nextjs.org/docs/app/api-reference/config/next-config-js/output

Para testar a integracao MySQL, use um banco exclusivo cujo nome comece com `toptech_test_`, exporte DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME e execute `node tests/mysql.test.mjs`. Esse teste limpa as tabelas do banco de teste. Depois de compilar, `node tests/server.test.mjs` testa o servidor standalone por HTTP, usando os dados de teste anteriores. Nenhum teste envia mensagens reais nem consulta clientes no Asaas.
