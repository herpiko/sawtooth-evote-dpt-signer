node index.js $(docker ps | grep 'province-dpt-1' | cut -d' ' -f 1):8008
