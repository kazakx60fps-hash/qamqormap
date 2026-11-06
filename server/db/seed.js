// Демонстрациялық (оқу) деректер. Барлық адамдар мен мекенжайлар ойдан шығарылған.
// Қайта іске қосқанда жазбалар қайталанбайды: қолданушылар email бойынша, өтініштер demo_key бойынша тексеріледі.
// Қолданушылардың өз деректері өзгертілмейді және жойылмайды.
import { pathToFileURL } from 'node:url';
import { pool, tx } from './pool.js';
import { migrate } from './migrate.js';
import { hashPassword } from '../services/passwords.js';
import { approximate } from '../services/requests.js';

export const DEMO_PASSWORD = 'Demo12345';
const D = '@demo.qamqormap.kz';

const USERS = [
  { key: 'coord', email: `coordinator${D}`, name: 'Нұрлан Оспанов', city: 1, coordinator: true, phone: '+7 700 000 00 01' },
  { key: 'aigerim', email: `aigerim${D}`, name: 'Әйгерім Сәрсенова', city: 1, phone: '+7 700 000 00 02' },
  { key: 'aliya', email: `aliya${D}`, name: 'Әлия Қасымова', city: 2, phone: '+7 700 000 00 03' },
  { key: 'gulnar', email: `gulnar${D}`, name: 'Гүлнар Бекова', city: 45, phone: '+7 700 000 00 04' },
  { key: 'daniyar', email: `daniyar${D}`, name: 'Данияр Төлеуов', city: 1, phone: '+7 700 000 00 05',
    vol: { bio: 'Көлігім бар, кешке және демалыс күндері көмектесемін.', district: 'Есіл ауданы', base: [51.128, 71.430], radius: 8, days: [1, 2, 3, 4, 5, 6], from: '17:00', to: '21:30', cats: ['food', 'transport'] } },
  { key: 'madina', email: `madina${D}`, name: 'Мадина Ахметова', city: 1, phone: '+7 700 000 00 06',
    vol: { bio: 'Студентпін, тұрмыстық көмек пен киім жинауға қатысамын.', district: 'Сарыарқа ауданы', base: [51.185, 71.410], radius: 6, days: [6, 7], from: '10:00', to: '18:00', cats: ['household', 'clothes', 'food'] } },
  { key: 'arman', email: `arman${D}`, name: 'Арман Жұмабеков', city: 2, phone: '+7 700 000 00 07',
    vol: { bio: 'Алматыдағы еріктілер тобының мүшесімін.', district: 'Бостандық ауданы', base: [43.225, 76.905], radius: 10, days: [1, 2, 3, 4, 5, 6, 7], from: '09:00', to: '20:00', cats: ['food', 'transport', 'household'] } },
  { key: 'zhanna', email: `zhanna${D}`, name: 'Жанна Нұрланқызы', city: 2, phone: '+7 700 000 00 08',
    vol: { bio: 'Қарттарға күнделікті тұрмыстық көмек көрсетемін.', district: 'Әуезов ауданы', base: [43.235, 76.855], radius: 5, days: [], from: null, to: null, cats: ['household', 'clothes'] } },
  { key: 'erlan', email: `erlan${D}`, name: 'Ерлан Сейітов', city: 3, phone: '+7 700 000 00 09',
    vol: { bio: 'Шымкентте жүк тасымалдауға көмектесемін.', district: 'Әл-Фараби ауданы', base: [42.320, 69.595], radius: 12, days: [1, 3, 5, 6], from: '08:00', to: '19:00', cats: ['transport', 'food', 'community'] } },
  { key: 'timur', email: `timur${D}`, name: 'Тимур Әбенов', city: 45, phone: '+7 700 000 00 10',
    vol: { bio: 'Қарағандыда азық-түлік жеткізуге көмектесемін.', district: 'Қазыбек би ауданы', base: [49.808, 73.090], radius: 7, days: [2, 4, 6], from: '12:00', to: '20:00', cats: ['food', 'household'] } },
  { key: 'aset', email: `aset${D}`, name: 'Әсет Қуанышев', city: 56, phone: '+7 700 000 00 11',
    vol: { bio: 'Қостанайда көлігім бар, апаттан кейінгі тасымал мен заттар жинауға көмектесемін (қауіпті аймаққа кірмеймін).', district: '', base: [53.214, 63.624], radius: 40, days: [1, 2, 3, 4, 5, 6, 7], from: '09:00', to: '20:00', cats: ['evacuation', 'water_food', 'essentials', 'shelter'], disaster: true } },
  // Қызылорда су тасқыны (оқу сценарийі): ұйым координаторы, екі ерікті және көмек алушы
  { key: 'kzo_coord', email: `kzo.coord${D}`, name: 'Жанар Әбдіқадырова', city: 62, phone: '+7 700 000 00 21' },
  { key: 'kzo_vol1', email: `kzo.vol1${D}`, name: 'Ерасыл Махамбетов', city: 62, phone: '+7 700 000 00 22',
    vol: { bio: 'Қызылордада көлігім бар. Су мен заттарды жеткізуге көмектесемін, қауіпті аймаққа кірмеймін.', district: 'Тасбөгет кенті', base: [44.80, 65.53], radius: 25, days: [1, 2, 3, 4, 5, 6, 7], from: '09:00', to: '21:00', cats: ['water_food', 'essentials', 'evacuation', 'shelter'], disaster: true } },
  { key: 'kzo_vol2', email: `kzo.vol2${D}`, name: 'Мейіржан Сейтқали', city: 62, phone: '+7 700 000 00 23',
    vol: { bio: 'Киім мен төсек-орын жинаймын, уақытша баспанадағы отбасыларға көмектесемін.', district: 'Шұғыла ықшам ауданы', base: [44.86, 65.49], radius: 15, days: [1, 3, 5, 6, 7], from: '10:00', to: '20:00', cats: ['essentials', 'shelter', 'water_food'], disaster: true } },
  { key: 'kzo_recipient', email: `kzo.recipient${D}`, name: 'Бақыт Оразова', city: 62, phone: '+7 700 000 00 24' },
  // Екінші оқу ұйымының координаторы (ұйымдар арасындағы қолжетімділікті тексеру үшін)
  { key: 'ast_org_coord', email: `ast.org${D}`, name: 'Санжар Бекенов', city: 1, phone: '+7 700 000 00 25' },
];

