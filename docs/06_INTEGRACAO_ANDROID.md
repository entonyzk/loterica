# 06. Plano de Integração Android (Capacitor & Google Play)

O **LOTUS AI** compartilha uma única base frontend React/TypeScript (`dist/`) e um único backend REST (`server.ts`) + banco PostgreSQL entre o site, o PWA e o aplicativo Android nativo empacotado com **Capacitor**.

## Estado Atual na Etapa 1
- Dependências oficiais instaladas no `package.json`: `@capacitor/core`, `@capacitor/cli` e `@capacitor/android`.
- Arquivo `capacitor.config.ts` tipado oficialmente (`appId: "ai.lotus.analytics"`, `appName: "LOTUS AI"`, `webDir: "dist"`, `androidScheme: "https"`).
- Interface responsiva compatível com Android WebView (`viewport-fit=cover`, `env(safe-area-inset-bottom)` na barra inferior e alvos de toque $\ge 44\text{px}$).
- **IMPORTANTE**: O projeto nativo `/android`, o APK e o AAB **ainda não foram gerados nem compilados**, pois o ambiente web atual não possui Android SDK, Gradle e JDK instalados.

## Passo a Passo para Gerar o Projeto Android, APK e AAB (Ambiente Externo com Android SDK)

### 1. Compilar o Frontend Web e Criar o Projeto Android
```bash
npm run build
npx cap add android
npx cap sync android
```
*Em atualizações futuras da interface:* executar `npm run build && npx cap sync android`.

### 2. Autenticação e CORS em WebView Android
- Configurar `CORS_ORIGIN` no servidor de produção incluindo `https://localhost` e `capacitor://localhost`.
- Em builds nativos empacotados, configurar `VITE_API_BASE_URL` apontando para o domínio HTTPS da API em produção e utilizar fluxo de autenticação compatível com WebView nativa (ex.: `@capacitor-firebase/authentication` ou Custom Tabs na Etapa 8), já que `signInWithPopup` é específico para navegadores web.

### 3. Gerar APK de Testes (Debug)
```bash
cd android
./gradlew assembleDebug
# Saída esperada: android/app/build/outputs/apk/debug/app-debug.apk
```

### 4. Gerar AAB Assinado para Google Play Store
1. Gerar keystore de produção segura (`keytool -genkey -v -keystore lotus-release.keystore ...`) — nunca versionar no Git.
2. Configurar `signingConfigs.release` em `android/app/build.gradle`.
3. Executar:
```bash
cd android
./gradlew bundleRelease
# Saída esperada: android/app/build/outputs/bundle/release/app-release.aab
```
4. Testar em dispositivo real/emulador antes de enviar `app-release.aab` ao Google Play Console.
