// Қазақстан қалаларының анықтамалығы (облыстық, аудандық және республикалық маңызы бар қалалар).
// Идентификаторлар тұрақты: жаңа қала тек тізімнің соңына жаңа id-мен қосылады.
// Координаттар — картаның шамамен алынған орталығы.

export const REGIONS = {
  rep: ['Республикалық маңызы бар қала', 'Город республиканского значения', 'City of republican significance'],
  abai: ['Абай облысы', 'Абайская область', 'Abai Region'],
  akm: ['Ақмола облысы', 'Акмолинская область', 'Akmola Region'],
  akt: ['Ақтөбе облысы', 'Актюбинская область', 'Aktobe Region'],
  alm: ['Алматы облысы', 'Алматинская область', 'Almaty Region'],
  atr: ['Атырау облысы', 'Атырауская область', 'Atyrau Region'],
  bko: ['Батыс Қазақстан облысы', 'Западно-Казахстанская область', 'West Kazakhstan Region'],
  zhm: ['Жамбыл облысы', 'Жамбылская область', 'Jambyl Region'],
  jet: ['Жетісу облысы', 'Жетысуская область', 'Jetisu Region'],
  krg: ['Қарағанды облысы', 'Карагандинская область', 'Karaganda Region'],
  kst: ['Қостанай облысы', 'Костанайская область', 'Kostanay Region'],
  kzo: ['Қызылорда облысы', 'Кызылординская область', 'Kyzylorda Region'],
  mng: ['Маңғыстау облысы', 'Мангистауская область', 'Mangystau Region'],
  pvl: ['Павлодар облысы', 'Павлодарская область', 'Pavlodar Region'],
  sko: ['Солтүстік Қазақстан облысы', 'Северо-Казахстанская область', 'North Kazakhstan Region'],
  trk: ['Түркістан облысы', 'Туркестанская область', 'Turkistan Region'],
  ulu: ['Ұлытау облысы', 'Улытауская область', 'Ulytau Region'],
  vko: ['Шығыс Қазақстан облысы', 'Восточно-Казахстанская область', 'East Kazakhstan Region'],
};

