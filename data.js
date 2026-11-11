/* Datos estáticos: categorías, autocategorización, calendario de rebajas y consejos. */

const CATEGORIES = [
  { id: 'super',    name: 'Súper',        icon: 'cart', color: '#34d399', needs: true },
  { id: 'ropa',     name: 'Ropa',         icon: 'shirt', color: '#f472b6' },
  { id: 'bisu',     name: 'Bisutería',    icon: 'gem', color: '#a78bfa' },
  { id: 'belleza',  name: 'Belleza',      icon: 'sparkle', color: '#fb7185' },
  { id: 'comer',    name: 'Comer fuera',  icon: 'utensils', color: '#fb923c' },
  { id: 'cafe',     name: 'Café/snacks',  icon: 'cup', color: '#e0b07a' },
  { id: 'ocio',     name: 'Ocio',         icon: 'ticket', color: '#facc15' },
  { id: 'online',   name: 'Online',       icon: 'box', color: '#38bdf8' },
  { id: 'transp',   name: 'Transporte',   icon: 'tram', color: '#2dd4bf', needs: true },
  { id: 'subs',     name: 'Suscripción',  icon: 'play', color: '#818cf8' },
  { id: 'casa',     name: 'Casa/facturas',icon: 'home', color: '#60a5fa', needs: true },
  { id: 'salud',    name: 'Salud',        icon: 'pulse', color: '#4ade80', needs: true },
  { id: 'otros',    name: 'Otros',        icon: 'tag', color: '#94a3b8' },
];
const INCOME_CAT = { id: 'ingreso', name: 'Ingreso', icon: 'income', color: '#22c55e' };

// Palabras clave para adivinar la categoría por el comercio / concepto bancario
const KEYWORDS = {
  ropa: ['zara', 'bershka', 'stradivarius', 'pull&bear', 'pull and bear', 'pull & bear', 'mango', 'h&m', 'h & m', 'hm.com', 'primark', 'lefties', 'shein', 'massimo dutti', 'oysho', 'springfield', 'women secret', "women'secret", 'cortefiel', 'sfera', 'kiabi', 'decathlon', 'zalando', 'asos', 'vinted', 'uniqlo', 'c&a', 'tezenis', 'calzedonia', 'intimissimi', 'mango outlet', 'skechers', 'deichmann', 'foot locker', 'jd sports'],
  bisu: ['parfois', 'bijou brigitte', 'claire', 'accessorize', 'pandora', 'uno de 50', 'tous', 'singularu', 'aristocrazy', 'misako', 'bimba'],
  belleza: ['sephora', 'primor', 'druni', 'douglas', 'kiko', 'rituals', 'perfumeria', 'perfumería', 'peluquer', 'estetica', 'estética', 'manicura', 'notino', 'lookfantastic'],
  super: ['mercadona', 'carrefour', 'lidl', 'aldi', 'dia ', 'dia%', 'supermercado', 'eroski', 'alcampo', 'hipercor', 'consum', 'bonpreu', 'caprabo', 'ahorramas', 'ahorramás', 'gadis', 'froiz', 'bm supermercados', 'covirán', 'coviran', 'spar', 'mas y mas', 'condis', 'el corte ingles super'],
  comer: ['glovo', 'uber eats', 'ubereats', 'just eat', 'deliveroo', 'telepizza', 'domino', 'mcdonald', 'burger king', 'kfc', 'goiko', 'foster', 'vips', 'restaurante', 'rest.', 'bar ', 'cerveceria', 'cervecería', 'taberna', 'sushi', 'pizzeria', 'pizzería', 'tagliatella', '100 montaditos', 'five guys', 'taco bell', 'pans & company'],
  cafe: ['starbucks', 'cafe', 'café', 'cafeteria', 'cafetería', 'panaderia', 'panadería', 'horno', 'granier', 'manolo bakes', 'vending', 'tim hortons', 'costa coffee', 'santagloria'],
  ocio: ['cine', 'yelmo', 'cinesa', 'kinepolis', 'ticketmaster', 'entradas', 'fever', 'teatro', 'discoteca', 'club ', 'bowling', 'steam', 'playstation', 'nintendo', 'xbox', 'fnac'],
  online: ['amazon', 'amzn', 'aliexpress', 'temu', 'ebay', 'miravia', 'wallapop', 'paypal'],
  transp: ['renfe', 'metro', 'emt', 'tmb', 'cabify', 'uber', 'bolt', 'freenow', 'free now', 'blablacar', 'alsa', 'repsol', 'cepsa', 'bp ', 'galp', 'shell', 'gasolinera', 'parking', 'aparcamiento', 'peaje', 'ryanair', 'vueling', 'iberia', 'easyjet'],
  subs: ['netflix', 'spotify', 'hbo', 'max.com', 'disney', 'prime video', 'amazon prime', 'apple.com', 'icloud', 'google one', 'youtube', 'dazn', 'movistar+', 'filmin', 'audible', 'chatgpt', 'openai', 'claude.ai', 'anthropic', 'gimnasio', 'gym', 'basic-fit', 'basic fit', 'vivagym', 'duolingo', 'tinder', 'bumble', 'canva', 'adobe'],
  casa: ['alquiler', 'iberdrola', 'endesa', 'naturgy', 'holaluz', 'repsol luz', 'agua', 'canal de isabel', 'movistar', 'vodafone', 'orange', 'digi', 'yoigo', 'masmovil', 'lowi', 'pepephone', 'o2 ', 'ikea', 'leroy merlin', 'comunidad', 'seguro', 'hipoteca', 'ibi', 'butano'],
  salud: ['farmacia', 'clinica', 'clínica', 'dentista', 'optica', 'óptica', 'fisio', 'sanitas', 'adeslas', 'dkv', 'asisa', 'hospital', 'psicolog'],
};

