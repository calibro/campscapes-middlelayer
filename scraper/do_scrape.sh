cd /home/bitnami/htdocs/campscapes/scraper

node update.js . --pagesize=20

cd ./campscapes-data

ftp -n -p platform.campscapes.org <<END_SCRIPT
quote USER ftp-user
quote PASS ftp-password
cd ./httpdocs
rename campscapes-data campscapes-data-$(date -Iseconds)
mkdir campscapes-data
cd campscapes-data
binary
prompt
mput *.json
quit
END_SCRIPT
exit 0
