# DEVNEX Control

Panel estático para gestionar proyectos mediante la API existente de Google Apps Script. No necesita compilación.

## Avisar antes de suspender

1. En **Proyectos**, edita un proyecto o toca el icono de reloj.
2. Selecciona **Avisar · iniciar contador**, el plazo en horas, el mensaje, la esquina y la distancia desde arriba. El valor inicial es 110 px desde la esquina superior derecha; en pantallas bajas se limita para mantenerlo visible.
3. Guarda. El plazo empieza al guardar y el cliente puede seguir trabajando. El aviso se puede minimizar.
4. Al llegar a cero, se muestra la suspensión con el contacto del desarrollador, **ELKIN RANGEL** y la llave Nequi/Bre-B **3208759798**.
5. Usa **Activar sin aviso** (icono de candado abierto) o cambia a **Activo · sin aviso** para quitar el aviso y el bloqueo. Los clientes conectados consultan cada 15 segundos, al recuperar conexión y al volver a la pestaña.

Editar el mensaje o la posición conserva el vencimiento. Cambiar las horas o marcar **Reiniciar el plazo** crea un plazo nuevo. También se conserva **Bloquear ahora** para una suspensión inmediata. Los bloqueos antiguos mantienen su estado hasta que el administrador los cambie.

## Integración en cada proyecto cliente

Publica este repositorio en el alojamiento HTTPS que ya uses para DEVNEX. En cada sistema cliente debe cargarse **la nueva versión** de `js/project-guard.js` en todas las páginas donde deba funcionar el aviso:

```html
<script>
  window.DEVNEX_BLOCKER_CONFIG = {
    project_id: 'ID-EXACTO-DEL-PROYECTO',
    whatsapp: '573246394689'
  };
</script>
<script defer src="https://devnnex.github.io/DEVNEX-BLOQUEO.COM/js/project-guard.js?v=2"></script>
```

Conserva el `project_id` registrado en el panel. También funciona `data-project-id` en el script y las variables de identificación de la integración anterior. `apiUrl` permite usar otro despliegue de Apps Script. El número de WhatsApp predeterminado se conserva del panel anterior; es independiente de la llave de pago Nequi.

El guard es autónomo, no requiere CSS ni librerías del cliente y aísla sus estilos con Shadow DOM. No se agrega al sistema de TIENDA NAPOLES ni a otros repositorios automáticamente: esos proyectos deben estar apuntando a este archivo actualizado. Una copia antigua del guard no interpreta los nuevos plazos. Invalida también la caché de su service worker, si existe. El parámetro `v=2` ayuda a renovar el script.

## Persistencia y compatibilidad

La API pública actual conserva `project_id`, `status`, `amount` y `message`. Para evitar depender de columnas que ese backend no guarda, un aviso se transmite como `status: active` y un sufijo versionado en `message`: `[DEVNEX_SCHEDULE_V1:…]`. Incluye el vencimiento ISO UTC, las horas y la posición. Panel y guard separan ese sufijo del texto que ve el usuario. No lo borres editando directamente la hoja mientras el aviso esté activo.

El tiempo se calcula contra ese vencimiento absoluto; no se reinicia al cargar ni depende de un contador del navegador. En desconexión se conserva el último estado conocido en cada cliente y el contador sigue venciendo. Un desbloqueo remoto requiere que el cliente recupere conexión. La hora del dispositivo debe ser correcta. El control visual en el navegador conserva el alcance de la integración anterior; el control de acceso a datos del servidor corresponde al backend de cada sistema.

Después de una escritura, el panel vuelve a leer el registro y verifica los cambios antes de confirmar éxito. No requiere cambiar el Apps Script. Las operaciones remotas reales deben mantener el contrato de los cuatro campos anteriores.

## PWA y móviles

Abre sobre HTTPS o localhost. Los iconos PNG de 48, 180, 192 y 512 px, más el icono maskable, usan el símbolo geométrico violeta inspirado en la referencia DEVNEX. El manifest permite instalación en modo independiente. En **Ajustes → Instalar DEVNEX** aparece la instalación cuando el navegador la ofrece; en Safari usa **Compartir → Añadir a pantalla de inicio**.

Los inputs usan 16 px para evitar el zoom automático en iPhone, manteniendo el zoom manual accesible. El login permite desplazarse con el teclado abierto; en móviles hay navegación inferior y tarjetas para los proyectos. La interfaz se puede abrir sin conexión después de una primera visita, pero consultar o guardar proyectos requiere internet.

El service worker almacena solo archivos de la interfaz, nunca respuestas de la API. Al publicar cambios futuros, incrementa `CACHE_NAME` en `sw.js`.

## Verificación

Con Node.js:

