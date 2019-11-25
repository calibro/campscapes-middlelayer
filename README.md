# campscapes-middlelayer


## prepare remote machine (only once)
install node (follow instructions for bitnami stack)
install yarn (follow instructions for bitnami stack)
npm install -g pm2
pm2 startup 
(...follow instructions)


## build frontend locally
cd frontend
yarn install
yarn build
cp ../to_copy_in_build/* build/

## fix passwords
put ftp passwords in file:
scraper/do_scrape.sh

## upload
frontend/build/* into remote folder /home/bitnami/htdocs/campscapes/
ws/* into remote folder /home/bitnami/htdocs/campscapes/ws/
scraper/* into remote folder /home/bitnami/htdocs/campscapes/scraper/

## complete remote install
cd /home/bitnami/htdocs/campscapes/ws/
npm i
cd /home/bitnami/htdocs/campscapes/scraper/
yarn install

## apache config
copy these lines

    ```
    ProxyPass /campscapes/ws/ ws://localhost:3000
    ProxyPassReverse /campscapes/ws/ ws://localhost:3000
    ```

at the end of file: `/opt/bitnami/apache2/conf/httpd.conf`


# start services with pm2
cd /home/bitnami/htdocs/campscapes/ws
pm2 start start.sh --name campscapes_ws