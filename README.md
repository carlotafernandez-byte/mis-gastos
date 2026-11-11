# Mis Gastos

App web para el móvil (PWA) que registra tus gastos, te avisa si un día pasas de 50 € en varios pagos, te dice dónde puedes ahorrar para llegar a 900 €/mes y te recuerda los mejores momentos para comprar (rebajas, Black Friday, Singles Day…).

Los datos se guardan **solo en tu móvil** (no hay servidor, ni analítica, ni conexión con el banco o la tarjeta). Haz copias desde Ajustes → Copia de seguridad.

## Cómo funciona
- **Primer uso:** un asistente pide nombre, nómina, día de cobro, gastos fijos (se apuntan solos cada mes), objetivo, límites e intereses.
- **Pagos detectados:** una automatización del propio móvil abre la app con `?pago=IMPORTE&comercio=TIENDA` (iPhone, app Atajos → Transacción) o `?aviso=TEXTO` (Android, MacroDroid). La app muestra un formulario que no se puede cerrar hasta apuntar el pago.
- **Comprobación al abrir:** si llevas más de 3 h sin apuntar nada, pregunta "¿Has pagado algo?".
- **Día 1:** al abrir la app pide la nómina y lo que quedó del mes anterior. Desde Ajustes se descarga un recordatorio de calendario (.ics) que se repite cada mes.

## Probarla en el ordenador
```
python3 -m http.server 8000
```
y abre http://localhost:8000

## Instalarla en el móvil
Hay que publicarla en una dirección https (por ejemplo GitHub Pages o Netlify, que son gratis). Luego:
- **iPhone:** ábrela en Safari → Compartir → "Añadir a pantalla de inicio".
- **Android:** ábrela en Chrome → menú ⋮ → "Instalar aplicación".

## Archivos
- `index.html`, `styles.css`: estructura y diseño
- `charts.js`: gráficos SVG propios (sin librerías externas)
- `app.js`: lógica (presupuesto, alertas, análisis de ahorro, importar CSV del banco)
- `data.js`: categorías, palabras clave por tienda, calendario de rebajas y consejos
- `sw.js`, `manifest.webmanifest`, `icons/`: lo necesario para instalarla y usarla sin conexión