```sh
node --test tests/project-state.test.cjs
```

La verificación de navegador usa Playwright y Chrome instalado (dependencias de desarrollo):

```sh
npm install
npm test
```

Estas pruebas usan una API simulada con los mismos cuatro campos; no crean, bloquean ni modifican proyectos reales.

## Agenda de pagos

En **Pagos → Agendar pago**, registra cliente, proyecto opcional, importe COP, fecha/hora de Colombia, frecuencia y nota. Puedes elegir un aviso anticipado de 1 hora, 1 o 2 días, o 1 semana.

- **Semanal:** cada 7 días; **quincenal:** cada 15 días.
- **Mensual:** mismo día del mes; si no existe se usa el último día, conservando el día original para el siguiente mes (31 de enero → 28/29 de febrero → 31 de marzo).
- **Personalizado:** intervalo en días desde la fecha elegida. También admite pagos únicos.

**Registrar pago recibido** conserva un historial de las últimas 24 cuotas y avanza un período. Nunca salta de forma automática las cuotas vencidas. La agenda informa al administrador y no suspende por sí sola un proyecto; para eso usa los avisos de **Proyectos**.

## Notificaciones con la PWA cerrada

GitHub Pages aloja la interfaz. `.github/workflows/notifications.yml` revisa Apps Script mediante GitHub Actions aproximadamente cada 5 minutos y envía Web Push a los dispositivos vinculados. El teléfono recibe las notificaciones aunque la PWA no esté abierta, sujeto a conexión, permisos y restricciones del sistema operativo.

La primera apertura de la PWA instalada muestra una invitación. El permiso del navegador se solicita al tocar **Activar notificaciones**, como requieren los navegadores. En iOS/iPadOS hace falta instalar en la pantalla de inicio y una versión compatible con Web Push (16.4 o posterior).

Una vez en cada dispositivo:

1. Copia la clave de `.private/CLAVE-VINCULACION.txt` a **Ajustes → Clave de vinculación**.
2. Toca **Vincular este dispositivo** y luego **Activar notificaciones**.
3. Acepta el permiso del navegador. **Probar en este dispositivo** muestra un aviso local de ejemplo.

La clave se recuerda en ese navegador. La instalación de una PWA puede usar almacenamiento separado del navegador: si la PWA instalada aún no está vinculada, pega la clave allí. La clave abre la agenda cifrada y autoriza registros de notificaciones; no es la contraseña del cliente. Si borras los datos del navegador, vuelve a vincular.

Se envía un aviso por dispositivo y evento: proyecto vencido/bloqueado, pago por cobrar y aviso anticipado cuando se configuró. Los recibos de envío evitan repetirlo cada cinco minutos. Una suscripción caducada (404/410) se retira. En **Ajustes → Desactivar** puedes cancelar los avisos de ese dispositivo. El importe lleva formato COP. Icono y contenido son DEVNEX; los colores y la disposición final los decide Android/iOS.

Los avisos no tienen precisión de alarma: GitHub puede retrasar una tarea programada, y en repositorios públicos puede desactivar el cron después de 60 días sin actividad. Revisa **Actions → DEVNEX · Notificaciones** si dejan de llegar y vuelve a habilitar el workflow. El botón **Run workflow** permite ejecutar la revisión manualmente.

## Claves, almacenamiento y mantenimiento

`push-config.json` contiene únicamente la clave pública VAPID y el hash de la clave de vinculación. Los secretos `DEVNEX_OWNER_KEY` y `DEVNEX_VAPID_PRIVATE_KEY` están en GitHub Actions. Nunca publiques `.private/` ni la clave VAPID privada.

Los pagos (`__DEVNEX_PAYMENT__`), suscripciones (`__DEVNEX_PUSH__`) y recibos (`__DEVNEX_DELIVERY__`) se guardan en las mismas cuatro columnas de Apps Script, con `amount: 0` y el contenido cifrado con AES-GCM. El identificador se autentica junto al contenido, y estos registros se excluyen de las listas, estadísticas y bloqueos de proyectos. No se publican agendas, nombres de clientes ni endpoints de notificaciones en GitHub. La API anterior sigue gestionando los proyectos con su contrato existente.

Para configurar otra instalación, ejecuta `npm run setup:push -- --github` con GitHub CLI autenticado y guarda una copia segura de `.private/`. El script reutiliza claves existentes; cambiar la clave de datos impediría abrir registros anteriores, y cambiar VAPID exige volver a suscribir dispositivos. Antes de una migración conserva y restaura los secretos existentes.

La PWA solo abre la interfaz sin conexión: la agenda privada se consulta online. Un pago programado se considera pendiente hasta que tú lo registres como recibido. No se confirman pagos bancarios automáticamente.
