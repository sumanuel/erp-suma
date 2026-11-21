-- Administradores de la plataforma (el proveedor del servicio). Distintos de los usuarios de cada cliente.
CREATE TABLE IF NOT EXISTS administrador_plataforma (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text NOT NULL UNIQUE,
  nombre             text NOT NULL,
  hash_contrasena    text NOT NULL,
  activo             boolean NOT NULL DEFAULT true,
  intentos_fallidos  integer NOT NULL DEFAULT 0,
  bloqueado_hasta    timestamptz,
  contrasena_cambiada_en timestamptz,
  creado_en          timestamptz NOT NULL DEFAULT now()
);