// [id, қазақша, орысша, облыс, lat, lng, 'латын нұсқалары; орысша балама атаулар', ірі қала]
const RAW = [
  [1, 'Астана', 'Астана', 'rep', 51.1694, 71.4491, 'astana; nur-sultan; нур-султан; нұр-сұлтан; akmola; целиноград', true],
  [2, 'Алматы', 'Алматы', 'rep', 43.2389, 76.8897, 'almaty; alma-ata; алма-ата', true],
  [3, 'Шымкент', 'Шымкент', 'rep', 42.3417, 69.5901, 'shymkent; chimkent; чимкент', true],

  [4, 'Семей', 'Семей', 'abai', 50.4111, 80.2275, 'semey; semei; semipalatinsk; семипалатинск', true],
  [5, 'Аягөз', 'Аягоз', 'abai', 47.9647, 80.4392, 'ayagoz; ayaguz; аягуз', false],
  [6, 'Курчатов', 'Курчатов', 'abai', 50.7564, 78.5400, 'kurchatov', false],
  [7, 'Шар', 'Шар', 'abai', 49.5856, 81.0472, 'shar; chary; чарск', false],

  [8, 'Көкшетау', 'Кокшетау', 'akm', 53.2833, 69.3833, 'kokshetau; kokchetav; кокчетав', true],
  [9, 'Степногорск', 'Степногорск', 'akm', 52.3500, 71.8833, 'stepnogorsk', false],
  [10, 'Ақкөл', 'Акколь', 'akm', 51.9958, 70.9361, 'akkol; akkol\'; алексеевка', false],
  [11, 'Атбасар', 'Атбасар', 'akm', 51.8000, 68.3333, 'atbasar', false],
  [12, 'Державин', 'Державинск', 'akm', 51.1000, 66.3167, 'derzhavinsk; derzhavin', false],
  [13, 'Ерейментау', 'Ерейментау', 'akm', 51.6197, 73.1036, 'ereymentau; yereymentau; ерментау', false],
  [14, 'Есіл', 'Есиль', 'akm', 51.9556, 66.4042, 'esil; yesil; есиль', false],
  [15, 'Макинск', 'Макинск', 'akm', 52.6333, 70.4167, 'makinsk', false],
  [16, 'Степняк', 'Степняк', 'akm', 52.8333, 70.7833, 'stepnyak', false],
  [17, 'Щучинск', 'Щучинск', 'akm', 52.9333, 70.2000, 'shchuchinsk; shuchinsk; borovoe; бурабай', false],
  [18, 'Қосшы', 'Косшы', 'akm', 51.0633, 71.4200, 'kosshy; koshy; косши; лесное', false],

  [19, 'Ақтөбе', 'Актобе', 'akt', 50.2797, 57.2072, 'aktobe; aqtobe; aktyubinsk; актюбинск', true],
  [20, 'Алға', 'Алга', 'akt', 49.9031, 57.3350, 'alga', false],
  [21, 'Жем', 'Жем', 'akt', 48.8264, 58.1442, 'zhem; emba; эмба', false],
  [22, 'Қандыағаш', 'Кандыагаш', 'akt', 49.4572, 57.4192, 'kandyagash; qandyagash; октябрьск', false],
  [23, 'Темір', 'Темир', 'akt', 49.1406, 57.1225, 'temir', false],
  [24, 'Хромтау', 'Хромтау', 'akt', 50.2503, 58.4347, 'khromtau; hromtau', false],
  [25, 'Шалқар', 'Шалкар', 'akt', 47.8333, 59.6000, 'shalkar; chelkar; челкар', false],

  [26, 'Қонаев', 'Конаев', 'alm', 43.8667, 77.0667, 'konaev; qonaev; kapshagay; капшагай; қапшағай', true],
  [27, 'Есік', 'Есик', 'alm', 43.3550, 77.4528, 'esik; issyk; иссык', false],
  [28, 'Қаскелең', 'Каскелен', 'alm', 43.2000, 76.6167, 'kaskelen; qaskelen', false],
  [29, 'Талғар', 'Талгар', 'alm', 43.3033, 77.2375, 'talgar', false],
  [30, 'Алатау', 'Алатау', 'alm', 43.6400, 77.0200, 'alatau; g4 city', false],

  [31, 'Талдықорған', 'Талдыкорган', 'jet', 45.0156, 78.3739, 'taldykorgan; taldyqorgan; талдыкурган', true],
  [32, 'Жаркент', 'Жаркент', 'jet', 44.1667, 80.0000, 'zharkent; panfilov; панфилов', false],
  [33, 'Текелі', 'Текели', 'jet', 44.8300, 78.8239, 'tekeli', false],
  [34, 'Үштөбе', 'Уштобе', 'jet', 45.2500, 77.9833, 'ushtobe; ushtobe', false],
  [35, 'Сарқан', 'Саркан', 'jet', 45.4167, 79.9167, 'sarkan; sarqan; сарканд', false],
  [36, 'Үшарал', 'Ушарал', 'jet', 46.1694, 80.9394, 'usharal; ucharal; учарал', false],

  [37, 'Атырау', 'Атырау', 'atr', 47.1167, 51.8833, 'atyrau; guryev; гурьев', true],
  [38, 'Құлсары', 'Кульсары', 'atr', 46.9536, 54.0197, 'kulsary; qulsary', false],

  [39, 'Орал', 'Уральск', 'bko', 51.2333, 51.3667, 'oral; uralsk; uralsk', true],
  [40, 'Ақсай', 'Аксай', 'bko', 51.1667, 52.9833, 'aksay; aksai', false],

  [41, 'Тараз', 'Тараз', 'zhm', 42.9000, 71.3667, 'taraz; zhambyl; dzhambul; джамбул; аулиеата', true],
  [42, 'Жаңатас', 'Жанатас', 'zhm', 43.5667, 69.7500, 'zhanatas', false],
  [43, 'Қаратау', 'Каратау', 'zhm', 43.1667, 70.4667, 'karatau; qaratau', false],
  [44, 'Шу', 'Шу', 'zhm', 43.6000, 73.7667, 'shu; chu; чу', false],

  [45, 'Қарағанды', 'Караганда', 'krg', 49.8047, 73.1094, 'karaganda; qaragandy; karagandy', true],
  [46, 'Балқаш', 'Балхаш', 'krg', 46.8481, 74.9950, 'balkhash; balqash', false],
  [47, 'Теміртау', 'Темиртау', 'krg', 50.0500, 72.9667, 'temirtau', false],
  [48, 'Шахтинск', 'Шахтинск', 'krg', 49.7167, 72.5833, 'shakhtinsk; shahtinsk', false],
  [49, 'Саран', 'Сарань', 'krg', 49.8000, 72.8333, 'saran; saran\'', false],
  [50, 'Абай', 'Абай', 'krg', 49.6333, 72.8667, 'abay; abai', false],
  [51, 'Приозерск', 'Приозерск', 'krg', 46.0333, 73.7000, 'priozersk', false],
  [52, 'Қарқаралы', 'Каркаралинск', 'krg', 49.4167, 75.4667, 'karkaraly; karkaralinsk; qarqaraly', false],

  [53, 'Жезқазған', 'Жезказган', 'ulu', 47.7833, 67.7667, 'zhezkazgan; jezkazgan; dzhezkazgan; джезказган', true],
  [54, 'Сәтбаев', 'Сатпаев', 'ulu', 47.9000, 67.5333, 'satpayev; satbayev; satpaev', false],
  [55, 'Қаражал', 'Каражал', 'ulu', 48.0000, 70.7833, 'karazhal; qarazhal', false],

  [56, 'Қостанай', 'Костанай', 'kst', 53.2144, 63.6246, 'kostanay; qostanay; kustanay; кустанай', true],
  [57, 'Рудный', 'Рудный', 'kst', 52.9667, 63.1167, 'rudny; rudnyy; rudnyi', false],
  [58, 'Лисаковск', 'Лисаковск', 'kst', 52.5500, 62.5000, 'lisakovsk', false],
  [59, 'Арқалық', 'Аркалык', 'kst', 50.2500, 66.9167, 'arkalyk; arqalyq', false],
  [60, 'Жітіқара', 'Житикара', 'kst', 52.1833, 61.2000, 'zhitikara; zhetikara; джетыгара', false],
  [61, 'Тобыл', 'Тобыл', 'kst', 53.1739, 63.6500, 'tobyl; zatobolsk; затобольск', false],

  [62, 'Қызылорда', 'Кызылорда', 'kzo', 44.8528, 65.5092, 'kyzylorda; qyzylorda; kzyl-orda; кзыл-орда', true],
  [63, 'Арал', 'Аральск', 'kzo', 46.8000, 61.6667, 'aral; aralsk', false],
  [64, 'Қазалы', 'Казалинск', 'kzo', 45.7667, 62.1000, 'kazaly; kazalinsk; qazaly', false],
  [65, 'Байқоңыр', 'Байконыр', 'kzo', 45.6167, 63.3167, 'baikonur; baykonyr; байконур', false],

  [66, 'Ақтау', 'Актау', 'mng', 43.6500, 51.1667, 'aktau; aqtau; shevchenko; шевченко', true],
  [67, 'Жаңаөзен', 'Жанаозен', 'mng', 43.3333, 52.8667, 'zhanaozen; janaozen; новый узень', false],
  [68, 'Форт-Шевченко', 'Форт-Шевченко', 'mng', 44.5167, 50.2667, 'fort-shevchenko; fort shevchenko', false],

  [69, 'Павлодар', 'Павлодар', 'pvl', 52.2833, 76.9667, 'pavlodar', true],
  [70, 'Екібастұз', 'Экибастуз', 'pvl', 51.7333, 75.3167, 'ekibastuz; ekibastuz', false],
  [71, 'Ақсу', 'Аксу', 'pvl', 52.0333, 76.9167, 'aksu; aqsu; ермак', false],

  [72, 'Петропавл', 'Петропавловск', 'sko', 54.8667, 69.1500, 'petropavl; petropavlovsk; kyzylzhar; қызылжар', true],
  [73, 'Булаев', 'Булаево', 'sko', 54.9056, 70.4439, 'bulaevo; bulayevo', false],
  [74, 'Мамлют', 'Мамлютка', 'sko', 54.9375, 68.5394, 'mamlyutka; mamlut', false],
  [75, 'Сергеев', 'Сергеевка', 'sko', 53.8800, 67.4158, 'sergeyevka; sergeevka', false],
  [76, 'Тайынша', 'Тайынша', 'sko', 53.8478, 69.7639, 'taiynsha; tayynsha; красноармейск', false],

  [77, 'Түркістан', 'Туркестан', 'trk', 43.3000, 68.2500, 'turkistan; turkestan', true],
  [78, 'Кентау', 'Кентау', 'trk', 43.5167, 68.5167, 'kentau', false],
  [79, 'Арыс', 'Арыс', 'trk', 42.4333, 68.8000, 'arys', false],
  [80, 'Сарыағаш', 'Сарыагаш', 'trk', 41.4500, 69.1667, 'saryagash; saryagash', false],
  [81, 'Жетісай', 'Жетысай', 'trk', 40.7750, 68.3272, 'zhetisai; jetisay; zhetysai', false],
  [82, 'Ленгер', 'Ленгер', 'trk', 42.1833, 69.8833, 'lenger', false],
  [83, 'Шардара', 'Шардара', 'trk', 41.2547, 67.9692, 'shardara; chardara; чардара', false],

  [84, 'Өскемен', 'Усть-Каменогорск', 'vko', 49.9483, 82.6275, 'oskemen; ust-kamenogorsk; ustkamenogorsk; усть-каменогорск', true],
  [85, 'Риддер', 'Риддер', 'vko', 50.3444, 83.5125, 'ridder; leninogorsk; лениногорск', false],
  [86, 'Алтай', 'Алтай', 'vko', 49.7378, 84.2736, 'altai; altay; zyryanovsk; зыряновск', false],
  [87, 'Серебрянск', 'Серебрянск', 'vko', 49.6833, 83.2833, 'serebryansk', false],
  [88, 'Зайсаң', 'Зайсан', 'vko', 47.4667, 84.8667, 'zaisan; zaysan', false],
  [89, 'Шемонаиха', 'Шемонаиха', 'vko', 50.6275, 81.9089, 'shemonaikha; shemonaiha', false],
];

