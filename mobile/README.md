# QamqorMap — мобильді қосымша (Android / iOS)

React Native + Expo (SDK 58) + TypeScript. Қосымша сайтпен **бір серверге және бір PostgreSQL дерекқорына** қосылады:

```text
Сайт:      HTML + CSS + JavaScript  →  HTTP/REST API  →  Node.js + Express  →  PostgreSQL
Қосымша:   React Native + Expo      →  сол HTTP/REST API  →  Node.js + Express  →  PostgreSQL
```

Қосымшада жасалған өтініш, ұсыныс, хат және растау бірден сайтта да көрінеді (және керісінше).
Қала мен санаттардың идентификаторлары, мәртебе кодтары және қате кодтары сайттағымен бірдей.

## 1. Серверді іске қосу (компьютерде)

Түбірлік папкада (`QamqorMap/`):

```bash
npm install
npm run migrate        # миграциялар (001–004), бар деректер сақталады
npm run seed           # оқу деректері (қайталау қауіпсіз)
npm start              # http://localhost:3000
```

### Қорғауға арналған бөлек демо дерекқор

```bash
npm run demo:setup     # qamqormap_demo дерекқорын жасайды, миграция + оқу деректері
npm run demo           # серверді демо дерекқормен және «Демо-кіру» қосулы күйде іске қосады
npm run demo:reset     # көрсетілімнен кейін демо дерекқорды бастапқы күйге қайтарады
```

Windows-та: **`IskeQosu-Demo.bat`** (бірінші рет PostgreSQL әкімшісінің құпиясөзін сұрауы мүмкін).
Негізгі `qamqormap` дерекқоры демо режимде өзгермейді. Демо-кіру тек `DEMO_LOGIN=true` болғанда
(яғни `npm run demo` арқылы) және тек `is_demo` аккаунттарына ашылады.

Демо аккаунттар (құпиясөзі `Demo12345`): `aigerim@demo.qamqormap.kz` (өтініш иесі),
`daniyar@demo.qamqormap.kz` (ерікті), `coordinator@demo.qamqormap.kz` (координатор).

## 2. Мобильді қосымшаны іске қосу

**Windows-та бір батырмамен:** `IskeQosu-Mobile.bat` — серверді тексереді (қосылмаса, демо режимде іске қосады),
бірінші рет пакеттерді орнатады және **tunnel** режимінде QR-код шығарады. Телефон кез келген желіде болса да қосылады.
Бір Wi‑Fi-да болсаңыз, жылдамырақ: `IskeQosu-Mobile.bat lan`.

Қолмен (алдымен түбір папкада `npm run demo`):

```bash
cd mobile
npm install
npx expo start --tunnel ngrok --clear   # немесе түбірден: npm run mobile
```

* **Android:** Expo Go (ең соңғы нұсқа, SDK 58) → **Scan QR code**.
* **iPhone:** **Камера** қосымшасымен QR-кодты сканерлеп, «Expo Go-да ашу» хабарын басыңыз.
* **Android эмуляторы:** `npx expo start --android`.

### API мекенжайы (автоматты)

Expo Go-да қосымша API-ге **Expo серверінің өзі арқылы** жетеді: `metro.config.js` `/api/*` сұрауларын
компьютердегі `http://127.0.0.1:3000`-ге жібереді. LAN режимінде мекенжай `http://192.168.x.x:8081`,
tunnel режимінде `https://…exp.direct` болады — екеуінде де 3000-портты ашудың, IP жазудың немесе брандмауэр рұқсатының қажеті жоқ.

Қолмен баптау қажет болса (басқа сервер): **Профиль → Сервер мекенжайы**, немесе `EXPO_PUBLIC_API_URL=https://… npx expo start`.
Бұрын мекенжай қолмен жазылған болса: «Әдепкі мекенжайға қайтару».

