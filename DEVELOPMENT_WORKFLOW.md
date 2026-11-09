# Flujo de desarrollo, staging y produccion

## Regla principal

```text
development -> feature/<descripcion> -> development -> staging -> main -> produccion
```

Todas las ramas de trabajo nacen de `development`. Staging es un paso obligatorio
antes de `main`, incluso para cambios pequenos, documentacion y hotfixes.
No desarrollar sobre ramas de entorno ni crear nuevas features desde otra feature.

Esta politica aplica a los cuatro proyectos:

| Proyecto | Responsabilidad |
| --- | --- |
| cotizador-v2 | Frontend |
| cotizador-core-backend | Dominio comercial, autenticacion, archivos y WhatsApp |
| tuvansa-ai-platform | API y workers de IA, PostgreSQL y catalogo SAT |
| tuvansa-backend-ca | Consultas e integracion con Proscai |

Solo se modifican y despliegan los proyectos afectados. Cuando un cambio cruza
APIs, documentar y comprobar las versiones compatibles de todos los involucrados.

## 1. Abrir una rama de trabajo

Revisar primero `git status --short --branch`. Conservar los cambios existentes,
incluidos los .env locales. Si impiden cambiar de rama, detenerse y resolverlo con
el usuario; no hacer stash, reset o checkout de esos archivos por cuenta propia.

Con el arbol listo para cambiar de rama:

```bash
git fetch origin
git switch development
git pull --ff-only origin development
git switch -c feature/nombre-del-cambio
```

Si development existe solo en el remoto, usar `git switch --track origin/development`.
Si existe solo localmente, solicitar autorizacion para publicarla y configurar
su upstream antes del primer pull; no asumir que origin/development ya existe.
Si no existe en ninguno, acordar su base inicial; no reemplazarla por main ni por
staging de forma silenciosa. Si hay divergencias, revisarlas sin force-push.

Implementar y probar localmente con la configuracion y las bases de desarrollo.
Respetar el gestor de paquetes y las verificaciones propias del proyecto.
Revisar el diff antes de guardar o publicar para excluir secretos y cambios ajenos.

## 2. Integrar en development

Cuando el trabajo este revisado y exista autorizacion de integracion:

1. Guardar y publicar la feature con sus pruebas, migraciones y documentacion.
2. Revisar el diff e integrar feature -> development, preferentemente mediante PR.
3. Ejecutar las comprobaciones de integracion y registrar el SHA resultante.
4. Seleccionar el conjunto que se probara en staging. Si development contiene
   trabajo no listo, no promoverlo entero por accidente: separar y revisar la entrega.

No hacer merge de feature -> main. No integrar ni desplegar por el solo hecho de
que el usuario haya pedido implementar una funcionalidad.

## 3. Promover y validar en staging

Con autorizacion, integrar los cambios seleccionados en `staging` y publicar esa
rama. Registrar el SHA de staging de cada repositorio participante antes de probar.
Mantener un registro de entrega con versiones, migraciones, pruebas y resultado.

Los checkouts del servidor son independientes de produccion:

```text
/srv/staging/tuvansa/cotizador-core-backend
/srv/staging/tuvansa/tuvansa-ai-platform
/srv/staging/tuvansa/cotizador-v2
/srv/staging/tuvansa-backend-ca
```

Actualizar solo esos checkouts a las versiones seleccionadas, verificar sus SHA
y desplegar manualmente. El push por si solo no actualiza el servidor ni Firebase.

El lanzador compartido esta en cotizador-core-backend. Seguir su `STAGING.md`:

```bash
sudo bash scripts/staging.sh doctor
sudo bash scripts/staging.sh build
sudo bash scripts/staging.sh migrate
sudo bash scripts/staging.sh up
sudo bash scripts/staging.sh status
```

Estos comandos se ejecutan desde el checkout del core de staging. El seed inicial
y la importacion del catalogo SAT no se repiten en cada despliegue; ejecutarlos
solo cuando haga falta. Respaldar staging si se deben conservar ejercicios.

El frontend se compila y publica explicitamente en `cotizador-tuvansa-staging`,
usando `npm run deploy:staging` y `FIREBASE_STAGING_PROJECT_ID`. Nunca publicar una
compilacion de staging en el proyecto Firebase `cotizador-tuvansa` de produccion.

Validar las rutas afectadas, permisos, migraciones, API, archivos y workers. Para
WhatsApp, usar el remitente de desarrollo/staging y destinatarios autorizados;
comprobar la entrega real de PDF y callbacks, no solo que el proveedor acepte el envio.
Registrar tambien los escenarios funcionales que el usuario aprobo o rechazo.

Si falla una prueba, corregir en la feature y volver a pasar por development y
staging. No editar el servidor ni considerar aprobados los commits posteriores a
una prueba anterior. Los nuevos cambios requieren la validacion correspondiente.

## 4. Promover a main y desplegar produccion

Solo despues de la aprobacion funcional en staging y la autorizacion explicita
del usuario para promover/desplegar:

1. Verificar los SHA aprobados y el diff contra main. Si staging avanzo despues de
   la prueba, no integrar su HEAD automaticamente: promover la revision aprobada.
2. Integrar a main exactamente la entrega validada en staging. No usar una nueva
   version de development con cambios adicionales.
3. Publicar main y respaldar la base de datos y los documentos de produccion.
4. Revisar las migraciones SQL, su compatibilidad con la version actualmente
   desplegada y el orden de actualizacion de APIs, workers y frontend.
5. Usar los checkouts, archivos privados y procedimientos propios de produccion.
   Aplicar `prisma migrate deploy` cuando corresponda; no resetear la base.
6. Verificar salud, acceso y flujos afectados; registrar los SHA desplegados.

Si main tenia cambios exclusivos aprobados, reintegrarlos a development para
evitar que se pierdan en la siguiente entrega. No promover datos ni .env.

## 5. Separacion y recuperacion

- Desarrollo: equipo local y recursos de desarrollo.
- Staging: Neon de staging, PostgreSQL/Redis y volumenes Docker aislados,
  Firebase separado y numero WhatsApp de desarrollo con lista de destinatarios.
- Produccion: sus propios recursos y numero WhatsApp, sin ejercicios de staging.
- No restaurar produccion desde staging ni desde un respaldo antiguo para limpiar
  pruebas. No importar al Proscai real los TXT de ejercicios de staging.
- Antes de volver a una imagen anterior, revisar compatibilidad del esquema.
  Un rollback de codigo no revierte automaticamente las migraciones ni los datos.

## Lista de cierre

- Rama de trabajo creada desde development, sin cambios directos en ramas de entorno.
- Diff revisado, sin secretos ni modificaciones ajenas al alcance.
- Pruebas y comprobaciones del proyecto registradas, incluidos los limites no probados.
- SHA y dependencias entre repositorios identificados para la entrega.
- Paso por staging y aprobacion del usuario registrados antes de main.
- Respaldo, revision SQL y comprobaciones posteriores para produccion.
- Estado informado con precision: local, publicado, desplegado o pendiente.

`AGENTS.md` recuerda estas reglas a los agentes de codigo. La documentacion no
instala protecciones de ramas, revisiones obligatorias ni pipelines automaticos
en GitHub; esas medidas requieren configuracion adicional autorizada.
