docker build -t evote-server .
docker rm evote-server; docker run --network national -p 3000:3000 -ti evote-server