// Қазақша әріптерді латынға жуық ауыстыру (іздеу үшін)
const KK_LAT = {
  а: 'a', ә: 'a', б: 'b', в: 'v', г: 'g', ғ: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', қ: 'k', л: 'l', м: 'm', н: 'n', ң: 'n', о: 'o', ө: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ұ: 'u', ү: 'u', ф: 'f', х: 'kh', һ: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', і: 'i',
  ь: '', э: 'e', ю: 'yu', я: 'ya',
};
export function translit(s) {
  return [...s.toLowerCase()].map((ch) => KK_LAT[ch] ?? ch).join('');
}

/** Ағылшынша атау: латын нұсқаларының біріншісінен (мысалы, «fort-shevchenko» → «Fort-Shevchenko»). */
function englishName(aliases) {
  const first = aliases.split(';')[0].trim();
  return first.split(/([\s-])/).map((p) => (p.length > 1 ? p[0].toUpperCase() + p.slice(1) : p)).join('');
}

export const REGION_LIST = Object.entries(REGIONS).map(([code, [kk, ru, en]], i) => ({ code, name_kk: kk, name_ru: ru, name_en: en, sort: i }));

export const CITIES = RAW.map(([id, kk, ru, reg, lat, lng, aliases, major]) => {
  const [regionKk, regionRu, regionEn] = REGIONS[reg];
  const en = englishName(aliases);
  const parts = [kk, ru, en, aliases, translit(kk), translit(ru), regionKk, regionRu, regionEn];
  return {
    id,
    name_kk: kk,
    name_ru: ru,
    name_en: en,
    region_code: reg,
    region_kk: regionKk,
    region_ru: regionRu,
    lat,
    lng,
    zoom: major ? 12 : 13,
    is_major: major,
    search_text: parts.join(' ').toLowerCase(),
  };
});
