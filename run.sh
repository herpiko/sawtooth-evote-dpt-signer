cp -R ../sawtooth-evote-submitter submitter
cp -R ../sawtooth-evote-ejbca certs
docker build -t evote-server .
rm -rf submitter
rm -rf certs
docker rm evote-server; docker run --network national -p 3000:3000 -p 3443:3443 -ti evote-server
