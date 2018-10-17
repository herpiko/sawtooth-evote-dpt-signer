cp -R ../sawtooth-evote-submitter submitter
docker build -t evote-server .
rm -rf submitter
docker rm evote-server; docker run --network national -p 3000:3000 -ti evote-server
