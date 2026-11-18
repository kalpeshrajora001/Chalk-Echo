# Chalk Echo

Expo React Native (TypeScript) app.

## Requirements

- Node.js 22 LTS (see `.nvmrc`)
- npm

## Scripts

```bash
npm start          # Expo dev server
npx expo-doctor    # project health checks
npx tsc --noEmit   # typecheck
```

## Android builds

Use Expo cloud builds (EAS). Local Android Studio / SDK / emulators are not required.

```bash
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

Profiles are defined in `eas.json` (`development`, `preview`, `production`).
