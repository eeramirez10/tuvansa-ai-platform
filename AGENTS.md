# Instrucciones del repositorio

## Flujo obligatorio de ramas y entornos

Antes de modificar archivos, leer `DEVELOPMENT_WORKFLOW.md` y revisar la rama y
el estado de Git. Estas reglas aplican a codigo, pruebas, documentacion,
migraciones y configuracion versionada.

1. Crear siempre una rama `feature/<descripcion>` desde `development` actualizado.
   No crear ramas de trabajo desde `main`, `staging` ni otra feature.
2. No implementar directamente sobre `development`, `staging` o `main`.
   Si la rama actual no cumple el flujo, preparar una rama correcta antes de editar.
3. Si falta `development`, no usar `main` o `staging` como sustituto silencioso.
   Informarlo y acordar su inicializacion antes de empezar.
4. Integrar el trabajo revisado en `development`; promover despues a `staging`.
   Validar alli el mismo conjunto de cambios antes de promoverlo a `main`.
5. Nunca promover `development` o una feature directamente a `main`, ni omitir
   staging por tratarse de un cambio pequeno o una correccion urgente.
6. Promover a `main` solo los commits aprobados en staging. Registrar los SHA
   por repositorio; no incluir cambios que entraron despues de las pruebas.
7. Crear una rama no autoriza commits, push, merges de integracion ni despliegues.
   Realizar esas acciones cuando el usuario las solicite o autorice expresamente.
   Una peticion de produccion no elimina la validacion previa en staging.

## Proteccion de datos y del trabajo existente

- Conservar cambios previos del usuario. No descartar, guardar en stash ni
  sobrescribir archivos privados para poder cambiar de rama sin autorizacion.
- No versionar `.env`, `.env.development`, `.env.staging`, `.env.production`,
  credenciales, respaldos ni documentos de clientes. Las plantillas `.example`
  pueden versionarse si no contienen secretos reales.
- Cada entorno conserva sus bases, archivos, secretos, Redis y remitente WhatsApp.
  Promover codigo y migraciones, nunca copiar datos de staging a produccion.
- No ejecutar `migrate reset`, `db push`, `migrate dev`, `down -v` ni restauraciones
  para actualizar staging o produccion. Revisar SQL y usar `migrate deploy` donde
  corresponda; respaldar antes de las migraciones de produccion.
- No editar la aplicacion desplegada en el servidor para corregir errores.
  Corregir en la feature correspondiente y repetir el recorrido por staging.
- No cambiar ramas, variables, webhooks ni recursos de produccion al operar staging.

## Cierre de cada trabajo

Informar rama usada, archivos cambiados, comprobaciones realizadas y pendientes.
Distinguir explicitamente entre cambios locales, commits publicados, codigo
desplegado en staging y codigo desplegado en produccion. No afirmar que un push
despliega automaticamente: el despliegue actual es manual.

## Contexto de este proyecto

- Gestor: pnpm, segun `package.json` y su lockfile.
- API y worker se despliegan y verifican como procesos separados.
- El PostgreSQL de IA, Redis, archivos y namespace de productos locales deben
  mantenerse aislados por entorno. En staging no reindexar el catalogo ERP compartido.
- Seguir el `STAGING.md` del repositorio hermano cotizador-core-backend para Docker.