Expo Go компьютердегі Expo серверінен жұмыс істейді — терезелерді жаппаңыз. Ақаулар мен себептер кестесі: [`../DEPLOY.md`](../DEPLOY.md#3-мобильді-қосымша-expo-go--tunnel).

## 3. Android APK жинау

**Бұлттағы жинау (ұсынылады, Android SDK керек емес):**

```bash
npx eas-cli@latest login           # тегін Expo аккаунты
npx eas-cli@latest build -p android --profile preview
```

Жинау аяқталғанда APK сілтемесі мен QR-код шығады; телефонда ашып орнатасыз (`eas.json` → `preview` профилі `apk` жасайды).

**Компьютерде жинау** (JDK 17, Android Studio және Android SDK орнатылған болуы керек):

```bash
npx expo prebuild -p android
cd android && ./gradlew assembleRelease      # Windows: gradlew.bat assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
adb install android/app/build/outputs/apk/release/app-release.apk
```

APK HTTP мекенжайға (жергілікті сервер) қосыла алуы үшін `usesCleartextTraffic` қосылған
(`expo-build-properties`). Нақты жариялауда серверді HTTPS арқылы ашыңыз.

## 4. iOS

* Тексеру және қорғау: **Expo Go** (App Store) арқылы — Mac керек емес.
* Симулятор нұсқасы: `npx eas-cli@latest build -p ios --profile preview`.
* Нақты құрылғыға орнатылатын `.ipa` үшін Apple Developer аккаунты қажет.

## 5. Тексерулер

```bash
cd mobile
npm run typecheck      # TypeScript
npm test               # kk/ru/en сөздіктері, кілттер, ортақ файлдардың сайтпен сәйкестігі
npm run export:android # Android JS бандлы (Hermes)
npm run export:ios     # iOS JS бандлы
npm run export:web     # браузерде тексеруге арналған нұсқа (dist-web)
```

Браузерде толық сценарий (телефон көрінісі 390×844, Playwright):

```bash
CORS_ORIGINS=http://localhost:8081 npm run demo      # түбірлік папкада
node mobile/scripts/serve-web.mjs                     # http://localhost:8081
node mobile/scripts/e2e-web.mjs                       # 25 қадам; кейін: npm run demo:reset
```

Түбірлік папкадағы `npm test` — API тесттері, соның ішінде мобильді қосымшаның API-і (`tests/mobile-api.test.js`).

## 6. Құрылымы

```text
mobile/
  app.json, eas.json         Expo баптауы, APK профильдері
  src/app/                   экрандар (Expo Router)
    (tabs)/index.tsx         Карта (басты экран, төменгі панель)
    (tabs)/requests.tsx      Өтініштер: барлығы, менікі, ұсыныстар, тапсырмалар
    (tabs)/notifications.tsx Хабарламалар және чаттар
    (tabs)/profile.tsx       Профиль, тіл, рөл функциялары, демо-кіру
    request/[id].tsx         Өтініш беті, рөлге сай әрекеттер
    request/new.tsx          Жаңа өтініш / өңдеу / қайта жіберу
    chat/[id].tsx            Чат (оқылу күйімен)
    event/[id].tsx           Табиғи апат оқиғасы
    disasters.tsx, report.tsx, event-form.tsx, coordinator.tsx, volunteer.tsx, settings.tsx …
  src/components/            бірыңғай компоненттер жүйесі
  src/map/                   Leaflet картасы (WebView / iframe), хабар алмасу
  src/i18n/                  тіл жүйесі; mobile-kk/ru/en.ts — қосымшаның өз мәтіндері
  src/shared/                сайттан көшірілген сөздіктер, иконкалар, Leaflet (npm run sync)
  src/lib/                   API клиенті, аккаунт, анықтамалықтар, сүзгілер, форматтау
```

## 7. Қауіпсіздік және деректер

* Қосымша PostgreSQL-ге тікелей қосылмайды — тек REST API арқылы.
* Кіру токені Keychain/Keystore-да (`expo-secure-store`), серверде тек SHA-256 хэші сақталады.
  Bearer токені браузерде өздігінен жіберілмейді, сондықтан мобильді сессияға CSRF қаупі жоқ; сайттың cookie сессиясы бұрынғыдай CSRF тексерісімен.
* Нақты мекенжай, телефон, нақты координат, чат — тек өтініш иесіне, таңдалған орындаушыға және координаторға (сервер тексереді).
* Картаға тек шамаланған жария нүктелер жіберіледі.
* Сыртқы немесе жаппай хабарламалар жіберілмейді; хабарламалар қосымша ішінде, алушының тілінде.
* Карта қабаттары — OpenStreetMap (API кілті керек емес, телефонда интернет қажет).
