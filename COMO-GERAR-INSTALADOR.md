# Instalador completo do Mavi SFTP

O instalador inclui Electron, Node.js, o cliente SFTP e um Python portátil usado
nas conversões CSV/XLSX. A pessoa que recebe o instalador não precisa instalar
Node.js, Python ou bibliotecas adicionais.

## Gerar

Em um PowerShell aberto nesta pasta, execute:

```powershell
npm run installer
```

Na primeira execução, o comando baixa a distribuição portátil oficial do Python.
Depois, gera este arquivo:

```text
release\Mavi-SFTP-Setup-1.0.0.exe
```

Esse é o único arquivo que precisa ser enviado ao usuário. Ele instala o programa,
cria atalhos na Área de Trabalho e no menu Iniciar e não exige acesso de
administrador quando instalado apenas para o usuário atual.

## Nova versão

Altere o campo `version` do `package.json` antes de gerar novamente. Exemplo:

```powershell
npm version patch --no-git-tag-version
npm run installer
```

O Windows pode exibir um aviso do SmartScreen porque o executável não possui
assinatura digital. Isso não significa que faltem dependências; para remover o
aviso em distribuição pública, é necessário assinar o instalador com um
certificado de assinatura de código.
