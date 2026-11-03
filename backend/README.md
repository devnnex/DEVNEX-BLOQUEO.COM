# Activar el acceso de DEVNEX

El backend anterior no comprobaba usuarios ni contraseñas. Esta versión autoriza exclusivamente `elkin56ty@gmail.com`, protege las consultas privadas y las escrituras, y entrega la clave de datos existente después de comprobar la sesión. La PWA deja de pedir claves de vinculación.

## Configuración inicial

1. Ejecuta `npm run setup:auth`. Abre el archivo local `.private/CONFIGURAR-ACCESO.html` en Chrome o Edge.
2. Define tu contraseña **de DEVNEX**. No es un inicio de sesión con Google; no necesitas usar la contraseña de Gmail. La página no realiza conexiones de red ni guarda la contraseña.
3. Abre el mismo proyecto Apps Script que usa la hoja `projects`. Reemplaza su código por [Code.gs](Code.gs).
4. Sigue los pasos del archivo local para agregar y ejecutar `configurarAccesoDevnex`. Guarda las propiedades privadas; después elimina esa función del editor.
5. En **Implementar → Administrar implementaciones → Editar**, selecciona **Nueva versión** y actualiza la implementación existente. Conserva su URL, **ejecutar como tú** y el acceso **cualquier persona**. El código verifica las sesiones; los `admin.html` necesitan poder consultar su estado público.
6. Inicia sesión en DEVNEX. Si instalaste la PWA, inicia sesión dentro de ella y activa sus notificaciones. No hay formulario de vinculación.

El archivo local contiene configuración privada. Permanece excluido de Git mediante `.private/`. No lo publiques. El generador reutiliza `push-secrets.json`; no cambia la clave AES ni VAPID y conserva los pagos y suscripciones anteriores. Repetir la configuración cambia la contraseña y revoca las sesiones previas.

## Publicación y comprobación

Los cambios de GitHub Pages no actualizan Google Apps Script. Sin acceso al editor de Google, la actualización del backend debe hacerla el propietario. Mientras el backend anterior siga publicado, el nuevo frontend rechazará el inicio de sesión: no simula una autenticación correcta ni permite saltársela.

Google documenta cómo [actualizar una implementación existente con una nueva versión](https://developers.google.com/apps-script/concepts/deployments).

Después de actualizar Apps Script, un `GET` sin `project_id` debe devolver `AUTH_REQUIRED`; `?action=auth_challenge` devuelve una sal pública e iteraciones, sin secretos. Correo distinto, contraseña incorrecta y sesión modificada o vencida deben ser rechazados.

Las contraseñas se derivan con PBKDF2-SHA-256 (600 000 iteraciones) en el dispositivo. El servidor guarda un HMAC del resultado en propiedades privadas y limita intentos fallidos. Las sesiones firmadas duran siete días y se comprueban en el servidor al reabrir la PWA. Cerrar sesión borra la sesión local y la clave del navegador; las notificaciones ya suscritas siguen disponibles con la app cerrada.

Los workflows usan `DEVNEX_OWNER_KEY` como credencial de servicio mediante POST. Su lectura anterior solo se conserva como compatibilidad cuando el servidor devuelve exactamente `INVALID ACTION` para `get`. No se envían claves en la URL.

Las consultas públicas individuales conservan el contrato del guard. Los recibos `__DEVNEX_HEALTH__` admiten exclusivamente alta/actualización con estado activo, importe cero y un mensaje de confirmación de `admin.html`. No pueden usarse para editar un proyecto, borrar datos ni acceder a pagos privados. El bloqueo visual sigue siendo independiente de la autorización de datos del backend de cada cliente.

## Rapidez

El login y la reanudación entregan los registros junto a la sesión. El panel comparte esa lectura. Un guardado confirmado usa una petición: escribe las cuatro columnas juntas, ejecuta `flush()` y devuelve la fila persistida. El frontend compara el registro con lo solicitado antes de confirmar. Las eliminaciones actualizan la vista de inmediato y se revierten ante un fallo; los pagos muestran su estado en curso por tarjeta. La latencia de internet y Apps Script continúa influyendo en la confirmación.
