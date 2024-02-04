Para crear un supervisor que levante `npm start` en tu proyecto, puedes seguir los siguientes pasos:

1. Instala Supervisor en tu sistema Linux si aún no lo has hecho. Puedes hacerlo con el siguiente comando:

```bash
sudo apt-get install supervisor
```

2. Crea un nuevo archivo de configuración para tu aplicación en la carpeta `/etc/supervisor/conf.d/`. Puedes llamarlo `whatsapp-api-cdc.conf`.

```bash
sudo nano /etc/supervisor/conf.d/whatsapp-api-cdc.conf
```

3. En este archivo, agrega la siguiente configuración, asegurándote de reemplazar `/path/to/your/project` con la ruta real a tu proyecto:

```ini
[program:whatsapp-api-cdc]
command=/home/aestrada2796/.nvm/versions/node/v20.11.0/bin/npm start
directory=/media/aestrada2796/Trabajo1/Programacion/Proyectos/CDC/waserver
autostart=true
autorestart=true
stderr_logfile=/var/log/whatsapp-api-cdc.err.log
stdout_logfile=/var/log/whatsapp-api-cdc.out.log
environment=NODE_ENV=production
user=aestrada2796
```

4. Guarda y cierra el archivo.

5. Ahora, debes decirle a Supervisor que lea la nueva configuración y que inicie la aplicación:

```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start whatsapp-api-cdc
```

Con estos pasos, Supervisor debería estar configurado para mantener tu aplicación en ejecución. Si tu aplicación se cae por alguna razón, Supervisor la reiniciará automáticamente.