// Оқу ұйымдары (ойдан шығарылған)
const ORGS = [
  { key: 'demo-org-kzo', name: 'Оқу ұйымы: «Сыр еріктілері»', city: 62,
    desc: 'Қызылордадағы еріктілер тобы (оқу мысалы). Су тасқынынан кейін су, киім және уақытша баспанаға көмектеседі.',
    members: [['kzo_coord', 'coordinator'], ['kzo_vol1', 'volunteer'], ['kzo_vol2', 'volunteer']] },
  { key: 'demo-org-ast', name: 'Оқу ұйымы: «Астана көмек тобы»', city: 1,
    desc: 'Астанадағы еріктілер тобы (оқу мысалы).',
    members: [['ast_org_coord', 'coordinator'], ['daniyar', 'volunteer']] },
];

// stage: draft | pending | rejected | open | assigned | in_progress | awaiting | completed | cancelled
// Табиғи апат бөлімінің оқу мысалдары. Барлығы ойдан шығарылған және «Оқу мысалы» деп белгіленеді.
// Ескерту: эвакуация жолдары, болжамдар немесе «қауіпсіз аймақтар» әдейі қосылмаған.
const EVENTS = [
  { key: 'demo-flood-kst', type: 'flood', verification: 'verified', activity: 'active', days: 3,
    title: 'Оқу мысалы: Тобыл өзені бойындағы су тасқыны',
    desc: 'Бұл — платформаның жұмысын көрсетуге арналған ойдан шығарылған оқу мысалы, нақты оқиға емес. Мысалда бірнеше елді мекеннің тұрғындары уақытша баспана, ауыз су және заттарды тасымалдауға көмек сұрайды.',
    point: [53.10, 63.40], radius: 25, note: 'Тобыл өзенінің бойы, елді мекендер арасы (шамамен)',
    source: 'Оқу мысалы — дереккөз жоқ', cities: [56, 57, 61], regions: [] },
  { key: 'demo-blizzard-akm', type: 'blizzard', verification: 'unverified', activity: 'active', days: 1,
    title: 'Оқу мысалы: Астана маңындағы қатты боран туралы хабар',
    desc: 'Ойдан шығарылған оқу мысалы. Координатор хабарды әлі тексермеген. Боран кезінде жолға шықпаңыз; көмек тек қауіп сейілгеннен кейін, қауіпсіз жағдайда көрсетіледі.',
    point: null, radius: null, note: '', source: '', cities: [1, 18], regions: [] },
  { key: 'demo-wildfire-abai', type: 'wildfire', verification: 'verified', activity: 'resolved', days: 40,
    title: 'Оқу мысалы: Абай облысындағы дала өрті (аяқталған)',
    desc: 'Ойдан шығарылған оқу мысалы. Өрт елді мекендерден тыс аумақта болды деп алынған. Мысалда зардап шеккен отбасыларға киім мен қажетті заттар жиналды.',
    point: [49.20, 79.70], radius: 15, note: 'Елді мекендерден тыс дала аумағы (шамамен)',
    source: 'Оқу мысалы — дереккөз жоқ', cities: [], regions: ['abai'] },
  { key: 'demo-flood-kzo', type: 'flood', verification: 'verified', activity: 'active', days: 2,
    title: 'Оқу мысалы: Қызылорда маңындағы су тасқыны',
    desc: 'Ойдан шығарылған оқу мысалы, нақты оқиға емес. Сценарийде Сырдария бойындағы бірнеше үйді су басқан деп алынған: тұрғындарға ауыз су, киім және уақытша баспана қажет.',
    point: [44.82, 65.53], radius: 12, note: 'Сырдария өзенінің бойы (шамамен)',
    source: 'Оқу мысалы — дереккөз жоқ', cities: [62], regions: [] },
  // Оқиғалар картасына арналған қосымша оқу мысалдары (нақты оқиғалар емес, нүктелер шамамен)
  { key: 'demo-fire-shym', type: 'fire', verification: 'unverified', activity: 'active', days: 0.3,
    title: 'Оқу мысалы: Шымкенттің шетіндегі қоймада өрт туралы хабар',
    desc: 'Ойдан шығарылған оқу мысалы, нақты оқиға емес. Координатор хабарды әлі тексермеген. Өрт аймағына жақындамаңыз; шұғыл жағдайда 112-ге хабарласыңыз.',
    point: [42.29, 69.66], radius: 1, note: 'Қаланың оңтүстік-шығыс шеті (шамамен)', source: '', cities: [3], regions: [] },
  { key: 'demo-accident-krg', type: 'accident', verification: 'verified', activity: 'active', days: 0.5,
    title: 'Оқу мысалы: Қарағанды маңындағы трассада жол апаты',
    desc: 'Ойдан шығарылған оқу мысалы. Сценарийде жолда кептеліс бар деп алынған. Апат орнына өз бетіңізше бармаңыз — құтқару жұмыстарын тек арнайы қызметтер жүргізеді.',
    point: [49.87, 73.05], radius: 2, note: 'Қала маңындағы трасса бөлігі (шамамен)', source: 'Оқу мысалы — дереккөз жоқ', cities: [45], regions: [] },
  { key: 'demo-quake-alm', type: 'earthquake', verification: 'verified', activity: 'resolved', days: 9,
    title: 'Оқу мысалы: Алматыдағы әлсіз жер сілкінісі (аяқталған)',
    desc: 'Ойдан шығарылған оқу мысалы, нақты оқиға емес. Мысалда тұрғындар үйдегі ұсақ зақымды жөндеуге және қарт көршілерге азық жеткізуге көмек сұрады.',
    point: [43.24, 76.92], radius: 20, note: 'Қала аумағы (шамамен)', source: 'Оқу мысалы — дереккөз жоқ', cities: [2], regions: [] },
  { key: 'demo-other-akt', type: 'incident_other', verification: 'unverified', activity: 'active', days: 1,
    title: 'Оқу мысалы: Ақтөбеде жылу берілмей қалған үйлер туралы хабар',
    desc: 'Ойдан шығарылған оқу мысалы. Координатор хабарды әлі тексермеген. Мысалда қарт тұрғындарға жылы киім мен жылытқыш жеткізуге көмек керек.',
    point: [50.30, 57.17], radius: 3, note: 'Қаланың бір ауданы (шамамен)', source: '', cities: [19], regions: [] },
];

