# Codex Meter

Painel local e instalável para acompanhar os limites e a atividade recente da sua própria conta Codex, inclusive no iPhone.

> Projeto independente, sem afiliação com a OpenAI.

## O que mostra

- Percentual usado e tempo para renovar as janelas de 5 horas e semanal.
- Tokens processados hoje, comparação com o pico diário e atividade dos últimos sete dias.
- Atualização periódica a partir da sessão Codex autenticada neste computador.

A atividade diária não presume uma cota diária fixa.

## Requisitos

- Node.js 22 ou mais recente.
- Codex CLI instalado e autenticado na conta que você quer consultar.
- PC e iPhone na mesma rede local para abrir o painel no telefone.

## Instalar e executar

1. Clone o projeto e entre na pasta:

   ```bash
   git clone https://github.com/pedaeadr-hash/codex-meter.git
   cd codex-meter
   ```

2. Confirme que o Codex CLI está disponível e faça login na conta que deseja consultar:

   ```bash
   codex --version
   ```

3. Inicie o painel:

   ```bash
   npm start
   ```

   O servidor inicia na porta `4177` e imprime URLs para o PC e para as interfaces de rede disponíveis. Se aparecerem várias, use no iPhone o endereço da rede compartilhada com o PC.

4. No iPhone, abra a URL marcada `iPhone:` no Safari. Mantenha o PC ligado e o servidor rodando enquanto usar o painel.

### Adicionar à Tela de Início

No Safari, toque em **Compartilhar → Adicionar à Tela de Início → Adicionar**.

## Sua chave e sua conta

Na primeira execução, o servidor cria uma chave aleatória e a salva em `.codex-meter-key`. A URL `iPhone:` já inclui essa chave; o app a guarda apenas no navegador daquele aparelho.

- Cada pessoa gera e usa sua própria chave local. Não copie a chave de outra instalação.
- `.codex-meter-key` e arquivos `.env` são ignorados pelo Git.
- Não coloque sua senha do Codex, token OAuth ou chave pessoal no repositório.
- O servidor inicia `codex app-server` neste computador e usa a sessão Codex local. As credenciais da conta não são enviadas ao navegador do iPhone.
- A chave protege a ponte local; não é uma senha da OpenAI. Não exponha a porta `4177` diretamente à internet. Use apenas em uma rede confiável ou por VPN privada.

Para escolher uma chave própria, defina `CODEX_METER_KEY` antes de iniciar. Use uma sequência longa e aleatória, não uma senha reutilizada.

## API local

```http
GET /api/usage
x-access-key: <sua-chave-local>
```

O endpoint retorna JSON com `primary`, `secondary`, `today`, `week`, `summary` e `updatedAt`. `GET /health` verifica o servidor e não exige chave. Essa é uma ponte local, não uma API pública da Codex: o servidor consulta `codex app-server` por mensagens JSON em `stdin/stdout`.

## Configuração opcional

```powershell
# Windows PowerShell
$env:PORT = "4177"
$env:CODEX_METER_KEY = "escolha-uma-chave-longa-e-aleatoria"
npm start
```

Em macOS ou Linux, defina as mesmas variáveis no shell. Se o executável do Codex não estiver no `PATH`, configure `CODEX_BINARY` com o caminho do Codex CLI.

## Problemas comuns

- **Sem dados:** confirme que o Codex CLI está instalado e autenticado nesta conta do computador.
- **iPhone não abre:** confirme que PC e celular estão na mesma rede, use o IP da interface correta e permita acesso local na firewall.
- **Parou de atualizar:** veja se o PC não suspendeu e se `npm start` continua rodando.
- **Chave inválida:** abra novamente a URL `iPhone:` impressa pelo servidor.

## Desenvolvimento

```bash
npm start
npm test
```

## Licença

MIT. Consulte [`LICENSE`](LICENSE).
