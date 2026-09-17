# BTA Messenger Desktop

Aplicativo desktop complementar do BTA Messenger para Windows, Linux e macOS. Ele abre o Messenger em uma janela nativa e adiciona um seletor seguro de tela ou janela para o compartilhamento de display.

## Baixar

Os instaladores publicados estão na página de [Releases](https://github.com/JpAndreBTA/BTA-Messenger/releases). O instalador já inclui o runtime do aplicativo: o usuário final não precisa instalar Node.js, npm ou outra dependência de desenvolvimento.

## O que já existe

- Janela nativa apontando diretamente para `https://engine.btastudio.com/chat`, com a mesma interface, tema, login, visitante e ações da web.
- Isolamento entre o processo principal e a página remota usando `contextIsolation`, `sandbox` e `nodeIntegration: false`.
- Navegação limitada ao domínio do BTA Engine; links externos são encaminhados ao navegador padrão.
- Seletor de telas e janelas antes de iniciar o compartilhamento.
- Interface do Messenger carregada diretamente do mesmo `/chat` da web, com login, visitante, temas, abas e botões sincronizados.
- No Windows, captura de áudio do sistema em uma faixa RTP separada, com loopback local silenciado pelo aplicativo.
- Microfone continua sendo capturado pelo Messenger como uma faixa RTP independente, com cancelamento de eco, supressão de ruído e ganho automático.
- Na reprodução, voz e áudio do sistema remoto ficam em elementos de áudio independentes para evitar que o controle de uma faixa misture ou reenvie a outra.
- A conta usa o mesmo backend do BTA Engine: usuários, servidores, comunidades/grupos, amigos, DMs, mensagens, figurinhas, favoritos, chamadas e permissões permanecem sincronizados entre o site e o aplicativo.
- Builds configurados para NSIS Windows, AppImage Linux e DMG macOS.
- Instalador Windows com ícone BTA, painel visual com o mascote e atalhos de área de trabalho/menu Iniciar.
- Atualização nativa pelo GitHub: a cada abertura o aplicativo verifica uma vez, baixa a nova versão em segundo plano e mostra `Atualizar agora` somente quando o instalador estiver pronto.

## Executar localmente

Requer Node.js 22 ou superior.

```bash
npm ci
npm run check
npm start
```

O aplicativo usa o ambiente online do BTA Engine e abre diretamente a rota oficial `/chat`. O servidor, autenticação, banco de dados, mensagens e permissões permanecem no domínio do BTA Engine e não fazem parte deste repositório. O cliente não mantém uma base local paralela nem requer Node.js para ser executado depois da instalação.

Depois de instalado, o aplicativo não exige Node.js nem npm. As atualizações são baixadas apenas uma vez por abertura, em segundo plano, e só são aplicadas quando o usuário seleciona `Atualizar agora`; nesse momento o aplicativo fecha e reabre com a versão nova.

## Gerar instalador

```bash
npm run dist:win
npm run dist:linux
npm run dist:mac
```

Os artefatos aparecem em `release/`, que é ignorada pelo Git.

## Limites por plataforma

O aplicativo desktop aplica a proteção nativa de loopback no Windows. Em macOS e Linux, a captura nativa de áudio do sistema depende do suporte do sistema operacional e do Electron; nesses casos o compartilhamento de vídeo continua disponível e a interface informa quando nenhuma faixa de áudio foi fornecida. O microfone permanece protegido pelo cancelamento de eco do navegador em todas as plataformas.

O protocolo de mídia mantém transceptores separados para vídeo da tela, áudio do sistema e microfone. A saída da própria chamada não deve ser usada como áudio de apresentação; quando a plataforma não permite a filtragem nativa, o áudio do sistema não é anunciado como protegido.

Para participantes na mesma rede, a otimização deve usar candidatos locais do ICE ou um relay local opcional e manter o SFU/TURN como fallback por participante. A rota local nunca deve ser obrigatória, nem deve alterar a autorização, a gravação ou a visibilidade dos outros participantes.

## Estrutura

```text
main.cjs              processo principal e políticas de segurança
preload.cjs           ponte mínima exposta à página remota
picker-preload.cjs    ponte mínima do seletor nativo
capture-picker.html   interface local para tela/janela
.github/workflows/    builds multiplataforma por tag
```

## Licença

Distribuído sob a licença MIT. Consulte [LICENSE](LICENSE).
