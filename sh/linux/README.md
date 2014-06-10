# Manta Server Linux Init Script
_______________________________

Complete the following steps after installing node-manta:

1. Install Node Forever: *npm -g install forever*
2. Grab the init script from init.d and copy to your /etc/init.d as root, then chmod the file: *chomd 0755 manta-server*
3. Update system service definitions: *update-rc.d my-application defaults*
4. Then add your environment variables to the persistent scope *vi /etc/environment* and add the following lines:
    ```
    MANTA_KEY_ID="Key Id (can be found in your account settings SSH Keys)"
    MANTA_URL="https://us-east.manta.joyent.com" 
    MANTA_USER="Your username"
    ```
5. Then source the env vars: *source /etc/environment*
6. Last but not least, create your log folder, *mkdir /var/log/manta-server;* *touch /var/log/manta-server/error.log;*
7. Now you're ready to run it: */etc/init.d/manta-server (start|stop|restart)*