function guessCategory(text) {
  const t = ' ' + (text || '').toLowerCase() + ' ';
  // las suscripciones van primero para que "amazon prime" no caiga en online
  const order = ['subs', 'bisu', 'ropa', 'belleza', 'super', 'comer', 'cafe', 'ocio', 'transp', 'casa', 'salud', 'online'];
  for (const cat of order) {
    if (KEYWORDS[cat].some(k => t.includes(k))) return cat;
  }
  return 'otros';
}

/* ---------- Calendario de mejores momentos para comprar ---------- */
function nthWeekdayOfMonth(year, month, weekday, n) {
  // month 0-11, weekday 0=domingo
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

function salesEvents(year) {
  const blackFriday = addDays(nthWeekdayOfMonth(year, 10, 4, 4), 1); // viernes tras 4º jueves de noviembre
  const cyberMonday = addDays(blackFriday, 3);
  return [
    {
      id: 'rebajas-inv', title: 'Rebajas de invierno', start: new Date(year, 0, 7), end: new Date(year, 0, 24),
      cats: ['ropa', 'bisu', 'belleza'],
      tip: 'Primeros días = más tallas, descuentos del 20-40%. En Zara, Mango y El Corte Inglés suelen empezar online la noche anterior. Ve con la lista de "Lo quiero" y no compres nada que no estuviera en ella.',
      stores: 'Inditex, Mango, H&M, El Corte Inglés, Parfois, Bijou Brigitte',
    },
    {
      id: 'rebajas-inv-2', title: 'Segundas rebajas de invierno', start: new Date(year, 0, 25), end: new Date(year, 1, 28),
      cats: ['ropa', 'bisu'],
      tip: 'El mejor precio del año: 50-70%. Quedan menos tallas, así que es ideal para básicos y bisutería, que no dependen de talla.',
      stores: 'Lefties, Primark (bajadas en tienda), Parfois, Bijou Brigitte, outlets',
    },
    {
      id: 'mid-season', title: 'Mid-season sales (primavera)', start: new Date(year, 3, 1), end: new Date(year, 4, 15),
      cats: ['ropa'], approx: true,
      tip: 'Mango, H&M, Asos y Zalando hacen descuentos de entretemporada. Si necesitas algo de primavera, espera aquí en vez de comprarlo en marzo.',
      stores: 'Mango, H&M, Asos, Zalando, Springfield',
    },
    {
      id: 'rebajas-ver', title: 'Rebajas de verano', start: new Date(year, 6, 1), end: new Date(year, 6, 20),
      cats: ['ropa', 'bisu', 'belleza'],
      tip: 'Empiezan a finales de junio online en muchas marcas. Bañadores, sandalias y vestidos de verano a mitad de precio.',
      stores: 'Inditex, Mango, H&M, El Corte Inglés, Parfois',
    },
    {
      id: 'prime-day', title: 'Amazon Prime Day', start: new Date(year, 6, 8), end: new Date(year, 6, 11),
      cats: ['online', 'belleza'], approx: true,
      tip: 'Mira el historial de precios con Keepa o CamelCamelCamel antes de comprar: muchas "ofertas" son el precio normal.',
      stores: 'Amazon (y contra-ofertas en El Corte Inglés, MediaMarkt, PcComponentes)',
    },
    {
      id: 'rebajas-ver-2', title: 'Segundas rebajas de verano', start: new Date(year, 6, 21), end: new Date(year, 7, 31),
      cats: ['ropa', 'bisu'],
      tip: 'Hasta 70%. Buen momento para comprar básicos que usarás todo el año (camisetas, vaqueros).',
      stores: 'Inditex, Lefties, Primark, Parfois, outlets',
    },
    {
      id: 'vuelta-cole', title: 'Vuelta al cole / septiembre', start: new Date(year, 8, 1), end: new Date(year, 8, 15),
      cats: ['online', 'casa'],
      tip: 'Ofertas en tecnología, papelería y hogar. Últimos restos de rebajas de verano en tiendas físicas.',
      stores: 'MediaMarkt, Fnac, El Corte Inglés, Amazon',
    },
    {
      id: 'singles-day', title: 'Singles Day (11.11)', start: new Date(year, 10, 11), end: new Date(year, 10, 11),
      cats: ['online', 'belleza', 'bisu'],
      tip: 'Fuerte en AliExpress, Miravia, Druni y perfumerías online. Bueno para bisutería barata y maquillaje.',
      stores: 'AliExpress, Miravia, Druni, Notino, Primor',
    },
    {
      id: 'black-friday', title: 'Black Friday', start: addDays(blackFriday, -7), end: blackFriday,
      cats: ['ropa', 'bisu', 'belleza', 'online'],
      tip: 'Compra los regalos de Navidad aquí, no en diciembre. Ojo: algunas tiendas suben precios en octubre para "bajarlos" ahora. Si no estaba en tu lista, no es una oferta.',
      stores: 'Casi todas: Inditex, Mango, Sephora, Druni, Amazon, El Corte Inglés',
    },
    {
      id: 'cyber-monday', title: 'Cyber Monday', start: cyberMonday, end: cyberMonday,
      cats: ['online', 'ropa'],
      tip: 'Último día de Black Friday online. Algunas marcas repiten descuento con códigos extra.',
      stores: 'Tiendas online',
    },
  ];
}

function upcomingEvents(today) {
  const y = today.getFullYear();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return [...salesEvents(y), ...salesEvents(y + 1)]
    .filter(e => e.end >= t0)
    .sort((a, b) => a.start - b.start);
}

/* ---------- Consejos fijos por categoría ---------- */
const CATEGORY_TIPS = {
  ropa: [
    'Regla de las 48 h: apúntalo en "Lo quiero" y si a los 2 días sigues queriéndolo, espera a la siguiente rebaja.',
    'Mira primero en Vinted y Wallapop: muchas prendas de Zara/Mango están nuevas con etiqueta a un 30-60% menos.',
    'Desinstala o silencia las apps de tiendas: las notificaciones están diseñadas para que compres.',
    'Antes de comprar, piensa en 3 cosas de tu armario con las que lo combinarías.',
  ],
  bisu: [
    'La bisutería no depende de talla: es lo mejor para comprar en segundas rebajas (hasta 70%).',
    'AliExpress / Shein / Temu tienen piezas muy parecidas por 1-3 €, sobre todo en el Singles Day (11.11).',
    'Parfois y Bijou Brigitte tienen 2x1 o 3x2 frecuentes: no compres piezas sueltas a precio completo.',
  ],
  belleza: [
    'Druni, Primor y Notino suelen ser más baratos que Sephora para las mismas marcas.',
    'Mercadona y Lidl tienen "dupes" de cremas y maquillaje muy bien valorados.',
    'Termina un producto antes de comprar otro de la misma categoría.',
  ],
  comer: [
    'Cada pedido de Glovo/Uber Eats cuesta un 30-40% más que el mismo menú en el local (gastos de envío + precios inflados).',
    'Pon un tope de comidas fuera a la semana y cocina el doble para llevar tupper.',
  ],
  cafe: [
    'Un café de 2,50 € al día son ~75 € al mes. Un termo con café de casa cuesta menos de 10 € al mes.',
    'Los "gastos hormiga" (menos de 10 €) son los que más se escapan: lleva la cuenta aquí.',
  ],
  super: [
    'Haz lista y no vayas con hambre. Las marcas blancas ahorran un 25-40%.',
    'Planifica el menú semanal: reduce desperdicio y compras de última hora.',
    'Usa las apps de Lidl Plus o Carrefour para sus cupones semanales.',
  ],
  online: [
    'Deja el carrito 24 h. Muchas tiendas te envían un código de descuento si no compras.',
    'Desactiva el pago en 1 clic y borra la tarjeta guardada en las tiendas.',
    'Comprueba el historial de precios con Keepa (Amazon) antes de fiarte de una "oferta".',
  ],
  subs: [
    'Revisa cada suscripción: si no la has usado en 30 días, cancélala. Puedes volver cuando la necesites.',
    'Comparte planes familiares (Spotify, YouTube, Netflix) con amigos o familia.',
  ],
  ocio: [
    'Busca planes gratis: museos gratis ciertos días, conciertos al aire libre, días del espectador en el cine.',
  ],
  transp: [
    'Compara el abono mensual con lo que gastas en billetes sueltos y en Cabify/Uber.',
  ],
  casa: [
    'Compara tarifa de luz y móvil una vez al año: cambiar de compañía puede ahorrar 10-30 € al mes.',
  ],
};

/* ---------- Directorio de tiendas (enlaces directos, sin rastreo: se abren con no-referrer) ---------- */
const STORES = [
  // Ropa
  { name: 'Zara', url: 'https://www.zara.com/es/', cats: ['ropa'], note: 'Las rebajas suelen abrir en la app la noche anterior' },
  { name: 'Bershka', url: 'https://www.bershka.com/es/', cats: ['ropa'], note: 'Rebajas a la vez que Zara (grupo Inditex)' },
  { name: 'Stradivarius', url: 'https://www.stradivarius.com/es/', cats: ['ropa'], note: 'Grupo Inditex' },
  { name: 'Pull&Bear', url: 'https://www.pullandbear.com/es/', cats: ['ropa'], note: 'Grupo Inditex' },
  { name: 'Lefties', url: 'https://www.lefties.com/es/', cats: ['ropa'], note: 'Lo más barato de Inditex' },
  { name: 'Mango', url: 'https://shop.mango.com/es', cats: ['ropa'], note: 'Mid-season sale en primavera y otoño' },
  { name: 'Mango Outlet', url: 'https://www.mangooutlet.com/es', cats: ['ropa'], note: 'Outlet todo el año' },
  { name: 'H&M', url: 'https://www2.hm.com/es_es/index.html', cats: ['ropa'], note: 'Descuentos extra para socios' },
  { name: 'Primark', url: 'https://www.primark.com/es-es', cats: ['ropa', 'bisu', 'belleza'], note: 'Catálogo online; compra en tienda' },
  { name: 'Shein', url: 'https://es.shein.com/', cats: ['ropa', 'bisu'], note: 'Barato, pero ojo con comprar de más' },
  { name: 'Zalando', url: 'https://www.zalando.es/', cats: ['ropa'], note: 'Muchas marcas, devolución gratis' },
  { name: 'Vinted', url: 'https://www.vinted.es/', cats: ['ropa', 'bisu'], note: 'Segunda mano, prendas nuevas con etiqueta' },
  // Bisutería
  { name: 'Parfois', url: 'https://www.parfois.com/es/', cats: ['bisu'], note: 'Promos 2x1 / 3x2 frecuentes' },
  { name: 'Bijou Brigitte', url: 'https://www.bijou-brigitte.com/es/', cats: ['bisu'], note: 'Rebajas fuertes en segundas rebajas' },
  { name: 'Singularu', url: 'https://singularu.com/', cats: ['bisu'], note: 'Acero; descuentos en Black Friday' },
  { name: 'AliExpress', url: 'https://es.aliexpress.com/', cats: ['bisu', 'online'], note: 'Bisutería a 1-3 €, sobre todo el 11.11' },
  // Belleza
  { name: 'Druni', url: 'https://www.druni.es/', cats: ['belleza'], note: 'Más barato que Sephora en muchas marcas' },
  { name: 'Primor', url: 'https://www.primor.eu/', cats: ['belleza'], note: 'Precios bajos en perfumería' },
  { name: 'Notino', url: 'https://www.notino.es/', cats: ['belleza'], note: 'Perfumes con buen descuento' },
  { name: 'Sephora', url: 'https://www.sephora.es/', cats: ['belleza'], note: 'Espera a sus semanas de descuento' },
  { name: 'Kiko', url: 'https://www.kikocosmetics.com/es-es/', cats: ['belleza'], note: 'Promos de temporada frecuentes' },
  // Online y chollos
  { name: 'Amazon', url: 'https://www.amazon.es/', cats: ['online'], note: 'Compara historial de precios antes de comprar' },
  { name: 'El Corte Inglés', url: 'https://www.elcorteingles.es/', cats: ['ropa', 'belleza', 'online'], note: 'Rebajas y "Tecnoprecios"' },
  { name: 'Wallapop', url: 'https://es.wallapop.com/', cats: ['ropa', 'online'], note: 'Segunda mano cerca de ti' },
  { name: 'Chollómetro', url: 'https://www.chollometro.com/', cats: ['online', 'ropa', 'belleza'], note: 'Ofertas de la comunidad; crea alertas' },
];