const REQUESTS = [
  // Қызылорда сценарийі: орындаушысы жоқ (ұйым әлі қабылдамаған), жұмыста, расталған; тағы біреуі — тексеруде
  { key: 'kzo-flood-1', event: 'demo-flood-kzo', author: 'kzo_recipient', city: 62, cat: 'water_food', stage: 'open', urgency: 'high', days: 1, need: null,
    title: 'Су басқан үйге ауыз су жеткізу', district: 'Тасбөгет кенті', place: 'Мектеп маңы', quantity: 20, unit: 'bottle',
    desc: 'Оқу мысалы. Үйімізді су басып, туыстарымыздың үйінде отырмыз. Төрт адамға ауыз су керек — 20 бөтелке (1,5 л). Есік алдында күтіп аламыз.',
    at: [44.792, 65.541], addr: 'Тасбөгет, Жібек жолы көшесі 14 (оқу дерегі)', applicants: ['kzo_vol1', 'kzo_vol2'] },
  { key: 'kzo-flood-2', event: 'demo-flood-kzo', author: 'kzo_recipient', city: 62, cat: 'essentials', stage: 'in_progress', urgency: 'normal', days: 2, need: null,
    title: 'Балаларға құрғақ киім мен төсек-орын', district: 'Шұғыла ықшам ауданы', place: 'Мәдениет үйі маңы', quantity: 5, unit: 'set',
    desc: 'Оқу мысалы. Уақытша тұрған отбасыға балалардың құрғақ киімі мен төсек-орын керек — 5 жиынтық.',
    at: [44.862, 65.488], addr: 'Шұғыла ықшам ауданы, 7-үй, 2-пәтер (оқу дерегі)', applicants: ['kzo_vol2'], assignee: 'kzo_vol2', org: 'demo-org-kzo', assignedBy: 'kzo_coord' },
  { key: 'kzo-flood-3', event: 'demo-flood-kzo', author: 'kzo_recipient', city: 62, cat: 'shelter', stage: 'completed', urgency: 'normal', days: 2, need: null,
    title: 'Екі түнге уақытша баспана табуға көмек', district: 'Тасбөгет кенті', place: 'Орталық көше маңы', quantity: 3, unit: 'bed',
    desc: 'Оқу мысалы. Үш адамға екі түнге қауіпсіз жерде уақытша баспана табуға көмек керек болды.',
    at: [44.798, 65.533], addr: 'Мекенжай тек қатысушыларға (оқу дерегі)', applicants: ['kzo_vol1'], assignee: 'kzo_vol1', org: 'demo-org-kzo', assignedBy: 'kzo_coord',
    completionNote: 'Отбасы уақытша баспанаға орналасты.' },
  { key: 'kzo-flood-4', event: 'demo-flood-kzo', author: 'kzo_recipient', city: 62, cat: 'evacuation', stage: 'pending', urgency: 'normal', days: 0, need: null,
    title: 'Қарт кісіні туыстарына жеткізу', district: 'Тасбөгет кенті', place: 'Аурухана маңы',
    desc: 'Оқу мысалы. Су басқан аймақтан тыс тұратын туыстарына қарт кісіні жеткізу керек. Координатор әлі тексерген жоқ.',
    at: [44.795, 65.545], addr: 'Тасбөгет (оқу дерегі)' },
  { key: 'ast-1', author: 'aigerim', city: 1, cat: 'food', stage: 'open', urgency: 'high', days: 1, need: [1, 18],
    title: 'Әжеме азық-түлік жеткізу керек', district: 'Сарыарқа ауданы', place: 'Сейфуллин көшесі маңы',
    desc: 'Әжем 82 жаста, аяғы ауырып дүкенге бара алмайды. Аптасына бір рет нан, сүт, жарма мен көкөніс жеткізіп беру керек. Тізім мен ақшаны өзім беремін.',
    at: [51.181, 71.418], addr: 'Сейфуллин көшесі, 12-үй, 34-пәтер (оқу дерегі)', applicants: ['daniyar', 'madina'] },
  { key: 'ast-2', author: 'aigerim', city: 1, cat: 'transport', stage: 'in_progress', urgency: 'normal', days: 3, need: [0, 19],
    title: 'Кір жуғыш машинаны жаңа пәтерге апару', district: 'Есіл ауданы', place: 'Мәңгілік Ел даңғылы бойы',
    desc: 'Анам жаңа пәтерге көшті. Ескі пәтерден кір жуғыш машина мен екі қорапты апаруға көлігі бар ерікті керек. Қабат — үшінші, лифт бар.',
    at: [51.122, 71.432], addr: 'Мәңгілік Ел даңғылы, 30-үй, 5-подъезд (оқу дерегі)', applicants: ['daniyar'], assignee: 'daniyar',
    messages: [['aigerim', 'Сәлеметсіз бе! Кешкі 19:00 сізге ыңғайлы ма?'], ['daniyar', 'Иә, ыңғайлы. Подъезд алдында күтемін.'], ['aigerim', 'Рақмет! Кодты телефонмен айтамын.']] },
  { key: 'ast-3', author: 'aigerim', city: 1, cat: 'household', stage: 'awaiting', urgency: 'low', days: 6, need: null,
    title: 'Қарт көршіге шам ауыстыруға көмек', district: 'Алматы ауданы', place: 'Абылай хан даңғылы маңы',
    desc: 'Көршіміз жалғыз тұрады. Ас үй мен дәліздегі екі шамды ауыстырып, ілгішті бекітіп беру керек. Құрал-саймандар бар.',
    at: [51.155, 71.475], addr: 'Абылай хан даңғылы, 5-үй, 12-пәтер (оқу дерегі)', applicants: ['madina'], assignee: 'madina',
    completionNote: 'Екі шам ауыстырылды, ілгіш бекітілді.', messages: [['madina', 'Сенбі күні сағат 11-де келемін.']] },
  { key: 'ast-4', author: 'aigerim', city: 1, cat: 'clothes', stage: 'completed', urgency: 'normal', days: 14, need: null,
    title: 'Балаларға қысқы киім жинау', district: 'Байқоңыр ауданы', place: 'Жеңіс даңғылы маңы',
    desc: 'Көпбалалы отбасына 6 және 9 жастағы балаларға қысқы куртка мен етік қажет. Таза, жарамды киімдерді жинап жеткізуге көмек сұраймыз.',
    at: [51.170, 71.445], addr: 'Жеңіс даңғылы, 45-үй (оқу дерегі)', applicants: ['madina'], assignee: 'madina' },
  { key: 'ast-5', author: 'gulnar', city: 1, cat: 'food', stage: 'completed', urgency: 'high', days: 20, need: null,
    title: 'Науқас көршіге дәрі мен азық әкелу', district: 'Есіл ауданы', place: 'Қабанбай батыр даңғылы маңы',
    desc: 'Көршім тұмаумен ауырып жатыр, үйден шыға алмайды. Дәріханадан тізім бойынша дәрі мен бірнеше күнге азық әкеліп беру керек.',
    at: [51.105, 71.410], addr: 'Қабанбай батыр даңғылы, 11-үй (оқу дерегі)', applicants: ['daniyar'], assignee: 'daniyar' },
  { key: 'ast-6', author: 'gulnar', city: 1, cat: 'community', stage: 'pending', urgency: 'normal', days: 0, need: [4, 11],
    title: 'Аула тазалығына сенбілік ұйымдастыру', district: 'Нұра ауданы', place: 'Тұран даңғылы маңындағы аула',
    desc: 'Аулада ойын алаңын тазалап, қоқыс жинау сенбілігін өткізгіміз келеді. 5–6 ерікті мен қоқыс қаптары керек.',
    at: [51.090, 71.400], addr: 'Тұран даңғылы, 50-үй ауласы (оқу дерегі)' },
  { key: 'ast-7', author: 'gulnar', city: 1, cat: 'food', stage: 'pending', urgency: 'high', days: 0, need: [1, 17],
    title: 'Әжеге азық-түлік жеткізуге көмек керек', district: 'Сарыарқа ауданы', place: 'Сейфуллин көшесі',
    desc: 'Сарыарқа ауданындағы әжеге азық-түлік жеткізу керек: нан, сүт, жарма және көкөніс. Әже дүкенге өзі бара алмайды.',
    at: [51.1825, 71.4195], addr: 'Сейфуллин көшесі, 14-үй (оқу дерегі)' },
  { key: 'ast-8', author: 'aigerim', city: 1, cat: 'transport', stage: 'rejected', urgency: 'low', days: 2, need: null,
    title: 'Көлік керек', district: '', place: '',
    desc: 'Бір нәрсе апару керек болып тұр, толығырақ хабарласқанда айтамын. Жылдам жауап беріңіздер.',
    at: [51.140, 71.460], addr: 'Кенесары көшесі, 8-үй (оқу дерегі)', rejectReason: 'Не тасымалдау керегін, көлемін және уақытын нақтылаңыз.' },
  { key: 'ast-9', author: 'aigerim', city: 1, cat: 'household', stage: 'draft', urgency: 'normal', days: 0, need: null,
    title: 'Пәтерді жинауға көмек (жоба)', district: 'Есіл ауданы', place: 'Сарайшық көшесі маңы',
    desc: 'Мүмкіндігі шектеулі көршіміздің пәтерін жинауға көмек керек. Мәтінді әлі толықтырамын.',
    at: [51.128, 71.425], addr: 'Сарайшық көшесі, 4-үй (оқу дерегі)' },

  { key: 'alm-1', author: 'aliya', city: 2, cat: 'household', stage: 'open', urgency: 'normal', days: 2, need: null,
    title: 'Зейнеткерге терезе жылытуға көмек', district: 'Әуезов ауданы', place: 'Абай даңғылы мен Саин көшесі маңы',
    desc: 'Жалғыз тұратын зейнеткерге қыс алдында терезе саңылауларын бітеп, жылыту таспасын жапсыру керек. Материалдар дайын.',
    at: [43.239, 76.852], addr: 'Саин көшесі, 18-үй, 7-пәтер (оқу дерегі)', applicants: ['zhanna'] },
  { key: 'alm-2', author: 'aliya', city: 2, cat: 'food', stage: 'assigned', urgency: 'high', days: 1, need: [1, 12],
    title: 'Көпбалалы отбасына азық-түлік себетін жеткізу', district: 'Түрксіб ауданы', place: 'Сүйінбай даңғылы маңы',
    desc: 'Қайырымдылық қорынан бөлінген азық-түлік себетін қордың қоймасынан алып, отбасына жеткізу керек. Салмағы шамамен 15 кг.',
    at: [43.300, 76.940], addr: 'Сүйінбай даңғылы, 120-үй (оқу дерегі)', applicants: ['arman'], assignee: 'arman',
    messages: [['arman', 'Ертең түсте қоймадан аламын.'], ['aliya', 'Жақсы, отбасына ескертемін.']] },
  { key: 'alm-3', author: 'aliya', city: 2, cat: 'transport', stage: 'completed', urgency: 'normal', days: 10, need: null,
    title: 'Мүгедектік арбаны клиникаға апару', district: 'Бостандық ауданы', place: 'Тимирязев көшесі маңы',
    desc: 'Мүгедектік арбаны жөндеу үшін клиникаға апарып, кейін қайтару керек. Арба жиналады, көліктің жүксалғышына сыяды.',
    at: [43.226, 76.910], addr: 'Тимирязев көшесі, 42-үй (оқу дерегі)', applicants: ['arman'], assignee: 'arman' },
  { key: 'alm-4', author: 'aliya', city: 2, cat: 'clothes', stage: 'cancelled', urgency: 'low', days: 8, need: null,
    title: 'Жатақханаға төсек-орын жабдықтарын жинау', district: 'Алмалы ауданы', place: 'Төле би көшесі маңы',
    desc: 'Студенттер жатақханасына көрпе мен жастық жинау жоспарланған еді. Ұйымдастырушылар мәселені өздері шешті.',
    at: [43.255, 76.920], addr: 'Төле би көшесі, 100-үй (оқу дерегі)', cancelReason: 'Мәселені қор өзі шешті, көмек қажет емес.' },

  { key: 'shy-1', author: 'aliya', city: 3, cat: 'transport', stage: 'open', urgency: 'normal', days: 1, need: [2, 10],
    title: 'Мектепке кітап сөрелерін жеткізу', district: 'Әл-Фараби ауданы', place: 'Тәуке хан даңғылы маңы',
    desc: 'Ауыл мектебінің кітапханасына сыйға берілген үш кітап сөресін қаладағы қоймадан мектепке дейін жеткізу керек.',
    at: [42.318, 69.590], addr: 'Тәуке хан даңғылы, 20-үй (оқу дерегі)', applicants: ['erlan'] },
  { key: 'shy-2', author: 'gulnar', city: 3, cat: 'community', stage: 'completed', urgency: 'low', days: 25, need: null,
    title: 'Саябақта ағаш отырғызу акциясы', district: 'Еңбекші ауданы', place: 'Қаланың орталық саябағы',
    desc: 'Аудан тұрғындарымен бірге саябаққа 40 көшет отырғызу акциясына қол ұшын беретін еріктілер мен күрек керек.',
    at: [42.335, 69.610], addr: 'Орталық саябақ, батыс кіреберіс (оқу дерегі)', applicants: ['erlan'], assignee: 'erlan' },

  { key: 'krg-1', author: 'gulnar', city: 45, cat: 'food', stage: 'open', urgency: 'normal', days: 2, need: [3, 15],
    title: 'Ардагерге апта сайын азық-түлік жеткізу', district: 'Қазыбек би ауданы', place: 'Бұқар жырау даңғылы маңы',
    desc: 'Еңбек ардагеріне апта сайын бейсенбі күні азық-түлік жеткізіп тұратын ерікті керек. Тізімді өзі береді.',
    at: [49.805, 73.100], addr: 'Бұқар жырау даңғылы, 33-үй (оқу дерегі)', applicants: [] },
  { key: 'krg-2', author: 'gulnar', city: 45, cat: 'household', stage: 'completed', urgency: 'normal', days: 12, need: null,
    title: 'Жиһазды жинап беруге көмек', district: 'Әлихан Бөкейханов ауданы', place: 'Строительная көшесі маңы',
    desc: 'Жалғыз басты анаға сатып алынған шкаф пен төсекті жинап беру керек. Нұсқаулық пен бұрағыштар бар.',
    at: [49.835, 73.150], addr: 'Строительная көшесі, 9-үй (оқу дерегі)', applicants: ['timur'], assignee: 'timur' },

  { key: 'pvl-1', author: 'gulnar', city: 69, cat: 'clothes', stage: 'open', urgency: 'low', days: 3, need: null,
    title: 'Балалар үйіне ойыншықтар мен кітап жеткізу', district: '', place: 'Қала орталығы, Торайғыров көшесі маңы',
    desc: 'Тұрғындар жинаған ойыншықтар мен балалар кітаптарын (4 қорап) балалар үйіне жеткізуге көмек керек.',
    at: [52.287, 76.960], addr: 'Торайғыров көшесі, 64-үй (оқу дерегі)', applicants: [] },

  // ── Табиғи апат оқиғаларына байланысты өтініштер (оқу мысалы) ──
  { key: 'kst-flood-1', event: 'demo-flood-kst', author: 'gulnar', city: 56, cat: 'evacuation', stage: 'open', urgency: 'high', days: 2, need: null,
    title: 'Үй жануарларымен бірге туыстарға көшуге көлік керек', district: '', place: 'Қала шетіндегі жеке үйлер ауданы',
    desc: 'Оқу мысалы. Отбасы өз еркімен қалаішіндегі туыстарына көшпек. Заттар мен екі мысықты апаруға көлігі бар ерікті керек. Су басқан көшеге кірудің қажеті жоқ — кездесу орны құрғақ жерде.',
    at: [53.235, 63.590], addr: 'Құрғақ кездесу орны: Әл-Фараби даңғылы, 50 (оқу дерегі)', applicants: ['aset'] },
  { key: 'kst-flood-2', event: 'demo-flood-kst', author: 'aigerim', city: 57, cat: 'water_food', stage: 'open', urgency: 'normal', days: 2, need: [1, 12],
    title: 'Уақытша тұрып жатқан отбасыларға ауыз су жеткізу', district: '', place: 'Қала орталығы маңы',
    desc: 'Оқу мысалы. Туыстарының үйінде уақытша тұрып жатқан үш отбасына 5 литрлік ауыз су бөтелкелерін жеткізу керек. Су сатып алынған, тек тасымал қажет.',
    at: [52.970, 63.120], addr: 'Ленин көшесі, 10-үй (оқу дерегі)', applicants: [] },
  { key: 'kst-flood-3', event: 'demo-flood-kst', author: 'gulnar', city: 56, cat: 'shelter', stage: 'assigned', urgency: 'normal', days: 2, need: null,
    title: 'Екі түнге уақытша баспана ұсынуға көмек', district: '', place: 'Қала орталығы',
    desc: 'Оқу мысалы. Егде жастағы ерлі-зайыптыларға су қайтқанша 2–3 түнге баспана беретін адаммен байланысып, қонуға қажетті заттарды жеткізу керек. Баспана мекенжайы тек орындаушыға ашылады.',
    at: [53.210, 63.630], addr: 'Баспана мекенжайы: Байтұрсынұлы көшесі, 77, 12-пәтер (оқу дерегі)', applicants: ['aset'], assignee: 'aset' },
  { key: 'ast-blizzard-1', event: 'demo-blizzard-akm', author: 'aigerim', city: 1, cat: 'water_food', stage: 'open', urgency: 'normal', days: 0, need: null,
    title: 'Боран басылғаннан кейін қарт көршіге азық-түлік жеткізу', district: 'Алматы ауданы', place: 'Республика даңғылы маңы',
    desc: 'Оқу мысалы. Боран кезінде жолға шықпаңыз. Ауа райы жақсарып, жолдар ашылғаннан кейін жалғыз тұратын көршіге нан, сүт және дәрі жеткізу керек.',
    at: [51.160, 71.450], addr: 'Республика даңғылы, 20-үй, 5-пәтер (оқу дерегі)', applicants: [] },
  { key: 'abai-fire-1', event: 'demo-wildfire-abai', author: 'gulnar', city: 4, cat: 'essentials', stage: 'completed', urgency: 'normal', days: 35, need: null,
    title: 'Зардап шеккен отбасыларға киім мен төсек-орын жинау', district: '', place: 'Қала орталығы, жинау пункті',
    desc: 'Оқу мысалы. Өрттен кейін уақытша туыстарында тұрған отбасыларға жылы киім, көрпе және тұрмыстық заттар жинап, жеткізу керек болды.',
    at: [50.410, 80.230], addr: 'Жинау пункті: Абай көшесі, 100 (оқу дерегі)', applicants: ['erlan'], assignee: 'erlan' },
];

