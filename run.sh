cp -R ../sawtooth-evote-submitter submitter
cp -R ../sawtooth-evote-ejbca ejbca
docker build -t evote-server.skripsi.local .
docker kill evote-server.skripis.local;docker rm evote-server.skripsi.local; 
docker create --network national -p 3000:3000 -p 3443:3443 --ip 172.20.0.100 --name evote-server.skripsi.local -ti evote-server.skripsi.local
docker start evote-server.skripsi.local
