# Logo DEVNEX

`devnex-mark.png` es el archivo maestro de 1254 × 1254 px, restaurado a partir de la referencia del usuario con la herramienta integrada `image_gen`. Conserva la red geométrica violeta/magenta sobre negro; sustituye la aproximación SVG anterior.

Los iconos de 48, 180, 192 y 512 px se preparan a partir de este mismo bitmap. La interfaz utiliza el archivo de 192 px para evitar descargar el maestro en cada apertura. El icono maskable añade un margen negro para mantener la figura completa dentro del área segura de recorte del sistema operativo. El badge de notificación es la versión monocroma de la misma figura, como requiere su representación en el sistema operativo.

Los enlaces a los iconos incluyen `?v=3` para que navegador, manifest y PWA reconozcan el cambio. El service worker precarga esos mismos enlaces para conservar el logo sin conexión.

## Prompt final utilizado

```text
Precise-object-edit, exact logo restoration. Use the SMALL original purple-on-black logo uploaded by the user as the authoritative reference. The large generated restoration has the right general layout but made the lines and junctions too thick. Correct ONLY stroke weights and junction sizes to match the original thin-line logo. Preserve exactly every vertex location, every curve, all connectivity, the asymmetry, overall orientation, centered black-square composition, and lavender-purple to magenta transition. Relative to the symbol's width, outer perimeter strokes should be approximately 2.4% to 3%, inner connecting strokes approximately 1.6%, and small circular junctions about 4.5% diameter; avoid the inflated rounded blobs of the generated version. The original is a delicate wire network, not thick ribbons. Do not redraw the topology or add missing lines. High-resolution clean flat artwork, pure black background, no glow, no shadow, no text, no new graphic. Faithfully copy the original outline and delicate line quality.
```