const STAGE_STATUS = {
  draft: ['draft', 'open'], pending: ['pending', 'open'], rejected: ['rejected', 'open'], open: ['approved', 'open'],
  assigned: ['approved', 'assigned'], in_progress: ['approved', 'in_progress'], awaiting: ['approved', 'awaiting_confirmation'],
  completed: ['approved', 'completed'], cancelled: ['approved', 'cancelled'],
};

export async function seed({ log = console.log } = {}) {
  await migrate({ log: () => {} });
  const cats = Object.fromEntries((await pool.query('SELECT id, code FROM help_categories')).rows.map((r) => [r.code, r.id]));
  const hash = await hashPassword(DEMO_PASSWORD);
  const ids = {};

  await tx(async (db) => {
    for (const u of USERS) {
      const ex = (await db.query('SELECT id FROM users WHERE lower(email)=lower($1)', [u.email])).rows[0];
      if (ex) {
        ids[u.key] = ex.id;
        continue;
      }
      const { rows } = await db.query(
        `INSERT INTO users (email, full_name, phone, password_hash, is_coordinator, city_id, is_demo) VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING id`,
        [u.email, u.name, u.phone, hash, !!u.coordinator, u.city],
      );
      ids[u.key] = rows[0].id;
      if (u.vol) {
        await db.query(
          `INSERT INTO volunteer_profiles (user_id, bio, city_id, district, base_lat, base_lng, radius_km, available_days, time_from, time_to, disaster_support)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [rows[0].id, u.vol.bio, u.city, u.vol.district, u.vol.base[0], u.vol.base[1], u.vol.radius, u.vol.days, u.vol.from, u.vol.to, !!u.vol.disaster],
        );
        for (const c of u.vol.cats) await db.query('INSERT INTO volunteer_categories VALUES ($1,$2)', [rows[0].id, cats[c]]);
      }
    }
  });

  // Бұрыннан бар демо еріктілерге апат бөлімінің баптауы (тек демо аккаунттар өзгереді)
  await pool.query(`UPDATE volunteer_profiles SET disaster_support=true WHERE user_id = ANY($1)
                      AND user_id IN (SELECT id FROM users WHERE is_demo)`, [[ids.daniyar, ids.erlan].filter(Boolean)]);
  for (const [who, list] of [['daniyar', ['water_food', 'evacuation']], ['erlan', ['essentials']]]) {
    for (const c of list) {
      await pool.query(`INSERT INTO volunteer_categories (user_id, category_id)
                        SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM volunteer_profiles WHERE user_id=$1) ON CONFLICT DO NOTHING`, [ids[who], cats[c]]);
    }
  }

  // Оқу ұйымдары және олардың мүшелері
  const orgIds = {};
  for (const o of ORGS) {
    let id = (await pool.query('SELECT id FROM organizations WHERE demo_key=$1', [o.key])).rows[0]?.id;
    if (!id) {
      id = (await pool.query('INSERT INTO organizations (name, description, city_id, is_demo, demo_key) VALUES ($1,$2,$3,true,$4) RETURNING id',
        [o.name, o.desc, o.city, o.key])).rows[0].id;
    }
    orgIds[o.key] = id;
    for (const [who, role] of o.members) {
      if (!ids[who]) continue;
      await pool.query('INSERT INTO organization_members (org_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [id, ids[who], role]);
    }
  }

  // Апат оқиғалары (оқу мысалдары)
  const types = Object.fromEntries((await pool.query('SELECT id, code FROM disaster_types')).rows.map((r) => [r.code, r.id]));
  const eventIds = {};
  let createdEvents = 0;
  for (const e of EVENTS) {
    const ex = (await pool.query('SELECT id FROM disaster_events WHERE demo_key=$1', [e.key])).rows[0];
    if (ex) { eventIds[e.key] = ex.id; continue; }
    createdEvents++;
    await tx(async (db) => {
      const started = new Date(Date.now() - e.days * 864e5);
      const verified = e.verification === 'verified';
      const resolved = e.activity === 'resolved';
      const { rows } = await db.query(
        `INSERT INTO disaster_events (type_id, title, description, content_lang, lat, lng, radius_km, location_note, source_name,
           started_at, ended_at, verification_status, activity_status, verified_by, verified_at, created_by, updated_by, is_demo, demo_key, created_at, updated_at)
         VALUES ($1,$2,$3,'kk',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15,true,$16,$9,$17) RETURNING id`,
        [types[e.type], e.title, e.desc, e.point?.[0] ?? null, e.point?.[1] ?? null, e.radius, e.note, e.source, started,
          resolved ? new Date(started.getTime() + 5 * 864e5) : null, e.verification, e.activity,
          verified ? ids.coord : null, verified ? new Date(started.getTime() + 3 * 3600e3) : null, ids.coord, e.key,
          new Date(Math.min(Date.now() - 3600e3, started.getTime() + (resolved ? 5 : 1) * 864e5))],
      );
      eventIds[e.key] = rows[0].id;
      for (const c of e.cities) await db.query('INSERT INTO disaster_event_areas (event_id, city_id) VALUES ($1,$2)', [rows[0].id, c]);
      for (const r of e.regions) await db.query('INSERT INTO disaster_event_areas (event_id, region_code) VALUES ($1,$2)', [rows[0].id, r]);
      await db.query(`INSERT INTO disaster_event_history (event_id, actor_id, action, changes, created_at) VALUES ($1,$2,'created',$3,$4)`,
        [rows[0].id, ids.coord, JSON.stringify({ verification_status: 'unverified', activity_status: 'active' }), started]);
      if (verified) {
        await db.query(`INSERT INTO disaster_event_history (event_id, actor_id, action, changes, created_at) VALUES ($1,$2,'verified',$3,$4)`,
          [rows[0].id, ids.coord, JSON.stringify({ verification_status: ['unverified', 'verified'] }), new Date(started.getTime() + 3 * 3600e3)]);
      }
      if (resolved) {
        await db.query(`INSERT INTO disaster_event_history (event_id, actor_id, action, changes, created_at) VALUES ($1,$2,'resolved',$3,$4)`,
          [rows[0].id, ids.coord, JSON.stringify({ activity_status: ['active', 'resolved'] }), new Date(started.getTime() + 5 * 864e5)]);
      }
    });
  }

  let created = 0;
  for (const q of REQUESTS) {
    await tx(async (db) => {
      if ((await db.query('SELECT 1 FROM help_requests WHERE demo_key=$1', [q.key])).rowCount) return;
      created++;
      const now = Date.now();
      const t0 = now - q.days * 864e5 - 5 * 3600e3;
      const at = (h) => new Date(Math.min(t0 + h * 3600e3, now - 60e3));
      const [moderation, status] = STAGE_STATUS[q.stage];
      const approx = approximate(q.at[0], q.at[1]);
      let neededFrom = null, neededTo = null;
      if (q.need) {
        // Қазақстан уақыты бойынша (UTC+5) күні мен сағаты
        const d = new Date(now + q.need[0] * 864e5);
        d.setUTCHours(q.need[1] - 5, 0, 0, 0);
        neededFrom = d;
        neededTo = new Date(d.getTime() + 2 * 3600e3);
      }
      const approved = moderation === 'approved';
      const { rows } = await db.query(
        `INSERT INTO help_requests (author_id, city_id, category_id, title, description, district, public_place, approx_lat, approx_lng,
            needed_from, needed_to, needed_note, urgency, moderation_status, status, rejection_reason, cancel_reason, is_demo, demo_key,
            submitted_at, published_at, first_assigned_at, completed_at, created_at, updated_at, disaster_event_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'open',$15,NULL,true,$16,$17,$18,NULL,NULL,$19,$19,$20) RETURNING id`,
        [ids[q.author], q.city, cats[q.cat], q.title, q.desc, q.district, q.place, approx.lat, approx.lng,
          neededFrom, neededTo, q.need ? '' : 'Уақытты ерікті екеуміз келісеміз', q.urgency, moderation,
          q.rejectReason || null, q.key, moderation === 'draft' ? null : at(0), approved ? at(2) : null, at(0), q.event ? eventIds[q.event] : null],
      );
      const id = rows[0].id;
      await db.query('INSERT INTO request_private VALUES ($1,$2,$3,$4,$5)', [id, q.addr, q.at[0], q.at[1], '+7 700 555 00 ' + String(10 + created).padStart(2, '0')]);
      if (q.quantity) await db.query('UPDATE help_requests SET quantity=$2, quantity_unit=$3 WHERE id=$1', [id, q.quantity, q.unit]);
      const ev = (actor, type, from, to, h, note = null) => db.query(
        'INSERT INTO request_events (request_id, actor_id, event_type, from_status, to_status, note, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [id, actor, type, from, to, note, at(h)],
      );
      await ev(ids[q.author], 'created', null, 'open', 0);
      if (moderation === 'draft') return;
      await ev(ids[q.author], 'submitted', 'draft', 'pending', 0);
      if (moderation === 'pending') return;
      if (moderation === 'rejected') {
        await ev(ids.coord, 'rejected', 'pending', 'rejected', 1, q.rejectReason);
        return;
      }
      await ev(ids.coord, 'approved', 'pending', 'approved', 2);
      if (q.org) {
        const org = ORGS.find((o) => o.key === q.org);
        await db.query('UPDATE help_requests SET org_id=$2, org_accepted_at=$3, org_accepted_by=$4 WHERE id=$1', [id, orgIds[q.org], at(2.5), ids[q.assignedBy]]);
        await ev(ids[q.assignedBy], 'org_accepted', 'open', 'open', 2.5, org.name);
      }
      let appIdFor = {};
      for (const [i, who] of (q.applicants || []).entries()) {
        const ar = await db.query(
          `INSERT INTO applications (request_id, volunteer_id, message, status, created_at, updated_at) VALUES ($1,$2,$3,'active',$4,$4) RETURNING id`,
          [id, ids[who], i === 0 ? 'Сәлеметсіз бе! Көмектесуге дайынмын.' : 'Мен де көмектесе аламын, уақытым бар.', at(3 + i)],
        );
        appIdFor[who] = ar.rows[0].id;
        await ev(ids[who], 'applied', null, null, 3 + i);
      }
      let cur = 'open';
      if (q.assignee) {
        await db.query(
          `INSERT INTO assignments (request_id, volunteer_id, application_id, assigned_by, is_active, assigned_at, ended_at, end_reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [id, ids[q.assignee], appIdFor[q.assignee], ids[q.assignedBy || q.author], q.stage !== 'cancelled', at(5), null, null],
        );
        await db.query(`UPDATE applications SET status='accepted' WHERE id=$1`, [appIdFor[q.assignee]]);
        await db.query('UPDATE help_requests SET first_assigned_at=$2 WHERE id=$1', [id, at(5)]);
        await ev(ids[q.assignedBy || q.author], 'assigned', 'open', 'assigned', 5, USERS.find((u) => u.key === q.assignee).name);
        cur = 'assigned';
        if (['in_progress', 'awaiting', 'completed'].includes(q.stage)) {
          await ev(ids[q.assignee], 'started', 'assigned', 'in_progress', 8);
          cur = 'in_progress';
        }
        if (['awaiting', 'completed'].includes(q.stage)) {
          await ev(ids[q.assignee], 'completion_submitted', 'in_progress', 'awaiting_confirmation', 20, q.completionNote || 'Көмек көрсетілді.');
          cur = 'awaiting_confirmation';
        }
        if (q.stage === 'completed') {
          await ev(ids[q.author], 'completed', 'awaiting_confirmation', 'completed', 24);
          await db.query('UPDATE help_requests SET completed_at=$2 WHERE id=$1', [id, at(24)]);
          cur = 'completed';
        }
      }
      if (q.stage === 'cancelled') {
        await db.query(`UPDATE applications SET status='declined' WHERE request_id=$1 AND status='active'`, [id]);
        await db.query('UPDATE help_requests SET cancel_reason=$2 WHERE id=$1', [id, q.cancelReason]);
        await ev(ids[q.author], 'cancelled', 'open', 'cancelled', 6, q.cancelReason);
        cur = 'cancelled';
      }
      await db.query('UPDATE help_requests SET status=$2, updated_at=$3 WHERE id=$1', [id, cur, at(24)]);
      for (const [i, [who, body]] of (q.messages || []).entries()) {
        await db.query('INSERT INTO messages (request_id, sender_id, body, created_at) VALUES ($1,$2,$3,$4)', [id, ids[who], body, at(6 + i)]);
      }
    });
  }

  // Бірнеше демо хабарлама (тек бірінші рет)
  const hasNotes = (await pool.query('SELECT 1 FROM notifications WHERE user_id=$1 LIMIT 1', [ids.aigerim])).rowCount;
  if (!hasNotes && created) {
    const r1 = (await pool.query(`SELECT id FROM help_requests WHERE demo_key='ast-1'`)).rows[0];
    const r3 = (await pool.query(`SELECT id FROM help_requests WHERE demo_key='ast-3'`)).rows[0];
    await pool.query(
      `INSERT INTO notifications (user_id, request_id, type, title, body, params) VALUES
        ($1,$2,'application','Жаңа көмек ұсынысы','Данияр Төлеуов өтінішіңізге көмектесуге дайын.', $4),
        ($1,$3,'completion_submitted','Көмек орындалды деп белгіленді','Нәтижені растаңыз.', $5)`,
      [ids.aigerim, r1.id, r3.id,
        JSON.stringify({ name: 'Данияр Төлеуов', title: 'Әжеме азық-түлік жеткізу керек' }),
        JSON.stringify({ title: 'Қарт көршіге шам ауыстыруға көмек' })],
    );
  }
  log(`[seed] Демо деректер дайын. Жаңа өтініштер: ${created}, жаңа апат оқиғалары: ${createdEvents}. Құпиясөз: ${DEMO_PASSWORD}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seed()
    .then(() => pool.end())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
